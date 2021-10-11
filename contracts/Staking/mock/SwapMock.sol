// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

contract SwapMock {
    using SafeMath for uint256;

    IERC20 currency;
    IERC20 token;

    constructor(IERC20 _currency, IERC20 _token) public {
        currency = _currency;
        token = _token;
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts) {
        uint[] memory amounts;
        currency.transferFrom(msg.sender, address(this), amountIn);
        token.transfer(to, amountOutMin);

        return amounts;
    }
}