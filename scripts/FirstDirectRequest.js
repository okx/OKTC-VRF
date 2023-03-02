const { ethers } = require("ethers");
require("dotenv").config();

const OKC_GOERLI_URL = "https://exchainrpc.okex.org";
const provider = new ethers.providers.JsonRpcProvider(
    process.env.OKC_GOERLI_URL,
);
const privateKey = process.env.PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const abiConsumer = [

    "function requestRandomWordsuint32,uint16,uint32) external payable returns (uint256 requestId)",
    "function getRequestStatus(uint256) external view returns(uint256,bool,uint256[])",
    "function lastRequestId() external view returns(uint256)"
];
const addressConsumer = process.argv[2];

const contractConsumer = new ethers.Contract(
    addressConsumer,
    abiConsumer,
    wallet,
);

async function request() {
    console.log("发起随机数请求");
    const tx = await contractConsumer.requestRandomWords(200000, 2, 2, {
        value: ethers.utils.parseUnits("0.01"),
        gasPrice: ethers.utils.parseUnits("1.01", "gwei"),
        gasLimit: 500000,
    });
    await tx.wait();
    console.log(`交易详情：`);
    console.log(tx);
    console.log("请求成功");
}

async function getRandomWords() {
    console.log('等待随机数被打回...');
    setTimeout(async () => {
        requestId = await contractConsumer.lastRequestId()
        console.log('获得随机数')
        console.log(await contractConsumer.getRequestStatus(requestId))
    }, 20000);
}


async function main() {
    await request();
    await getRandomWords();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
