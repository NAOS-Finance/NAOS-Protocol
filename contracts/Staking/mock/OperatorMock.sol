// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

contract OperatorMock {
    using SafeMath for uint256;

    IERC20 currency;
    IERC20 token;
    uint256 supplyAmount = 0;
    uint256 redeemAmount = 0; 

    constructor(IERC20 _currency, IERC20 _token) public {
        currency = _currency;
        token = _token;
    }

    function supplyOrder(uint256 newSupplyAmount) external {
        if (newSupplyAmount >= supplyAmount) {
            currency.transferFrom(msg.sender, address(this), newSupplyAmount.sub(supplyAmount));
            supplyAmount = newSupplyAmount;
        } else {
            currency.transfer(msg.sender, supplyAmount.sub(newSupplyAmount));
            supplyAmount = newSupplyAmount;
        }
    }

    function redeemOrder(uint256 newRedeemAmount) external {
        if (newRedeemAmount >= redeemAmount) {
            token.transferFrom(msg.sender, address(this), newRedeemAmount.sub(redeemAmount));
            redeemAmount = newRedeemAmount;
        } else {
            token.transfer(msg.sender, redeemAmount.sub(newRedeemAmount));
            redeemAmount = newRedeemAmount;
        }
    }

    function disburse()
        external
        returns (
            uint256 payoutCurrencyAmount,
            uint256 payoutTokenAmount,
            uint256 remainingSupplyCurrency,
            uint256 remainingRedeemToken
        )
    {
        return (0, 0, 0, 0);
    }

    function getTokenPriceByEpoch(uint256 _index) external view returns (uint256) {
        return 1e27;
    }
}
