pragma solidity 0.6.12;

interface IBoostPool {
    function getPoolTotalDeposited() external view returns (uint256);
    function getStakeTotalDeposited(address _account) external view returns (uint256);
}