const { BigNumber } = require("@ethersproject/bignumber")
const { expect } = require("chai")
const { ethers } = require("hardhat")

const timeFly = async (days) => {
  return await ethers.provider.send('evm_increaseTime', [ Math.floor(days * 86400) ])
}

describe("ERC721 Borrow", function () {
  const tokenName = "Mock DAI"
  const tokenSymbol = "DAI"

  async function setupNFT() {
    const Title = await ethers.getContractFactory("Title")
    return await Title.deploy("Collateral NFT", "collateralNFT")
  }

  async function setupERC20() {
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock")
    return await ERC20MockFactory.deploy(
      "Mock DAI",
      "DAI",
      18
    )
  }

  async function setupContracts() {
    const { BigNumber } = ethers
    const discountRate = BigNumber.from('1000000342100000000000000000')
    const erc20 = await setupERC20()
    expect(await erc20.name()).to.equal(tokenName)
    expect(await erc20.symbol()).to.equal(tokenSymbol)
    const signer = await ethers.getSigner()
    const Root = await ethers.getContractFactory("GalaxyRoot")
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
    const minSeniorRate = BigNumber.from(0).mul(tenp25) // 0%
    const maxSeniorRate = BigNumber.from(100).mul(tenp25) // 100%
    const maxReserve = BigNumber.from('10000000000000000001')
    const maxSeniorInterestRate = BigNumber.from('1000000229200000000000000000')
    await lenderDeployer.init(minSeniorRate, maxSeniorRate, maxReserve, 60 * 60, maxSeniorInterestRate, "Alpha Token", "Alpha", "Beta Token", "Beta")
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
    await root.relyContract(shelf.address, signer.address)
    await root.relyContract(pile.address, signer.address)
    await root.relyContract(title.address, signer.address)
    await root.relyContract(collector.address, signer.address)
    await root.relyContract(nftFeed.address, signer.address)    
    // to payout left money, assign signer to reserve
    await root.relyContract(reserve.address, signer.address)

    // authorize first user to update investors
    await root.relyContract(juniorMemberlist.address, signer.address)
    await root.relyContract(seniorMemberlist.address, signer.address)

    return {
      erc20,
      signer,
      root,
      borrowerDeployer,
      lenderDeployer,
      shelf,
      pile,
      title,
      collector,
      nftFeed,
      assessor,
      reserve,
      coordinator,
      juniorTranche,
      seniorTranche,
      juniorToken,
      seniorToken,
      juniorOperator,
      seniorOperator,
      juniorMemberlist,
      seniorMemberlist
    }
  }

  it("should setup loan", async function () {
    const {
      erc20,
      signer,
      root,
      borrowerDeployer,
      lenderDeployer,
      shelf,
      pile,
      title,
      collector,
      nftFeed,
      assessor,
      reserve,
      coordinator,
      juniorTranche,
      seniorTranche,
      juniorToken,
      seniorToken,
      juniorOperator,
      seniorOperator,
      juniorMemberlist,
      seniorMemberlist
    } = await setupContracts()
    console.log(`Signer: ${signer.address}`)
    console.log(`Root address: ${root.address}`)
    console.log(`Borrower deployer address: ${borrowerDeployer.address}`)
    console.log(`Lender deployer address: ${lenderDeployer.address}`)
    expect(root.address.length).to.equal(42)
    expect(borrowerDeployer.address.length).to.equal(42)
    expect(lenderDeployer.address.length).to.equal(42)
    const navs = async () => {
      return {
        nav: (await assessor.callStatic['calcUpdateNAV()']()),
        seniorTokenPrice: (await assessor.callStatic['calcSeniorTokenPrice()']()),
        juniorTokenPrice: (await assessor.callStatic['calcJuniorTokenPrice()']())
      }
    }
    const seniorValues = async () => {
      return {
        debt: (await assessor.callStatic['seniorDebt()']()),
        balance: (await assessor.callStatic['seniorBalance()']())
      }
    }
    const tokenPrices = async () => {
      return {
        junior: await juniorToken.balanceOf(juniorInvestor.address),
        senior: await seniorToken.balanceOf(seniorInvestor.address)
      }
    }
    const signers = await ethers.getSigners()
    const borrowerAccount = signers[1]
    const juniorInvestor = signers[2]
    const seniorInvestor = signers[3]
    const validUntil = (new Date).getTime() + 30 * 86400 * 1000
    const ten = BigNumber.from('10')
    const ether = ten.pow(18)
    const ONE = ten.pow(27)
    const setupLoan = async () => {
      const nft = await setupNFT()
      // 10 ether
      const nftPrice = ten.mul(ether)
      const riskGroup = 2
      // const abiCoder = new ethers.utils.AbiCoder()
      // issue loan
      await nft.issue(borrowerAccount.address)
      const tokenID = (await nft.count()).sub(1)
      // 30 days
      const maturityDate = 1700000000
      // it's different with keccak256(abi.encodePacked(nft.address, tokenID))
      // const tokenKey = ethers.utils.keccak256(abiCoder.encode([{ type: 'address' }, { type: 'uint256' }], [nft.address, tokenID]))
      const tokenKey = await nftFeed.callStatic['nftID(address,uint256)'](nft.address, tokenID)
      // set nft price and risk
      console.log(`Borrow NFT identifier ${tokenKey}`)
      await nftFeed['update(bytes32,uint256,uint256)'](tokenKey, nftPrice, riskGroup)
      await nftFeed['file(bytes32,bytes32,uint256)']('0x' + Buffer.from("maturityDate").toString('hex').padEnd(64, '0'), tokenKey, maturityDate)
      console.log('Issue nft')
      // issue nft
      const loan = await shelf.connect(borrowerAccount).callStatic.issue(nft.address, tokenID)
      await shelf.connect(borrowerAccount).issue(nft.address, tokenID)
      const ceiling = await nftFeed.ceiling(loan)
      expect(ceiling.toString()).equal(nftPrice.div(2).toString())
      await nft.connect(borrowerAccount).setApprovalForAll(shelf.address, true)
      return {
        nft,
        tokenID,
        maturityDate,
        tokenKey,
        loan,
        ceiling
      }
    }
    const {
      nft,
      tokenID,
      // maturityDate,
      // tokenKey,
      loan,
      ceiling
    } = await setupLoan()
    
    console.log('Invest the debt')

    // await juniorMemberlist.updateMember(juniorInvestor.address, validUntil)
    // expect((await juniorMemberlist.members(juniorInvestor.address)).toString()).equal(validUntil.toString())
    await seniorMemberlist.updateMember(seniorInvestor.address, validUntil)
    expect((await seniorMemberlist.members(seniorInvestor.address)).toString()).equal(validUntil.toString())

    // const jAmount = ceiling.mul(ten.pow(25)).mul(82).div(ONE) // 82%
    // const sAmount = ceiling.mul(ten.pow(25)).mul(18).div(ONE) // 18%

    // const jAmount = ceiling.mul(ten.pow(25)).mul(0).div(ONE) // 0%
    const sAmount = ceiling.mul(ten.pow(25)).mul(200).div(ONE) // 200%

    // console.log(`Supply junior order ${jAmount.toString()}`)
    // await erc20.mint(juniorInvestor.address, jAmount)
    // expect((await erc20.balanceOf(juniorInvestor.address)).toString()).to.equal(jAmount.toString())
    // await erc20.connect(juniorInvestor).approve(juniorTranche.address, jAmount)
    // expect((await erc20.allowance(juniorInvestor.address, juniorTranche.address)).toString()).to.equal(jAmount.toString())
    // await juniorOperator.connect(juniorInvestor).supplyOrder(jAmount)

    console.log(`Supply senior order ${sAmount.toString()}`)
    await erc20.mint(seniorInvestor.address, sAmount)
    expect((await erc20.balanceOf(seniorInvestor.address)).toString()).to.equal(sAmount.toString())
    await erc20.connect(seniorInvestor).approve(seniorTranche.address, sAmount)
    expect((await erc20.allowance(seniorInvestor.address, seniorTranche.address)).toString()).to.equal(sAmount.toString())
    let checkoutReceipts = []
    const orderTx = await seniorOperator.connect(seniorInvestor).supplyOrder(sAmount)
    const orderReceipt = await orderTx.wait()
    checkoutReceipts.push({
      title: 'supply order',
      receipt: orderReceipt
    })

    // add one day (minimum times)
    await timeFly(1)
    // expect((await coordinator.validate(0, 0 , sAmount, jAmount)).toNumber()).to.equal(0)
    // should care about these variables when init: minSeniorRatio_, maxSeniorRatio_, maxReserve_
    const closeTx = await coordinator.closeEpoch()
    const closeReceipt = await closeTx.wait()
    checkoutReceipts.push({
      title: 'close epoch1',
      receipt: closeReceipt
    })

    let seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)
    // should not start the challenge period
    if (await coordinator.submissionPeriod() == true) {
      expect((await coordinator.submissionResult()).toNumber()).to.equal(0)
    }

    // disburse tokens
    // console.log('Disburse junior investor')
    // await juniorOperator.connect(juniorInvestor)['disburse()']()
    console.log('Disburse senior investor')
    const disburseTx = await seniorOperator.connect(seniorInvestor)['disburse()']()
    const disburseReceipt = await disburseTx.wait()
    checkoutReceipts.push({
      title: 'disburse',
      receipt: disburseReceipt
    })

    let jrAmount = await juniorToken.balanceOf(juniorInvestor.address)
    let srAmount = await seniorToken.balanceOf(seniorInvestor.address)
    console.log(`Junior token amount: ${jrAmount.toString()}, Senior token amount: ${srAmount.toString()}`)

    // make sure there are investment
    // withdraw loan
    console.log('Borrow and withdraw loan')
    const lockTx = await shelf.connect(borrowerAccount).lock(loan)
    const lockReceipt = await lockTx.wait()
    checkoutReceipts.push({
      title: 'lock',
       receipt: lockReceipt
    })
    const borrowTx = await shelf.connect(borrowerAccount).borrow(loan, ceiling)
    const borrowReceipt = await borrowTx.wait()
    checkoutReceipts.push({
      title: 'borrow',
       receipt: borrowReceipt
    })
    const wTx = await shelf.connect(borrowerAccount).withdraw(loan, ceiling, borrowerAccount.address)
    const wReceipt = await wTx.wait()
    checkoutReceipts.push({
      title: 'withdraw',
       receipt: wReceipt
    })
    // check
    expect((await nftFeed.ceiling(loan)).toString()).to.equal('0')
    expect(await nft.ownerOf(tokenID)).to.equal(shelf.address)
    expect((await erc20.balanceOf(borrowerAccount.address)).toString()).to.equal(ceiling.toString())

    let ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)

    // repay
    // mint more money to borrower
    const bAmount = ten.mul(ten).mul(ether)
    await erc20.mint(borrowerAccount.address, bAmount)
    await erc20.connect(borrowerAccount).approve(shelf.address, bAmount)
    // add two days
    console.log("Add two days")
    await timeFly(2)
    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)
    // repay all the debt
    let debt = await pile.connect(borrowerAccount).debt(loan)
    while (debt.gt(BigNumber.from('0'))) {
      console.log(`Pay the debt ${debt.toString()}`)
      await shelf.connect(borrowerAccount).repay(loan, debt)
      debt = await pile.connect(borrowerAccount).debt(loan)
    }
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)
    // should call unlock if repay all the debt
    await shelf.connect(borrowerAccount).unlock(loan)
    await reserve.connect(borrowerAccount).balance()
    // check
    expect(await nft.connect(borrowerAccount).ownerOf(tokenID)).to.equal(borrowerAccount.address)
    expect((await pile.connect(borrowerAccount).debt(loan)).toString()).to.equal('0')
    expect((await erc20.connect(borrowerAccount).balanceOf(pile.address)).toString()).to.equal('0')

    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)

    // await coordinator.closeEpoch()
    // // should not start the challenge period
    // if (await coordinator.submissionPeriod() == true) {
    //   expect((await coordinator.submissionResult()).toNumber()).to.equal(0)
    // }

    // redeem
    console.log('Approve and redeem senior order')
    const approveTx = await seniorToken.connect(seniorInvestor).approve(seniorTranche.address, srAmount)
    const approveReceipt = await approveTx.wait()
    checkoutReceipts.push({
      title: 'approve token to redeem',
      receipt: approveReceipt
    })
    const redeemTx = await seniorOperator.connect(seniorInvestor).redeemOrder(srAmount)
    const redeemReceipt = await redeemTx.wait()
    checkoutReceipts.push({
      title: 'redeem order',
      receipt: redeemReceipt
    })
    // console.log('Approve and redeem junior order')
    // await juniorToken.connect(juniorInvestor).approve(juniorTranche.address, jrAmount)
    // await juniorOperator.connect(juniorInvestor).redeemOrder(jrAmount)

    jrAmount = await juniorToken.balanceOf(juniorInvestor.address)
    srAmount = await seniorToken.balanceOf(seniorInvestor.address)
    console.log(`Junior token amount: ${jrAmount.toString()}, Senior token amount: ${srAmount.toString()}`)

    const close2Tx = await coordinator.closeEpoch()
    const close2Receipt = await close2Tx.wait()
    checkoutReceipts.push({
      title: 'close epoch2',
      receipt: close2Receipt
    })
    // should not start the challenge period
    if (await coordinator.submissionPeriod() == true) {
      expect((await coordinator.submissionResult()).toNumber()).to.equal(0)
    }

    console.log(`Reserve balance: ${(await erc20.balanceOf(reserve.address)).toString()}, Senior tranche balance: ${(await erc20.balanceOf(seniorTranche.address)).toString()}`)

    console.log('Payout currency to admin')
    const payoutTx = await reserve.payout(await erc20.balanceOf(reserve.address))
    const payoutReceipt = await payoutTx.wait()
    checkoutReceipts.push({
      title: 'payout',
      receipt: payoutReceipt
    })
    console.log(`Reserve balance: ${(await erc20.balanceOf(reserve.address)).toString()}, Admin balance: ${(await erc20.balanceOf(signers[0].address)).toString()}`)

    console.log('====== Gas Used')
    checkoutReceipts.forEach((cr) => {
      console.log(`| ${cr.title}: ${cr.receipt.gasUsed.toString()}`)
    })
    console.log('======         ')

    // collect
    // await timeFly(200)
    // ns = await navs()
    // console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    // console.log('Seize loan')
    // await collector.seize(loan)
    // await collector['collect(uint256)'](loan)
    // ns = await navs()
    // console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
  }, 100000)
}, 200000)