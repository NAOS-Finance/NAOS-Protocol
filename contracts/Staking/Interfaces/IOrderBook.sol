pragma solidity 0.6.12;

interface IOrderBook {
    function setPool() external;
    function deposit(uint256 _poolId, uint256 _amount) external;
    function register(address _user, uint256 _poolId, uint256 _amount) external;
    function getCurrentEpoch() external view returns (uint256 epoch);
    function getEpochTokenPrice(uint256 _index) external view returns (uint256 rTokenPrice);
}