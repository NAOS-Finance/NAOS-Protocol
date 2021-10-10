pragma solidity 0.6.12;

interface IEpochTicker {
    function currentEpoch() external returns (uint256 epoch);
}
