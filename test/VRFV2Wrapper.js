const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const ProxyAdmin = require("@openzeppelin/contracts/build/contracts/ProxyAdmin.json");
const TransparentUpgradeableProxy = require("@openzeppelin/contracts/build/contracts/TransparentUpgradeableProxy.json");

describe("VRFWrapperV2", function () {
  async function deploy() {
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

    const CoordinatorAdmin = await ethers.getContractFactory(
      ProxyAdmin.abi,
      ProxyAdmin.bytecode,
    );
    const CoordinatorproxyAdmin = await CoordinatorAdmin.deploy();

    const CoordinatorProxy = await ethers.getContractFactory(
      TransparentUpgradeableProxy.abi,
      TransparentUpgradeableProxy.bytecode,
    );

    const CoordinatortransparentUpgradeableProxy =
      await CoordinatorProxy.deploy(
        VRFCoordinatorV2Implement.address,
        CoordinatorproxyAdmin.address,
        "0x",
      );

    let VRFCoordinatorV2 = await VRFCoordinatorV2Implement.attach(
      CoordinatortransparentUpgradeableProxy.address,
    );

    await VRFCoordinatorV2.initialize(2, BlockhashStore.address);

    await VRFCoordinatorV2.connect(owner).setConfig(
      20,
      5000000,
      1e12,
      55448,
      [4, 3, 2, 1, 0, 1, 2, 3, 4],
    );

    await VRFCoordinatorV2.connect(owner).registerProvingKey(
      oracle.address,
      [0, 0],
      2 * 1e9,
    );

    const keyHash = await VRFCoordinatorV2.hashOfKey([0, 0]);

    const mockVRFV2WrapperFactory = await ethers.getContractFactory(
      "mockVRFV2Wrapper",
    );
    const mockVRFV2WrapperImplement = await mockVRFV2WrapperFactory
      .connect(owner)
      .deploy();

    const Admin = await ethers.getContractFactory(
      ProxyAdmin.abi,
      ProxyAdmin.bytecode,
    );
    const proxyAdmin = await CoordinatorAdmin.deploy();

    const Proxy = await ethers.getContractFactory(
      TransparentUpgradeableProxy.abi,
      TransparentUpgradeableProxy.bytecode,
    );

    const transparentUpgradeableProxy = await CoordinatorProxy.deploy(
      mockVRFV2WrapperImplement.address,
      CoordinatorproxyAdmin.address,
      "0x",
    );

    let mockVRFV2Wrapper = await mockVRFV2WrapperImplement.attach(
      transparentUpgradeableProxy.address,
    );

    await mockVRFV2Wrapper.initialize(VRFCoordinatorV2.address);

    await mockVRFV2Wrapper
      .connect(owner)
      .setConfig(1e9, 10000, 8000, 0, keyHash, 2);

    await VRFCoordinatorV2.connect(owner).charge(
      1,
      { value: ethers.utils.parseUnits("1.0") },
    );

    const mockVRFV2WrapperConsumerExampleFactory =
      await ethers.getContractFactory("mockVRFV2WrapperConsumerExample");
    const mockVRFV2WrapperConsumerExample =
      await mockVRFV2WrapperConsumerExampleFactory
        .connect(owner)
        .deploy(mockVRFV2Wrapper.address);

    return {
      VRFCoordinatorV2,
      mockVRFV2Wrapper,
      mockVRFV2WrapperConsumerExample,
      keyHash,
      owner,
      oracle,
      alice,
      bob,
    };
  }

  describe("setConfig", function () {
    describe("Validations", function () {
      it("Should revert because of not called by owner", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2Wrapper
            .connect(alice)
            .setConfig(1e9, 5000, 8000, 0, keyHash, 2),
        ).to.be.revertedWith(`Ownable: caller is not the owner`);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          bob,
          oracle,
          alice,
        } = await loadFixture(deploy);
        expect((await mockVRFV2Wrapper.getConfig()).slice(0, 6)).deep.equal([
          4,
          10000,
          8000,
          0,
          keyHash,
          2,
        ]);
      });
    });
  });

  describe("withdraw", function () {
    describe("Validations", function () {
      it("Should revert because of not called by owner", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2Wrapper
            .connect(alice)
            .withdraw(alice.address, ethers.utils.parseUnits("1.0")),
        ).to.be.revertedWith(`Ownable: caller is not the owner`);
      });

      it("Should revert because of not enoughOKT", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2Wrapper
            .connect(owner)
            .withdraw(alice.address, ethers.utils.parseUnits("1.0")),
        ).to.be.revertedWith(`VRFV2Wrapper::sendOKT: Not enough OKT left`);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          owner,
          bob,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await mockVRFV2WrapperConsumerExample
          .connect(owner)
          .requestRandomWords(1000, 20, 1, {
            value: ethers.utils.parseUnits("1"),
          });
        const beforeWithDrawAliceBalance = await ethers.provider.getBalance(
          bob.address,
        );
        const beforeWithDrawContractBalance = await ethers.provider.getBalance(
          mockVRFV2Wrapper.address,
        );
        await mockVRFV2Wrapper
          .connect(owner)
          .withdraw(bob.address, ethers.utils.parseUnits("0.000001"));
        const afterWithDrawAliceBalance = await ethers.provider.getBalance(
          bob.address,
        );
        const afterWithDrawContractBalance = await ethers.provider.getBalance(
          mockVRFV2Wrapper.address,
        );
        expect(
          afterWithDrawAliceBalance.sub(beforeWithDrawAliceBalance),
        ).to.be.equal(
          beforeWithDrawContractBalance.sub(afterWithDrawContractBalance),
        );
      });
    });
  });

  describe("enable", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to deregisterProvingKey", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2Wrapper.connect(alice).enable(),
        ).to.be.revertedWith(`Ownable: caller is not the owner`);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await mockVRFV2Wrapper.connect(owner).enable();
        expect(await mockVRFV2Wrapper.connect(owner).s_disabled()).to.be.equal(
          false,
        );
      });
    });
  });

  describe("disable", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to deregisterProvingKey", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);

        await expect(
          mockVRFV2Wrapper.connect(alice).disable(),
        ).to.be.revertedWith(`Ownable: caller is not the owner`);
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          keyHash,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await mockVRFV2Wrapper.connect(owner).disable();
        expect(await mockVRFV2Wrapper.connect(owner).s_disabled()).to.be.equal(
          true,
        );
      });
    });
  });

  describe("charge", function () {
    describe("Validations", function () {
      it("Should revert because of too low gasprice", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2WrapperConsumerExample
            .connect(owner)
            .requestRandomWords(50000, 20, 10, {
              gasPrice: ethers.utils.parseUnits("0.2", "gwei"),
              value: ethers.utils.parseUnits("0.001"),
            }),
        ).to.be.revertedWith(`VRFV2Wrapper::charge: tx.gasprice too low`);
      });
      it("Should revert because of too low fee transfer", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2WrapperConsumerExample
            .connect(owner)
            .requestRandomnessForTest(50000, 20, 1, {
              gasPrice: ethers.utils.parseUnits("1", "gwei"),
              value: ethers.utils.parseUnits("0.00001"),
            }),
        ).to.be.revertedWith(`VRFV2Wrapper::charge: fee too low`);
      });
      it("Should revert because of too many randomness require", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2WrapperConsumerExample
            .connect(owner)
            .requestRandomWords(50000, 20, 100, {
              gasPrice: ethers.utils.parseUnits("1", "gwei"),
              value: ethers.utils.parseUnits("0.001"),
            }),
        ).to.be.revertedWith(`VRFV2Wrapper::charge: numWords too high`);
      });
    });

    describe("Events", function () {
      it("Should emit event ProvingKeyDeregistered on changeRequireAprove", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await expect(
          mockVRFV2WrapperConsumerExample
            .connect(owner)
            .requestRandomWords(50000, 20, 1, {
              gasPrice: ethers.utils.parseUnits("1", "gwei"),
              value: ethers.utils.parseUnits("0.001"),
            }),
        ).to.emit(VRFCoordinatorV2, "RandomWordsRequested");
      });
    });

    describe("Transfers", function () {
      it("Should change some state variables correctly when called successful", async function () {
        const {
          VRFCoordinatorV2,
          mockVRFV2Wrapper,
          mockVRFV2WrapperConsumerExample,
          owner,
          oracle,
          alice,
        } = await loadFixture(deploy);
        await mockVRFV2WrapperConsumerExample
          .connect(owner)
          .requestRandomWords(1000, 20, 1, {
            value: ethers.utils.parseUnits("0.001"),
          });
        const s_callbacks = await mockVRFV2Wrapper.s_callbacks(
          await mockVRFV2Wrapper.lastRequestId(),
        );
      });
    });
  });

  describe("fulfillRandomness", function () {
    describe("Validations", function () {
      it("Should revert because of no permission to deregisterProvingKey", async function () { });
    });

    describe("Events", function () {
      it("Should emit event ProvingKeyDeregistered on changeRequireAprove", async function () { });
    });

    describe("Transfers", function () {
      // it("Should change some state variables correctly when called successful", async function () {
      //   const { VRFCoordinatorV2,mockVRFV2Wrapper,mockVRFV2WrapperConsumerExample ,owner, bob,oracle, alice } = await loadFixture(
      //     deploy
      // );
      // await mockVRFV2WrapperConsumerExample.connect(owner).requestRandomWords(100000, 20, 2, {value:ethers.utils.parseUnits("1000")});
      //     const requestId = await mockVRFV2Wrapper.lastRequestId();
      //     const preSeed = await mockVRFV2Wrapper.lastPreSeed();
      //     const blocknumber = await mockVRFV2Wrapper.lastRequestBlockNumber();
      //     const sig = await oracle.signMessage(
      //       ethers.utils.arrayify(
      //         await VRFCoordinatorV2.getHashedSeed(preSeed, blocknumber)
      //       )
      //     );
      //     const proof = [[0,0],preSeed,sig]
      //     const rc = [blocknumber, 1, await mockVRFV2Wrapper.lastgaslimit(), 2, mockVRFV2Wrapper.address]
      //     await VRFCoordinatorV2.connect(oracle).fulfillRandomWords(proof, rc,{gasLimit: 3000000});
      //     const reward = await VRFCoordinatorV2.s_withdrawableTokens(oracle.address);
      //     const aliceStartBalance = await ethers.provider.getBalance(alice.address)
      //     await VRFCoordinatorV2.connect(oracle).oracleWithdraw(alice.address, reward)
      //     const aliceafterBalance = await ethers.provider.getBalance(alice.address)
      //     expect(aliceafterBalance.sub(aliceStartBalance)).to.be.equal(reward)
      //     expect(await VRFCoordinatorV2.s_withdrawableTokens(oracle.address)).to.be.equal(0)
      //   });
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
