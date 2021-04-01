require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ganache");

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.5.17",
      },
      {
        version: "0.6.0",
      },
      {
        version: "0.6.12",
      },
    ],
  },
  defaultNetwork: "ganache",
  networks: {
    ganache: {
      gasLimit: 10000000,
      defaultBalanceEther: 100,
      url: "http://localhost:8545",
    },
  }
}

