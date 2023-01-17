// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

library Errors {
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
}
