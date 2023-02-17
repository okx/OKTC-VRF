// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./VRFV2WrapperInterface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/** *******************************************************************************
 * @notice Interface for contracts using VRF randomness through the VRF V2 wrapper
 * ********************************************************************************
 * @dev PURPOSE
 *
 * @dev Create VRF V2 requests without the need for subscription management. Rather than creating
 * @dev and funding a VRF V2 subscription, a user can use this wrapper to create one off requests,
 * @dev paying up front rather than at fulfillment.
 *
 * @dev Since the price is determined using the gas price of the request transaction rather than
 * @dev the fulfillment transaction, the wrapper charges an additional premium on callback gas
 * @dev usage, in addition to some extra overhead costs associated with the VRFV2Wrapper contract.
 * *****************************************************************************
 * @dev USAGE
 *
 * @dev Calling contracts must inherit from VRFV2WrapperConsumerBase. The consumer must be funded
 * @dev with enough OKT to make the request, otherwise requests will revert. To request randomness,
 * @dev call the 'requestRandomness' function with the desired VRF parameters. This function handles
 * @dev paying for the request based on the current pricing.
 *
 * @dev Consumers must implement the fullfillRandomWords function, which will be called during
 * @dev fulfillment with the randomness result.
 */
abstract contract VRFV2WrapperConsumerBase is Ownable {
    VRFV2WrapperInterface public immutable VRF_V2_WRAPPER;

    struct RequestStatus {
        uint256 paid; // amount paid in OKT
        bool fulfilled; // whether the request has been successfully fulfilled
        uint256[] randomWords;
    }
    mapping(uint256 => RequestStatus) public s_requests; /* requestId --> requestStatus */

    // past requests Id.
    uint256[] public requestIds;
    uint256 public lastRequestId;

    /**
     * @param _vrfV2Wrapper is the address of the VRFV2Wrapper contract
     */

    constructor(address _vrfV2Wrapper) Ownable() {
        VRF_V2_WRAPPER = VRFV2WrapperInterface(_vrfV2Wrapper);
    }

    function getRequestStatus(uint256 _requestId)
        external
        view
        returns (
            uint256 paid,
            bool fulfilled,
            uint256[] memory randomWords
        )
    {
        require(s_requests[_requestId].paid > 0, "request not found");
        RequestStatus memory request = s_requests[_requestId];
        return (request.paid, request.fulfilled, request.randomWords);
    }

    /**
     * @dev Requests randomness from the VRF V2 wrapper.
     *
     * @param _callbackGasLimit is the gas limit that should be used when calling the consumer's
     *        fulfillRandomWords function.
     * @param _requestConfirmations is the number of confirmations to wait before fulfilling the
     *        request. A higher number of confirmations increases security by reducing the likelihood
     *        that a chain re-org changes a published randomness outcome.
     * @param _numWords is the number of random words to request.
     *
     * @return requestId is the VRF V2 request ID of the newly created randomness request.
     */
    function requestRandomness(
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        uint32 _numWords
    ) external payable virtual returns (uint256 requestId) {
        uint256 requestPrice = VRF_V2_WRAPPER.calculateRequestPrice(
            _callbackGasLimit
        );
        VRF_V2_WRAPPER.charge{value: requestPrice}(
            address(this),
            abi.encode(_callbackGasLimit, _requestConfirmations, _numWords)
        );
        lastRequestId = VRF_V2_WRAPPER.lastRequestId();
        requestIds.push(lastRequestId);
        s_requests[lastRequestId].paid = requestPrice;
        return lastRequestId;
    }

    /**
     * @notice withdraw is used by owner to withdraw OKT revenue.
     */
    function withdraw() external onlyOwner {
        (bool success, ) = payable(msg.sender).call{
            value: address(this).balance,
            gas: 8000
        }("");
        require(success, "VRFV2Wrapper::sendOKT: transfer OKT failed");
    }

    /**
     * @notice fulfillRandomWords handles the VRF V2 wrapper response. The consuming contract must
     * @notice implement it.
     *
     * @param _requestId is the VRF V2 request ID.
     * @param _randomWords is the randomness result.
     */

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal virtual;

    function rawFulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) external {
        require(
            msg.sender == address(VRF_V2_WRAPPER),
            "only VRF V2 wrapper can fulfill"
        );
        fulfillRandomWords(_requestId, _randomWords);
    }
}
