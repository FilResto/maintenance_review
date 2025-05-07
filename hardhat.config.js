require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // enable the IR pipeline
    },
  },
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/21a1dd5c29f64a52a1ff2518b947cd5b",
      accounts: ["a9d37d0f15dc5f69737bf324995277d1c059d404314962c3f6f0b48312e6930f"],
    },
    amoy: {
      url: "https://polygon-amoy.infura.io/v3/21a1dd5c29f64a52a1ff2518b947cd5b",
      accounts: ["a9d37d0f15dc5f69737bf324995277d1c059d404314962c3f6f0b48312e6930f"],
    },
  },
};

