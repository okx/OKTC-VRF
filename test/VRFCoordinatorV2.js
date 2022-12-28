const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const ProxyAdmin = require("@openzeppelin/contracts/build/contracts/ProxyAdmin.json");
const TransparentUpgradeableProxy = require("@openzeppelin/contracts/build/contracts/TransparentUpgradeableProxy.json");

describe("VRFCoordinatorV2", function () {
  async function deployVRFCoordinatorV2() {
    const [owner, oracle, alice, bob] = await ethers.getSigners();
    const BlockhashStoreFactory = await ethers.getContractFactory(
      "BlockhashStore",
    );
    const BlockhashStore = await BlockhashStoreFactory.connect(owner).deploy();
    const VRFCoordinatorV2Factory = await ethers.getContractFactory(
      "MockVRFCoordinatorV2",
    );
    const VRFCoordinatorV2Implement = await VRFCoordinatorV2Factory.connect(
      owner,
    ).deploy();

    const Admin = await ethers.getContractFactory(
      ProxyAdmin.abi,
      ProxyAdmin.bytecode,
    );
    const proxyAdmin = await Admin.deploy();

    const Proxy = await ethers.getContractFactory(
      TransparentUpgradeableProxy.abi,
      TransparentUpgradeableProxy.bytecode,
    );

    const transparentUpgradeableProxy = await Proxy.deploy(
      VRFCoordinatorV2Implement.address,
      proxyAdmin.address,
      "0x",
    );

    let VRFCoordinatorV2 = await VRFCoordinatorV2Implement.attach(
      transparentUpgradeableProxy.address,
    );

    await VRFCoordinatorV2.initialize(1, BlockhashStore.address);

    return { VRFCoordinatorV2, BlockhashStore, owner, oracle, alice, bob };
  }

  async function deployVRFCoordinatorV2andInit() {
    const [owner, oracle, alice, bob] = await ethers.getSigners();
    const BlockhashStoreFactory = await ethers.getContractFactory(
      "BlockhashStore",
    );
    const BlockhashStore = await BlockhashStoreFactory.connect(owner).deploy();
    const VRFCoordinatorV2Factory = await ethers.getContractFactory(
      "MockVRFCoordinatorV2",
    );
    const VRFCoordinatorV2Implement = await VRFCoordinatorV2Factory.connect(
      owner,
    ).deploy();

    const Admin = await ethers.getContractFactory(
      ProxyAdmin.abi,
      ProxyAdmin.bytecode,
    );
    const proxyAdmin = await Admin.deploy();

    const Proxy = await ethers.getContractFactory(
      TransparentUpgradeableProxy.abi,
      TransparentUpgradeableProxy.bytecode,
    );

    const transparentUpgradeableProxy = await Proxy.deploy(
      VRFCoordinatorV2Implement.address,
      proxyAdmin.address,
      "0x",
    );

    let VRFCoordinatorV2 = await VRFCoordinatorV2Implement.attach(
      transparentUpgradeableProxy.address,
    );

    await VRFCoordinatorV2.initialize(2, BlockhashStore.address);

    await VRFCoordinatorV2.connect(owner).setConfig(
      20,
      2500000,
      1e12,
      11667 + 19673 + 4,
      [4, 3, 2, 1, 0, 1, 2, 3, 4],
    );
    await VRFCoordinatorV2.connect(alice).createSubscription();

    await VRFCoordinatorV2.connect(owner).registerProvingKey(
      oracle.address,
      [0, 0],
      100 * 1e9,
    );

    const keyHash = await VRFCoordinatorV2.hashOfKey([0, 0]);
    const mockVRFConsumerExampleFactory = await ethers.getContractFactory(
      "mockVRFConsumerExample",
    );
    const mockVRFConsumer = await mockVRFConsumerExampleFactory
      .connect(owner)
      .deploy(1, VRFCoordinatorV2.address, keyHash, 500000, 20, 2);

    await VRFCoordinatorV2.connect(alice).charge(
      ethers.utils.parseUnits("1.0"),
      1,
      { value: ethers.utils.parseUnits("1.0") },
    );

    await VRFCoordinatorV2.connect(alice).addConsumer(1, bob.address);

    await VRFCoordinatorV2.connect(alice).addConsumer(
      1,
      mockVRFConsumer.address,
    );

    return {
      VRFCoordinatorV2,
      BlockhashStore,
      mockVRFConsumer,
      keyHash,
      owner,
      oracle,
      alice,
      bob,
    };
  }

  describe("registerProvingKey", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to register", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(
          VRFCoordinatorV2.connect(alice).registerProvingKey(
            oracle.address,
            [0, 0],
            1e2,
          ),
        ).to.be.reverted;
      });

      it("Should revert because of the address has been register before", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(owner).setConfig(
          20,
          2500000,
          1e12,
          11667 + 19673 + 4,
          [4, 3, 2, 1, 0, 1, 2, 3, 4],
        );
        await VRFCoordinatorV2.connect(owner).registerProvingKey(
          oracle.address,
          [0, 0],
          1e9,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).registerProvingKey(
            oracle.address,
            [0, 0],
            1e9,
          ),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `ProvingKeyAlreadyRegistered`,
        );
      });
      it("Should revert because of too much gasprice register", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).registerProvingKey(
            owner.address,
            [0, 0],
            500 * 1e12,
          ),
        ).to.be.revertedWithCustomError(VRFCoordinatorV2, `GasPriceOverRange`);
      });
    });

    describe("Events", function () {
      it("Should emit event registerProvingKey on changeRequireAprove", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2);
        await VRFCoordinatorV2.connect(owner).setConfig(
          20,
          2500000,
          1e12,
          11667 + 19673 + 4,
          [4, 3, 2, 1, 0, 1, 2, 3, 4],
        );
        await expect(
          VRFCoordinatorV2.connect(owner).registerProvingKey(
            oracle.address,
            [0, 0],
            100 * 1e9,
          ),
        )
          .to.emit(VRFCoordinatorV2, "ProvingKeyRegistered")
          .withArgs(
            await VRFCoordinatorV2.hashOfKey([0, 0]),
            oracle.address,
            100 * 1e9,
          );
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2);
        await VRFCoordinatorV2.connect(owner).setConfig(
          20,
          2500000,
          1e12,
          11667 + 19673 + 4,
          [4, 3, 2, 1, 0, 1, 2, 3, 4],
        );
        await VRFCoordinatorV2.connect(owner).registerProvingKey(
          oracle.address,
          [0, 0],
          100 * 1e9,
        );
        expect(
          await VRFCoordinatorV2.s_provingKeys(
            await VRFCoordinatorV2.hashOfKey([0, 0]),
          ),
        ).to.be.equal(oracle.address);
        expect(await VRFCoordinatorV2.s_provingKeyHashes(0)).to.be.equal(
          await VRFCoordinatorV2.hashOfKey([0, 0]),
        );
      });
    });
  });

  describe("deregisterProvingKey", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to deregisterProvingKey", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(
          VRFCoordinatorV2.connect(alice).deregisterProvingKey([0, 0]),
        ).to.be.reverted;
      });

      it("Should revert because of the address have not been register before", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).deregisterProvingKey([0, 0]),
        ).to.be.revertedWithCustomError(VRFCoordinatorV2, `NoSuchProvingKey`);
      });
    });

    describe("Events", function () {
      it("Should emit event ProvingKeyDeregistered on changeRequireAprove", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2);
        await VRFCoordinatorV2.connect(owner).setConfig(
          20,
          2500000,
          1e12,
          11667 + 19673 + 4,
          [4, 3, 2, 1, 0, 1, 2, 3, 4],
        );
        await VRFCoordinatorV2.connect(owner).registerProvingKey(
          oracle.address,
          [0, 0],
          100 * 1e9,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).deregisterProvingKey([0, 0]),
        )
          .to.emit(VRFCoordinatorV2, "ProvingKeyDeregistered")
          .withArgs(await VRFCoordinatorV2.hashOfKey([0, 0]), oracle.address);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2);
        await VRFCoordinatorV2.connect(owner).setConfig(
          20,
          2500000,
          1e12,
          11667 + 19673 + 4,
          [4, 3, 2, 1, 0, 1, 2, 3, 4],
        );
        await VRFCoordinatorV2.connect(owner).registerProvingKey(
          oracle.address,
          [0, 0],
          100 * 1e9,
        );
        await VRFCoordinatorV2.connect(owner).deregisterProvingKey([0, 0]);
        expect(
          await VRFCoordinatorV2.s_provingKeys(
            await VRFCoordinatorV2.hashOfKey([0, 0]),
          ),
        ).to.be.equal(ethers.constants.AddressZero);
      });
    });
  });

  describe("setConfig", function () {
    describe("Validations", function () {
      it("Should revert because of no permission", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(
          VRFCoordinatorV2.connect(alice).setConfig(
            201,
            0,
            1e12,
            0,
            [0, 1, 2, 3, 4, 4, 3, 2, 1],
          ),
        ).to.be.reverted;
      });

      it("Should revert because of illegal input", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).setConfig(
            201,
            0,
            1e12,
            0,
            [0, 1, 2, 3, 4, 4, 3, 2, 1],
          ),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `InvalidRequestConfirmations`,
        );
      });
    });

    describe("Events", function () {
      it("Should emit event ConfigSet on setConfig", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).setConfig(
            200,
            0,
            1e12,
            10,
            [0, 1, 2, 3, 4, 4, 3, 2, 1],
          ),
        )
          .to.emit(VRFCoordinatorV2, "ConfigSet")
          .withArgs(200, 0, 10, [0, 1, 2, 3, 4, 4, 3, 2, 1]);
      });
    });

    describe("Transfers", function () {
      it("Should change some state varibles correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(owner).setConfig(
          200,
          0,
          1e12,
          10,
          [0, 1, 2, 3, 4, 4, 3, 2, 1],
        );
        expect(await VRFCoordinatorV2.getConfig()).to.be.deep.equal([
          200, 0, 10,
        ]);
        expect(await VRFCoordinatorV2.getFeeConfig()).to.be.deep.equal([
          0, 1, 2, 3, 4, 4, 3, 2, 1,
        ]);
      });
    });
  });

  describe("createSubscription", function () {
    describe("Events", function () {
      it("Should emit event SubscriptionCreated on createSubscription", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await expect(VRFCoordinatorV2.connect(alice).createSubscription())
          .to.emit(VRFCoordinatorV2, "SubscriptionCreated")
          .withArgs(1, alice.address);
      });
    });

    describe("Transfers", function () {
      it("Should change some state varibles correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        expect(
          await VRFCoordinatorV2.getSubscription(
            await VRFCoordinatorV2.getCurrentSubId(),
          ),
        ).to.be.deep.equal([0, 0, alice.address, []]);
      });
    });
  });

  describe("charge", function () {
    describe("Validations", function () {
      it("Should revert because of not enough OKT", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await expect(
          VRFCoordinatorV2.connect(oracle).charge(10, 1, { value: 5 }),
        ).to.be.revertedWith("VRFCoordinatorV2::charge: send not enough okt");
      });

      it("Should revert because of subId not exisit", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await expect(
          VRFCoordinatorV2.connect(oracle).charge(10, 2, { value: 11 }),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `InvalidSubscription`,
        );
      });
    });

    describe("Events", function () {
      it("Should emit event SubscriptionFunded on charge", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await expect(
          VRFCoordinatorV2.connect(alice).charge(10, 1, { value: 11 }),
        )
          .to.emit(VRFCoordinatorV2, "SubscriptionFunded")
          .withArgs(1, 0, 10);
      });
    });

    describe("Transfers", function () {
      it("Should change some state varibles correctly correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).charge(10, 1, { value: 11 });
        expect(await VRFCoordinatorV2.getSubscription(1)).to.be.deep.equal([
          10,
          0,
          alice.address,
          [],
        ]);
        expect(await VRFCoordinatorV2.getTotalBalance()).to.be.equal(10);
      });
    });
  });

  describe("requestSubscriptionOwnerTransfer", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to requestSubscriptionOwnerTransfer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await expect(
          VRFCoordinatorV2.connect(oracle).requestSubscriptionOwnerTransfer(
            1,
            owner.address,
          ),
        ).to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit event SubscriptionOwnerTransferRequested on requestSubscriptionOwnerTransfer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await expect(
          VRFCoordinatorV2.connect(alice).requestSubscriptionOwnerTransfer(
            1,
            owner.address,
          ),
        )
          .to.emit(VRFCoordinatorV2, "SubscriptionOwnerTransferRequested")
          .withArgs(1, alice.address, owner.address);
      });
    });
  });

  describe("acceptSubscriptionOwnerTransfer", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to acceptSubscriptionOwnerTransfer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).requestSubscriptionOwnerTransfer(
          1,
          oracle.address,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).acceptSubscriptionOwnerTransfer(1),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `MustBeRequestedOwner`,
        );
      });

      it("Should revert because of invailed subId", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).requestSubscriptionOwnerTransfer(
          1,
          oracle.address,
        );
        await expect(
          VRFCoordinatorV2.connect(owner).acceptSubscriptionOwnerTransfer(2),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `InvalidSubscription`,
        );
      });
    });

    describe("Events", function () {
      it("Should emit event SubscriptionOwnerTransferred on acceptSubscriptionOwnerTransfer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).requestSubscriptionOwnerTransfer(
          1,
          owner.address,
        );
        await VRFCoordinatorV2.connect(owner).acceptSubscriptionOwnerTransfer(
          1,
        );
        expect(await VRFCoordinatorV2.getSubscription(1))
          .to.emit(VRFCoordinatorV2, "SubscriptionOwnerTransferred")
          .withArgs(1, alice.address, owner.address);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).requestSubscriptionOwnerTransfer(
          1,
          owner.address,
        );
        await VRFCoordinatorV2.connect(owner).acceptSubscriptionOwnerTransfer(
          1,
        );
        expect(await VRFCoordinatorV2.getSubscription(1)).to.be.deep.equal([
          0,
          0,
          owner.address,
          [],
        ]);
      });
    });
  });

  describe("addConsumer", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to addConsumer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await expect(
          VRFCoordinatorV2.connect(owner).addConsumer(1, oracle.address),
        ).to.be.reverted;
      });
      it("Should revert because of no permission to addConsumer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).addConsumer(1, oracle.address);
        await expect(
          VRFCoordinatorV2.connect(alice).addConsumer(1, owner.address),
        ).to.be.revertedWithCustomError(VRFCoordinatorV2, `TooManyConsumers`);
      });
    });

    describe("Events", function () {
      it("Should emit event SubscriptionConsumerAdded on changeRequireAprove", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        expect(
          await VRFCoordinatorV2.connect(alice).addConsumer(1, oracle.address),
        )
          .to.emit(VRFCoordinatorV2, "SubscriptionConsumerAdded")
          .withArgs(1, oracle.address);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).addConsumer(1, oracle.address);
        expect(
          await VRFCoordinatorV2.s_consumers(oracle.address, 1),
        ).to.be.equal(1);
        expect(await VRFCoordinatorV2.getSubscription(1)).to.be.deep.equal([
          0,
          0,
          alice.address,
          [oracle.address],
        ]);
      });
    });
  });

  describe("removeConsumer", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to removeConsumer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).addConsumer(1, oracle.address);
        await expect(
          VRFCoordinatorV2.connect(owner).removeConsumer(1, oracle.address),
        ).to.be.reverted;
      });
      it("Should revert because of consumer have not been added", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await expect(
          VRFCoordinatorV2.connect(alice).removeConsumer(1, oracle.address),
        ).to.be.revertedWithCustomError(VRFCoordinatorV2, `InvalidConsumer`);
      });
    });

    describe("Events", function () {
      it("Should emit event SubscriptionConsumerRemoved on removeConsumer", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).addConsumer(1, oracle.address);
        expect(
          await VRFCoordinatorV2.connect(alice).removeConsumer(
            1,
            oracle.address,
          ),
        )
          .to.emit(VRFCoordinatorV2, "SubscriptionConsumerRemoved")
          .withArgs(1, oracle.address);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const { VRFCoordinatorV2, owner, oracle, alice } = await loadFixture(
          deployVRFCoordinatorV2,
        );
        await VRFCoordinatorV2.connect(alice).createSubscription();
        await VRFCoordinatorV2.connect(alice).addConsumer(1, oracle.address);
        await VRFCoordinatorV2.connect(alice).removeConsumer(1, oracle.address);
        expect(
          await VRFCoordinatorV2.s_consumers(oracle.address, 1),
        ).to.be.equal(0);
        expect(await VRFCoordinatorV2.getSubscription(1)).to.be.deep.equal([
          0,
          0,
          alice.address,
          [],
        ]);
      });
    });
  });

  describe("requestRandomWords", function () {
    describe("Validations", function () {
      it("Should revert because of not called by consumer", async function () {
        const { VRFCoordinatorV2, keyHash, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2andInit);
        await expect(
          VRFCoordinatorV2.connect(alice).requestRandomWords(
            keyHash,
            1,
            5,
            1,
            1,
          ),
        ).to.be.revertedWithCustomError(VRFCoordinatorV2, `InvalidConsumer`);
      });
      it("Should revert because of subId not exisit", async function () {
        const { VRFCoordinatorV2, keyHash, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2andInit);
        await expect(
          VRFCoordinatorV2.connect(bob).requestRandomWords(keyHash, 2, 5, 1, 1),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `InvalidSubscription`,
        );
      });

      it("Should revert because of illeagle params", async function () {
        const { VRFCoordinatorV2, keyHash, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2andInit);
        await expect(
          VRFCoordinatorV2.connect(bob).requestRandomWords(
            keyHash,
            1,
            3000,
            1,
            1,
          ),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `InvalidRequestConfirmations`,
        );
        await expect(
          VRFCoordinatorV2.connect(bob).requestRandomWords(
            keyHash,
            1,
            100,
            0,
            1000,
          ),
        ).to.be.revertedWithCustomError(VRFCoordinatorV2, `NumWordsTooBig`);
        await expect(
          VRFCoordinatorV2.connect(bob).requestRandomWords(
            keyHash,
            1,
            100,
            5110000,
            1,
          ),
        ).to.be.revertedWithCustomError(VRFCoordinatorV2, `GasLimitTooBig`);
      });
    });

    describe("Events", function () {
      it("Should emit event RandomWordsRequested on changeRequireAprove", async function () {
        const { VRFCoordinatorV2, keyHash, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2andInit);
        [requestId, preSeed] = await VRFCoordinatorV2.computeRequestId(
          keyHash,
          bob.address,
          1,
          2,
        );
        const blockNumAfter = await ethers.provider.getBlockNumber();
        expect(
          await VRFCoordinatorV2.connect(bob).requestRandomWords(
            keyHash,
            1,
            100,
            0,
            1,
          ),
        )
          .to.emit(VRFCoordinatorV2, "RandomWordsRequested")
          .withArgs(keyHash, requestId, preSeed, 1, 100, 100, 1, bob.address);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const { VRFCoordinatorV2, keyHash, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2andInit);
        [requestId, preSeed] = await VRFCoordinatorV2.computeRequestId(
          keyHash,
          bob.address,
          1,
          2,
        );
        await VRFCoordinatorV2.connect(bob).requestRandomWords(
          keyHash,
          1,
          100,
          0,
          1,
        );
        const blockNumAfter = await ethers.provider.getBlockNumber();
        expect(await VRFCoordinatorV2.s_consumers(bob.address, 1)).to.be.equal(
          2,
        );
        expect(
          await VRFCoordinatorV2.s_requestCommitments(requestId),
        ).to.be.equal(
          await VRFCoordinatorV2.helpCalculateCommitments(
            requestId,
            blockNumAfter,
            1,
            0,
            1,
            bob.address,
          ),
        );
      });
    });
  });

  // describe("fulfillRandomWords", function () {
  //   describe("Validations", function () {
  //     it("Should revert because of keyHash not exisit", async function () {
  //       const { VRFCoordinatorV2,mockVRFConsumer,keyHash, owner, oracle, alice ,bob} = await loadFixture(
  //         deployVRFCoordinatorV2andInit
  //       );
  //       await mockVRFConsumer.connect(bob).requestRandomWords();
  //       const requestId = await mockVRFConsumer.lastRequestId();
  //       const preSeed = await mockVRFConsumer.lastPreSeed();
  //       const blocknumber = await mockVRFConsumer.lastRequestBlockNumber();
  //       const sig = await oracle.signMessage(preSeed);
  //       const proof = [[0,1],preSeed,sig]
  //       const rc = [blocknumber,1,50000, 2,mockVRFConsumer.address]
  //       await expect(VRFCoordinatorV2.connect(oracle).fulfillRandomWords(proof,rc)).to.be.revertedWithCustomError(VRFCoordinatorV2, `NoSuchProvingKey`);;
  //     });

  //     it("Should revert because of requestId not exisit", async function () {
  //       const { VRFCoordinatorV2,mockVRFConsumer,keyHash, owner, oracle, alice ,bob} = await loadFixture(
  //         deployVRFCoordinatorV2andInit
  //       );
  //       await mockVRFConsumer.connect(bob).requestRandomWords();
  //       const requestId = await mockVRFConsumer.lastRequestId();
  //       const preSeed = await mockVRFConsumer.lastPreSeed();
  //       const blocknumber = await mockVRFConsumer.lastRequestBlockNumber();
  //       const sig = await oracle.signMessage(preSeed);
  //       const proof = [[0,0],preSeed.add(200),sig]
  //       const rc = [blocknumber,1,50000, 2,mockVRFConsumer.address]
  //       await expect(VRFCoordinatorV2.connect(oracle).fulfillRandomWords(proof,rc)).to.be.revertedWithCustomError(VRFCoordinatorV2, `NoCorrespondingRequest`);;
  //     });

  //     it("Should revert because of not right rc struct passed", async function () {
  //       const { VRFCoordinatorV2,mockVRFConsumer,keyHash, owner, oracle, alice ,bob} = await loadFixture(
  //         deployVRFCoordinatorV2andInit
  //       );
  //       await mockVRFConsumer.connect(bob).requestRandomWords();
  //       const requestId = await mockVRFConsumer.lastRequestId();
  //       const preSeed = await mockVRFConsumer.lastPreSeed();
  //       const blocknumber = await mockVRFConsumer.lastRequestBlockNumber();
  //       const sig = await oracle.signMessage(preSeed);
  //       const proof = [[0,0],preSeed,sig]
  //       const rc = [blocknumber.add(20),1,50000, 2,mockVRFConsumer.address]
  //       await expect(VRFCoordinatorV2.connect(oracle).fulfillRandomWords(proof,rc)).to.be.revertedWithCustomError(VRFCoordinatorV2, `IncorrectCommitment`);;
  //     });

  //   it("Should revert because of not called by the right oracle", async function () {
  //     const { VRFCoordinatorV2,mockVRFConsumer,keyHash, owner, oracle, alice ,bob} = await loadFixture(
  //       deployVRFCoordinatorV2andInit
  //     );
  //     await mockVRFConsumer.connect(bob).requestRandomWords();
  //     const requestId = await mockVRFConsumer.lastRequestId();
  //     const preSeed = await mockVRFConsumer.lastPreSeed();
  //     const blocknumber = await mockVRFConsumer.lastRequestBlockNumber();
  //     const sig = await oracle.signMessage(preSeed);
  //     const proof = [[0,0],preSeed,sig]
  //     const rc = [blocknumber,1,500000, 2,mockVRFConsumer.address]
  //     await expect(VRFCoordinatorV2.connect(oracle).fulfillRandomWords(proof,rc)).to.be.revertedWith( `Not in charge of this randomness`);
  //   });
  //   });

  //   describe("Transfers", function () {
  //     it("Should change some state variables correctly when called successful", async function () {
  //       const { VRFCoordinatorV2,mockVRFConsumer,keyHash, owner, oracle, alice ,bob} = await loadFixture(
  //         deployVRFCoordinatorV2andInit
  //       );
  //       await mockVRFConsumer.connect(bob).requestRandomWords();
  //       const requestId = await mockVRFConsumer.lastRequestId();
  //       const preSeed = await mockVRFConsumer.lastPreSeed();
  //       const blocknumber = await mockVRFConsumer.lastRequestBlockNumber();
  //       const sig = await oracle.signMessage(
  //         ethers.utils.arrayify(
  //           await VRFCoordinatorV2.getHashedSeed(preSeed, blocknumber)
  //         )
  //       );

  //       const proof = [[0,0],preSeed,sig]
  //       const rc = [blocknumber, 1, 500000, 2, mockVRFConsumer.address]
  //       const oracleStartBalance = await ethers.provider.getBalance(oracle.address)
  //       const subIdStartBalance = (await VRFCoordinatorV2.s_subscriptions(1))["balance"]
  //       console.log(subIdStartBalance)
  //       console.log(await VRFCoordinatorV2.connect(oracle).fulfillRandomWords(proof,rc))

  //       const oracleafterBalance = await ethers.provider.getBalance(oracle.address)
  //       const subIdAfterBalance = (await VRFCoordinatorV2.s_subscriptions(1))["balance"]
  //       console.log(ethers.utils.formatUnits(subIdStartBalance - subIdAfterBalance, "ether"));
  //       console.log(oracleStartBalance - oracleafterBalance)
  //       console.log(subIdStartBalance - subIdAfterBalance)
  //       // expect(oracleStartBalance.sub(oracleafterBalance)).to.be.equal(reward)

  //       });
  //     });
  //  });

  describe("getFeeTier", function () {
    describe("Check", function () {
      it("Should return value as expects", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);
        expect(await VRFCoordinatorV2.getFeeTier(0)).to.be.equal(4);
        expect(await VRFCoordinatorV2.getFeeTier(1)).to.be.equal(4);
        expect(await VRFCoordinatorV2.getFeeTier(2)).to.be.equal(3);
        expect(await VRFCoordinatorV2.getFeeTier(3)).to.be.equal(2);
        expect(await VRFCoordinatorV2.getFeeTier(4)).to.be.equal(1);
        expect(await VRFCoordinatorV2.getFeeTier(5)).to.be.equal(0);
      });
    });
  });

  describe("recoverFunds", function () {
    describe("Validations", function () {
      it("Should revert because of no the owner ", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);
        await expect(
          VRFCoordinatorV2.connect(oracle).recoverFunds(alice.address),
        ).to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit event FundsRecovered on changeRequireAprove", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);

        await VRFCoordinatorV2.connect(alice).charge(
          ethers.utils.parseUnits("1.0"),
          1,
          { value: ethers.utils.parseUnits("2.0") },
        );

        expect(
          await VRFCoordinatorV2.connect(owner).recoverFunds(oracle.address),
        )
          .to.emit(VRFCoordinatorV2, "FundsRecovered")
          .withArgs(oracle.address, ethers.utils.parseUnits("1.0"));
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);

        await VRFCoordinatorV2.connect(alice).charge(
          ethers.utils.parseUnits("1.0"),
          1,
          { value: ethers.utils.parseUnits("2.0") },
        );
        const oracleStartBalance = await ethers.provider.getBalance(
          oracle.address,
        );
        await VRFCoordinatorV2.connect(owner).recoverFunds(oracle.address);
        const oracleafterBalance = await ethers.provider.getBalance(
          oracle.address,
        );
        expect(oracleafterBalance.sub(oracleStartBalance)).to.be.equal(
          ethers.utils.parseUnits("1.0"),
        );
      });
    });
  });

  describe("ownerCancelSubscription", function () {
    describe("Validations", function () {
      it("Should revert because of not the owner", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);
        await expect(
          VRFCoordinatorV2.connect(oracle).ownerCancelSubscription(1),
        ).to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit event SubscriptionCanceled on changeRequireAprove", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);

        expect(await VRFCoordinatorV2.connect(owner).ownerCancelSubscription(1))
          .to.emit(VRFCoordinatorV2, "SubscriptionCanceled")
          .withArgs(1, alice.address, ethers.utils.parseUnits("1.0"));
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);
        const aliceStartBalance = await ethers.provider.getBalance(
          alice.address,
        );
        await VRFCoordinatorV2.connect(owner).ownerCancelSubscription(1);
        const aliceafterBalance = await ethers.provider.getBalance(
          alice.address,
        );
        expect(aliceafterBalance.sub(aliceStartBalance)).to.be.equal(
          ethers.utils.parseUnits("1.0"),
        );
      });
    });
  });

  describe("cancelSubscription", function () {
    describe("Validations", function () {
      it("Should revert because of no subId Owner", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);
        await expect(
          VRFCoordinatorV2.connect(oracle).cancelSubscription(1, alice.address),
        ).to.be.reverted;
      });

      it("Should revert because of there is an randomrequest pending", async function () {
        const { VRFCoordinatorV2, keyHash, owner, oracle, alice, bob } =
          await loadFixture(deployVRFCoordinatorV2andInit);
        [requestId, preSeed] = await VRFCoordinatorV2.computeRequestId(
          keyHash,
          bob.address,
          1,
          2,
        );
        await VRFCoordinatorV2.connect(bob).requestRandomWords(
          keyHash,
          1,
          100,
          0,
          1,
        );
        await expect(
          VRFCoordinatorV2.connect(alice).cancelSubscription(1, alice.address),
        ).to.be.revertedWithCustomError(
          VRFCoordinatorV2,
          `PendingRequestExists`,
        );
      });
    });

    describe("Events", function () {
      it("Should emit event SubscriptionCanceled on changeRequireAprove", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);
        expect(
          await VRFCoordinatorV2.connect(alice).cancelSubscription(
            1,
            alice.address,
          ),
        )
          .to.emit(VRFCoordinatorV2, "SubscriptionCanceled")
          .withArgs(1, alice.address, ethers.utils.parseUnits("1.0"));
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFConsumer,
          keyHash,
          owner,
          oracle,
          alice,
          bob,
        } = await loadFixture(deployVRFCoordinatorV2andInit);

        const aliceStartBalance = await ethers.provider.getBalance(bob.address);
        await VRFCoordinatorV2.connect(alice).cancelSubscription(
          1,
          bob.address,
        );
        const aliceafterBalance = await ethers.provider.getBalance(bob.address);
        expect(aliceafterBalance.sub(aliceStartBalance)).to.be.equal(
          ethers.utils.parseUnits("1.0"),
        );
      });
    });
  });

  // describe("deregisterProvingKey", function () {
  //   describe("Validations", function () {
  //     it("Should revert because of no permission to deregisterProvingKey", async function () {

  //     });
  //   });

  //   describe("Events", function () {
  //     it("Should emit event ProvingKeyDeregistered on changeRequireAprove", async function () {

  //     });
  //   });

  //   describe("Transfers", function () {
  //       it("Should change some state variables correctly when called successful", async function () {

  //       });
  //     });
  //  });
});
