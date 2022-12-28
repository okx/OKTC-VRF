// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface VRFV2WrapperInterface {
    /**
     * @return the request ID of the most recent VRF V2 request made by this wrapper. This should only
     * be relied option within the same transaction that the request was made.
     */
    function lastRequestId() external view returns (uint256);

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
        returns (uint256);

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
    ) external view returns (uint256);

    /**
     * @notice Consumer contract call this function with OKT to requestRandomWords.
     *
     * @dev This function receives the OKT sent by the user and calls the VRFCoordinatorV2 contract
     * @dev to request a random number.
     *
     * @param _sender is the target for fulfillRandomWords.
     * @param _amount is the OKT amount consumer contract send to this contract.
     * @param _data is the abi encode for
     *      uint32 callbackGasLimit,
     *      uint16 requestConfirmations,
     *      uint32 numWords
     */

    function charge(
        address _sender,
        uint256 _amount,
        bytes calldata _data
    ) external payable;
}
