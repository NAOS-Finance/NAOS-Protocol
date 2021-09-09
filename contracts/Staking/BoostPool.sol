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

/// @title StakingPools
/// @dev A contract which allows users to stake to farm tokens.
///
/// This contract was inspired by Chef Nomi's 'MasterChef' contract which can be found in this
/// repository: https://github.com/sushiswap/sushiswap.
contract BoostPool is ReentrancyGuard {
    using FixedPointMath for FixedPointMath.uq192x64;
    using Pool for Pool.Data;
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

    event TokensDeposited(address indexed user, uint256 amount);

    event TokensWithdrawn(address indexed user, uint256 amount);

    event TokensClaimed(address indexed user, uint256 amount);

    /// @dev The token which will be minted as a reward for staking.
    IERC20 public reward;

    /// @dev The address of the account which currently has administrative capabilities over this contract.
    address public governance;

    /// @dev The address which is the candidate of governance
    address public pendingGovernance;

    /// @dev The token lock time
    uint256 public constant LOCK_TIME = 86400 * 90;

    /// @dev The claim period after cooldown period is expired
    uint256 public constant CLAIM_PERIOD = 86400;

    /// @dev The resolution of fixed point. The resolution allows for a granularity of 1% increments.
    uint256 public constant PERCENT_RESOLUTION = 100;

    /// @dev The cooldown period
    uint256 public cooldownPeriod;

    /// @dev The percent of reward will be distributed to the pool if user claims reward immediately.
    uint256 public penaltyPercent;

    /// @dev The count of user's deposited orders.
    mapping(address => uint256) public userOrderCount;

    /// @dev The record of user's deposited orders.
    mapping(address => mapping(uint256 => UserDepositedOrder))
        public userDepositedOrder;

    /// @dev The cooldown period for each user.
    mapping(address => Cooldown) public userCooldown;

    /// @dev The context shared between the pools.
    Pool.Context private _ctx;

    /// @dev The pool information.
    Pool.Data private pool;

    /// @dev A mapping of all of the user stakes mapped by address.
    mapping(address => Stake.Data) private _stakes;

    constructor(
        IERC20 _token,
        IERC20 _reward,
        address _governance
    ) public {
        require(
            address(_token) != address(0),
            "BoostPool: token address cannot be 0x0"
        );
        require(
            address(_reward) != address(0),
            "BoostPool: reward address cannot be 0x0"
        );
        require(
            _governance != address(0),
            "BoostPool: governance address cannot be 0x0"
        );

        pool.set(_token);

        reward = _reward;
        governance = _governance;
        cooldownPeriod = 86400 * 5;
        penaltyPercent = 50;
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
    /// @param _rewardRate The number of tokens to distribute per block.
    function setRewardRate(uint256 _rewardRate) external onlyGovernance {
        Pool.Data storage _pool = pool.get();
        _pool.update(_ctx);

        _ctx.rewardRate = _rewardRate;

        emit RewardRateUpdated(_rewardRate);
    }

    /// @dev set cool down period
    ///
    /// @param _cooldownPeriod the cooldown period when user claims reward
    function setCooldown(uint256 _cooldownPeriod) external onlyGovernance {
        cooldownPeriod = _cooldownPeriod;
    }

    /// @dev set penalty percent
    ///
    /// @param _penaltyPercent the percent of reward will be distributed to other users
    function setPenaltyPercent(uint256 _penaltyPercent)
        external
        onlyGovernance
    {
        penaltyPercent = _penaltyPercent;
    }

    /// @dev Stakes tokens into a pool.
    ///
    /// @param _depositAmount the amount of tokens to deposit.
    function deposit(uint256 _depositAmount) external nonReentrant {
        Pool.Data storage _pool = pool.get();
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender];
        _stake.update(_pool, _ctx);

        _deposit(_depositAmount);
    }

    /// @dev Withdraws staked tokens from a pool.
    ///
    /// @param _index           The index of deposited order.
    function withdraw(uint256[] calldata _index) external nonReentrant {
        Pool.Data storage _pool = pool.get();
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender];
        _stake.update(_pool, _ctx);

        require(_index.length <= userOrderCount[msg.sender], "invalid index");

        uint256 withdrawAmount;
        for (uint256 i = 0; i <= _index.length; i++) {
            UserDepositedOrder storage depositedOrder = userDepositedOrder[
                msg.sender
            ][_index[i]];
            require(_index[i] < userOrderCount[msg.sender], "invalid index");
            require(!depositedOrder.isWithdraw, "The order has been withdrew");
            require(
                depositedOrder.depositedTime.add(LOCK_TIME) < block.timestamp,
                "The lock time is not expired!"
            );
            depositedOrder.isWithdraw = true;
            withdrawAmount.add(depositedOrder.amount);
        }

        _withdraw(withdrawAmount);
    }

    /// @dev Claims all rewarded tokens from a pool.
    function claimImmediately() external nonReentrant {
        Cooldown memory cooldown = userCooldown[msg.sender];
        require(
            cooldown.claimEnd < block.timestamp,
            "wait for the last cooldown period expired"
        );

        Pool.Data storage _pool = pool.get();
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender];
        _stake.update(_pool, _ctx);

        uint256 penalty = _stake.totalUnclaimed.mul(penaltyPercent).div(
            PERCENT_RESOLUTION
        );
        _pool.distribute(penalty);
        _stake.totalUnclaimed = _stake.totalUnclaimed.sub(penalty);

        _claim();
    }

    /// @dev Claims all rewarded tokens from a pool.
    function claim() external nonReentrant {
        Cooldown storage cooldown = userCooldown[msg.sender];
        require(
            cooldown.claimStart <= block.timestamp &&
                cooldown.claimEnd >= block.timestamp,
            "not in the claim period!"
        );

        Pool.Data storage _pool = pool.get();
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender];
        _stake.update(_pool, _ctx);

        _claim();
    }

    /// @dev lead user into cooldown period.
    function startCoolDown() public nonReentrant {
        Cooldown storage cooldown = userCooldown[msg.sender];
        require(
            cooldown.claimEnd < block.timestamp,
            "wait for the last cooldown period expired"
        );
        cooldown.claimStart = block.timestamp + cooldownPeriod;
        cooldown.claimEnd = block.timestamp + cooldownPeriod + CLAIM_PERIOD;
    }

    /// @dev donate reward to the pool
    ///
    /// @param _donateAmount The donate amount
    function donateReward(uint256 _donateAmount) external nonReentrant {
        Pool.Data storage _pool = pool.get();
        _pool.update(_ctx);

        _pool.distribute(_donateAmount);
        reward.safeTransferFrom(msg.sender, address(this), _donateAmount);
    }

    /// @dev Gets the rate at which tokens are minted to stakers for all pools.
    ///
    /// @return the reward rate.
    function rewardRate() external view returns (uint256) {
        return _ctx.rewardRate;
    }

    /// @dev Gets the token a pool accepts.
    ///
    /// @return the token.
    function getPoolToken() external view returns (IERC20) {
        Pool.Data storage _pool = pool.get();
        return _pool.token;
    }

    /// @dev Gets the total amount of funds staked in a pool.
    ///
    /// @return the total amount of staked or deposited tokens.
    function getPoolTotalDeposited() external view returns (uint256) {
        Pool.Data storage _pool = pool.get();
        return _pool.totalDeposited;
    }

    /// @dev Gets the number of tokens a user has staked into a pool.
    ///
    /// @param _account The account to query.
    ///
    /// @return the amount of deposited tokens.
    function getStakeTotalDeposited(address _account)
        external
        view
        returns (uint256)
    {
        Stake.Data storage _stake = _stakes[_account];
        return _stake.totalDeposited;
    }

    /// @dev Gets the number of unclaimed reward tokens a user can claim from a pool.
    ///
    /// @param _account The account to get the unclaimed balance of.
    ///
    /// @return the amount of unclaimed reward tokens a user has in a pool.
    function getStakeTotalUnclaimed(address _account)
        external
        view
        returns (uint256)
    {
        Stake.Data storage _stake = _stakes[_account];
        return _stake.getUpdatedTotalUnclaimed(pool.get(), _ctx);
    }

    /// @dev Stakes tokens into a pool.
    ///
    /// The pool and stake MUST be updated before calling this function.
    ///
    /// @param _depositAmount the amount of tokens to deposit.
    function _deposit(uint256 _depositAmount) internal {
        Pool.Data storage _pool = pool.get();
        Stake.Data storage _stake = _stakes[msg.sender];

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

        emit TokensDeposited(msg.sender, _depositAmount);
    }

    /// @dev Withdraws staked tokens from a pool.
    ///
    /// The pool and stake MUST be updated before calling this function.
    ///
    /// @param _withdrawAmount  The number of tokens to withdraw.
    function _withdraw(uint256 _withdrawAmount) internal {
        Pool.Data storage _pool = pool.get();
        Stake.Data storage _stake = _stakes[msg.sender];

        _pool.totalDeposited = _pool.totalDeposited.sub(_withdrawAmount);
        _stake.totalDeposited = _stake.totalDeposited.sub(_withdrawAmount);

        _pool.token.safeTransfer(msg.sender, _withdrawAmount);

        emit TokensWithdrawn(msg.sender, _withdrawAmount);
    }

    /// @dev Claims all rewarded tokens from a pool.
    ///
    /// The pool and stake MUST be updated before calling this function.
    ///
    /// @notice use this function to claim the tokens from a corresponding pool by ID.
    function _claim() internal {
        Stake.Data storage _stake = _stakes[msg.sender];

        uint256 _claimAmount = _stake.totalUnclaimed;
        _stake.totalUnclaimed = 0;

        reward.safeTransfer(msg.sender, _claimAmount);

        emit TokensClaimed(msg.sender, _claimAmount);
    }
}
