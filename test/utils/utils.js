const { utils } = require("ethers");
const { BigNumber } = require("@ethersproject/bignumber");
const { ethers } = require("hardhat");

module.exports = {
  ONE: ethers.utils.parseUnits("1", 27),
  MAXIMUM_U256: BigNumber.from(1).shl(255),
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",

  zeroPadEnd: (src, length) => {
    if (src.length >= length) {
      return src
    }
    let padded = utils.zeroPad([], length)
    let data = utils.zeroPad(src, length)
    for (let i = length - src.length; i < length; i++) {
      padded[i - length + src.length] = data[i]
    }
    return padded
  },

  mineBlocks: async (numberBlocks) => {
    for (let i = 0; i < numberBlocks; i++) {
      await ethers.provider.send('evm_mine', []);
    }
  },

  timeFly: async (seconds) => {
    return await ethers.provider.send('evm_increaseTime', [seconds]);
  }
}
