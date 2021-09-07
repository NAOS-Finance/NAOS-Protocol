// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {FixedPointMath} from "./libraries/FixedPointMath.sol";
import {Pool} from "./libraries/boostPools/Pool.sol";
import {Stake} from "./libraries/boostPools/Stake.sol";
import {StakingPools} from "./StakingPools.sol";

import "hardhat/console.sol";

/// @title StakingPools
/// @dev A contract which allows users to stake to farm tokens.
///
/// This contract was inspired by Chef Nomi's 'MasterChef' contract which can be found in this
/// repository: https://github.com/sushiswap/sushiswap.
contract BoostPool is ReentrancyGuard {
    using FixedPointMath for FixedPointMath.uq192x64;
    using Pool for Pool.Data;
    using Pool for Pool.List;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using Stake for Stake.Data;

    struct UserDepositedOrder {
        uint256 amount;
        uint256 depositedTime;
        bool isWithdraw;
    }

    struct Cooldown {
        uint256 claimStart;
        uint256 claimEnd;
    }

    event PendingGovernanceUpdated(address pendingGovernance);

    event GovernanceUpdated(address governance);

    event RewardRateUpdated(uint256 rewardRate);

    event PoolRewardWeightUpdated(uint256 indexed poolId, uint256 rewardWeight);

    event PoolCreated(uint256 indexed poolId, IERC20 indexed token);

    event TokensDeposited(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount
    );

    event TokensWithdrawn(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount
    );

    event TokensClaimed(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount
    );

    /// @dev The token which will be minted as a reward for staking.
    IERC20 public reward;

    /// @dev The address of the account which currently has administrative capabilities over this contract.
    address public governance;

    address public pendingGovernance;

    uint256 public constant LOCK_TIME = 86400 * 90;

    uint256 public constant CLAIM_PERIOD = 86400;

    uint256 public cooldownPeriod;

    /// @dev Tokens are mapped to their pool identifier plus one. Tokens that do not have an associated pool
    /// will return an identifier of zero.
    mapping(IERC20 => uint256) public tokenPoolIds;

    /// @dev The count of user's deposited orders.
    mapping(address => uint256) public userOrderCount;

    /// @dev The record of user's deposited orders.
    mapping(address => mapping(uint256 => UserDepositedOrder))
        public userDepositedOrder;

    /// @dev The cooldown period for each user of each pool.
    mapping(address => mapping(uint256 => Cooldown)) public userCooldown;

    /// @dev The context shared between the pools.
    Pool.Context private _ctx;

    /// @dev A list of all of the pools.
    Pool.List private _pools;

    /// @dev A mapping of all of the user stakes mapped first by pool and then by address.
    mapping(address => mapping(uint256 => Stake.Data)) private _stakes;

    constructor(IERC20 _reward, address _governance) public {
        require(
            address(_reward) != address(0),
            "StakingPools: reward address cannot be 0x0"
        );
        require(
            _governance != address(0),
            "StakingPools: governance address cannot be 0x0"
        );

        reward = _reward;
        governance = _governance;
        cooldownPeriod = 86400 * 5;
    }

    /// @dev A modifier which reverts when the caller is not the governance.
    modifier onlyGovernance() {
        require(msg.sender == governance, "StakingPools: only governance");
        _;
    }

    /// @dev Sets the governance.
    ///
    /// This function can only called by the current governance.
    ///
    /// @param _pendingGovernance the new pending governance.
    function setPendingGovernance(address _pendingGovernance)
        external
        onlyGovernance
    {
        require(
            _pendingGovernance != address(0),
            "StakingPools: pending governance address cannot be 0x0"
        );
        pendingGovernance = _pendingGovernance;

        emit PendingGovernanceUpdated(_pendingGovernance);
    }

    function acceptGovernance() external {
        require(
            msg.sender == pendingGovernance,
            "StakingPools: only pending governance"
        );

        governance = pendingGovernance;

        emit GovernanceUpdated(pendingGovernance);
    }

    /// @dev Sets the distribution reward rate.
    ///
    /// This will update all of the pools.
    ///
    /// @param _rewardRate The number of tokens to distribute per second.
    function setRewardRate(uint256 _rewardRate) external onlyGovernance {
        _updatePools();

        _ctx.rewardRate = _rewardRate;

        emit RewardRateUpdated(_rewardRate);
    }

    /// @dev Creates a new pool.
    ///
    /// The created pool will need to have its reward weight initialized before it begins generating rewards.
    ///
    /// @param _token The token the pool will accept for staking.
    ///
    /// @return the identifier for the newly created pool.
    function createPool(IERC20 _token)
        external
        onlyGovernance
        returns (uint256)
    {
        require(
            address(_token) != address(0),
            "StakingPools: token address cannot be 0x0"
        );
        require(
            tokenPoolIds[_token] == 0,
            "StakingPools: token already has a pool"
        );

        uint256 _poolId = _pools.length();

        _pools.push(
            Pool.Data({
                token: _token,
                totalDeposited: 0,
                rewardWeight: 0,
                accumulatedRewardWeight: FixedPointMath.uq192x64(0),
                lastUpdatedBlock: block.number
            })
        );

        tokenPoolIds[_token] = _poolId + 1;

        emit PoolCreated(_poolId, _token);

        return _poolId;
    }

    /// @dev Sets the reward weights of all of the pools.
    ///
    /// @param _rewardWeights The reward weights of all of the pools.
    function setRewardWeights(uint256[] calldata _rewardWeights)
        external
        onlyGovernance
    {
        require(
            _rewardWeights.length == _pools.length(),
            "StakingPools: weights length mismatch"
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

    function setCooldown(uint256 _cooldownPeriod) external onlyGovernance {
        cooldownPeriod = _cooldownPeriod;
    }

    /// @dev Stakes tokens into a pool.
    ///
    /// @param _poolId        the pool to deposit tokens into.
    /// @param _depositAmount the amount of tokens to deposit.
    function deposit(uint256 _poolId, uint256 _depositAmount)
        external
        nonReentrant
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        _deposit(_poolId, _depositAmount);
    }

    /// @dev Withdraws staked tokens from a pool.
    ///
    /// @param _poolId          The pool to withdraw staked tokens from.
    /// @param _index           The index of deposited order.
    function withdraw(uint256 _poolId, uint256[] calldata _index)
        external
        nonReentrant
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        require(_index.length <= userOrderCount[msg.sender], "invalid index");

        uint256 withdrawAmount;
        for (uint256 i = 0; i <= _index.length; i++) {
            UserDepositedOrder storage depositedOrder = userDepositedOrder[
                msg.sender
            ][_index[i]];
            require(!depositedOrder.isWithdraw, "The order has been withdrew");
            require(
                depositedOrder.depositedTime.add(LOCK_TIME) > block.timestamp,
                "The lock time is not expired!"
            );
            depositedOrder.isWithdraw = true;
            withdrawAmount.add(depositedOrder.amount);
        }

        _withdraw(_poolId, withdrawAmount);
    }

    /// @dev Claims all rewarded tokens from a pool.
    ///
    /// @param _poolId The pool to claim rewards from.
    function claimImmediately(uint256 _poolId) external nonReentrant {
        Cooldown memory cooldown = userCooldown[msg.sender][_poolId];
        require(
            cooldown.claimEnd < block.timestamp,
            "wait for the last cooldown period expired"
        );

        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        _claim(_poolId);
    }

    /// @dev Claims all rewarded tokens from a pool.
    ///
    /// @param _poolId The pool to claim rewards from.
    function claim(uint256 _poolId) external nonReentrant {
        Cooldown storage cooldown = userCooldown[msg.sender][_poolId];
        require(
            cooldown.claimStart <= block.timestamp &&
                cooldown.claimEnd >= block.timestamp,
            "not in the claim period!"
        );

        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        _claim(_poolId);
    }

    /// @dev lead user into cooldown period.
    ///
    /// @param _poolId The pool id.
    function startCoolDown(uint256 _poolId) public {
        Cooldown storage cooldown = userCooldown[msg.sender][_poolId];
        require(
            cooldown.claimEnd < block.timestamp,
            "wait for the last cooldown period expired"
        );
        cooldown.claimStart = block.timestamp + cooldownPeriod;
        cooldown.claimEnd = block.timestamp + cooldownPeriod + CLAIM_PERIOD;
    }

    /// @dev Claims all rewards from a pool and then withdraws all staked tokens.
    ///
    /// @param _poolId the pool to exit from.
    function exit(uint256 _poolId) external nonReentrant {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx);

        _claim(_poolId);
        _withdraw(_poolId, _stake.totalDeposited);
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

    /// @dev Gets the token a pool accepts.
    ///
    /// @param _poolId the identifier of the pool.
    ///
    /// @return the token.
    function getPoolToken(uint256 _poolId) external view returns (IERC20) {
        Pool.Data storage _pool = _pools.get(_poolId);
        return _pool.token;
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

    /// @dev Updates all of the pools.
    ///
    /// Warning:
    /// Make the staking plan before add a new pool. If the amount of pool becomes too many would
    /// result the transaction failed due to high gas usage in for-loop.
    function _updatePools() internal {
        for (uint256 _poolId = 0; _poolId < _pools.length(); _poolId++) {
            Pool.Data storage _pool = _pools.get(_poolId);
            _pool.update(_ctx);
        }
    }

    /// @dev Stakes tokens into a pool.
    ///
    /// The pool and stake MUST be updated before calling this function.
    ///
    /// @param _poolId        the pool to deposit tokens into.
    /// @param _depositAmount the amount of tokens to deposit.
    function _deposit(uint256 _poolId, uint256 _depositAmount) internal {
        Pool.Data storage _pool = _pools.get(_poolId);
        Stake.Data storage _stake = _stakes[msg.sender][_poolId];

        _pool.totalDeposited = _pool.totalDeposited.add(_depositAmount);
        _stake.totalDeposited = _stake.totalDeposited.add(_depositAmount);

        userDepositedOrder[msg.sender][
            userOrderCount[msg.sender]
        ] = UserDepositedOrder({
            amount: _depositAmount,
            depositedTime: block.timestamp,
            isWithdraw: false
        });
        userOrderCount[msg.sender] = userOrderCount[msg.sender] + 1;

        _pool.token.safeTransferFrom(msg.sender, address(this), _depositAmount);

        emit TokensDeposited(msg.sender, _poolId, _depositAmount);
    }

    /// @dev Withdraws staked tokens from a pool.
    ///
    /// The pool and stake MUST be updated before calling this function.
    ///
    /// @param _poolId          The pool to withdraw staked tokens from.
    /// @param _withdrawAmount  The number of tokens to withdraw.
    function _withdraw(uint256 _poolId, uint256 _withdrawAmount) internal {
        Pool.Data storage _pool = _pools.get(_poolId);
        Stake.Data storage _stake = _stakes[msg.sender][_poolId];

        _pool.totalDeposited = _pool.totalDeposited.sub(_withdrawAmount);
        _stake.totalDeposited = _stake.totalDeposited.sub(_withdrawAmount);

        _pool.token.safeTransfer(msg.sender, _withdrawAmount);

        emit TokensWithdrawn(msg.sender, _poolId, _withdrawAmount);
    }

    /// @dev Claims all rewarded tokens from a pool.
    ///
    /// The pool and stake MUST be updated before calling this function.
    ///
    /// @param _poolId The pool to claim rewards from.
    ///
    /// @notice use this function to claim the tokens from a corresponding pool by ID.
    function _claim(uint256 _poolId) internal {
        Stake.Data storage _stake = _stakes[msg.sender][_poolId];

        uint256 _claimAmount = _stake.totalUnclaimed;
        _stake.totalUnclaimed = 0;

        reward.safeTransfer(msg.sender, _claimAmount);

        emit TokensClaimed(msg.sender, _poolId, _claimAmount);
    }
}
