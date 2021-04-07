const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Committee", function () {

  it("should deploy the gnosis-safe proxy", async function () {
    signers = await ethers.getSigners();
    const CallBackHandler = await ethers.getContractFactory("DefaultCallbackHandler");
    const callBackHandler = await CallBackHandler.deploy();

    Gnosis = await ethers.getContractFactory("GnosisSafe");
    const gnosis = await Gnosis.deploy();

    const ProxyFactory = await ethers.getContractFactory("GnosisSafeProxyFactory");
    const proxyFactory = await ProxyFactory.deploy();

    const setupInterface = new ethers.utils.Interface(["function setup(address[],uint256,address,bytes,address,address,uint256,address)"]);
    const initializer = setupInterface.encodeFunctionData("setup",
      [
        [signers[0].address, signers[1].address, signers[2].address],
        2,
        "0x0000000000000000000000000000000000000000",
        "0x",
        callBackHandler.address,
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000"
      ]);
    const res = await proxyFactory.createProxyWithNonce(gnosis.address, initializer, new Date().getTime());
    const receipt = await res.wait();
    proxyAddress = `0x${receipt.events[0].data.slice(26)}`;
  });

  it("Should deploy ERC721 contract", async function () {
    const NAOSNFT = await ethers.getContractFactory("Nebula");
    ERC721 = await NAOSNFT.deploy();
    expect(await ERC721.name()).to.equal("Nebula");
    expect(await ERC721.symbol()).to.equal("NAOS");
    expect(await ERC721.totalSupply()).to.equal(0);
  });

  it("Should grant ERC721 owner to gnosis proxy", async function () {
    await ERC721.transferOwnership(proxyAddress);
    expect((await ERC721.owner()).toLowerCase()).to.equal(proxyAddress);
  });

  it("Should create a ERC721 token", async function () {
    let mintInterface = new ethers.utils.Interface(["function safeMint(address to, string memory tokenURI)"]);
    const mintERC721Data = mintInterface.encodeFunctionData("safeMint",
      [
        signers[3].address,
        "testURI"
      ]);
    const gnosisProxy = await Gnosis.attach(proxyAddress);
    const gnosisProxyNonce = await gnosisProxy.nonce();
    const gnosisMintTransactionHash = await gnosisProxy.getTransactionHash(
      ERC721.address,
      0,
      mintERC721Data,
      0,
      0,
      0,
      0,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      gnosisProxyNonce.toNumber()
    );
    // generate committee's signatures for gnosis-safe transaction
    let sig1 = await signers[1].provider.send("eth_sign", [signers[1].address, gnosisMintTransactionHash]);
    sig1 = sig1.slice(130) === "00" ? `${sig1.slice(2, 130)}1f` : `${sig1.slice(2, 130)}20`;
    let sig2 = await signers[2].provider.send("eth_sign", [signers[2].address, gnosisMintTransactionHash]);
    sig2 = sig2.slice(130) === "00" ? `${sig2.slice(2, 130)}1f` : `${sig2.slice(2, 130)}20`;
    // order signature
    const signature = parseInt(signers[1].address) > parseInt(signers[2].address) ? `0x${sig2}${sig1}` : `0x${sig1}${sig2}`;
    await gnosisProxy.execTransaction(
      ERC721.address,
      0,
      mintERC721Data,
      0,
      0,
      0,
      0,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      signature
    )
    expect(await ERC721.totalSupply()).to.equal(1);
    expect(await ERC721.balanceOf(signers[3].address)).to.equal(1);
    expect(await ERC721.ownerOf(0)).to.equal(signers[3].address);
  })
})