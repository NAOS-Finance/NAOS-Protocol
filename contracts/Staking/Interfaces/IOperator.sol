pragma solidity 0.6.12;

interface IOperator {
    function supplyOrder(uint256 newSupplyAmount) external;

    function redeemOrder(uint256 newRedeemAmount) external;

    //TODO: If not work, need to add a function to get tranche address
    function disburse()
        external
        returns (
            uint256 payoutCurrencyAmount,
            uint256 payoutTokenAmount,
            uint256 remainingSupplyCurrency,
            uint256 remainingRedeemToken
        );
}
