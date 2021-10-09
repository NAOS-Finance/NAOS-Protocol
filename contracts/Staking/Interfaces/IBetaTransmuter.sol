// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

interface IBetaTransmuter {
    function NToken() external returns (address);
    function Token() external returns (address);
    function stake(uint256 amount) external;
    function unstake(uint256 amount) external;
    function transmuteAndClaim() external;
    function transmuteClaimAndWithdraw() external;
    function totalSupplyNtokens() external view returns (uint256);
    function depositedNTokens(address user) external view returns (uint256);
    function userInfo(address user)
        external
        view
        returns (
            uint256 depositedN,
            uint256 pendingdivs,
            uint256 inbucket,
            uint256 realised
        );
}
