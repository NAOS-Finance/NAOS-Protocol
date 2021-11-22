pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMathUpgradeable} from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import {IBetaTransmuter} from "./Interfaces/IBetaTransmuter.sol";
import {IUniswapV2Router01} from "./Interfaces/IUniswapV2Router01.sol";
import {IStakingPoolWithTransfer} from "./Interfaces/IStakingPoolWithTransfer.sol";
import {IVaultAdapter} from "./Interfaces/IVaultAdapter.sol";
import {Vault} from "./libraries/betaInsurance/Vault.sol";

contract BetaInsurance is ERC20Upgradeable {
    using SafeMathUpgradeable for uint256;
    using Vault for Vault.Data;
    using Vault for Vault.List;

    struct InsurancePolicy {
        address NFTContract;
        address issuer;
        uint256 NFTID;
        uint256 validPeriod;
        uint256 insuranceAmount;
        uint256 premiumCurrencyAmount;
        uint256 premiumNAOSAmount;
        uint256 expiredTime;
        bool premiumIsSet;
        bool isValid;
        bool isLock;
    }

    struct PremiumNAOSDistribution {
        uint256 insuranceID;
        uint256 NAOSAmount;
        uint256 start;
        uint256 end;
        uint256 lastDistributedTimestamp;
    }

    address public constant ZERO_ADDRESS = address(0);

    uint256 public constant PERCENT_RESOLUTION = 10000;

    /// @dev nUSD address
    IERC20 public token;

    /// @dev the stable coins which nUSD can be transmuted into
    IERC20 public currency;

    /// @dev wbnb address which is used to swap tokens
    IERC20 public wbnb;

    /// @dev naos Token address
    IERC20 public naos;

    /// @dev transmuter which can transmute tokens into currecny
    IBetaTransmuter public transmuter;

    /// @dev the dex which can swap currency into naos
    IUniswapV2Router01 public uniV2Router;

    /// @dev the staking pool which naos will be distribued in
    IStakingPoolWithTransfer public stakingPool;

    /// @dev A list of all of the vaults. The last element of the list is the vault that is currently being used for
    /// deposits and withdraws. Vaults before the last element are considered inactive and are expected to be cleared.
    Vault.List private _vaults;

    /// @dev the governance of the contract which can set some important parameters
    address public governance;

    /// @dev if pending goverance accepts, the address will be the new governance
    address public pendingGovernance;

    /// @dev the harvested fee which will be transfered to
    address public treasury;

    /// @dev the lock amount which will be locked in the pool
    uint256 public lockAmount;

    /// @dev the staking pool id which naos will be distribued in
    uint256 public poolId;

    /// @dev the percentage of the harvest fee which earns from vault
    uint256 public harvestFee;

    /// @dev if some emergency situations happend, it can prevent depositing currency into vault
    bool public emergencyExit;

    /// @dev the list of insurance policy
    InsurancePolicy[] public insurancePolicyList;

    /// @dev the list which records the naos distribution for the staking pool
    PremiumNAOSDistribution[] public premiumNAOSDistributionList;

    /// @dev admins
    mapping(address => bool) public admins;

    /// @dev A mapping of adapter addresses to keep track of vault adapters that have already been added
    mapping(IVaultAdapter => bool) public adapters;

    event GovernanceUpdated(address governance);

    event PendingGovernanceUpdated(address pendingGovernance);

    event EmergencyExitUpdated(bool emergencyExit);

    event AdminUpdated(address indexed user, bool state);

    event TransmuterUpdated(address transmuter);

    event StakingPoolUpdated(IStakingPoolWithTransfer stakingPool, uint256 poolId);

    event HarvestFeeUpdated(uint256 harvestFee);

    event ActiveVaultUpdated(IVaultAdapter indexed adapter);

    event TokenDeposited(address indexed user, uint256 amount, uint256 shares);

    event TokenWithdrawn(address indexed user, uint256 amount, uint256 shares);

    event insurancePolicyIssued(uint256 insuranceID);

    event insurancePolicyUpdated(uint256 insuranceID);

    event premiumNAOSDistributionListUpdated(uint256 index);

    event naosTokenDistributed(uint256 index, uint256 donateAmount);

    event Compensate(uint256 insuranceID, uint256 amount);

    event TransmuterStaked(uint256 amount);

    event transmuteTokenIntoCurrency(uint256 amount);

    event FundsFlushed(uint256 amount);

    event FundsHarvested(uint256 withdrawnAmount, uint256 decreasedValue);

    event FundsRecalled(uint256 indexed vaultId, uint256 withdrawnAmount, uint256 decreasedValue);

    modifier onlyGovernance() {
        require(msg.sender == governance, "only governance.");
        _;
    }

    /// @dev Checks that the current message sender or caller is the admin address.
    modifier onlyAdmins() {
        require(admins[msg.sender], "!admin");
        _;
    }

    modifier expectVaultInitialized() {
        require(_vaults.length() > 0, "vault is not set");
        _;
    }

    modifier beforePaymentCheck(uint256 _insuranceID) {
        require(_insuranceID < insurancePolicyList.length, "invalid insurance index");

        InsurancePolicy memory insurancePolicy = insurancePolicyList[_insuranceID];

        require(insurancePolicy.premiumIsSet, "The insurance premium didn't set");
        require(!insurancePolicy.isValid, "The insurance policy has been effective");
        require(balance().sub(lockAmount) >= insurancePolicy.insuranceAmount, "no enough insurance quota");
        _;
    }

    function initialize(
        IERC20 _token,
        IERC20 _currency,
        IERC20 _naos,
        IERC20 _wbnb,
        IUniswapV2Router01 _uniV2Router,
        IBetaTransmuter _transmuter,
        address _governance,
        address _treasury
    ) external initializer {
        require(address(_token) != ZERO_ADDRESS, "token cannot be 0x0");
        require(address(_currency) != ZERO_ADDRESS, "currency cannot be 0x0");
        require(address(_naos) != ZERO_ADDRESS, "NAOS Token cannot be 0x0");
        require(address(_wbnb) != ZERO_ADDRESS, "WBNB cannot be 0x0");
        require(address(_uniV2Router) != ZERO_ADDRESS, "swapRouter cannot be 0x0");
        require(address(_transmuter) != ZERO_ADDRESS, "transmuter cannot be 0x0");
        require(_transmuter.NToken() == address(_token));
        require(_transmuter.Token() == address(_currency));
        require(_governance != ZERO_ADDRESS, "governance cannot be 0x0");
        require(_treasury != ZERO_ADDRESS, "treasury cannot be 0x0");
        token = _token;
        currency = _currency;
        naos = _naos;
        wbnb = _wbnb;
        uniV2Router = _uniV2Router;
        transmuter = _transmuter;
        governance = _governance;
        treasury = _treasury;

        __ERC20_init("Beta Insurance Token", "Beta");
    }

    /// @dev Sets the pending governance.
    ///
    /// @param _pendingGovernance the new pending governance.
    function setPendingGovernance(address _pendingGovernance) external onlyGovernance {
        require(_pendingGovernance != ZERO_ADDRESS, "0 gov");

        pendingGovernance = _pendingGovernance;

        emit PendingGovernanceUpdated(_pendingGovernance);
    }

    /// @dev Accepts the role as governance.
    ///
    /// This function reverts if the caller is not the new pending governance.
    function acceptGovernance() external {
        require(msg.sender == pendingGovernance, "!pendingGovernance");

        governance = pendingGovernance;

        emit GovernanceUpdated(pendingGovernance);
    }

    /// @dev Sets the user into admins list.
    ///
    /// @param _user The user address.
    /// @param _state The admin state which will be set.
    function setAdmin(address _user, bool _state) external onlyGovernance {
        admins[_user] = _state;

        emit AdminUpdated(_user, _state);
    }

    /// @dev Sets if the contract should enter emergency exit mode.
    ///
    /// @param _emergencyExit if the contract should enter emergency exit mode.
    function setEmergencyExit(bool _emergencyExit) external {
        require(msg.sender == governance || admins[msg.sender], "sender should be governance or admins");

        emergencyExit = _emergencyExit;

        emit EmergencyExitUpdated(_emergencyExit);
    }

    /// @dev Set the staking pool which the reward will be distributed to
    ///
    /// @param _stakingPool The address of the staking pool
    /// @param _poolId The poolId which the rewards will be distributed to
    function setStakingPool(IStakingPoolWithTransfer _stakingPool, uint256 _poolId) external onlyGovernance {
        require(address(_stakingPool.reward()) == address(naos), "inconsistent reward");
        stakingPool = _stakingPool;
        poolId = _poolId;

        emit StakingPoolUpdated(_stakingPool, _poolId);
    }

    /// @dev deposit tokens and get Beta tokens
    ///
    /// @param _amount The amount which will be deposited into the pool
    function deposit(uint256 _amount) external {
        uint256 _pool = balance();
        token.transferFrom(msg.sender, address(this), _amount);

        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = _amount;
        } else {
            shares = (_amount.mul(totalSupply())).div(_pool);
        }
        _mint(msg.sender, shares);

        emit TokenDeposited(msg.sender, _amount, shares);
    }

    /// @dev Burns beta tokens and withdraw deposited shares. If these is no enough tokens in the pool, it will pay  1:1 currency for user.
    ///
    /// @param _shares The amount of beta token
    function withdraw(uint256 _shares) external {
        uint256 r = (balance().mul(_shares)).div(totalSupply());
        require(balance().sub(r) >= lockAmount, "no enough quota");
        _burn(msg.sender, _shares);

        _withdrawTo(true, r, msg.sender);
        emit TokenWithdrawn(msg.sender, r, _shares);
    }

    /// @dev The pool total deposited which includes the tokens in the pool and transmuter, the currency in the pool and vault
    function balance() public view returns (uint256) {
        uint256 balance = token.balanceOf(address(this)).add(currency.balanceOf(address(this))).add(transmuter.depositedNTokens(address(this)));
        for (uint256 vaultId = 0; vaultId < _vaults.length(); vaultId++) {
            Vault.Data storage _vault = _vaults.get(vaultId);
            balance = balance.add(_vault.totalDeposited);
        }
        return balance;
    }

    /// @dev The share of each Beta token.
    function getPricePerFullShare() public view returns (uint256) {
        return balance().mul(1e18).div(totalSupply());
    }

    // ====================== transmuter ======================

    /// @dev Sets the transmuter.
    ///
    /// @param _transmuter the new transmuter.
    function setTransmuter(IBetaTransmuter _transmuter) external onlyGovernance {
        require(address(_transmuter) != ZERO_ADDRESS, "transmuter cannot be 0x0.");
        require(_transmuter.NToken() == address(token));
        require(_transmuter.Token() == address(currency));

        if (transmuter.depositedNTokens(address(this)) > 0) {
            transmuter.transmuteClaimAndWithdraw();
        }
        transmuter = _transmuter;

        emit TransmuterUpdated(address(transmuter));
    }

    /// @dev stake token into transmuter.
    function stakeIntoTransmuter() external {
        uint256 tokenAmount = token.balanceOf(address(this));
        require(tokenAmount > 0, "no tokens for transmuter staking");

        token.approve(address(transmuter), tokenAmount);
        transmuter.stake(tokenAmount);

        emit TransmuterStaked(tokenAmount);
    }

    /// @dev transmute the token which is staked in the transmuter into currency.
    function transmuteAndClaim() external {
        uint256 stakedToken = transmuter.depositedNTokens(address(this));
        require(stakedToken > 0, "no tokens staking in transmuter");

        (uint256 depositedN, uint256 pendingdivs, uint256 inbucket, uint256 realised) = transmuter.userInfo(address(this));
        require(pendingdivs > 0 || inbucket > 0, "there is no transmutable tokens");

        uint256 currencyTransmuterBefore = currency.balanceOf(address(this));
        transmuter.transmuteAndClaim();
        uint256 currencyTransmuterAfter = currency.balanceOf(address(this));
        require(stakedToken.sub(transmuter.depositedNTokens(address(this))) == currencyTransmuterAfter.sub(currencyTransmuterBefore), "transmute failed");

        emit transmuteTokenIntoCurrency(currencyTransmuterAfter.sub(currencyTransmuterBefore));
    }

    // ====================== vault ======================

    /// @dev Updates the active vault.
    ///
    /// @param _adapter the adapter for the new active vault.
    function updateActiveVault(IVaultAdapter _adapter) external onlyGovernance {
        require(treasury != ZERO_ADDRESS, "reward cannot be 0x0");

        require(_adapter != IVaultAdapter(ZERO_ADDRESS), "active vault cannot be 0x0.");
        require(address(_adapter.token()) == address(currency), "vault: currency mismatch.");
        require(!adapters[_adapter], "Adapter already in use");
        adapters[_adapter] = true;

        _vaults.push(Vault.Data({adapter: _adapter, totalDeposited: 0}));

        emit ActiveVaultUpdated(_adapter);
    }

    /// @dev Sets the harvest fee.
    ///
    /// @param _harvestFee the new harvest fee.
    function setHarvestFee(uint256 _harvestFee) external onlyGovernance {
        require(_harvestFee <= PERCENT_RESOLUTION, "harvest fee above maximum.");

        harvestFee = _harvestFee;

        emit HarvestFeeUpdated(_harvestFee);
    }

    /// @dev flush buffered tokens to the active vault.
    ///
    /// @return the amount of tokens flushed to the active vault.
    function flushActiveVault() external expectVaultInitialized returns (uint256) {
        // Prevent flushing to the active vault when an emergency exit is enabled to prevent potential loss of funds if
        // the active vault is poisoned for any reason.
        require(!emergencyExit, "emergency pause enabled");

        Vault.Data storage _activeVault = _vaults.last();
        uint256 _depositedAmount = _activeVault.depositAll();

        emit FundsFlushed(_depositedAmount);

        return _depositedAmount;
    }

    /// @dev Harvests yield from a vault.
    ///
    /// @param _vaultId the identifier of the vault to harvest from.
    ///
    /// @return the amount of funds that were harvested from the vault.
    function harvest(uint256 _vaultId) external onlyAdmins expectVaultInitialized returns (uint256, uint256) {
        Vault.Data storage _vault = _vaults.get(_vaultId);

        (uint256 _harvestedAmount, uint256 _decreasedValue) = _vault.harvest(address(this));

        if (_harvestedAmount > 0) {
            uint256 _feeAmount = _harvestedAmount.mul(harvestFee).div(PERCENT_RESOLUTION);
            uint256 _distributeAmount = _harvestedAmount.sub(_feeAmount);

            if (_feeAmount > 0) {
                currency.transfer(treasury, _feeAmount);
            }
        }

        emit FundsHarvested(_harvestedAmount, _decreasedValue);

        return (_harvestedAmount, _decreasedValue);
    }

    /// @dev Recalls planted funds from a target vault
    ///
    /// @param _vaultId the id of the vault from which to recall funds
    /// @param _amount the amount of funds to recall
    function recallFundsFromVault(uint256 _vaultId, uint256 _amount) external expectVaultInitialized {
        require(emergencyExit && (msg.sender == governance || admins[msg.sender]), "not paused, or not governance or admin");

        Vault.Data storage _vault = _vaults.get(_vaultId);
        (uint256 _withdrawnAmount, uint256 _decreasedValue) = _vault.withdraw(address(this), _amount);
        emit FundsRecalled(_vaultId, _withdrawnAmount, _decreasedValue);
    }

    /// @dev Gets the number of vaults in the vault list.
    ///
    /// @return the vault count.
    function vaultCount() external view returns (uint256) {
        return _vaults.length();
    }

    /// @dev Get the adapter of a vault.
    ///
    /// @param _vaultId the identifier of the vault.
    ///
    /// @return the vault adapter.
    function getVaultAdapter(uint256 _vaultId) external view returns (address) {
        Vault.Data storage _vault = _vaults.get(_vaultId);
        return address(_vault.adapter);
    }

    /// @dev Get the total amount of the parent asset that has been deposited into a vault.
    ///
    /// @param _vaultId the identifier of the vault.
    ///
    /// @return the total amount of deposited tokens.
    function getVaultTotalDeposited(uint256 _vaultId) external view returns (uint256) {
        Vault.Data storage _vault = _vaults.get(_vaultId);
        return _vault.totalDeposited;
    }

    // ====================== insurance ======================

    /// @dev Issue an insurance
    ///
    /// @param _NFTContract the NFT contract.
    /// @param _NFTID the NFT ID.
    /// @param _validPeriod the valid period of the insurance.
    /// @param _insuranceAmount the amount which will be locked for the insurance
    ///
    /// @return insuranceID the insurance ID;
    function issue(
        address _NFTContract,
        uint256 _NFTID,
        uint256 _validPeriod,
        uint256 _insuranceAmount
    ) external returns (uint256 insuranceID) {
        uint256 insuranceID = insurancePolicyList.length;
        insurancePolicyList.push(
            InsurancePolicy({
                NFTContract: _NFTContract,
                issuer: msg.sender,
                NFTID: _NFTID,
                validPeriod: _validPeriod,
                insuranceAmount: _insuranceAmount,
                premiumCurrencyAmount: 0,
                premiumNAOSAmount: 0,
                expiredTime: 0,
                premiumIsSet: false,
                isValid: false,
                isLock: false
            })
        );

        emit insurancePolicyIssued(insuranceID);
    }

    /// @dev set the insurance premium
    ///
    /// @param _insuranceID the insurance ID.
    /// @param _premiumCurrencyAmount the insurance premium which is paid by currency.
    /// @param _premiumNAOSAmount the insurance premium which is paid by NAOS.
    function setInsurancePremium(
        uint256 _insuranceID,
        uint256 _premiumCurrencyAmount,
        uint256 _premiumNAOSAmount
    ) external onlyGovernance {
        require(_insuranceID < insurancePolicyList.length, "invalid insurance index");

        InsurancePolicy storage insurancePolicy = insurancePolicyList[_insuranceID];
        require(!insurancePolicy.isValid, "The insurance policy has been effective");
        insurancePolicy.premiumCurrencyAmount = _premiumCurrencyAmount;
        insurancePolicy.premiumNAOSAmount = _premiumNAOSAmount;
        insurancePolicy.premiumIsSet = true;

        emit insurancePolicyUpdated(_insuranceID);
    }

    /// @dev pay the insurance premium by currency, the currecny will buy the NAOS. The buy back NAOS will distributed to staker linearly.
    ///
    /// @param _insuranceID the insurance ID.
    /// @param _naosAmountOutMin the minimum of the naos token which will be swapped.
    function payPremiumByCurrency(uint256 _insuranceID, uint256 _naosAmountOutMin) external beforePaymentCheck(_insuranceID) {
        InsurancePolicy storage insurancePolicy = insurancePolicyList[_insuranceID];

        currency.transferFrom(msg.sender, address(this), insurancePolicy.premiumCurrencyAmount);

        // buy back NAOS token
        uint256 naosAmountBeforeSwap = naos.balanceOf(address(this));
        uint256 currencyAmountBeforeSwap = currency.balanceOf(address(this));
        address[] memory _pathNAOS = new address[](3);
        _pathNAOS[0] = address(currency);
        _pathNAOS[1] = address(wbnb);
        _pathNAOS[2] = address(naos);
        currency.approve(address(uniV2Router), insurancePolicy.premiumCurrencyAmount);
        uniV2Router.swapExactTokensForTokens(insurancePolicy.premiumCurrencyAmount, _naosAmountOutMin, _pathNAOS, address(this), block.timestamp + 800);

        uint256 naosAmountOut = naos.balanceOf(address(this)).sub(naosAmountBeforeSwap);
        require(currencyAmountBeforeSwap.sub(currency.balanceOf(address(this))) == insurancePolicy.premiumCurrencyAmount, "invalid swap");
        require(naosAmountOut >= _naosAmountOutMin, "swap amount is lower than expected");

        _activateInsurance(insurancePolicy, _insuranceID, naosAmountOut);
    }

    /// @dev Pay the insurance premium by NAOS. The NAOS will distributed to staker linearly.
    ///
    /// @param _insuranceID the insurance ID.
    function payPremiumByNAOS(uint256 _insuranceID) external beforePaymentCheck(_insuranceID) {
        InsurancePolicy storage insurancePolicy = insurancePolicyList[_insuranceID];

        naos.transferFrom(msg.sender, address(this), insurancePolicy.premiumNAOSAmount);

        _activateInsurance(insurancePolicy, _insuranceID, insurancePolicy.premiumNAOSAmount);
    }

    /// @dev If bad debt happens, the governance can call this function to let the issuer receive compensation
    ///
    /// @param _insuranceID the insurance ID.
    /// @param _amount the compensation amount.
    function compensate(uint256 _insuranceID, uint256 _amount) external onlyGovernance {
        require(_insuranceID < insurancePolicyList.length, "invalid insurance index");

        InsurancePolicy storage insurancePolicy = insurancePolicyList[_insuranceID];
        require(insurancePolicy.isValid, "The insurance policy is not effective");
        require(insurancePolicy.insuranceAmount >= _amount, "compensation amount too high");
        require(insurancePolicy.isLock, "The insurance has been unlock");
        require(insurancePolicy.expiredTime >= block.timestamp, "The insurance is expired");

        insurancePolicy.isLock = false;
        lockAmount = lockAmount.sub(insurancePolicy.insuranceAmount);
        _withdrawTo(false, _amount, insurancePolicy.issuer);

        emit insurancePolicyUpdated(_insuranceID);
        emit Compensate(_insuranceID, _amount);
    }

    /// @dev unlock expired insurance, it will reduce lock amount
    ///
    /// @param _insuranceID the insurance ID which will be unlocked
    function unlock(uint256 _insuranceID) external {
        require(_insuranceID < insurancePolicyList.length, "invalid insurance index");

        InsurancePolicy storage insurancePolicy = insurancePolicyList[_insuranceID];
        require(insurancePolicy.isLock, "The insurance has been unlock");
        require(insurancePolicy.expiredTime < block.timestamp, "cannot suspend unexpired insurance");

        insurancePolicy.isLock = false;
        lockAmount = lockAmount.sub(insurancePolicy.insuranceAmount);

        emit insurancePolicyUpdated(_insuranceID);
    }

    /// @dev distribute the buy back tokens to the staking pool linearly in the insurance period
    ///
    /// @param _index the index of distribution list which will be distributed.
    function distributeNAOSToStakingPool(uint256[] calldata _index) external {
        require(_index.length <= premiumNAOSDistributionList.length, "invalid index");
        require(address(stakingPool) != ZERO_ADDRESS, "stakingPool didn't set");

        uint256 donateAmount;
        for (uint256 index = 0; index < _index.length; index++) {
            require(_index[index] < premiumNAOSDistributionList.length, "invalid index");

            PremiumNAOSDistribution storage distribute = premiumNAOSDistributionList[_index[index]];
            require(distribute.lastDistributedTimestamp < distribute.end, "the NAOS has been distributed");

            uint256 due = block.timestamp;
            if (due > distribute.end) {
                due = distribute.end;
            }
            uint256 elapsedTime = due.sub(distribute.lastDistributedTimestamp);
            donateAmount = donateAmount.add(distribute.NAOSAmount.mul(elapsedTime).div(distribute.end.sub(distribute.start)));
            distribute.lastDistributedTimestamp = block.timestamp;

            emit naosTokenDistributed(_index[index], donateAmount);
        }
        naos.approve(address(stakingPool), donateAmount);
        stakingPool.donateReward(poolId, donateAmount);
    }

    /// @dev activate insurance policy after user pays the premium.
    ///
    /// @param _insurancePolicy the insurance policy which will be active.
    /// @param _insuranceID the insurance ID
    /// @param _paymentNAOSAmount the premium NAOS amount
    function _activateInsurance(
        InsurancePolicy storage _insurancePolicy,
        uint256 _insuranceID,
        uint256 _paymentNAOSAmount
    ) internal {
        _insurancePolicy.isValid = true;
        _insurancePolicy.isLock = true;
        _insurancePolicy.expiredTime = block.timestamp.add(_insurancePolicy.validPeriod);
        lockAmount = lockAmount.add(_insurancePolicy.insuranceAmount);
        premiumNAOSDistributionList.push(PremiumNAOSDistribution({insuranceID: _insuranceID, NAOSAmount: _paymentNAOSAmount, start: block.timestamp, end: _insurancePolicy.expiredTime, lastDistributedTimestamp: block.timestamp}));

        emit insurancePolicyUpdated(_insuranceID);
        emit premiumNAOSDistributionListUpdated(premiumNAOSDistributionList.length - 1);
    }

    /// @dev get the number of insurance policy
    function getInsurancePolicyCount() external view returns (uint256) {
        return insurancePolicyList.length;
    }

    /// @dev get the number of premium NAOS distribution
    function getPremiumNAOSDistributionCount() external view returns (uint256) {
        return premiumNAOSDistributionList.length;
    }

    /// @dev withdraw amount to an address.
    ///
    /// @param _isWithdraw if yes, transfer token first, and then currency. if no, transfer currency first, and then token
    /// @param _amount the amount which will be withdrawn.
    /// @param _to the address which will receive the tokens and currency
    function _withdrawTo(
        bool _isWithdraw,
        uint256 _amount,
        address _to
    ) internal {
        if (transmuter.depositedNTokens(address(this)) > 0) {
            (uint256 depositedN, uint256 pendingdivs, uint256 inbucket, uint256 realised) = transmuter.userInfo(address(this));
            if (pendingdivs.add(inbucket) > 0) {
                transmuter.transmuteAndClaim();
            }
        }

        uint256 diff;
        if (_isWithdraw) {
            diff = _withdraw(token, _amount, _to);
            if (diff == 0) return;
            diff = _unstakeTokenFromTransmuter(diff, _to);
            if (diff == 0) return;
            diff = _withdraw(currency, diff, _to);
            if (diff == 0) return;
            diff = _withdrawCurrencyFromVault(diff, _to);
        } else {
            diff = _withdraw(currency, _amount, _to);
            if (diff == 0) return;
            diff = _withdrawCurrencyFromVault(diff, _to);
            if (diff == 0) return;
            diff = _withdraw(token, diff, _to);
            if (diff == 0) return;
            diff = _unstakeTokenFromTransmuter(diff, _to);
        }
        require(diff == 0, "invalid withdraw");
    }

    /// @dev withdraw amount to an address.
    ///
    /// @param _money the erc20 which will be transfered
    /// @param _amount the expected transfer amount
    /// @param _to the address which erc20 will be transfered to
    function _withdraw(
        IERC20 _money,
        uint256 _amount,
        address _to
    ) internal returns (uint256) {
        uint256 balance = _money.balanceOf(address(this));
        if (balance == 0) return _amount;
        if (_amount <= balance) {
            _money.transfer(_to, _amount);
            return 0;
        } else {
            _money.transfer(_to, balance);
            return _amount.sub(balance);
        }
    }

    /// @dev unstake token from transmuter to an address.
    ///
    /// @param _amount the expected transfer amount
    /// @param _to the address which erc20 will be transfered to
    function _unstakeTokenFromTransmuter(uint256 _amount, address _to) internal returns (uint256) {
        uint256 balance = transmuter.depositedNTokens(address(this));
        if (balance == 0) return _amount;
        if (_amount <= balance) {
            transmuter.unstake(_amount);
            token.transfer(_to, _amount);
            return 0;
        } else {
            transmuter.unstake(balance);
            token.transfer(_to, balance);
            return _amount.sub(balance);
        }
    }

    /// @dev withdraw currency from vault to an address.
    ///
    /// @param _amount the expected transfer amount
    /// @param _to the address which erc20 will be transfered to
    function _withdrawCurrencyFromVault(uint256 _amount, address _to) internal returns (uint256) {
        if (_vaults.length() == 0) return _amount;
        Vault.Data storage _vault = _vaults.last();
        uint256 balance = _vault.totalDeposited;
        if (balance == 0) return _amount;
        if (_amount <= balance) {
            _vault.withdraw(_to, _amount);
            return 0;
        } else {
            _vault.withdraw(_to, balance);
            return _amount.sub(balance);
        }
    }
}
