let { ethers } = require("hardhat");
let fs = require("fs");
let settings = require("./settings.json");
let ProxyAdmin = require("@openzeppelin/contracts/build/contracts/ProxyAdmin.json");
let TransparentUpgradeableProxy = require("@openzeppelin/contracts/build/contracts/TransparentUpgradeableProxy.json");
require("dotenv").config();

async function main() {
  let proxyAdminAddress = await delpoyProxyAdmin();
  let BlockhashStoreAddress = await delpoyBlockhashStore();
  let VRFCoordinatorV2Address = await delpoyVRFCoordinatorV2(
    proxyAdminAddress.address,
  );

  let VRFV2WrapperAddress = await delpoyVRFV2Wrapper(proxyAdminAddress.address);

  await initAllContracts(
    BlockhashStoreAddress.address,
    VRFCoordinatorV2Address.address,
    VRFCoordinatorV2Address,
    VRFV2WrapperAddress.address,
  );
  await setConfigAllContracts(
    VRFCoordinatorV2Address,
    VRFCoordinatorV2Address.address,
    VRFV2WrapperAddress.address,
  );

  await createWrapperModuleConsumer(
    VRFCoordinatorV2Address,
    VRFCoordinatorV2Address.address,
    VRFV2WrapperAddress.address,
  );
  await createSubModuleConsumer(VRFCoordinatorV2Address.address);
}

async function delpoyProxyAdmin() {
  console.log("\n-------------- start delpoyProxyAdmin --------------");
  let Admin = await ethers.getContractFactory(
    ProxyAdmin.abi,
    ProxyAdmin.bytecode,
  );
  let proxyAdmin = await Admin.deploy();
  await proxyAdmin.deployed();

  console.log("proxyAdmin deployed to " + proxyAdmin.address);
  console.log("-------------- finish delpoyProxyAdmin --------------\n");
  return proxyAdmin;
}

async function delpoyBlockhashStore() {
  console.log("\n-------------- start delpoyBlockhashStore --------------");
  let BlockhashStoreFactory = await ethers.getContractFactory("BlockhashStore");
  let BlockhashStore = await BlockhashStoreFactory.deploy();
  await BlockhashStore.deployed();

  console.log("BlockhashStore deployed to " + BlockhashStore.address);
  console.log("-------------- finish delpoyBlockhashStore --------------\n");
  return BlockhashStore;
}

async function delpoyVRFCoordinatorV2(proxyAdmin) {
  console.log("-------------- start delpoyVRFCoordinatorV2 --------------");
  let VRFCoordinatorV2Factory = await ethers.getContractFactory(
    "VRFCoordinatorV2",
  );
  let VRFCoordinatorV2 = await VRFCoordinatorV2Factory.deploy();
  await VRFCoordinatorV2.deployed();

  let Proxy = await ethers.getContractFactory(
    TransparentUpgradeableProxy.abi,
    TransparentUpgradeableProxy.bytecode,
  );

  let transparentUpgradeableProxy = await Proxy.deploy(
    VRFCoordinatorV2.address,
    proxyAdmin,
    "0x",
  );
  await transparentUpgradeableProxy.deployed();

  console.log(
    "VRFCoordinatorV2ImplementContract deployed to " + VRFCoordinatorV2.address,
  );
  console.log(
    "VRFCoordinatorV2ProxyContract deployed to " +
    transparentUpgradeableProxy.address,
  );
  console.log("-------------- finish delpoyVRFCoordinatorV2 --------------\n");
  return transparentUpgradeableProxy;
}

