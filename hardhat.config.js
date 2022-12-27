require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },

  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    OKCMainnet: {
      url: `https://exchainrpc.okex.org`,
      gas: 6000000,
      accounts: [process.env.PRIVATE_KEY]
    },
    rinkeby: {
      url: `https://eth-goerli.alchemyapi.io/v2/GlaeWuylnNM3uuOo-SAwJxuwTdqHaY5l`,
      accounts: [process.env.PRIVATE_KEY]
    },
  }
}




  // networks: {

  // },
