pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

interface ITranche {
    //TODO: Add this function in tranche
    function getTokenPriceByEpoch(uint256 _index) external view returns (uint256 tokenPrice);
}
