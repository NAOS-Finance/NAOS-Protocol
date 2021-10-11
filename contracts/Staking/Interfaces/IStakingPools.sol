pragma solidity 0.6.12;

interface IStakingPool {
    function updateDepositedToken(uint256 poolId, uint256 depositedToken) external;

    function transmute(
        uint256 poolId,
        address user,
        uint256 reducedRToken,
        uint256 payoutCurrency
    ) external;
}
