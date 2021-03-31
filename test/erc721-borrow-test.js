const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("ERC721 Borrow", function () {
  const tokenName = "NAOS Loan Token"
  const tokenSymbol = "NAOS20"

  async function setupERC721() {
    const NAOSNFT = await ethers.getContractFactory("NAOSNFT")
    return await NAOSNFT.deploy()
  }

  async function setupERC20() {
    const NAOS = await ethers.getContractFactory("NAOS")
    return await NAOS.deploy()
  }

  async function setupContracts() {
    const { BigNumber } = ethers
    const discountRate = BigNumber.from('1000000342100000000000000000')
    const erc20 = await setupERC20()
    expect(await erc20.name()).to.equal(tokenName)
    expect(await erc20.symbol()).to.equal(tokenSymbol)
    const signer = await ethers.getSigner()

    const Root = await ethers.getContractFactory("TinlakeRoot")
    const root = await Root.deploy(signer.address)

    // setup borrower
    const TitleFab = await ethers.getContractFactory("TitleFab")
    const titleFab = await TitleFab.deploy()

    const ShelfFab = await ethers.getContractFactory("ShelfFab")
    const shelfFab = await ShelfFab.deploy()

    const PileFab = await ethers.getContractFactory("PileFab")
    const pileFab = await PileFab.deploy()

    const CollectorFab = await ethers.getContractFactory("CollectorFab")
    const collectorFab = await CollectorFab.deploy()

    const NAVFeedFab = await ethers.getContractFactory("NAVFeedFab")
    const navFeedFab = await NAVFeedFab.deploy()

    const BorrowerDeployer = await ethers.getContractFactory("BorrowerDeployer")
    const borrower = await BorrowerDeployer.deploy(root.address, titleFab.address, shelfFab.address, pileFab.address, collectorFab.address, navFeedFab.address, erc20.address, tokenName, tokenSymbol, discountRate)

    await borrower.deployTitle()
    await borrower.deployPile()
    await borrower.deployFeed()
    await borrower.deployShelf()
    await borrower.deployCollector()
    await borrower.deploy()

    // setup lender
    const ReserveFab = await ethers.getContractFactory("ReserveFab")
    const reserveFab = await ReserveFab.deploy()

    const AssessorFab = await ethers.getContractFactory("AssessorFab")
    const assessorFab = await AssessorFab.deploy()

    const TrancheFab = await ethers.getContractFactory("TrancheFab")
    const trancheFab = await TrancheFab.deploy()

    const MemberlistFab = await ethers.getContractFactory("MemberlistFab")
    const memberlistFab = await MemberlistFab.deploy()

    const RestrictedTokenFab = await ethers.getContractFactory("RestrictedTokenFab")
    const restrictedTokenFab = await RestrictedTokenFab.deploy()

    const OperatorFab = await ethers.getContractFactory("OperatorFab")
    const operatorFab = await OperatorFab.deploy()

    const CoordinatorFab = await ethers.getContractFactory("CoordinatorFab")
    const coordinatorFab = await CoordinatorFab.deploy()

    const LenderDeployer = await ethers.getContractFactory("LenderDeployer")
    const lender = await LenderDeployer.deploy(root.address, erc20.address, trancheFab.address, memberlistFab.address, restrictedTokenFab.address, reserveFab.address, assessorFab.address, coordinatorFab.address, operatorFab.address)
    const tenp25 = BigNumber.from(10).pow(25)
    // await lender.init(BigNumber.from(75).mul(tenp25), BigNumber.from(85).mul(tenp25), 10, 60*60, BigNumber.from('1000000229200000000000000000'), "Drop Token", "Drop", "Tin Token", "Tin")
    // await lender.deployJunior()
    // await lender.deploySenior()
    // await lender.deployReserve()
    // await lender.deployAssessor()
    // await lender.deployCoordinator()
    // await lender.deploy()

    await root.prepare(lender.address, borrower.address, signer.address)
    await root.deploy()

    return { root, borrower, lender }
  }

  it("should setup contracts", async function () {
    const { root, borrower, lender } = await setupContracts()
    console.log(root.address, borrower.address, lender.address)
    expect(root.address).to.equal(40)
    const erc721 = await setupERC721()
    console.log(erc721.name)
  })
})