// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStakingPoolWithTransfer {
    function reward() external returns (IERC20);
    function donateReward(uint poolId, uint256 donateAmount) external;
}
