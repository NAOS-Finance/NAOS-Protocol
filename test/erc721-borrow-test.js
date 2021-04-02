const { BigNumber } = require("@ethersproject/bignumber")
const { expect } = require("chai")
const { ethers } = require("hardhat")
const { ContractFunctionVisibility } = require("hardhat/internal/hardhat-network/stack-traces/model")

describe("ERC721 Borrow", function () {
  const tokenName = "NAOS Loan Token"
  const tokenSymbol = "NAOS20"

  async function setupNFT() {
    const Title = await ethers.getContractFactory("Title")
    return await Title.deploy("Collateral NFT", "collateralNFT")
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
    const borrowerDeployer = await BorrowerDeployer.deploy(root.address, titleFab.address, shelfFab.address, pileFab.address, collectorFab.address, navFeedFab.address, erc20.address, tokenName, tokenSymbol, discountRate)

    await borrowerDeployer.deployTitle()
    await borrowerDeployer.deployPile()
    await borrowerDeployer.deployFeed()
    await borrowerDeployer.deployShelf()
    await borrowerDeployer.deployCollector()
    await borrowerDeployer.deploy()

    const Shelf = await ethers.getContractFactory("Shelf")
    const shelf = Shelf.attach(await borrowerDeployer.shelf())
    const Pile = await ethers.getContractFactory("Pile")
    const pile = Pile.attach(await borrowerDeployer.pile())
    const Title = await ethers.getContractFactory("Title")
    const title = Title.attach(await borrowerDeployer.title())
    const Collector = await ethers.getContractFactory("Collector")
    const collector = Collector.attach(await borrowerDeployer.collector())
    const NAVFeed = await ethers.getContractFactory("NAVFeed")
    const nftFeed = NAVFeed.attach(await borrowerDeployer.feed())

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
    const lenderDeployer = await LenderDeployer.deploy(root.address, erc20.address, trancheFab.address, memberlistFab.address, restrictedTokenFab.address, reserveFab.address, assessorFab.address, coordinatorFab.address, operatorFab.address)
    const tenp25 = BigNumber.from(10).pow(25)
    await lenderDeployer.init(BigNumber.from(75).mul(tenp25), BigNumber.from(85).mul(tenp25), 10, 60*60, BigNumber.from('1000000229200000000000000000'), "Drop Token", "Drop", "Tin Token", "Tin")
    await lenderDeployer.deployJunior()
    await lenderDeployer.deploySenior()
    await lenderDeployer.deployReserve()
    await lenderDeployer.deployAssessor()
    await lenderDeployer.deployCoordinator()
    await lenderDeployer.deploy()

    const Assessor = await ethers.getContractFactory("Assessor")
    const assessor = Assessor.attach(await lenderDeployer.assessor())
    const Reserve = await ethers.getContractFactory("Reserve")
    const reserve = Reserve.attach(await lenderDeployer.reserve())
    const EpochCoordinator = await ethers.getContractFactory("EpochCoordinator")
    const coordinator = EpochCoordinator.attach(await lenderDeployer.coordinator())
    const Tranche = await ethers.getContractFactory("Tranche")
    const seniorTranche = Tranche.attach(await lenderDeployer.seniorTranche())
    const juniorTranche = Tranche.attach(await lenderDeployer.juniorTranche())
    const Operator = await ethers.getContractFactory("Operator")
    const juniorOperator = Operator.attach(await lenderDeployer.juniorOperator())
    const seniorOperator = Operator.attach(await lenderDeployer.seniorOperator())
    const RestrictedToken = await ethers.getContractFactory("RestrictedToken")
    const seniorToken = RestrictedToken.attach(await lenderDeployer.seniorToken())
    const juniorToken = RestrictedToken.attach(await lenderDeployer.juniorToken())
    const Memberlist = await ethers.getContractFactory("Memberlist")
    const juniorMemberlist = Memberlist.attach(await lenderDeployer.juniorMemberlist())
    const seniorMemberlist = Memberlist.attach(await lenderDeployer.seniorMemberlist())

    await root.prepare(lenderDeployer.address, borrowerDeployer.address, signer.address)
    await root.deploy()

    // set first user as admin
    await root.relyContract(title.address, signer.address)
    await root.relyContract(shelf.address, signer.address)
    await root.relyContract(pile.address, signer.address)
    await root.relyContract(nftFeed.address, signer.address)
    await root.relyContract(collector.address, signer.address)

    await root.relyContract(juniorMemberlist.address, signer.address)
    await root.relyContract(seniorMemberlist.address, signer.address)

    return { erc20, signer, root, borrowerDeployer, lenderDeployer, shelf, pile, title, collector, nftFeed, assessor, reserve, coordinator, juniorTranche, seniorTranche, juniorToken, seniorToken, juniorOperator, seniorOperator, juniorMemberlist, seniorMemberlist }
  }

  it("should setup loan", async function () {
    const { erc20, signer, root, borrowerDeployer, lenderDeployer, shelf, pile, title, collector, nftFeed, assessor, reserve, coordinator, juniorTranche, seniorTranche, juniorToken, seniorToken, juniorOperator, seniorOperator, juniorMemberlist, seniorMemberlist } = await setupContracts()
    console.log(`Signer: ${signer.address}`)
    console.log(`Root address: ${root.address}`)
    console.log(`Borrower deployer address: ${borrowerDeployer.address}`)
    console.log(`Lender deployer address: ${lenderDeployer.address}`)
    expect(root.address.length).to.equal(42)
    expect(borrowerDeployer.address.length).to.equal(42)
    expect(lenderDeployer.address.length).to.equal(42)
    const nft = await setupNFT()
    const ten = BigNumber.from('10')
    const ether = ten.pow(18)
    // 10 ether
    const nftPrice = ten.mul(ether)
    const riskGroup = 2
    // const abiCoder = new ethers.utils.AbiCoder()
    const signers = await ethers.getSigners()
    const borrowerAccount = signers[1]
    const juniorInvestor = signers[2]
    const seniorInvestor = signers[3]
    // issue loan
    await nft.issue(borrowerAccount.address)
    const tokenID = (await nft.count()).sub(1)
    // 30 days
    const maturityDate = 60000 * 86400
    // it's different with keccak256(abi.encodePacked(registry, tokenId))
    // const tokenKey = ethers.utils.keccak256(abiCoder.encode([{ type: 'address' }, { type: 'uint256' }], [nft.address, tokenID]))
    const tokenKey = await nftFeed.callStatic['nftID(address,uint256)'](nft.address, tokenID)
    // set nft price and risk
    console.log(`Borrow NFT identifier ${tokenKey}`)
    await nftFeed['update(bytes32,uint256,uint256)'](tokenKey, nftPrice, riskGroup)
    await nftFeed['file(bytes32,bytes32,uint256)']('0x' + Buffer.from("maturityDate").toString('hex').padEnd(64, '0'), tokenKey, maturityDate)
    // issue nft
    const loan = await shelf.connect(borrowerAccount).callStatic.issue(nft.address, tokenID)
    await shelf.connect(borrowerAccount).issue(nft.address, tokenID)
    const ceiling = await nftFeed.ceiling(loan)
    await nft.connect(borrowerAccount).setApprovalForAll(shelf.address, true)
    const validUntil = Math.floor((new Date).getTime() / 1000) + 8 * 86400
    const ONE = ten.pow(27)

    juniorMemberlist.updateMember(juniorInvestor.address, validUntil)
    seniorMemberlist.updateMember(seniorInvestor.address, validUntil)

    const jAmount = ceiling.mul(ten.pow(25)).mul(82).div(ONE)
    const sAmount = ceiling.mul(ten.pow(25)).mul(18).div(ONE)

    await erc20.mint(juniorInvestor.address, jAmount)
    await erc20.connect(juniorInvestor).approve(juniorTranche.address, jAmount)
    await erc20.mint(seniorInvestor.address, sAmount)
    await erc20.connect(seniorInvestor).approve(seniorTranche.address, sAmount)

    await juniorOperator.connect(juniorInvestor).supplyOrder(jAmount)
    await seniorOperator.connect(seniorInvestor).supplyOrder(sAmount)
    // add one day (minimum times)
    await ethers.provider.send('evm_increaseTime', [ 86400 ])
    await coordinator.closeEpoch()
    // make sure there are investment
    // withdraw loan
    await shelf.connect(borrowerAccount).lock(loan)
    await shelf.connect(borrowerAccount).borrow(loan, ceiling)
    await shelf.connect(borrowerAccount).withdraw(loan, ceiling, borrowerAccount.address)
  }, 60000)
})