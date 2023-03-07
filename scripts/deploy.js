let { ethers } = require("hardhat");
let transparentProxy = require("./utils/transparentProxy");
let settings = require("./settings.json");
let ProxyAdmin = require("@openzeppelin/contracts/build/contracts/ProxyAdmin.json");
require("dotenv").config();

async function main() {
  let proxyAdminAddress = await delpoyProxyAdmin();
  let BlockhashStoreAddress = await delpoyBlockhashStore();
  let VRFCoordinatorV2Address = await delpoyAndInitializeVRFCoordinatorV2(
    proxyAdminAddress,
    BlockhashStoreAddress,
  );

  let VRFV2WrapperAddress = await delpoyAndInitializeVRFV2Wrapper(
    proxyAdminAddress,
    VRFCoordinatorV2Address,
  );

  await setConfigAllContracts(
    VRFCoordinatorV2Address.address,
    VRFV2WrapperAddress.address,
  );

  await createWrapperModuleConsumer(
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

async function delpoyAndInitializeVRFCoordinatorV2(
  proxyAdmin,
  BlockhashStoreAddress,
) {
  console.log("-------------- start delpoyVRFCoordinatorV2 --------------");

  let VRFCoordinatorV2 = await transparentProxy.deployProxy({
    implementationFactory: "VRFCoordinatorV2",
    initializeParams: [BlockhashStoreAddress.address],
    proxyAdmin: proxyAdmin,
  });

  await VRFCoordinatorV2.getConfig();

  console.log(
    "VRFCoordinatorV2ProxyContract deployed to " + VRFCoordinatorV2.address,
  );

  console.log("-------------- finish delpoyVRFCoordinatorV2 --------------\n");
  return VRFCoordinatorV2;
}

async function delpoyAndInitializeVRFV2Wrapper(
  proxyAdmin,
  VRFCoordinatorV2Address,
) {
  console.log("-------------- start delpoyVRFV2Wrapper --------------");

  let VRFV2Wrapper = await transparentProxy.deployProxy({
    implementationFactory: "VRFV2Wrapper",
    initializeParams: [VRFCoordinatorV2Address.address],
    proxyAdmin: proxyAdmin,
  });


  console.log("VRFV2WrapperProxyContract deployed to " + VRFV2Wrapper.address);
  console.log("-------------- finish delpoyVRFV2Wrapper --------------\n");
  return VRFV2Wrapper;
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
  console.log(await VRFCoordinatorV2Proxy.getConfig());
  console.log(await VRFCoordinatorV2Proxy.getFeeConfig());
  console.log("VRFCoordinatorV2 has setted config");

  for (let i = 0; i < 4; i++) {
    await (
      await VRFCoordinatorV2Proxy.registerProvingKey(
        settings.Oracle[i].address,
        settings.Oracle[i].pk,
        settings.Oracle[i].gasprice,
      )
    ).wait();
    keyHash = await VRFCoordinatorV2Proxy.hashOfKey(settings.Oracle[i].pk);
    console.log(
      "Oracle " + i + " has registered " + settings.Oracle[i].address,
      "\nOracle " + i + " 's keyhash " + keyHash,
    );
  }

  await (
    await VRFV2WrapperProxy.setConfig(
      settings.VRFV2WrapperConfig.minGasPrice,
      settings.VRFV2WrapperConfig._wrapperGasOverhead,
      settings.VRFV2WrapperConfig._coordinatorGasOverhead,
      settings.VRFV2WrapperConfig._wrapperPremiumPercentage,
      await VRFCoordinatorV2Proxy.hashOfKey(settings.Oracle[0].pk),
      settings.VRFV2WrapperConfig._maxNumWords,
    )
  ).wait();

  console.log(await VRFV2WrapperProxy.getConfig());
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
    await VRFCoordinatorV2Proxy.charge(consumerSubId, {
      value: ethers.utils.parseUnits("0.001"),
    })
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
    await VRFCoordinatorV2Proxy.charge(wrapperSubId, {
      value: ethers.utils.parseUnits("0.001"),
    })
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
