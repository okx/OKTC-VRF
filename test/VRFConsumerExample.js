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
        const VRFConsumerExampleFactory = await ethers.getContractFactory(
            "VRFConsumerExample",
        );
        const VRFConsumerExample = await VRFConsumerExampleFactory
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
            VRFConsumerExample.address,
        );

        return {
            VRFCoordinatorV2,
            BlockhashStore,
            VRFConsumerExample,
            keyHash,
            owner,
            oracle,
            alice,
            bob,
        };
    }

    describe("cancelSubscription", function () {
        describe("Transfers", function () {
            it("Should change some state variables correctly when called successful", async function () {
                const {
                    VRFCoordinatorV2,
                    VRFConsumerExample,
                    keyHash,
                    owner,
                    oracle,
                    alice,
                    bob,
                } = await loadFixture(deployVRFCoordinatorV2andInit);

                expect(await VRFConsumerExample.setConfig(1, VRFConsumerExample.address, keyHash, 500000, 20, 2)).to.not.be.reverted;
            });
        });
    });

});
