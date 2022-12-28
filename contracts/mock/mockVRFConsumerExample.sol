// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./mockCoordinatorV2Interface.sol";
import "../interfaces/VRFConsumerBaseV2.sol";

contract mockVRFConsumerExample is VRFConsumerBaseV2 {
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);

    struct RequestStatus {
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
        uint256[] randomWords;
    }
    mapping(uint256 => RequestStatus) public s_requests; /* requestId --> requestStatus */
    VRFCoordinatorV2Interface public COORDINATOR;

    // Your subscription ID.
    uint64 s_subscriptionId;

    // past requests Id.
    uint256[] public requestIds;
    uint256 public lastRequestId;
    uint256 public lastPreSeed;
    uint256 public lastRequestBlockNumber;

    bytes32 keyHash;

    uint32 callbackGasLimit;

    uint16 requestConfirmations;

    uint32 numWords;

    constructor(
        uint64 subscriptionId,
        address VRFCoordinatorV2Interfaceaddr,
        bytes32 _keyHash,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        uint32 _numWords
    ) {
        vrfCoordinator = VRFCoordinatorV2Interfaceaddr;
        COORDINATOR = VRFCoordinatorV2Interface(VRFCoordinatorV2Interfaceaddr);
        s_subscriptionId = subscriptionId;
        keyHash = _keyHash;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        numWords = _numWords;
    }

    // Assumes the subscription is funded sufficiently.
    function requestRandomWords()
        external
        returns (uint256 requestId, uint256 preseed)
    {
        // Will revert if subscription is not set and funded.
        (requestId, preseed) = COORDINATOR.requestRandomWords(
            keyHash,
            s_subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        s_requests[requestId] = RequestStatus({
            randomWords: new uint256[](0),
            exists: true,
            fulfilled: false
        });
        requestIds.push(requestId);
        lastRequestId = requestId;
        lastPreSeed = preseed;
        lastRequestBlockNumber = block.number;
        emit RequestSent(requestId, numWords);
        return (requestId, preseed);
    }

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal override {
        require(s_requests[_requestId].exists, "request not found");
        s_requests[_requestId].fulfilled = true;
        s_requests[_requestId].randomWords = _randomWords;
        emit RequestFulfilled(_requestId, _randomWords);
    }

    function getRequestStatus(uint256 _requestId)
        external
        view
        returns (bool fulfilled, uint256[] memory randomWords)
    {
        require(s_requests[_requestId].exists, "request not found");
        RequestStatus memory request = s_requests[_requestId];
        return (request.fulfilled, request.randomWords);
    }
}