async function delpoyVRFV2Wrapper(proxyAdmin) {
  console.log("-------------- start delpoyVRFV2Wrapper --------------");
  let VRFV2WrapperFactory = await ethers.getContractFactory("VRFV2Wrapper");
  let VRFV2Wrapper = await VRFV2WrapperFactory.deploy();
  await VRFV2Wrapper.deployed();

  let Proxy = await ethers.getContractFactory(
    TransparentUpgradeableProxy.abi,
    TransparentUpgradeableProxy.bytecode,
  );

  let transparentUpgradeableProxy = await Proxy.deploy(
    VRFV2Wrapper.address,
    proxyAdmin,
    "0x",
  );
  await transparentUpgradeableProxy.deployed();
  console.log(
    "VRFV2WrapperImplementContract deployed to " + VRFV2Wrapper.address,
  );
  console.log(
    "VRFV2WrapperProxyContract deployed to " +
    transparentUpgradeableProxy.address,
  );
  console.log("-------------- finish delpoyVRFV2Wrapper --------------\n");
  return transparentUpgradeableProxy;
}

async function initAllContracts(
  BlockhashStoreAddress,
  VRFCoordinatorV2Address,
  VRFV2WrapperAddressAddress,
) {
  let VRFCoordinatorV2 = await ethers.getContractFactory("VRFCoordinatorV2");
  let VRFV2Wrapper = await ethers.getContractFactory("VRFV2Wrapper");

  let VRFCoordinatorV2Proxy = await VRFCoordinatorV2.attach(
    VRFCoordinatorV2Address,
  );
  let VRFV2WrapperProxy = await VRFV2Wrapper.attach(VRFV2WrapperAddressAddress);

  console.log("-------------- start initializing --------------");

  await (await VRFCoordinatorV2Proxy.initialize(BlockhashStoreAddress)).wait();
  console.log("VRFCoordinatorV2 initialized");

  await (await VRFV2WrapperProxy.initialize(VRFCoordinatorV2Address)).wait();
  console.log("VRFV2Wrapper initialized");

  console.log("-------------- finish initializing --------------\n");
  return VRFCoordinatorV2Proxy, VRFV2WrapperProxy;
}

async function setConfigAllContracts(
  VRFCoordinatorV2Address,
  VRFV2WrapperAddressAddress,
) {
  let VRFCoordinatorV2 = await ethers.getContractFactory("VRFCoordinatorV2");
  let VRFV2Wrapper = await ethers.getContractFactory("VRFV2Wrapper");

  let VRFCoordinatorV2Proxy = await VRFCoordinatorV2.attach(
    VRFCoordinatorV2Address,
  );
  let VRFV2WrapperProxy = await VRFV2Wrapper.attach(VRFV2WrapperAddressAddress);

  console.log("-------------- start setConfig --------------");

  await (
    await VRFCoordinatorV2Proxy.setConfig(
      settings.VRFCoordinatorV2Config.minimumRequestConfirmations,
      settings.VRFCoordinatorV2Config.maxGasLimit,
      settings.VRFCoordinatorV2Config.maxGasPrice,
      settings.VRFCoordinatorV2Config.gasAfterPaymentCalculation,
      settings.VRFCoordinatorV2Config.feeConfig,
    )
  ).wait();

  console.log("VRFCoordinatorV2 has setted config");

  await (
    await VRFCoordinatorV2Proxy.registerProvingKey(
      settings.Oracle[0].address,
      settings.Oracle[0].pk,
      await VRFCoordinatorV2Proxy.MAX_GAS_PRICE(),
    )
  ).wait();
  let keyHash = await VRFCoordinatorV2Proxy.hashOfKey(settings.Oracle[0].pk);
  console.log(
    "Oracle has registered " + settings.Oracle[0].address,
    "\nOracle's keyhash " + keyHash,
  );

  await (
    await VRFV2WrapperProxy.setConfig(
      settings.VRFV2WrapperConfig.minGasPrice,
      settings.VRFV2WrapperConfig._wrapperGasOverhead,
      settings.VRFV2WrapperConfig._coordinatorGasOverhead,
      settings.VRFV2WrapperConfig._wrapperPremiumPercentage,
      keyHash,
      settings.VRFV2WrapperConfig._maxNumWords,
    )
  ).wait();

  console.log("VRFV2Wrapper has setted config");
  console.log("-------------- finish setConfig --------------\n");

  return VRFCoordinatorV2Proxy, VRFV2WrapperProxy;
}

