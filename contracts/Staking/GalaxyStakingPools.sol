// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {FixedPointMath} from "./libraries/FixedPointMath.sol";
import {Pool} from "./libraries/pools/Pool.sol";
import {Stake} from "./libraries/pools/Stake.sol";
import {IBoostPool} from "./Interfaces/IBoostPool.sol";
import {IEpochTicker} from "./Interfaces/IEpochTicker.sol";
import {IOperator} from "./Interfaces/IOperator.sol";
import {ITranche} from "./Interfaces/ITranche.sol";

contract GalaxyStakingPools is ReentrancyGuardUpgradeable {
    using FixedPointMath for FixedPointMath.uq192x64;
    using Pool for Pool.Data;
    using Pool for Pool.List;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using Stake for Stake.Data;

    struct DepositedOrder {
        address owner;
        uint256 poolId;
        uint256 amount;
        uint256 expiredTime;
        uint256 redeemToken;
        uint256 remainingRedeemToken;
        uint256 redeemedCurrency;
        uint256 epoch;
        bool isRedeem;
    }

    /// @dev The context shared between the pools.
    Pool.Context private _ctx;

    /// @dev A list of all of the pools.
    Pool.List private _pools;

    /// @dev Stable currency
    IERC20 public currency;

    /// @dev Investment certificate token
    IERC20 public alpha;

    /// @dev Reward token
    IERC20 public token;

    /// @dev Boost pool
    IBoostPool public boostPool;

    /// @dev Epoch ticker
    IEpochTicker public epochTicker;

    /// @dev Galaxy tranche
    ITranche public tranche;

    /// @dev Galaxy operator
    IOperator public operator;

    /// @dev Zero address
    address public constant ZERO_ADDRESS = address(0);

    /// @dev The address of the account which currently has administrative capabilities over this contract.
    address public governance;

    /// @dev The address of the pending governance.
    address public pendingGovernance;

    /// @dev Max number of for loop execution
    uint256 public constant MAX_EXECUTION = 20;

    /// @dev values needed to calculate the token price of reward token
    uint256 public constant pointMultiplier = 1e27;

    /// @dev The deposited order count
    uint256 public depositedOrderCount;

    /// @dev The total supplied currency
    uint256 public totalSupplyCurrency;

    /// @dev The total redeemed token
    uint256 public totalRedeemTokenAmount;

    /// @dev The redeem order count
    uint256 public redeemOrderCount;

    /// @dev The start index of redeem list
    uint256 public redeemOrderListPendingIndex;

    /// @dev The current epoch
    uint256 public currentEpoch;

    /// @dev The remaining redeemed token amount
    uint256 public remainingRedeemTokenAmount;

    /// @dev The remaining payout currency amount
    uint256 public remainingPayoutCurrencyAmount;

    /// @dev The epoch has been updated or not
    bool public epochUpdated;

    /// @dev A mapping of all of the user stakes mapped first by pool and then by address.
    mapping(address => mapping(uint256 => Stake.Data)) private _stakes;

    /// @dev A mapping of user's remaining redeem token
    mapping(address => uint256) public userRemainingRedeemToken;

    /// @dev A mapping of user's unclaimed currency
    mapping(address => uint256) public userUnclaimedCurrency;

    /// @dev The record of user's deposited orders.
    mapping(uint256 => DepositedOrder) public depositedOrderList;

    /// @dev The redeem list.
    mapping(uint256 => uint256) public redeemOrderList;

    /// @dev Deposited amount for each pool
    mapping(uint256 => uint256) public depositedAmount;

    /// @dev token price of each epoch
    mapping(uint256 => uint256) public epochTokenPrice;

    /// @dev The approval of the deposited order transfer, will implement in the next verison
    mapping(address => mapping(uint256 => bool)) public approval;

    /// @dev admin
    mapping(address => bool) public admins;

    /// @dev whitelist
    mapping(address => bool) public whitelist;

    /// @dev Checks that the current message sender or caller is the governance address.
    modifier onlyGov() {
        require(msg.sender == governance, "GalaxyStakingPools: !governance");
        _;
    }

    /// @dev Checks that the current message sender or caller is the admin address.
    modifier onlyAdmins() {
        require(admins[msg.sender], "GalaxyStakingPools: !admin");
        _;
    }

    /// @dev only whitelisted address can interact with the contract
    modifier onlyWhitelist() {
        require(whitelist[msg.sender], "GalaxyStakingPools: !whitelist");
        _;
    }

    /// @dev Check that the epoch has been updated.
    modifier onlyUpdated() {
        require(
            epochTicker.currentEpoch() == currentEpoch && epochUpdated,
            "Wait for epoch updated"
        );
        _;
    }

    event GovernanceUpdated(address governance);

    event PendingGovernanceUpdated(address pendingGovernance);

    event AdminUpdated(address indexed user, bool state);

    event WhitelistUpdated(address indexed user, bool state);

    event PoolCreated(uint256 indexed poolId, uint256 indexed expiredTimestamp);

    event RewardRateUpdated(uint256 rewardRate);

    event DepositedCeilingUpdated(uint256 poolId, uint256 amount);

    event PoolRewardWeightUpdated(uint256 indexed poolId, uint256 rewardWeight);

    event TokensDeposited(address indexed user, uint256 amount, uint256 index);

    event TokensWithdrawn(address indexed user, uint256 amount);

    event TokensClaimed(address indexed user, uint256 amount);

    event DepositedOrderRedeemUpdated(
        uint256 depositedOrderIndex,
        uint256 RedeemOrderListindex
    );

    function initialize(
        IERC20 _currency,
        IERC20 _token,
        IERC20 _alpha,
        IBoostPool _boostPool,
        IEpochTicker _epochTicker,
        ITranche _tranche,
        IOperator _operator,
        address _governance
    ) public initializer {
        currency = _currency;
        token = _token;
        alpha = _alpha;
        boostPool = _boostPool;
        epochTicker = _epochTicker;
        tranche = _tranche;
        operator = _operator;
        governance = _governance;

        epochUpdated = true;
        currency.approve(address(tranche), uint256(-1));
        _alpha.approve(address(tranche), uint256(-1));
        __ReentrancyGuard_init();
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
            "GalaxyStakingPools: governance address cannot be 0x0."
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
            "GalaxyStakingPools: !pendingGovernance"
        );

        governance = pendingGovernance;

        emit GovernanceUpdated(pendingGovernance);
    }

    /// @dev Sets the user into admins list.
    ///
    /// @param _user The user address.
    /// @param _state The admin state which will be set.
    function setAdmin(address _user, bool _state) external onlyGov {
        admins[_user] = true;

        emit AdminUpdated(_user, _state);
    }

    /// @dev Sets the user into whitelist.
    ///
    /// @param _user The user address.
    /// @param _state The whitelist state which will be set.
    function setWhitelist(address _user, bool _state) external onlyAdmins {
        whitelist[_user] = true;

        emit WhitelistUpdated(_user, _state);
    }

    /// @dev Sets the distribution reward rate.
    ///
    /// This will update all of the pools.
    ///
    /// @param _rewardRate The number of tokens to distribute per block.
    function setRewardRate(uint256 _rewardRate) external onlyGov {
        _updatePools();
        _ctx.rewardRate = _rewardRate;

        emit RewardRateUpdated(_rewardRate);
    }

    /// @dev Sets the reward weights of all of the pools.
    ///
    /// This will update all of the pools.
    ///
    /// @param _rewardWeights The reward weights of all of the pools.
    function setRewardWeights(uint256[] calldata _rewardWeights)
        external
        onlyGov
    {
        require(
            _rewardWeights.length == _pools.length(),
            "GalaxyStakingPools: weights length mismatch"
        );

        _updatePools();
        uint256 _totalRewardWeight = _ctx.totalRewardWeight;
        for (uint256 _poolId = 0; _poolId < _pools.length(); _poolId++) {
            Pool.Data storage _pool = _pools.get(_poolId);
            uint256 _currentRewardWeight = _pool.rewardWeight;
            if (_currentRewardWeight == _rewardWeights[_poolId]) {
                continue;
            }
            _totalRewardWeight = _totalRewardWeight
                .sub(_currentRewardWeight)
                .add(_rewardWeights[_poolId]);
            _pool.rewardWeight = _rewardWeights[_poolId];

            emit PoolRewardWeightUpdated(_poolId, _rewardWeights[_poolId]);
        }
        _ctx.totalRewardWeight = _totalRewardWeight;
    }

    /// @dev set deposited ceiling
    ///
    /// @param _amount The new deposited ceiling
    function setDepositedCeiling(uint256 _poolId, uint256 _amount)
        external
        onlyGov
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        _pool.ceiling = _amount;

        emit DepositedCeilingUpdated(_poolId, _amount);
    }

    /// @dev Creates a new pool.
    ///
    /// The created pool will need to have its reward weight initialized before it begins generating rewards.
    ///
    /// @param _expiredTimestamp The minimum staking time of the pool
    ///
    /// @return the identifier for the newly created pool.
    function createPool(uint256 _expiredTimestamp)
        external
        onlyGov
        returns (uint256)
    {
        require(
            _expiredTimestamp > 0,
            "GalaxyStakingPools: timestamp should greater than 0"
        );

        uint256 _poolId = _pools.length();
        _pools.push(
            Pool.Data({
                totalDeposited: 0,
                totalDepositedWeight: 0,
                ceiling: 0,
                rewardWeight: 0,
                accumulatedRewardWeight: FixedPointMath.uq192x64(0),
                lastUpdatedBlock: block.number,
                expiredTimestamp: _expiredTimestamp
            })
        );

        emit PoolCreated(_poolId, _expiredTimestamp);

        return _poolId;
    }

    /// @dev deposit currency in the pool.
    ///
    /// @param _poolId pool id
    /// @param _amount deposit amount
    function deposit(uint256 _poolId, uint256 _amount)
        external
        onlyWhitelist
        onlyUpdated
        nonReentrant
    {
        require(_amount > 0, "supply amount should be greater than 0");
        require(_poolId < _pools.length(), "invalid pool id");

        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        require(
            depositedAmount[_poolId].add(_amount) <= _pool.ceiling,
            "exceed deposited ceiling"
        );

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        depositedAmount[_poolId] = depositedAmount[_poolId].add(_amount);
        depositedOrderList[depositedOrderCount] = DepositedOrder({
            owner: msg.sender,
            poolId: _poolId,
            amount: _amount,
            expiredTime: block.timestamp.add(_pool.expiredTimestamp),
            epoch: epochTicker.currentEpoch(),
            redeemToken: 0,
            remainingRedeemToken: 0,
            redeemedCurrency: 0,
            isRedeem: false
        });
        depositedOrderCount = depositedOrderCount + 1;
        _deposit(_poolId, _amount);

        emit TokensDeposited(msg.sender, _amount, depositedOrderCount - 1);
    }

    /// @dev register to redeem currency.
    ///
    /// @param _poolId pool id
    /// @param _index deposited order index which will be redeemed
    function redeem(uint256 _poolId, uint256[] calldata _index)
        external
        onlyWhitelist
        onlyUpdated
        nonReentrant
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        _updateWeighted(
            _pool,
            _stake,
            boostPool.getPoolTotalDeposited(),
            boostPool.getStakeTotalDeposited(msg.sender)
        );

        require(_index.length <= depositedOrderCount, "invalid index");
        for (uint256 i = 0; i < _index.length; i++) {
            DepositedOrder storage depositedOrder = depositedOrderList[
                _index[i]
            ];
            require(_index[i] < depositedOrderCount, "invalid index");
            require(!depositedOrder.isRedeem, "The order has been redeemed");
            require(depositedOrder.owner == msg.sender, "invalid owner");
            require(
                depositedOrder.expiredTime < block.timestamp,
                "The lock time is not expired!"
            );
            require(depositedOrder.poolId == _poolId, "inconsistent pool id");

            depositedOrder.isRedeem = true;
            depositedOrder.redeemToken = depositedOrder
                .amount
                .mul(pointMultiplier)
                .div(epochTokenPrice[depositedOrder.epoch]);
            depositedOrder.remainingRedeemToken = depositedOrder.redeemToken;
            userRemainingRedeemToken[msg.sender] = userRemainingRedeemToken[
                msg.sender
            ].add(depositedOrder.redeemToken);

            redeemOrderList[redeemOrderCount] = _index[i];
            redeemOrderCount = redeemOrderCount + 1;

            totalRedeemTokenAmount = totalRedeemTokenAmount.add(
                depositedOrder.redeemToken
            );
            emit DepositedOrderRedeemUpdated(_index[i], redeemOrderCount - 1);
        }

        operator.redeemOrder(totalRedeemTokenAmount);
    }

    /// @dev Withdraw unclaimed currency.
    ///
    function withdraw() external onlyWhitelist onlyUpdated nonReentrant {
        require(userUnclaimedCurrency[msg.sender] > 0, "No unclaimed currency");

        uint256 unclaimedAmount = userUnclaimedCurrency[msg.sender];
        userUnclaimedCurrency[msg.sender] = 0;
        currency.transfer(msg.sender, unclaimedAmount);

        emit TokensWithdrawn(msg.sender, unclaimedAmount);
    }

    /// @dev Claims all rewarded tokens from a pool.
    ///
    /// @param _poolId The pool to claim rewards from.
    ///
    /// @notice use this function to claim the tokens from a corresponding pool by ID.
    function claim(uint256 _poolId)
        external
        onlyWhitelist
        onlyUpdated
        nonReentrant
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        _claim(_poolId);
    }

    /// @dev After Galaxy epoch closes, this function is called to update the epoch.
    function updateEpoch() external nonReentrant {
        if (epochUpdated) {
            (
                uint256 payoutCurrencyAmount,
                uint256 payoutTokenAmount,
                uint256 remainingSupplyCurrency,
                uint256 remainingRedeemToken
            ) = operator.disburse();
            uint256 newEpoch = epochTicker.currentEpoch();
            require(newEpoch != currentEpoch, "epoch has been updated");

            epochTokenPrice[newEpoch - 1] = tranche.getTokenPriceByEpoch(
                newEpoch - 1
            );
            currentEpoch = newEpoch;
            remainingRedeemTokenAmount = totalRedeemTokenAmount.sub(
                remainingRedeemToken
            );
            remainingPayoutCurrencyAmount = payoutCurrencyAmount;
            totalRedeemTokenAmount = remainingRedeemToken;
            totalSupplyCurrency = 0;
        }

        uint256 maxExecution = redeemOrderCount - redeemOrderListPendingIndex;
        if (maxExecution >= MAX_EXECUTION) {
            maxExecution = MAX_EXECUTION;
        }
        uint256 end = redeemOrderListPendingIndex + maxExecution;
        uint256 reduceDepositedAmount;
        uint256 redeemTokenAmount;
        uint256 payoutCurrencyAmount;
        uint256 poolTotalDeposited = boostPool.getPoolTotalDeposited();
        _updatePools();

        for (uint256 i = redeemOrderListPendingIndex; i < end; i++) {
            DepositedOrder storage order = depositedOrderList[
                redeemOrderList[i]
            ];
            uint256 userTotalDeposited = boostPool.getStakeTotalDeposited(
                order.owner
            );
            if (order.remainingRedeemToken >= remainingRedeemTokenAmount) {
                redeemTokenAmount = remainingRedeemTokenAmount;
                payoutCurrencyAmount = remainingPayoutCurrencyAmount;
            } else {
                redeemTokenAmount = order.remainingRedeemToken;
                payoutCurrencyAmount = order
                    .remainingRedeemToken
                    .mul(epochTokenPrice[currentEpoch - 1])
                    .div(pointMultiplier);
            }
            if (order.remainingRedeemToken <= remainingRedeemTokenAmount) {
                redeemOrderListPendingIndex = redeemOrderListPendingIndex + 1;
            }
            userRemainingRedeemToken[order.owner] = userRemainingRedeemToken[
                order.owner
            ].sub(redeemTokenAmount);
            userUnclaimedCurrency[order.owner] = userUnclaimedCurrency[
                order.owner
            ].add(payoutCurrencyAmount);
            order.remainingRedeemToken = order.remainingRedeemToken.sub(
                redeemTokenAmount
            );
            if (order.redeemedCurrency >= order.amount) {
                reduceDepositedAmount = 0;
            } else {
                if (
                    order.redeemedCurrency.add(payoutCurrencyAmount) >=
                    order.amount ||
                    order.remainingRedeemToken == 0
                ) {
                    reduceDepositedAmount = order.amount.sub(
                        order.redeemedCurrency
                    );
                } else {
                    reduceDepositedAmount = payoutCurrencyAmount;
                }
            }
            order.redeemedCurrency = order.redeemedCurrency.add(
                payoutCurrencyAmount
            );

            _transmute(
                order.poolId,
                order.owner,
                reduceDepositedAmount,
                poolTotalDeposited,
                userTotalDeposited
            );
            remainingRedeemTokenAmount = remainingRedeemTokenAmount.sub(
                redeemTokenAmount
            );
            remainingPayoutCurrencyAmount = remainingPayoutCurrencyAmount.sub(
                payoutCurrencyAmount
            );

            emit DepositedOrderRedeemUpdated(redeemOrderList[i], i);

            if (remainingRedeemTokenAmount == 0) {
                epochUpdated = true;
                return;
            }
        }

        if (remainingRedeemTokenAmount == 0) {
            epochUpdated = true;
        } else {
            epochUpdated = false;
        }
    }

    /// @dev Update the boost of the account.
    ///
    /// @param _poolId The pool to update boost for.
    /// @param _account The address to update boost for.
    function activateBoost(uint256 _poolId, address _account)
        external
        onlyUpdated
        nonReentrant
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[_account][_poolId];
        _stake.update(_pool, _ctx);

        _updateWeighted(
            _pool,
            _stake,
            boostPool.getPoolTotalDeposited(),
            boostPool.getStakeTotalDeposited(_account)
        );
    }

    /// @dev Update the boost of all pools of the account.
    ///
    /// @param _account The address to update boost for.
    function activateBoosts(address _account)
        external
        onlyUpdated
        nonReentrant
    {
        uint256 poolTotalDeposited = boostPool.getPoolTotalDeposited();
        uint256 userTotalDeposited = boostPool.getStakeTotalDeposited(_account);

        for (uint256 _poolId = 0; _poolId < _pools.length(); _poolId++) {
            Pool.Data storage _pool = _pools.get(_poolId);
            _pool.update(_ctx);

            Stake.Data storage _stake = _stakes[_account][_poolId];
            _stake.update(_pool, _ctx);

            _updateWeighted(
                _pool,
                _stake,
                poolTotalDeposited,
                userTotalDeposited
            );
        }
    }

    /// @dev Updates all of the pools.
    function _updatePools() internal {
        for (uint256 _poolId = 0; _poolId < _pools.length(); _poolId++) {
            Pool.Data storage _pool = _pools.get(_poolId);
            _pool.update(_ctx);
        }
    }

    /// @dev Gets the rate at which tokens are minted to stakers for all pools.
    ///
    /// @return the reward rate.
    function rewardRate() external view returns (uint256) {
        return _ctx.rewardRate;
    }

    /// @dev Gets the total reward weight between all the pools.
    ///
    /// @return the total reward weight.
    function totalRewardWeight() external view returns (uint256) {
        return _ctx.totalRewardWeight;
    }

    /// @dev Gets the number of pools that exist.
    ///
    /// @return the pool count.
    function poolCount() external view returns (uint256) {
        return _pools.length();
    }

    /// @dev Gets the total amount of funds staked in a pool.
    ///
    /// @param _poolId the identifier of the pool.
    ///
    /// @return the total amount of staked or deposited tokens.
    function getPoolTotalDeposited(uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        return _pool.totalDeposited;
    }

    /// @dev Gets the ceiling amount of pool.
    ///
    /// @param _poolId the identifier of the pool.
    ///
    /// @return the pool ceiling amount.
    function getPoolCeiling(uint256 _poolId) external view returns (uint256) {
        Pool.Data storage _pool = _pools.get(_poolId);
        return _pool.ceiling;
    }

    /// @dev Gets the reward weight of a pool which determines how much of the total rewards it receives per block.
    ///
    /// @param _poolId the identifier of the pool.
    ///
    /// @return the pool reward weight.
    function getPoolRewardWeight(uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        return _pool.rewardWeight;
    }

    /// @dev Gets the amount of tokens per block being distributed to stakers for a pool.
    ///
    /// @param _poolId the identifier of the pool.
    ///
    /// @return the pool reward rate.
    function getPoolRewardRate(uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        return _pool.getRewardRate(_ctx);
    }

    /// @dev Gets the pool expire time setting.
    ///
    /// @param _poolId the identifier of the pool.
    ///
    /// @return the pool expire time.
    function getPoolExpiredTimestamp(uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        return _pool.expiredTimestamp;
    }

    /// @dev Gets the pool total boost weight.
    ///
    /// @param _poolId the identifier of the pool.
    ///
    /// @return the pool total boost weight.
    function getPoolTotalDepositedWeight(uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        return _pool.totalDepositedWeight;
    }

    /// @dev Gets the number of tokens a user has staked into a pool.
    ///
    /// @param _account The account to query.
    /// @param _poolId  the identifier of the pool.
    ///
    /// @return the amount of deposited tokens.
    function getStakeTotalDeposited(address _account, uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Stake.Data storage _stake = _stakes[_account][_poolId];
        return _stake.totalDeposited;
    }

    /// @dev Gets the number of unclaimed reward tokens a user can claim from a pool.
    ///
    /// @param _account The account to get the unclaimed balance of.
    /// @param _poolId  The pool to check for unclaimed rewards.
    ///
    /// @return the amount of unclaimed reward tokens a user has in a pool.
    function getStakeTotalUnclaimed(address _account, uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Stake.Data storage _stake = _stakes[_account][_poolId];
        return _stake.getUpdatedTotalUnclaimed(_pools.get(_poolId), _ctx);
    }

    /// @dev Gets the user's total boost weight in the pool.
    ///
    /// @param _account The account to query.
    /// @param _poolId  the identifier of the pool.
    ///
    /// @return the account's total boost weight.
    function getStakeTotalDepositedWeight(address _account, uint256 _poolId)
        external
        view
        returns (uint256)
    {
        Stake.Data storage _stake = _stakes[_account][_poolId];
        return _stake.totalDepositedWeight;
    }

    /// @dev Gets the information of the deposited order.
    ///
    /// @param _index The index of the deposited order.
    ///
    /// @return owner the owner of the deposited order.
    /// @return poolId the poolId of the deposited order.
    /// @return amount the amount of the deposited order.
    /// @return expireTime the expire timestamp of the deposited order.
    /// @return redeemToken the alpha token amount of the deposited order, only update when user redeems token.
    /// @return remainingRedeemToken the remaining redeem token which is not redeemed.
    /// @return redeemedCurrency the currency which has been redeemed.
    /// @return epoch the epoch which the deposited order is created.
    /// @return isRedeem the deposited order is redeemed or not.
    function getDepositedOrderByIndex(uint256 _index)
        external
        view
        returns (
            address owner,
            uint256 poolId,
            uint256 amount,
            uint256 expireTime,
            uint256 redeemToken,
            uint256 remainingRedeemToken,
            uint256 redeemedCurrency,
            uint256 epoch,
            bool isRedeem
        )
    {
        DepositedOrder memory order = depositedOrderList[_index];
        return (
            order.owner,
            order.poolId,
            order.amount,
            order.expiredTime,
            order.redeemToken,
            order.remainingRedeemToken,
            order.redeemedCurrency,
            order.epoch,
            order.isRedeem
        );
    }

    /// @dev Get the user weight in the pool.
    ///
    /// @param poolDeposited The total deposited in the pool.
    /// @param userDeposited The user deposited in the pool.
    /// @param boostPoolDeposited The total deposited in the boost pool.
    /// @param boostUserDeposited The user deposited in the boost pool.
    ///
    /// @return the user boost weight in the pool.
    function calcUserWeight(
        uint256 poolDeposited,
        uint256 userDeposited,
        uint256 boostPoolDeposited,
        uint256 boostUserDeposited
    ) public view returns (uint256) {
        uint256 weighted = userDeposited.mul(40).div(100);
        if (boostPoolDeposited > 0) {
            weighted = weighted.add(
                poolDeposited
                    .mul(boostUserDeposited)
                    .div(boostPoolDeposited)
                    .mul(60)
                    .div(100)
            );
            if (weighted >= userDeposited) {
                weighted = userDeposited;
            }
        }

        return weighted;
    }

    /// @dev update user's supply amount and timestamp.
    ///
    /// @param _poolId The pool id.
    /// @param _amount The user supplied currency amount.
    function _deposit(uint256 _poolId, uint256 _amount) internal {
        Pool.Data storage _pool = _pools.get(_poolId);
        Stake.Data storage _stake = _stakes[msg.sender][_poolId];

        _pool.totalDeposited = _pool.totalDeposited.add(_amount);
        _stake.totalDeposited = _stake.totalDeposited.add(_amount);

        _updateWeighted(
            _pool,
            _stake,
            boostPool.getPoolTotalDeposited(),
            boostPool.getStakeTotalDeposited(msg.sender)
        );
        currency.transferFrom(msg.sender, address(this), _amount);

        totalSupplyCurrency = totalSupplyCurrency.add(_amount);
        operator.supplyOrder(totalSupplyCurrency);
    }

    /// @dev Claims all rewarded tokens from a pool.
    ///
    /// The pool and stake MUST be updated before calling this function.
    ///
    /// @param _poolId The pool to claim rewards from.
    ///
    /// @notice use this function to claim the tokens from a corresponding pool by ID.
    function _claim(uint256 _poolId) internal {
        Pool.Data storage _pool = _pools.get(_poolId);
        Stake.Data storage _stake = _stakes[msg.sender][_poolId];

        uint256 _claimAmount = _stake.totalUnclaimed;
        _stake.totalUnclaimed = 0;

        _updateWeighted(
            _pool,
            _stake,
            boostPool.getPoolTotalDeposited(),
            boostPool.getStakeTotalDeposited(msg.sender)
        );

        token.transfer(msg.sender, _claimAmount);

        emit TokensClaimed(msg.sender, _claimAmount);
    }

    /// @dev update user's deposit amount and claimable currency and reduce pool's deposit amount
    ///
    /// @param _poolId The pool id.
    /// @param _user The user address.
    /// @param _amount The reduced deposited amount.
    /// @param _poolTotalDeposited The total deposited token amount in boost pool
    /// @param _userTotalDeposited The user deposited token amount in boost pool
    function _transmute(
        uint256 _poolId,
        address _user,
        uint256 _amount,
        uint256 _poolTotalDeposited,
        uint256 _userTotalDeposited
    ) internal {
        Pool.Data storage _pool = _pools.get(_poolId);

        Stake.Data storage _stake = _stakes[_user][_poolId];
        _stake.update(_pool, _ctx);

        _pool.totalDeposited = _pool.totalDeposited.sub(_amount);
        _stake.totalDeposited = _stake.totalDeposited.sub(_amount);

        _updateWeighted(
            _pool,
            _stake,
            _poolTotalDeposited,
            _userTotalDeposited
        );
    }

    /// @dev update user's deposit boost weight
    ///
    /// @param _pool The pool information
    /// @param _stake The user information
    /// @param boostPoolDeposited The total deposited token amount in boost pool
    /// @param boostUserDeposited The user deposited token amount in boost pool
    function _updateWeighted(
        Pool.Data storage _pool,
        Stake.Data storage _stake,
        uint256 boostPoolDeposited,
        uint256 boostUserDeposited
    ) internal {
        uint256 weight = calcUserWeight(
            _pool.totalDeposited,
            _stake.totalDeposited,
            boostPoolDeposited,
            boostUserDeposited
        );

        _pool.totalDepositedWeight = _pool
            .totalDepositedWeight
            .sub(_stake.totalDepositedWeight)
            .add(weight);
        _stake.totalDepositedWeight = weight;
    }
}
