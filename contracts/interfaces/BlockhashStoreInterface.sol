// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface BlockhashStoreInterface {
    function storeVerifyHeader(uint256 n, bytes memory header) external;

    function store(uint256 n) external;

    function getBlockhash(uint256 number) external view returns (bytes32);
}