async function createSubModuleConsumer(VRFCoordinatorV2Address) {
  let VRFCoordinatorV2 = await ethers.getContractFactory("VRFCoordinatorV2");

  let VRFCoordinatorV2Proxy = await VRFCoordinatorV2.attach(
    VRFCoordinatorV2Address,
  );

  console.log("-------------- start createSubModuleConsumer --------------");
  let keyHash = await VRFCoordinatorV2Proxy.hashOfKey(settings.Oracle[0].pk);
  await (await VRFCoordinatorV2Proxy.createSubscription()).wait();
  let consumerSubId = await VRFCoordinatorV2Proxy.getCurrentSubId();
  console.log("Consumer's sub has created and the SubId is " + consumerSubId);

  await (
    await VRFCoordinatorV2Proxy.charge(
      ethers.utils.parseUnits("0.001"),
      consumerSubId,
      { value: ethers.utils.parseUnits("0.001") },
    )
  ).wait();
  console.log("Has charge 0.001 OKT for SubId " + consumerSubId);

  let VRFConsumerExampleFactory = await ethers.getContractFactory(
    "VRFConsumerExample",
  );

  let VRFConsumerExample = await VRFConsumerExampleFactory.deploy(
    consumerSubId,
    VRFCoordinatorV2Proxy.address,
    keyHash,
    settings.VRFCoordinatorV2ConsumerConstructor.callbackGasLimit,
    settings.VRFCoordinatorV2ConsumerConstructor.requestConfirmations,
    settings.VRFCoordinatorV2ConsumerConstructor.numWords,
  );
  await VRFConsumerExample.deployed();
  console.log(
    "The " + consumerSubId + " SubId's Consumer deployed to:",
    VRFConsumerExample.address,
  );

  await (
    await VRFCoordinatorV2Proxy.addConsumer(
      consumerSubId,
      VRFConsumerExample.address,
      { gasLimit: 500000 },
    )
  ).wait();

  console.log("-------------- finish createSubModuleConsumer --------------\n");

  return VRFCoordinatorV2Proxy;
}

async function createWrapperModuleConsumer(
  VRFCoordinatorV2Address,
  VRFV2WrapperAddressAddress,
) {
  let VRFCoordinatorV2 = await ethers.getContractFactory("VRFCoordinatorV2");
  let VRFV2Wrapper = await ethers.getContractFactory("VRFV2Wrapper");

  let VRFCoordinatorV2Proxy = await VRFCoordinatorV2.attach(
    VRFCoordinatorV2Address,
  );
  let VRFV2WrapperProxy = await VRFV2Wrapper.attach(VRFV2WrapperAddressAddress);

  console.log(
    "-------------- start createWrapperModuleConsumer --------------",
  );

  let wrapperSubId = await VRFV2WrapperProxy.SUBSCRIPTION_ID();
  console.log(
    "Wrapper contract's sub has created and the SubId is " + wrapperSubId,
  );

  await (
    await VRFCoordinatorV2Proxy.charge(
      wrapperSubId,
      { value: ethers.utils.parseUnits("0.001") },
    )
  ).wait();
  console.log("Has charge 0.001 OKT for SubId " + wrapperSubId);

  let VRFV2WrapperConsumerExampleFactory = await ethers.getContractFactory(
    "VRFV2WrapperConsumerExample",
  );
  let VRFV2WrapperConsumerExample =
    await VRFV2WrapperConsumerExampleFactory.deploy(VRFV2WrapperProxy.address);

  await VRFV2WrapperConsumerExample.deployed();
  console.log(
    "The wrapper contract's Consumer deployed to:",
    VRFV2WrapperConsumerExample.address,
  );
  console.log(
    "-------------- finish createWrapperModuleConsumer --------------\n",
  );

  return VRFCoordinatorV2Proxy;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
