// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/TypeAndVersionInterface.sol";
import "./interfaces/VRFConsumerBaseV2.sol";
import "./interfaces/VRFCoordinatorV2Interface.sol";
import "./interfaces/VRFV2WrapperInterface.sol";
import "./interfaces/VRFV2WrapperConsumerBase.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/**
 * @notice A wrapper for VRFCoordinatorV2 that provides an interface better suited to one-off
 * @notice requests for randomness.
 */

contract VRFV2Wrapper is
    TypeAndVersionInterface,
    VRFConsumerBaseV2,
    VRFV2WrapperInterface,
    Ownable2StepUpgradeable
{
    event WrapperFulfillmentFailed(
        uint256 indexed requestId,
        address indexed consumer
    );

    ExtendedVRFCoordinatorV2Interface public COORDINATOR;
    uint64 public SUBSCRIPTION_ID;

    // 5k is plenty for an EXTCODESIZE call (2600) + warm CALL (100)
    // and some arithmetic operations.
    uint256 public constant GAS_FOR_CALL_EXACT_CHECK = 5_000;

    // lastRequestId is the request ID of the most recent VRF V2 request made by this wrapper. This
    // should only be relied on within the same transaction the request was made.
    uint256 public override lastRequestId;

    // Configuration fetched from VRFCoordinatorV2

    // s_configured tracks whether this contract has been configured. If not configured, randomness
    // requests cannot be made.
    bool public s_configured;

    // s_disabled disables the contract when true. When disabled, new VRF requests cannot be made
    // but existing ones can still be fulfilled.
    bool public s_disabled;

    // s_fulfillmentFlatFeeOKT is the flat fee in millionths of OKT that VRFCoordinatorV2
    // charges.
    uint32 private s_fulfillmentFlatFeeOKT;

    // Other configuration

    // s_wrapperGasOverhead reflects the gas overhead of the wrapper's fulfillRandomWords
    // function. The cost for this gas is passed to the user.
    uint32 private s_wrapperGasOverhead;

    // s_coordinatorGasOverhead reflects the gas overhead of the coordinator's fulfillRandomWords
    // function. The cost for this gas is billed to the subscription, and must therefor be included
    // in the pricing for wrapped requests. This includes the gas costs of proof verification and
    // payment calculation in the coordinator.
    uint32 private s_coordinatorGasOverhead;

    // s_wrapperPremiumPercentage is the premium ratio in percentage. For example, a value of 0
    // indicates no premium. A value of 15 indicates a 15 percent premium.
    uint8 private s_wrapperPremiumPercentage;

    //s_minGasPrice is the min gas price for user calling charge function.
    uint256 public s_minGasPrice;

    // s_keyHash is the key hash to use when requesting randomness. Fees are paid based on current gas
    // fees, so this should be set to the highest gas lane on the network.
    bytes32 s_keyHash;

    // s_maxNumWords is the max number of words that can be requested in a single wrapped VRF request.
    uint8 s_maxNumWords;

    struct Callback {
        address callbackAddress;
        uint32 callbackGasLimit;
        uint256 requestGasPrice;
        uint256 juelsPaid;
    }
    mapping(uint256 => Callback) /* requestID */ /* callback */
        public s_callbacks;

    function cancelRequest(uint256 requestID) internal override {
        VRFV2WrapperConsumerBase(s_callbacks[requestID].callbackAddress)
            .rawCancelRequest(requestID);
        delete s_callbacks[requestID];
    }

    function initialize(address _coordinator) public initializer {
        __Ownable2Step_init();
        vrfCoordinator = _coordinator;
        COORDINATOR = ExtendedVRFCoordinatorV2Interface(_coordinator);
        // Create this wrapper's subscription and add itself as a consumer.
        uint64 subId = ExtendedVRFCoordinatorV2Interface(_coordinator)
            .createSubscription();
        SUBSCRIPTION_ID = subId;
        ExtendedVRFCoordinatorV2Interface(_coordinator).addConsumer(
            subId,
            address(this)
        );
    }

    /**
     * @notice setConfig configures VRFV2Wrapper.
     *
     * @dev Sets wrapper-specific configuration based on the given parameters, and fetches any needed
     * @dev VRFCoordinatorV2 configuration from the coordinator.
     *
     * @param _minGasPrice reflects the the min gas price for user calling charge function.
     *
     * @param _wrapperGasOverhead reflects the gas overhead of the wrapper's fulfillRandomWords
     *        function.
     *
     * @param _coordinatorGasOverhead reflects the gas overhead of the coordinator's
     *        fulfillRandomWords function.
     *
     * @param _wrapperPremiumPercentage is the premium ratio in percentage for wrapper requests.
     *
     * @param _keyHash to use for requesting randomness.
     */
    function setConfig(
        uint256 _minGasPrice,
        uint32 _wrapperGasOverhead,
        uint32 _coordinatorGasOverhead,
        uint8 _wrapperPremiumPercentage,
        bytes32 _keyHash,
        uint8 _maxNumWords
    ) external onlyOwner {
        s_wrapperGasOverhead = _wrapperGasOverhead;
        s_coordinatorGasOverhead = _coordinatorGasOverhead;
        s_wrapperPremiumPercentage = _wrapperPremiumPercentage;
        s_keyHash = _keyHash;
        s_maxNumWords = _maxNumWords;
        s_configured = true;
        require(
            _minGasPrice <= COORDINATOR.s_gasPrice(s_keyHash),
            "VRFV2Wrapper::setConfig: too much gas price"
        );
        s_minGasPrice = _minGasPrice;
        (s_fulfillmentFlatFeeOKT, , , , , , , , ) = COORDINATOR.getFeeConfig();
    }

    /**
     * @notice getConfig returns the current VRFV2Wrapper configuration.
     *
     * @return fulfillmentFlatFeeOKT is the flat fee in millionths of OKT that VRFCoordinatorV2
     *         charges.
     *
     * @return wrapperGasOverhead reflects the gas overhead of the wrapper's fulfillRandomWords
     *         function. The cost for this gas is passed to the user.
     *
     * @return coordinatorGasOverhead reflects the gas overhead of the coordinator's
     *         fulfillRandomWords function.
     *
     * @return wrapperPremiumPercentage is the premium ratio in percentage. For example, a value of 0
     *         indicates no premium. A value of 15 indicates a 15 percent premium.
     *
     * @return keyHash is the key hash to use when requesting randomness. Fees are paid based on
     *         current gas fees, so this should be set to the highest gas lane on the network.
     *
     * @return maxNumWords is the max number of words that can be requested in a single wrapped VRF
     *         request.
     */
    function getConfig()
        external
        view
        returns (
            uint32 fulfillmentFlatFeeOKT,
            uint32 wrapperGasOverhead,
            uint32 coordinatorGasOverhead,
            uint8 wrapperPremiumPercentage,
            bytes32 keyHash,
            uint8 maxNumWords
        )
    {
        return (
            s_fulfillmentFlatFeeOKT,
            s_wrapperGasOverhead,
            s_coordinatorGasOverhead,
            s_wrapperPremiumPercentage,
            s_keyHash,
            s_maxNumWords
        );
    }

    /**
     * @notice Calculates the price of a VRF request with the given callbackGasLimit at the current
     * @notice block.
     *
     * @dev This function relies on the transaction gas price which is not automatically set during
     * @dev simulation. To estimate the price at a specific gas price, use the estimatePrice function.
     *
     * @param _callbackGasLimit is the gas limit used to estimate the price.
     */
    function calculateRequestPrice(uint32 _callbackGasLimit)
        external
        view
        override
        onlyConfiguredNotDisabled
        returns (uint256)
    {
        return calculateRequestPriceInternal(_callbackGasLimit, tx.gasprice);
    }

    /**
     * @notice Estimates the price of a VRF request with a specific gas limit and gas price.
     *
     * @dev This is a convenience function that can be called in simulation to better understand
     * @dev pricing.
     *
     * @param _callbackGasLimit is the gas limit used to estimate the price.
     * @param _requestGasPriceWei is the gas price in wei used for the estimation.
     */
    function estimateRequestPrice(
        uint32 _callbackGasLimit,
        uint256 _requestGasPriceWei
    ) external view override onlyConfiguredNotDisabled returns (uint256) {
        return
            calculateRequestPriceInternal(
                _callbackGasLimit,
                _requestGasPriceWei
            );
    }

    function calculateRequestPriceInternal(
        uint256 _gas,
        uint256 _requestGasPrice
    ) internal view returns (uint256) {
        uint256 baseFee = _requestGasPrice *
            (_gas + s_wrapperGasOverhead + s_coordinatorGasOverhead);

        uint256 feeWithPremium = (baseFee *
            (s_wrapperPremiumPercentage + 100)) / 100;

        uint256 feeWithFlatFee = feeWithPremium + s_fulfillmentFlatFeeOKT;

        return feeWithFlatFee;
    }

    /**
     * @inheritdoc VRFV2WrapperInterface
     */

    function charge(address _sender, bytes calldata _data)
        external
        payable
        override
        onlyConfiguredNotDisabled
    {
        uint256 _amount = msg.value;

        (
            uint32 callbackGasLimit,
            uint16 requestConfirmations,
            uint32 numWords
        ) = abi.decode(_data, (uint32, uint16, uint32));
        uint32 eip150Overhead = getEIP150Overhead(callbackGasLimit);
        require(
            tx.gasprice >= s_minGasPrice,
            "VRFV2Wrapper::charge: tx.gasprice too low"
        );
        uint256 price = calculateRequestPriceInternal(
            callbackGasLimit,
            tx.gasprice
        );
        require(_amount >= price, "VRFV2Wrapper::charge: fee too low");
        require(
            numWords <= s_maxNumWords,
            "VRFV2Wrapper::charge: numWords too high"
        );

        uint256 requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            SUBSCRIPTION_ID,
            requestConfirmations,
            callbackGasLimit + eip150Overhead + s_wrapperGasOverhead,
            numWords
        );
        s_callbacks[requestId] = Callback({
            callbackAddress: _sender,
            callbackGasLimit: callbackGasLimit,
            requestGasPrice: tx.gasprice,
            juelsPaid: _amount
        });
        lastRequestId = requestId;
    }

    /**
     * @notice withdraw is used by the VRFV2Wrapper's owner to withdraw OKT revenue.
     *
     * @param _recipient is the address that should receive the OKT funds.
     *
     * @param _amount is the amount of OKT in Juels that should be withdrawn.
     */
    function withdraw(address _recipient, uint256 _amount) external onlyOwner {
        require(
            _amount <= address(this).balance,
            "VRFV2Wrapper::sendOKT: Not enough OKT left"
        );
        (bool success, ) = payable(_recipient).call{value: _amount, gas: 8000}(
            ""
        );
        require(success, "VRFV2Wrapper::sendOKT: transfer OKT failed");
    }

    /**
     * @notice enable this contract so that new requests can be accepted.
     */
    function enable() external onlyOwner {
        s_disabled = false;
    }

    /**
     * @notice disable this contract so that new requests will be rejected. When disabled, new requests
     * @notice will revert but existing requests can still be fulfilled.
     */
    function disable() external onlyOwner {
        s_disabled = true;
    }

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal override {
        Callback memory callback = s_callbacks[_requestId];
        delete s_callbacks[_requestId];
        require(
            callback.callbackAddress != address(0),
            "VRFV2Wrapper::fulfillRandomWords: request not found"
        ); // This should never happen

        VRFV2WrapperConsumerBase c;
        bytes memory resp = abi.encodeWithSelector(
            c.rawFulfillRandomWords.selector,
            _requestId,
            _randomWords
        );

        bool success = callWithExactGas(
            callback.callbackGasLimit,
            callback.callbackAddress,
            resp
        );
        if (!success) {
            emit WrapperFulfillmentFailed(_requestId, callback.callbackAddress);
        }
    }

    /**
     * @dev Calculates extra amount of gas required for running an assembly call() post-EIP150.
     */
    function getEIP150Overhead(uint32 gas) private pure returns (uint32) {
        return gas / 63 + 1;
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
            if iszero(gt(sub(g, div(g, 64)), gasAmount)) {
                revert(0, 0)
            }
            // // solidity calls check that a contract actually exists at the destination, so we do the same
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

    function typeAndVersion()
        external
        pure
        virtual
        override
        returns (string memory)
    {
        return "VRFV2Wrapper 1.0.0";
    }

    modifier onlyConfiguredNotDisabled() {
        require(s_configured, "wrapper is not configured");
        require(!s_disabled, "wrapper is disabled");
        _;
    }
}

interface ExtendedVRFCoordinatorV2Interface is VRFCoordinatorV2Interface {
    function s_gasPrice(bytes32 _key) external view returns (uint256);

    function getConfig()
        external
        view
        returns (
            uint16 minimumRequestConfirmations,
            uint32 maxGasLimit,
            uint32 stalenessSeconds,
            uint32 gasAfterPaymentCalculation
        );

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
        );
}
