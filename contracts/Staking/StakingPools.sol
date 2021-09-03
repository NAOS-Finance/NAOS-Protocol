// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {FixedPointMath} from "./libraries/FixedPointMath.sol";
import {Pool} from "./libraries/pools/Pool.sol";
import {Stake} from "./libraries/pools/Stake.sol";
import {IOrderBook} from "./Interfaces/IOrderBook.sol";

//TODO: add event
contract StakingPools is ReentrancyGuard {
    using FixedPointMath for FixedPointMath.uq192x64;
    using Pool for Pool.Data;
    using Pool for Pool.List;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using Stake for Stake.Data;

    /// @dev The context shared between the pools.
    Pool.Context private _ctx;

    /// @dev A list of all of the pools.
    Pool.List private _pools;

    /// @dev Stable token;
    IERC20 token;

    IERC20 rewardToken;

    IOrderBook orderBook;

    address public constant ZERO_ADDRESS = address(0);

    uint256 period;

    /// @dev The address of the account which currently has administrative capabilities over this contract.
    address public governance;

    /// @dev The address of the pending governance.
    address public pendingGovernance;

    /// @dev A mapping of all of the user stakes mapped first by pool and then by address.
    mapping(address => mapping(uint256 => Stake.Data)) private _stakes;

    /// @dev A mapping of user's used quota
    mapping(address => uint256) userUsedQuota;

    /// @dev A mapping of user's unclaimed currency
    mapping(address => uint256) userUnclaimedCurrency;

    /// @dev Checks that the current message sender or caller is the governance address.
    ///
    ///
    modifier onlyGov() {
        require(msg.sender == governance, "StakingPools: !governance");
        _;
    }

    modifier onlyOrderBook() {
        require(msg.sender == address(orderBook), "StakingPools: invalid orderBook");
        _;
    }

    event GovernanceUpdated(address governance);

    event PendingGovernanceUpdated(address pendingGovernance);

    event PoolCreated(uint256 indexed poolId, uint256 indexed expiredTimestamp);

    event RewardRateUpdated(uint256 rewardRate);

    event PoolRewardWeightUpdated(uint256 indexed poolId, uint256 rewardWeight);

    constructor(
        IERC20 _token,
        IERC20 _rewardToken,
        IOrderBook _orderBook,
        address _governance
    ) public {
        token = _token;
        rewardToken = _rewardToken;
        orderBook = _orderBook;
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
            "StakingPools: governance address cannot be 0x0."
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
            "StakingPools: !pendingGovernance"
        );

        governance = pendingGovernance;

        emit GovernanceUpdated(pendingGovernance);
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
            "StakingPools: timestamp should greater than 0"
        );

        uint256 _poolId = _pools.length();
        _pools.push(
            Pool.Data({
                totalDeposited: 0,
                rewardWeight: 0,
                accumulatedRewardWeight: FixedPointMath.uq192x64(0),
                lastUpdatedBlock: block.number,
                expiredTimestamp: _expiredTimestamp
            })
        );
        orderBook.setPool();

        emit PoolCreated(_poolId, _expiredTimestamp);

        return _poolId;
    }

    //TODO: white list
    /// @dev deposit tokens in the pool.
    ///
    /// @param _poolId pool id
    /// @param _amount deposit amount
    function deposit(uint256 _poolId, uint256 _amount) external nonReentrant {
        require(_amount > 0, "supply amount should be greater than 0");
        require(_poolId < _pools.length(), "invalid pool id");

        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx, orderBook);

        _deposit(_poolId, _amount);
        orderBook.deposit(_poolId, _amount);
    }

    /// @dev register to redeem tokens.
    ///
    /// @param _poolId pool id
    /// @param _amount redeem amount
    function register(uint256 _poolId, uint256 _amount) external nonReentrant {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx, orderBook);

        require(_stake.totalDeposited <= _amount, "amount too high");
        require(
            _stake.lastDepositedTimestamp.add(_pool.expiredTimestamp) <=
                block.timestamp,
            "The scheduled time has not expired"
        );
        orderBook.register(msg.sender, _poolId, _amount);
    }

    /// @dev Withdraw unclaimed currency.
    ///
    function withdraw() external nonReentrant {
        require(userUnclaimedCurrency[msg.sender] > 0, "No unclaimed currency");

        uint256 unclaimedAmount = userUnclaimedCurrency[msg.sender];
        userUnclaimedCurrency[msg.sender] = 0;
        token.safeTransfer(msg.sender, unclaimedAmount);
    }

    /// @dev Claims all rewarded tokens from a pool.
    ///
    /// @param _poolId The pool to claim rewards from.
    ///
    /// @notice use this function to claim the tokens from a corresponding pool by ID.
    function claim(uint256 _poolId) external nonReentrant {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        Stake.Data storage _stake = _stakes[msg.sender][_poolId];
        _stake.update(_pool, _ctx, orderBook);

        _claim(_poolId);
    }

    /// @dev update deposit token amount of pool
    ///
    /// @param _poolId The pool id.
    /// @param _depositedToken The deposited token which is added in the epoch.
    function updateDepositedToken(uint256 _poolId, uint256 _depositedToken)
        external onlyOrderBook
    {
        Pool.Data storage _pool = _pools.get(_poolId);
        _pool.update(_ctx);

        _pool.totalDeposited = _pool.totalDeposited.add(_depositedToken);
    }

    /// @dev update user's deposit amount and claimable currency and reduce pool's deposit amount 
    ///
    /// @param _poolId The pool id.
    /// @param _user The user address.
    /// @param _reducedRToken The reduced deposited token amount.
    /// @param _payoutCurrency The claimable currency.
    function transmute(
        uint256 _poolId,
        address _user,
        uint256 _reducedRToken,
        uint256 _payoutCurrency
    ) external onlyOrderBook {
        Pool.Data storage _pool = _pools.get(_poolId);

        Stake.Data storage _stake = _stakes[_user][_poolId];
        _stake.update(_pool, _ctx, orderBook);

        _pool.totalDeposited = _pool.totalDeposited.sub(_reducedRToken);

        _stake.totalDeposited = _stake.totalDeposited.sub(_reducedRToken);
        userUnclaimedCurrency[_user] = userUnclaimedCurrency[_user].add(
            _payoutCurrency
        );
        if (_payoutCurrency > userUsedQuota[_user]) {
            userUsedQuota[_user] = 0;
        } else {
            userUsedQuota[_user] = userUsedQuota[_user].sub(_payoutCurrency);
        }
    }

    /// @dev Updates all of the pools.
    function _updatePools() internal {
        for (uint256 _poolId = 0; _poolId < _pools.length(); _poolId++) {
            Pool.Data storage _pool = _pools.get(_poolId);
            _pool.update(_ctx);
        }
    }

    /// @dev update user's supply amount and timestamp.
    ///
    /// @param _poolId The pool id.
    /// @param _amount The user supplied currency amount.
    function _deposit(uint256 _poolId, uint256 _amount) internal {
        Stake.Data storage _stake = _stakes[msg.sender][_poolId];

        _stake.totalSupply = _stake.totalSupply.add(_amount);
        _stake.lastDepositedTimestamp = block.timestamp;
        userUsedQuota[msg.sender] = userUsedQuota[msg.sender].add(_amount);

        token.safeTransferFrom(msg.sender, address(this), _amount);
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

        rewardToken.transfer(msg.sender, _claimAmount);
    }
}
