// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/BlockhashStoreInterface.sol";
import "./interfaces/VRFCoordinatorV2Interface.sol";
import "./interfaces/TypeAndVersionInterface.sol";
import "./interfaces/VRFConsumerBaseV2.sol";
import "./VRF.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

contract VRFCoordinatorV2 is
    VRF,
    Ownable2StepUpgradeable,
    TypeAndVersionInterface,
    VRFCoordinatorV2Interface
{
    error GasPriceOverRange(uint256 gasPrice);
    error TooManyConsumers();
    error InsufficientBalance();
    error InvalidConsumer(uint64 subId, address consumer);
    error InvalidSubscription();
    error MustBeSubOwner(address owner);
    error PendingRequestExists();
    error MustBeRequestedOwner(address proposedOwner);
    error BalanceInvariantViolated(
        uint256 internalBalance,
        uint256 externalBalance
    );
    error InvalidRequestConfirmations(uint16 have, uint16 min, uint16 max);
    error GasLimitTooBig(uint32 have, uint32 want);
    error NumWordsTooBig(uint32 have, uint32 want);
    error ProvingKeyAlreadyRegistered(bytes32 keyHash);
    error NoSuchProvingKey(bytes32 keyHash);
    error NoCorrespondingRequest();
    error IncorrectCommitment();
    error BlockhashNotInStore(uint256 blockNum);
    error Reentrant();

    event FundsRecovered(address to, uint256 amount);
    event OracleWithdraw(address to, uint256 amount);
    event SubscriptionCreated(uint64 indexed subId, address owner);
    event SubscriptionFunded(
        uint64 indexed subId,
        uint256 oldBalance,
        uint256 newBalance
    );
    event SubscriptionConsumerAdded(uint64 indexed subId, address consumer);
    event SubscriptionConsumerRemoved(uint64 indexed subId, address consumer);
    event SubscriptionCanceled(
        uint64 indexed subId,
        address to,
        uint256 amount
    );
    event SubscriptionOwnerTransferRequested(
        uint64 indexed subId,
        address from,
        address to
    );
    event SubscriptionOwnerTransferred(
        uint64 indexed subId,
        address from,
        address to
    );
    event ConfigSet(
        uint16 minimumRequestConfirmations,
        uint32 maxGasLimit,
        uint256 gasAfterPaymentCalculation,
        FeeConfig feeConfig
    );
    event ProvingKeyRegistered(
        bytes32 keyHash,
        address indexed oracle,
        uint256 gasPrice
    );
    event ProvingKeyDeregistered(bytes32 keyHash, address indexed oracle);
    event RandomWordsRequested(
        bytes32 indexed keyHash,
        uint256 requestId,
        uint256 preSeed,
        uint64 indexed subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords,
        address indexed sender
    );
    event RandomWordsFulfilled(
        uint256 indexed requestId,
        uint256 outputSeed,
        uint96 payment,
        bool success
    );

    // We need to maintain a list of consuming addresses.
    // This bound ensures we are able to loop over them as needed.
    // Should a user require more consumers, they can use multiple subscriptions.
    uint16 public constant MAX_CONSUMERS = 200;
    // We make the sub count public so that its possible to
    // get all the current subscriptions via getSubscription.
    uint64 private s_currentSubId;
    // s_totalBalance tracks the total OKT sent to/from
    // this contract through onTokenTransfer, cancelSubscription and oracleWithdraw.
    // A discrepancy with this contract's OKT balance indicates someone
    // sent tokens using transfer and so we may need to use recoverFunds.
    uint96 private s_totalBalance;
    // Set this maximum to 200 to give us a 56 block window to fulfill
    // the request before requiring the block hash feeder.
    uint16 public constant MAX_REQUEST_CONFIRMATIONS = 200;
    uint32 public constant MAX_NUM_WORDS = 500;

    // 5k is plenty for an EXTCODESIZE call (2600) + warm CALL (100)
    // and some arithmetic operations.
    uint256 public constant GAS_FOR_CALL_EXACT_CHECK = 5000;
    BlockhashStoreInterface public BLOCKHASH_STORE;
    uint256 public MAX_GAS_PRICE;
    Config private s_config;
    FeeConfig private s_feeConfig;

    struct Config {
        uint16 minimumRequestConfirmations;
        uint32 maxGasLimit;
        // Reentrancy protection.
        bool reentrancyLock;
        // Gas to cover oracle payment after we calculate the payment.
        // We make it configurable in case those operations are repriced.
        uint256 gasAfterPaymentCalculation;
    }
    struct FeeConfig {
        uint32 fulfillmentFlatFeeOKTTier1;
        uint32 fulfillmentFlatFeeOKTTier2;
        uint32 fulfillmentFlatFeeOKTTier3;
        uint32 fulfillmentFlatFeeOKTTier4;
        uint32 fulfillmentFlatFeeOKTTier5;
        uint24 reqsForTier2;
        uint24 reqsForTier3;
        uint24 reqsForTier4;
        uint24 reqsForTier5;
    }
    // We use the subscription struct (1 word)
    // at fulfillment time.
    struct Subscription {
        // There are only 1e9*1e18 = 1e27 juels in existence, so the balance can fit in uint96 (2^96 ~ 7e28)
        uint96 balance; // Common OKT balance used for all consumer requests.
        uint64 reqCount; // For fee tiers
    }
    struct SubscriptionConfig {
        address owner; // Owner can fund/withdraw/cancel the sub.
        address requestedOwner; // For safely transferring sub ownership.
        // Maintains the list of keys in s_consumers.
        // We do this for 2 reasons:
        // 1. To be able to clean up all keys from s_consumers when canceling a subscription.
        // 2. To be able to return the list of all consumers in getSubscription.
        // Note that we need the s_consumers map to be able to directly check if a
        // consumer is valid without reading all the consumers from storage.
        address[] consumers;
    }
    struct RequestCommitment {
        uint64 blockNum;
        uint64 subId;
        uint32 callbackGasLimit;
        uint32 numWords;
        address sender;
    }

    mapping(address => mapping(uint64 => uint64)) /* consumer */ /* subId */ /* nonce */
        private s_consumers;
    mapping(uint64 => SubscriptionConfig) /* subId */ /* subscriptionConfig */
        private s_subscriptionConfigs;
    mapping(uint64 => Subscription) /* subId */ /* subscription */
        private s_subscriptions;
    mapping(bytes32 => address) /* keyHash */ /* oracle */
        private s_provingKeys;
    bytes32[] private s_provingKeyHashes;
    mapping(uint256 => bytes32) /* requestID */ /* commitment */
        private s_requestCommitments;
    mapping(bytes32 => uint256) /* keyhash */ /* gasprice */
        public s_gasPrice;

    function initialize(address blockhashStore) public initializer {
        __Ownable2Step_init();
        BLOCKHASH_STORE = BlockhashStoreInterface(blockhashStore);
    }

    /**
     * @notice Registers a proving key to an oracle.
     * @param oracle address of the oracle
     * @param publicProvingKey key that oracle can use to submit vrf fulfillments
     */
    function registerProvingKey(
        address oracle,
        uint256[2] calldata publicProvingKey,
        uint256 gasPrice
    ) external onlyOwner {
        bytes32 kh = hashOfKey(publicProvingKey);
        if (s_provingKeys[kh] != address(0)) {
            revert ProvingKeyAlreadyRegistered(kh);
        }
        if (gasPrice > MAX_GAS_PRICE) {
            revert GasPriceOverRange(gasPrice);
        }
        s_provingKeys[kh] = oracle;
        s_gasPrice[kh] = gasPrice;
        s_provingKeyHashes.push(kh);
        emit ProvingKeyRegistered(kh, oracle, gasPrice);
    }

    /**
     * @notice Deregisters a proving key to an oracle.
     * @param publicProvingKey key that oracle can use to submit vrf fulfillments
     */
    function deregisterProvingKey(uint256[2] calldata publicProvingKey)
        external
        onlyOwner
    {
        bytes32 kh = hashOfKey(publicProvingKey);
        address oracle = s_provingKeys[kh];
        if (oracle == address(0)) {
            revert NoSuchProvingKey(kh);
        }
        delete s_provingKeys[kh];
        delete s_gasPrice[kh];
        for (uint256 i = 0; i < s_provingKeyHashes.length; i++) {
            if (s_provingKeyHashes[i] == kh) {
                bytes32 last = s_provingKeyHashes[
                    s_provingKeyHashes.length - 1
                ];
                // Copy last element and overwrite kh to be deleted with it
                s_provingKeyHashes[i] = last;
                s_provingKeyHashes.pop();
            }
        }
        emit ProvingKeyDeregistered(kh, oracle);
    }

    /**
     * @notice Returns the proving key hash key associated with this public key
     * @param publicKey the key to return the hash of
     */
    function hashOfKey(uint256[2] memory publicKey)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(publicKey));
    }

    /**
     * @notice Sets the configuration of the vrfv2 coordinator
     * @param minimumRequestConfirmations global min for request confirmations
     * @param maxGasLimit global max for request gas limit
     * @param maxGasPrice global max for oracle fulfillRandomWords tx.gasprice
     * @param gasAfterPaymentCalculation gas used in doing accounting after completing the gas measurement
     * @param feeConfig fee tier configuration
     */
    function setConfig(
        uint16 minimumRequestConfirmations,
        uint32 maxGasLimit,
        uint256 maxGasPrice,
        uint256 gasAfterPaymentCalculation,
        FeeConfig memory feeConfig
    ) external onlyOwner {
        if (minimumRequestConfirmations > MAX_REQUEST_CONFIRMATIONS) {
            revert InvalidRequestConfirmations(
                minimumRequestConfirmations,
                minimumRequestConfirmations,
                MAX_REQUEST_CONFIRMATIONS
            );
        }
        s_config = Config({
            minimumRequestConfirmations: minimumRequestConfirmations,
            maxGasLimit: maxGasLimit,
            gasAfterPaymentCalculation: gasAfterPaymentCalculation,
            reentrancyLock: false
        });
        s_feeConfig = feeConfig;
        MAX_GAS_PRICE = maxGasPrice;
        emit ConfigSet(
            minimumRequestConfirmations,
            maxGasLimit,
            gasAfterPaymentCalculation,
            s_feeConfig
        );
    }

    function getConfig()
        external
        view
        returns (
            uint16 minimumRequestConfirmations,
            uint32 maxGasLimit,
            uint256 gasAfterPaymentCalculation
        )
    {
        return (
            s_config.minimumRequestConfirmations,
            s_config.maxGasLimit,
            s_config.gasAfterPaymentCalculation
        );
    }

    function getFeeConfig()
        external
        view
        returns (
            uint32 fulfillmentFlatFeeOKTTier1,
            uint32 fulfillmentFlatFeeOKTTier2,
            uint32 fulfillmentFlatFeeOKTTier3,
            uint32 fulfillmentFlatFeeOKTTier4,
            uint32 fulfillmentFlatFeeOKTTier5,
            uint24 reqsForTier2,
            uint24 reqsForTier3,
            uint24 reqsForTier4,
            uint24 reqsForTier5
        )
    {
        return (
            s_feeConfig.fulfillmentFlatFeeOKTTier1,
            s_feeConfig.fulfillmentFlatFeeOKTTier2,
            s_feeConfig.fulfillmentFlatFeeOKTTier3,
            s_feeConfig.fulfillmentFlatFeeOKTTier4,
            s_feeConfig.fulfillmentFlatFeeOKTTier5,
            s_feeConfig.reqsForTier2,
            s_feeConfig.reqsForTier3,
            s_feeConfig.reqsForTier4,
            s_feeConfig.reqsForTier5
        );
    }

    function getTotalBalance() external view returns (uint256) {
        return s_totalBalance;
    }

    /**
     * @notice Owner cancel subscription, sends remaining OKT directly to the subscription owner.
     * @param subId subscription id
     * @dev notably can be called even if there are pending requests, outstanding ones may fail onchain
     */
    function ownerCancelSubscription(uint64 subId) external onlyOwner {
        if (s_subscriptionConfigs[subId].owner == address(0)) {
            revert InvalidSubscription();
        }
        cancelSubscriptionHelper(subId, s_subscriptionConfigs[subId].owner);
    }

    /**
     * @notice Recover OKT sent with transfer instead of transferAndCall.
     * @param to address to send OKT to
     */
    function recoverFunds(address to) external onlyOwner {
        uint256 externalBalance = address(this).balance;
        uint256 internalBalance = uint256(s_totalBalance);
        if (internalBalance > externalBalance) {
            revert BalanceInvariantViolated(internalBalance, externalBalance);
        }
        if (internalBalance < externalBalance) {
            uint256 amount = externalBalance - internalBalance;

            (bool success, ) = payable(to).call{value: amount, gas: 8000}("");
            require(success, "VRFCoordinatorV2::sendOKT: transfer OKT failed");

            emit FundsRecovered(to, amount);
        }
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     * @dev Looping is bounded to MAX_CONSUMERS*(number of keyhashes).
     * @dev Used to disable subscription canceling while outstanding request are present.
     */
    function pendingRequestExists(uint64 subId)
        public
        view
        override
        returns (bool)
    {
        SubscriptionConfig memory subConfig = s_subscriptionConfigs[subId];
        for (uint256 i = 0; i < subConfig.consumers.length; i++) {
            for (uint256 j = 0; j < s_provingKeyHashes.length; j++) {
                (uint256 reqId, ) = computeRequestId(
                    s_provingKeyHashes[j],
                    subConfig.consumers[i],
                    subId,
                    s_consumers[subConfig.consumers[i]][subId]
                );
                if (s_requestCommitments[reqId] != 0) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function getRequestConfig()
        external
        view
        override
        returns (
            uint16,
            uint32,
            bytes32[] memory
        )
    {
        return (
            s_config.minimumRequestConfirmations,
            s_config.maxGasLimit,
            s_provingKeyHashes
        );
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 requestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external override nonReentrant returns (uint256) {
        if (s_subscriptionConfigs[subId].owner == address(0)) {
            revert InvalidSubscription();
        }
        uint64 currentNonce = s_consumers[msg.sender][subId];
        if (currentNonce == 0) {
            revert InvalidConsumer(subId, msg.sender);
        }

        if (
            requestConfirmations < s_config.minimumRequestConfirmations ||
            requestConfirmations > MAX_REQUEST_CONFIRMATIONS
        ) {
            revert InvalidRequestConfirmations(
                requestConfirmations,
                s_config.minimumRequestConfirmations,
                MAX_REQUEST_CONFIRMATIONS
            );
        }

        if (callbackGasLimit > s_config.maxGasLimit) {
            revert GasLimitTooBig(callbackGasLimit, s_config.maxGasLimit);
        }
        if (numWords > MAX_NUM_WORDS) {
            revert NumWordsTooBig(numWords, MAX_NUM_WORDS);
        }
        uint64 nonce = currentNonce + 1;
        (uint256 requestId, uint256 preSeed) = computeRequestId(
            keyHash,
            msg.sender,
            subId,
            nonce
        );

        s_requestCommitments[requestId] = keccak256(
            abi.encode(
                requestId,
                block.number,
                subId,
                callbackGasLimit,
                numWords,
                msg.sender
            )
        );
        emit RandomWordsRequested(
            keyHash,
            requestId,
            preSeed,
            subId,
            requestConfirmations,
            callbackGasLimit,
            numWords,
            msg.sender
        );
        BlockhashStoreInterface(BLOCKHASH_STORE).store(block.number - 1);
        s_consumers[msg.sender][subId] = nonce;

        return requestId;
    }

    /**
     * @notice Get request commitment
     * @param requestId id of request
     * @dev used to determine if a request is fulfilled or not
     */
    function getCommitment(uint256 requestId) external view returns (bytes32) {
        return s_requestCommitments[requestId];
    }

    function computeRequestId(
        bytes32 keyHash,
        address sender,
        uint64 subId,
        uint64 nonce
    ) private pure returns (uint256, uint256) {
        uint256 preSeed = uint256(
            keccak256(abi.encode(keyHash, sender, subId, nonce))
        );
        return (uint256(keccak256(abi.encode(keyHash, preSeed))), preSeed);
    }

    /**
     * @dev calls target address with exactly gasAmount gas and data as calldata
     * or reverts if at least gasAmount gas is not available.
     */
    function callWithExactGas(
        uint256 gasAmount,
        address target,
        bytes memory data
    ) private returns (bool success) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let g := gas()
            // Compute g -= GAS_FOR_CALL_EXACT_CHECK and check for underflow
            // The gas actually passed to the callee is min(gasAmount, 63//64*gas available).
            // We want to ensure that we revert if gasAmount >  63//64*gas available
            // as we do not want to provide them with less, however that check itself costs
            // gas.  GAS_FOR_CALL_EXACT_CHECK ensures we have at least enough gas to be able
            // to revert if gasAmount >  63//64*gas available.
            if lt(g, GAS_FOR_CALL_EXACT_CHECK) {
                revert(0, 0)
            }
            g := sub(g, GAS_FOR_CALL_EXACT_CHECK)
            // if g - g//64 <= gasAmount, revert
            // (we subtract g//64 because of EIP-150)
            if iszero(gt(sub(g, div(g, 64)), gasAmount)) {
                revert(0, 0)
            }
            // solidity calls check that a contract actually exists at the destination, so we do the same
            if iszero(extcodesize(target)) {
                revert(0, 0)
            }
            // call and return whether we succeeded. ignore return data
            // call(gas,addr,value,argsOffset,argsLength,retOffset,retLength)
            success := call(
                gasAmount,
                target,
                0,
                add(data, 0x20),
                mload(data),
                0,
                0
            )
        }
        return success;
    }

    function getRandomnessFromProof(
        Proof memory proof,
        RequestCommitment memory rc
    )
        private
        view
        returns (
            bytes32 keyHash,
            uint256 requestId,
            uint256 randomness
        )
    {
        keyHash = hashOfKey(proof.pk);
        // Only registered proving keys are permitted.
        address oracle = s_provingKeys[keyHash];
        if (oracle == address(0)) {
            revert NoSuchProvingKey(keyHash);
        }
        requestId = uint256(keccak256(abi.encode(keyHash, proof.seed)));
        bytes32 commitment = s_requestCommitments[requestId];
        if (commitment == 0) {
            revert NoCorrespondingRequest();
        }
        if (
            commitment !=
            keccak256(
                abi.encode(
                    requestId,
                    rc.blockNum,
                    rc.subId,
                    rc.callbackGasLimit,
                    rc.numWords,
                    rc.sender
                )
            )
        ) {
            revert IncorrectCommitment();
        }

        bytes32 blockHash = blockhash(rc.blockNum - 1);
        if (blockHash == bytes32(0)) {
            blockHash = BLOCKHASH_STORE.getBlockhash(rc.blockNum - 1);
            if (blockHash == bytes32(0)) {
                revert BlockhashNotInStore(rc.blockNum);
            }
        }

        // The seed actually used by the VRF machinery, mixing in the blockhash
        uint256 actualSeed = uint256(
            keccak256(abi.encodePacked(proof.seed, blockHash))
        );
        randomness = VRF.randomValueFromVRFProof(proof, actualSeed); // Reverts on failure
    }

    /**
     * @notice Compute fee based on the request count
     * @param reqCount number of requests
     * @return fee in OKT
     */
    function getFeeTier(uint64 reqCount) public view returns (uint32) {
        FeeConfig memory fc = s_feeConfig;
        if (reqCount <= fc.reqsForTier2) {
            return fc.fulfillmentFlatFeeOKTTier1;
        } else if (reqCount <= fc.reqsForTier3) {
            return fc.fulfillmentFlatFeeOKTTier2;
        } else if (reqCount <= fc.reqsForTier4) {
            return fc.fulfillmentFlatFeeOKTTier3;
        } else if (reqCount <= fc.reqsForTier5) {
            return fc.fulfillmentFlatFeeOKTTier4;
        } else {
            return fc.fulfillmentFlatFeeOKTTier5;
        }
    }

    /**
     * @notice Fulfill a randomness request
     * @param proof contains the proof and randomness
     * @param rc request commitment pre-image, committed to at request time
     * @return payment amount billed to the subscription
     * @dev simulated offchain to determine if sufficient balance is present to fulfill the request
     */
    function fulfillRandomWords(Proof memory proof, RequestCommitment memory rc)
        external
        nonReentrant
        returns (uint96)
    {
        uint256 startGas = gasleft();
        (
            bytes32 keyHash,
            uint256 requestId,
            uint256 randomness
        ) = getRandomnessFromProof(proof, rc);

        if (tx.gasprice >= s_gasPrice[keyHash]) {
            revert GasPriceOverRange(tx.gasprice);
        }

        uint256[] memory randomWords = new uint256[](rc.numWords);
        for (uint256 i = 0; i < rc.numWords; i++) {
            randomWords[i] = uint256(keccak256(abi.encode(randomness, i)));
        }

        delete s_requestCommitments[requestId];
        VRFConsumerBaseV2 v;
        bytes memory resp = abi.encodeWithSelector(
            v.rawFulfillRandomWords.selector,
            requestId,
            randomWords
        );

        s_config.reentrancyLock = true;
        bool success = callWithExactGas(rc.callbackGasLimit, rc.sender, resp);
        s_config.reentrancyLock = false;

        uint64 reqCount = s_subscriptions[rc.subId].reqCount;
        s_subscriptions[rc.subId].reqCount += 1;

        uint96 payment = calculatePaymentAmount(
            startGas,
            s_config.gasAfterPaymentCalculation,
            getFeeTier(reqCount),
            tx.gasprice
        );
        if (s_subscriptions[rc.subId].balance < payment) {
            revert InsufficientBalance();
        }
        s_subscriptions[rc.subId].balance -= payment;
        (bool transfer, ) = payable(s_provingKeys[keyHash]).call{
            value: payment,
            gas: 8000
        }("");
        require(
            transfer,
            "VRFCoordinatorV2::fulfillRandomWords: transfer OKT failed"
        );
        emit RandomWordsFulfilled(requestId, randomness, payment, success);
        return payment;
    }

    // Get the amount of gas used for fulfillment
    function calculatePaymentAmount(
        uint256 startGas,
        uint256 gasAfterPaymentCalculation,
        uint32 fulfillmentFlatFeeOKT,
        uint256 weiPerUnitGas
    ) internal view returns (uint96) {
        uint256 paymentNoFee = weiPerUnitGas *
            (gasAfterPaymentCalculation + startGas - gasleft());
        uint256 fee = uint256(fulfillmentFlatFeeOKT);
        return uint96(paymentNoFee + fee);
    }

    /**
     * @notice user call this function to add balance for subId.
     *
     * @param amount is the OKT amount user send to this contract
     * @param subId is the target for add balance.
     */
    function charge(uint256 amount, uint64 subId)
        external
        payable
        nonReentrant
    {
        require(
            msg.value >= amount,
            "VRFCoordinatorV2::charge: send not enough okt"
        );
        if (s_subscriptionConfigs[subId].owner == address(0)) {
            revert InvalidSubscription();
        }
        // We do not check that the msg.sender is the subscription owner,
        // anyone can fund a subscription.
        uint256 oldBalance = s_subscriptions[subId].balance;
        s_subscriptions[subId].balance += uint96(amount);
        s_totalBalance += uint96(amount);
        emit SubscriptionFunded(subId, oldBalance, oldBalance + amount);
    }

    function getCurrentSubId() external view returns (uint64) {
        return s_currentSubId;
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function getSubscription(uint64 subId)
        external
        view
        override
        returns (
            uint96 balance,
            uint64 reqCount,
            address owner,
            address[] memory consumers
        )
    {
        if (s_subscriptionConfigs[subId].owner == address(0)) {
            revert InvalidSubscription();
        }
        return (
            s_subscriptions[subId].balance,
            s_subscriptions[subId].reqCount,
            s_subscriptionConfigs[subId].owner,
            s_subscriptionConfigs[subId].consumers
        );
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function createSubscription()
        external
        override
        nonReentrant
        returns (uint64)
    {
        s_currentSubId++;
        uint64 currentSubId = s_currentSubId;
        address[] memory consumers = new address[](0);
        s_subscriptions[currentSubId] = Subscription({balance: 0, reqCount: 0});
        s_subscriptionConfigs[currentSubId] = SubscriptionConfig({
            owner: msg.sender,
            requestedOwner: address(0),
            consumers: consumers
        });

        emit SubscriptionCreated(currentSubId, msg.sender);
        return currentSubId;
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function requestSubscriptionOwnerTransfer(uint64 subId, address newOwner)
        external
        override
        onlySubOwner(subId)
        nonReentrant
    {
        // Proposing to address(0) would never be claimable so don't need to check.
        if (s_subscriptionConfigs[subId].requestedOwner != newOwner) {
            s_subscriptionConfigs[subId].requestedOwner = newOwner;
            emit SubscriptionOwnerTransferRequested(
                subId,
                msg.sender,
                newOwner
            );
        }
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function acceptSubscriptionOwnerTransfer(uint64 subId)
        external
        override
        nonReentrant
    {
        if (s_subscriptionConfigs[subId].owner == address(0)) {
            revert InvalidSubscription();
        }
        if (s_subscriptionConfigs[subId].requestedOwner != msg.sender) {
            revert MustBeRequestedOwner(
                s_subscriptionConfigs[subId].requestedOwner
            );
        }
        address oldOwner = s_subscriptionConfigs[subId].owner;
        s_subscriptionConfigs[subId].owner = msg.sender;
        s_subscriptionConfigs[subId].requestedOwner = address(0);
        emit SubscriptionOwnerTransferred(subId, oldOwner, msg.sender);
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function addConsumer(uint64 subId, address consumer)
        external
        override
        onlySubOwner(subId)
        nonReentrant
    {
        // Already maxed, cannot add any more consumers.
        if (s_subscriptionConfigs[subId].consumers.length == MAX_CONSUMERS) {
            revert TooManyConsumers();
        }
        if (s_consumers[consumer][subId] != 0) {
            // Idempotence - do nothing if already added.
            // Ensures uniqueness in s_subscriptions[subId].consumers.
            return;
        }
        // Initialize the nonce to 1, indicating the consumer is allocated.
        s_consumers[consumer][subId] = 1;
        s_subscriptionConfigs[subId].consumers.push(consumer);

        emit SubscriptionConsumerAdded(subId, consumer);
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function removeConsumer(uint64 subId, address consumer)
        external
        override
        onlySubOwner(subId)
        nonReentrant
    {
        if (s_consumers[consumer][subId] == 0) {
            revert InvalidConsumer(subId, consumer);
        }
        // Note bounded by MAX_CONSUMERS
        address[] memory consumers = s_subscriptionConfigs[subId].consumers;
        uint256 lastConsumerIndex = consumers.length - 1;
        for (uint256 i = 0; i < consumers.length; i++) {
            if (consumers[i] == consumer) {
                address last = consumers[lastConsumerIndex];
                // Storage write to preserve last element
                s_subscriptionConfigs[subId].consumers[i] = last;
                // Storage remove last element
                s_subscriptionConfigs[subId].consumers.pop();
                break;
            }
        }
        delete s_consumers[consumer][subId];
        emit SubscriptionConsumerRemoved(subId, consumer);
    }

    /**
     * @inheritdoc VRFCoordinatorV2Interface
     */
    function cancelSubscription(uint64 subId, address to)
        external
        override
        onlySubOwner(subId)
        nonReentrant
    {
        if (pendingRequestExists(subId)) {
            revert PendingRequestExists();
        }
        cancelSubscriptionHelper(subId, to);
    }

    function cancelSubscriptionHelper(uint64 subId, address to)
        private
        nonReentrant
    {
        SubscriptionConfig memory subConfig = s_subscriptionConfigs[subId];
        Subscription memory sub = s_subscriptions[subId];
        uint96 balance = sub.balance;
        for (uint256 i = 0; i < subConfig.consumers.length; i++) {
            delete s_consumers[subConfig.consumers[i]][subId];
        }
        delete s_subscriptionConfigs[subId];
        delete s_subscriptions[subId];
        s_totalBalance -= balance;
        (bool success, ) = payable(to).call{value: balance, gas: 8000}("");
        if (!success) {
            revert InsufficientBalance();
        }
        emit SubscriptionCanceled(subId, to, balance);
    }

    modifier onlySubOwner(uint64 subId) {
        address owner = s_subscriptionConfigs[subId].owner;
        if (owner == address(0)) {
            revert InvalidSubscription();
        }
        if (msg.sender != owner) {
            revert MustBeSubOwner(owner);
        }
        _;
    }

    modifier nonReentrant() {
        if (s_config.reentrancyLock) {
            revert Reentrant();
        }
        _;
    }

    /**
     * @notice The type and version of this contract
     * @return Type and version string
     */
    function typeAndVersion()
        external
        pure
        virtual
        override
        returns (string memory)
    {
        return "VRFCoordinatorV2 1.0.0";
    }
}
