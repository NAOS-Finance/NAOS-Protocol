// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {IOperator} from "./Interfaces/IOperator.sol";
import {ITranche} from "./Interfaces/ITranche.sol";
import {IStakingPool} from "./Interfaces/IStakingPools.sol";
import {IEpochTicker} from "./Interfaces/IEpochTicker.sol";

//TODO: add event
contract OrderBook {
    using SafeMath for uint256;

    struct EpochInfo {
        uint256 epoch;
        uint256 rTokenPrice;
    }

    struct Order {
        address user;
        uint256 poolId;
        uint256 redeemTokenAmount;
    }

    /// @dev Stable token;
    IERC20 token;

    /// @dev Revenue token;
    IERC20 rToken;

    /// @dev Staking pool;
    IStakingPool stakingPool;

    /// @dev Galaxy operator;
    IOperator operator;

    /// @dev Galaxy tranche;
    ITranche tranche;

    /// @dev epoch ticker
    IEpochTicker epochTicker;

    address public constant ZERO_ADDRESS = address(0);

    /// @dev Pool count;
    uint256 poolCount;

    /// @dev The supplied currency
    uint256 totalSupplyCurrency;

    /// @dev The redeemed token
    uint256 totalRedeemTokenAmount;

    /// @dev The start index of redeem list
    uint256 orderBookIndex;

    /// @dev The address of the account which currently has administrative capabilities over this contract.
    address public governance;

    /// @dev The address of the pending governance.
    address public pendingGovernance;

    /// @dev Whitelist staking pool.
    address public whiteListPool;

    /// @dev Supply currency of each pool.
    mapping(uint256 => uint256) public poolSupplyCurrency;

    /// @dev Redeem order book.
    Order[] orderBook;

    /// @dev Epoch information.
    EpochInfo[] epochs;

    /// @dev Checks that the current message sender or caller is the governance address.
    modifier onlyGov() {
        require(msg.sender == governance, "OrderBook: !governance");
        _;
    }

    /// @dev A modifier which checks if whitelisted for minting.
    modifier onlyWhitelistedPool() {
        require(whiteListPool == msg.sender, "OrderBook: !whitelisted");
        _;
    }

    /// @dev Check if the epoch has been updated to the lastest version.
    modifier checkEpochUpdated() {
        uint256 currentEpoch = epochTicker.currentEpoch();
        if (epochs.length != 0) {
            EpochInfo memory epochInfo = epochs[epochs.length - 1];
            require(
                currentEpoch == epochInfo.epoch,
                "OrderBook: epoch hasn't updated"
            );
        }
        _;
    }

    event GovernanceUpdated(address governance);

    event PendingGovernanceUpdated(address pendingGovernance);

    constructor(
        IERC20 _token,
        IERC20 _rToken,
        IStakingPool _stakingPool,
        IOperator _operator,
        IEpochTicker _epochTicker,
        address _whiteListPool,
        address _governance
    ) public {
        token = _token;
        rToken = _rToken;
        stakingPool = _stakingPool;
        operator = _operator;
        tranche = operator.tranche();
        epochTicker = _epochTicker;
        whiteListPool = _whiteListPool;
        governance = _governance;
    }

    /// @dev Sets the pending governance.
    ///
    /// This function reverts if the new pending governance is the zero address or the caller is not the current
    /// governance. This is to prevent the contract governance being set to the zero address which would deadlock
    /// privileged contract functionality.
    ///
    /// @param _pendingGovernance the new pending governance.
    function setPendingGovernance(address _pendingGovernance) external onlyGov {
        require(
            _pendingGovernance != ZERO_ADDRESS,
            "OrderBook: governance address cannot be 0x0."
        );

        pendingGovernance = _pendingGovernance;

        emit PendingGovernanceUpdated(_pendingGovernance);
    }

    /// @dev Accepts the role as governance.
    ///
    /// This function reverts if the caller is not the new pending governance.
    function acceptGovernance() external {
        require(
            msg.sender == pendingGovernance,
            "OrderBook: !pendingGovernance"
        );

        address _pendingGovernance = pendingGovernance;
        governance = _pendingGovernance;

        emit GovernanceUpdated(_pendingGovernance);
    }

    /// @dev Initialize new pool
    /// This function reverts if the caller is not whitelisted pool
    ///
    function setPool() external onlyWhitelistedPool {
        poolSupplyCurrency[poolCount] = 0;
        poolCount++;
    }

    /// @dev Deposit user's currency into Galaxy.
    ///
    /// @param _poolId The staking pool id which currency transfers from.
    /// @param _amount The deposit amount
    function deposit(uint256 _poolId, uint256 _amount)
        external
        onlyWhitelistedPool
        checkEpochUpdated
    {
        token.transferFrom(msg.sender, address(this), _amount);
        poolSupplyCurrency[_poolId] = poolSupplyCurrency[_poolId].add(_amount);
        totalSupplyCurrency = totalSupplyCurrency.add(_amount);
        operator.supplyOrder(totalSupplyCurrency);
    }

    /// @dev Register to redeem tokens.
    ///
    /// @param _user The user who wants to redeem the tokens.
    /// @param _poolId The staking pool id.
    /// @param _amount The redeem amount.
    function register(
        address _user,
        uint256 _poolId,
        uint256 _amount
    ) external onlyWhitelistedPool checkEpochUpdated {
        totalRedeemTokenAmount = totalRedeemTokenAmount.add(_amount);
        orderBook.push(
            Order({user: _user, poolId: _poolId, redeemTokenAmount: _amount})
        );
        operator.redeemOrder(totalRedeemTokenAmount);
    }

    // TODO: Handle for-loop
    // TODO: Restricted permissions
    /// @dev After Galaxy epoch closes, this function is called to update the snapshot.
    function disburse() external {
        (
            uint256 payoutCurrencyAmount,
            uint256 payoutTokenAmount,
            uint256 remainingSupplyCurrency,
            uint256 remainingRedeemToken
        ) = operator.disburse();
        uint256 currentEpoch = epochTicker.currentEpoch();
        if (epochs.length > 0) {
            EpochInfo memory epochInfo = epochs[epochs.length - 1];
            require(
                currentEpoch != epochInfo.epoch,
                "OrderBook: epoch has been updated"
            );
        }
        uint256 tokenPrice = tranche.getTokenPriceByEpoch(
            currentEpoch
        );
        epochs.push(EpochInfo({epoch: currentEpoch, rTokenPrice: tokenPrice}));

        totalSupplyCurrency = 0;
        for (uint256 poolIndex = 0; poolIndex < poolCount; poolIndex++) {
            stakingPool.updateDepositedToken(
                poolIndex,
                poolSupplyCurrency[poolIndex].div(tokenPrice)
            );
            poolSupplyCurrency[poolIndex] = 0;
        }

        uint256 redeemedToken = totalRedeemTokenAmount - remainingRedeemToken;
        totalRedeemTokenAmount = remainingRedeemToken;
        token.transfer(address(stakingPool), payoutCurrencyAmount);
        for (uint256 i = orderBookIndex; i < orderBook.length; i++) {
            Order storage order = orderBook[i];
            if (order.redeemTokenAmount >= redeemedToken) {
                order.redeemTokenAmount = order.redeemTokenAmount.sub(
                    redeemedToken
                );
                stakingPool.transmute(
                    order.poolId,
                    order.user,
                    redeemedToken,
                    payoutCurrencyAmount
                );
                return;
            }
            redeemedToken = redeemedToken.sub(order.redeemTokenAmount);
            // TODO: check decimal
            uint256 redeemCurrencyAmount = order.redeemTokenAmount.mul(
                tokenPrice
            );
            payoutCurrencyAmount = payoutCurrencyAmount.sub(
                redeemCurrencyAmount
            );
            stakingPool.transmute(
                order.poolId,
                order.user,
                order.redeemTokenAmount,
                redeemCurrencyAmount
            );
            order.redeemTokenAmount = 0;
            orderBookIndex++;
        }
    }

    /// @dev Get current epoch.
    function getCurrentEpoch() external view returns (uint256 epoch) {
        if (epochs.length == 0) {
            return 0;
        }
        EpochInfo memory epochInfo = epochs[epochs.length - 1];
        return epochInfo.epoch;
    }

    /// @dev Get token price by epoch index
    function getEpochTokenPrice(uint256 _index)
        external
        view
        returns (uint256 rTokenPrice)
    {
        require(_index < epochs.length, "invalid index");
        EpochInfo memory epochInfo = epochs[_index];
        return epochInfo.rTokenPrice;
    }
}
