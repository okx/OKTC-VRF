// SPDX-License-Identifier: MIT
// An example of a consumer contract that directly pays for each request.
pragma solidity ^0.8.7;

import "../interfaces/VRFV2WrapperConsumerBase.sol";

contract mockVRFV2WrapperConsumerExample is VRFV2WrapperConsumerBase {
    event RequestFulfilled(
        uint256 requestId,
        uint256[] randomWords,
        uint256 payment
    );

    constructor(
        address _vrfV2Wrapper
    ) VRFV2WrapperConsumerBase(_vrfV2Wrapper) {}

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal override {
        require(s_requests[_requestId].paid > 0, "request not found");

        s_requests[_requestId].fulfilled = true;
        s_requests[_requestId].randomWords = _randomWords;
        emit RequestFulfilled(
            _requestId,
            _randomWords,
            s_requests[_requestId].paid
        );
    }

    function requestRandomnessForTest(
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        uint32 _numWords
    ) external payable returns (uint256 requestId) {
        VRF_V2_WRAPPER.charge{value: msg.value}(
            address(this),
            VRF_V2_WRAPPER.calculateRequestPrice(_callbackGasLimit) - 1,
            abi.encode(_callbackGasLimit, _requestConfirmations, _numWords)
        );
        return VRF_V2_WRAPPER.lastRequestId();
    }
}
