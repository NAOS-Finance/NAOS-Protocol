const { BigNumber } = require("@ethersproject/bignumber")
const { expect } = require("chai")
const { ethers } = require("hardhat")
const { Contract } = require("ethers")

const timeFly = async (days) => {
  await ethers.provider.send('evm_increaseTime', [ Math.floor(days * 86400) ])
  return await ethers.provider.send('evm_mine', [])
}

const timeFlySeconds = async (seconds) => {
  await ethers.provider.send('evm_increaseTime', [ seconds ])
  return await ethers.provider.send('evm_mine', [])
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
    await root.relyContract(assessor.address, signer.address)

    // authorize first user to update investors
    await root.relyContract(juniorMemberlist.address, signer.address)
    await root.relyContract(seniorMemberlist.address, signer.address)
    // authorize first user to collector
    await collector.relyCollector(signer.address)

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

  let checkoutReceipts = []
  let signers = []
  const ten = BigNumber.from('10')
  const ether = ten.pow(18)
  const ONE = ten.pow(27)
  const registerInvestors = async (memberlist, users, validUntil) => {
    let count = 0
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      if (user.getAddress == undefined) {
        continue
      }
      const userAddr = await user.getAddress()
      await memberlist.updateMember(userAddr, validUntil)
      expect((await memberlist.members(userAddr)).toString()).equal(validUntil.toString())
      count += 1
    }
    return count
  }

  const supplyOrder = async (erc20, tranche, operator, amount, users) => {
    const iAmount = amount.div(users.length)
    console.log(`Supply senior orders ${amount.toString()} / ${iAmount.toString()} each senior investor`)
    let gasCalculated = false
    let count = 0
    
    for (let i = 0; i < users.length; i++) {
      let user = users[i]
      if (user.getAddress == undefined) {
        continue
      }
      await erc20.mint(user.address, iAmount)
      expect((await erc20.balanceOf(user.address)).toString()).to.equal(iAmount.toString())
      await erc20.connect(user).approve(tranche.address, iAmount)
      expect((await erc20.allowance(user.address, tranche.address)).toString()).to.equal(iAmount.toString())
      const orderTx = await operator.connect(user).supplyOrder(iAmount)
      if (!gasCalculated) {
        gasCalculated = true
        const orderReceipt = await orderTx.wait()
        checkoutReceipts.push({
          title: 'supply order',
          receipt: orderReceipt
        })
      }
      count += 1
    }
    return count
  }

  const disburseToken = async (operator, users) => {
    let gasCalculated = false
    let count = 0
    
    for (let i = 0; i < users.length; i++) {
      let user = users[i]
      if (user.getAddress == undefined) {
        continue
      }
      const disburseTx = await operator.connect(user)['disburse()']()
      if (!gasCalculated) {
        gasCalculated = true
        const disburseReceipt = await disburseTx.wait()
        checkoutReceipts.push({
          title: 'disburse',
          receipt: disburseReceipt
        })
      }
      count += 1
    }
    return count
  }

  const approveAndRedeem = async (token, tranche, operator, users, amounts) => {
    if (amounts.length != users.length) {
      return 0
    }
    let gasCalculated = false
    let count = 0
    
    for (let i = 0; i < users.length; i++) {
      let user = users[i]
      if (user.getAddress == undefined) {
        continue
      }
      let amount = amounts[i]
      const approveTx = await token.connect(user).approve(tranche.address, amount)
      const redeemTx = await operator.connect(user).redeemOrder(amount)
      
      if (!gasCalculated) {
        gasCalculated = true
        const approveReceipt = await approveTx.wait()
        checkoutReceipts.push({
          title: 'approve token to redeem',
          receipt: approveReceipt
        })
        const redeemReceipt = await redeemTx.wait()
        checkoutReceipts.push({
          title: 'redeem order',
          receipt: redeemReceipt
        })
      }
      count += 1
    }
    return count
  }

  beforeEach(async () => {
    checkoutReceipts = []
    signers = await ethers.getSigners()
  })

  it("should setup loan / borrow and repay all debt", async function () {
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
    const borrowerAccount = signers[1]
    const seniorInvestors = [signers[3], signers[4]]
    const validUntil = (new Date).getTime() + 30 * 86400 * 1000
    
    const setupLoan = async () => {
      const nft = await setupNFT()
      // 10 ether
      const nftPrice = ten.mul(ether)
      const riskGroup = 2
      // const abiCoder = new ethers.utils.AbiCoder()
      // issue loan
      await nft.issue(borrowerAccount.address)
      const tokenID = (await nft.count()).sub(1)
      console.log('NFT ID:', tokenID.toString())
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
      // await shelf.connect(borrowerAccount).issue(nft.address, tokenID)
      await shelf.connect(borrowerAccount).issue(nft.address, tokenID)
      const ceiling = await nftFeed.ceiling(loan)
      expect(ceiling.toString()).equal(nftPrice.div(2).toString())
      await nft.connect(borrowerAccount).setApprovalForAll(shelf.address, true)
      console.log('NFT ID:', (await nft.count()).sub(1).toString())
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

    console.log('Register investors')
    // await registerInvestors(juniorMemberlist, juniorInvestors, validUntil)
    await registerInvestors(seniorMemberlist, seniorInvestors, validUntil)

    // const jAmount = ceiling.mul(ten.pow(25)).mul(82).div(ONE) // 82%
    // const sAmount = ceiling.mul(ten.pow(25)).mul(18).div(ONE) // 18%

    // const jAmount = ceiling.mul(ten.pow(25)).mul(0).div(ONE) // 0%
    const sAmount = ceiling.mul(ten.pow(25)).mul(200).div(ONE) // 200%

    // await supplyOrder(erc20, juniorTranche, juniorOperator, jAmount, juniorInvestors)
    await supplyOrder(erc20, seniorTranche, seniorOperator, sAmount, seniorInvestors)

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
    console.log('Disburse senior investors')

    // await disburseToken(juniorOperator, juniorInvestors)
    await disburseToken(seniorOperator, seniorInvestors)

    const tokenAmount = async (token, users) => {
      let tokens = []
      
      for (let i = 0; i < users.length; i++) {
        let user = users[i]
        if (user.getAddress == undefined) {
          continue
        }
        const balance = await token.balanceOf(user.address)
        tokens.push(balance)
      }
      return tokens
    }

    // let jrAmounts = await tokenAmount(juniorToken, juniorInvestors)
    let srAmounts = await tokenAmount(seniorToken, seniorInvestors)
    console.log(`Senior token amount: ${srAmounts.map(sr => sr.toString())}`)

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

    // await approveAndRedeem(juniorToken, juniorTranche, juniorOperator, juniorInvestors, jrAmounts)
    await approveAndRedeem(seniorToken, seniorTranche, seniorOperator, seniorInvestors, srAmounts)

    srAmounts = await tokenAmount(seniorToken, seniorInvestors)
    console.log(`Senior token amount: ${srAmounts.map(sr => sr.toString())}`)

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

    // withdraw investment
    // await disburseToken(juniorOperator, juniorInvestors)
    await disburseToken(seniorOperator, seniorInvestors)

    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)
    console.log('Payout currency to admin')
    try {
      const failedPayoutTx = await reserve.payout(await erc20.balanceOf(reserve.address))
    } catch (err) {
      expect(err.message).eq('VM Exception while processing transaction: revert')
    }
    const payoutTx = await assessor.withdrawFee(await erc20.balanceOf(reserve.address))
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

  it("should setup loan / borrow and repay partial debt", async function () {
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
    const borrowerAccount = signers[1]
    const seniorInvestors = [signers[2], signers[3], signers[4], signers[5]]
    const validUntil = (new Date).getTime() + 30 * 86400 * 1000
    
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

    console.log('Register investors')
    // await registerInvestors(juniorMemberlist, juniorInvestors, validUntil)
    await registerInvestors(seniorMemberlist, seniorInvestors, validUntil)

    // const jAmount = ceiling.mul(ten.pow(25)).mul(82).div(ONE) // 82%
    // const sAmount = ceiling.mul(ten.pow(25)).mul(18).div(ONE) // 18%

    // const jAmount = ceiling.mul(ten.pow(25)).mul(0).div(ONE) // 0%
    const sAmount = ceiling.mul(ten.pow(25)).mul(200).div(ONE) // 200%

    // await supplyOrder(erc20, juniorTranche, juniorOperator, jAmount, juniorInvestors)
    await supplyOrder(erc20, seniorTranche, seniorOperator, sAmount, seniorInvestors)

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
    console.log('Disburse senior investors')

    // await disburseToken(juniorOperator, juniorInvestors)
    await disburseToken(seniorOperator, seniorInvestors)

    const tokenAmount = async (token, users) => {
      let tokens = []
      
      for (let i = 0; i < users.length; i++) {
        let user = users[i]
        if (user.getAddress == undefined) {
          continue
        }
        const balance = await token.balanceOf(user.address)
        tokens.push(balance)
      }
      return tokens
    }

    // let jrAmounts = await tokenAmount(juniorToken, juniorInvestors)
    let srAmounts = await tokenAmount(seniorToken, seniorInvestors)
    console.log(`Senior token amount: ${srAmounts.map(sr => sr.toString())}`)

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

    // repay partial the debt
    let debt = await pile.connect(borrowerAccount).debt(loan)
    debt = debt.div(2)
    console.log(`Pay the debt ${debt.toString()}`)
    await shelf.connect(borrowerAccount).repay(loan, debt)
    debt = await pile.connect(borrowerAccount).debt(loan)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)

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

    // await approveAndRedeem(juniorToken, juniorTranche, juniorOperator, juniorInvestors, jrAmounts)
    await approveAndRedeem(seniorToken, seniorTranche, seniorOperator, seniorInvestors, srAmounts)

    srAmounts = await tokenAmount(seniorToken, seniorInvestors)
    console.log(`Senior token amount: ${srAmounts.map(sr => sr.toString())}`)

    const close2Tx = await coordinator.closeEpoch()
    const close2Receipt = await close2Tx.wait()
    checkoutReceipts.push({
      title: 'close epoch2',
      receipt: close2Receipt
    })
    // should not start the challenge period
    if (await coordinator.submissionPeriod() == true) {
      // submit solution
      let solution = await coordinator.callStatic.submitSolution(debt, 0, 0, 0)
      expect((solution).toNumber()).to.equal(0)
      await coordinator.submitSolution(debt, 0, 0, 0)
      // should fly minChallengePeriodEnd
      const timeDiff = (await coordinator.minChallengePeriodEnd()).sub(Math.floor((new Date()).getTime() / 1000))
      console.log(timeDiff.toString())
      await timeFlySeconds(timeDiff.toNumber())
      console.log('Execute submition solution')
      await coordinator.executeEpoch()
    }

    console.log(`Reserve balance: ${(await erc20.balanceOf(reserve.address)).toString()}, Senior tranche balance: ${(await erc20.balanceOf(seniorTranche.address)).toString()}`)

    // withdraw investment
    // await disburseToken(juniorOperator, juniorInvestors)
    await disburseToken(seniorOperator, seniorInvestors)

    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)
    srAmounts = await tokenAmount(seniorToken, seniorInvestors)
    console.log(`Senior token amount: ${srAmounts.map(sr => sr.toString())}`)
    const erc20SrAmounts = await tokenAmount(erc20, seniorInvestors)
    console.log(`Senior erc20 amount: ${erc20SrAmounts.map(sr => sr.toString())}`)
    // console.log('Payout currency to admin')
    // try {
    //   const failedPayoutTx = await reserve.payout(await erc20.balanceOf(reserve.address))
    // } catch (err) {
    //   expect(err.message).eq('VM Exception while processing transaction: revert')
    // }
    // const payoutTx = await assessor.withdrawFee(await erc20.balanceOf(reserve.address))
    // const payoutReceipt = await payoutTx.wait()
    // checkoutReceipts.push({
    //   title: 'payout',
    //   receipt: payoutReceipt
    // })
    // console.log(`Reserve balance: ${(await erc20.balanceOf(reserve.address)).toString()}, Admin balance: ${(await erc20.balanceOf(signers[0].address)).toString()}`)

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

  it("should setup loan / borrow and collect debt", async function () {
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
    const borrowerAccount = signers[1]
    const seniorInvestors = [signers[2], signers[3], signers[4], signers[5]]
    const validUntil = (new Date).getTime() + 30 * 86400 * 1000
    
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
      const threshold = await nftFeed.threshold(loan)
      return {
        nft,
        tokenID,
        maturityDate,
        tokenKey,
        loan,
        ceiling,
        threshold
      }
    }
    const {
      nft,
      tokenID,
      // maturityDate,
      // tokenKey,
      loan,
      ceiling,
      threshold
    } = await setupLoan()
    
    console.log('Invest the debt')

    console.log('Register investors')
    // await registerInvestors(juniorMemberlist, juniorInvestors, validUntil)
    await registerInvestors(seniorMemberlist, seniorInvestors, validUntil)

    // const jAmount = ceiling.mul(ten.pow(25)).mul(82).div(ONE) // 82%
    // const sAmount = ceiling.mul(ten.pow(25)).mul(18).div(ONE) // 18%

    // const jAmount = ceiling.mul(ten.pow(25)).mul(0).div(ONE) // 0%
    const sAmount = ceiling.mul(ten.pow(25)).mul(200).div(ONE) // 200%

    // await supplyOrder(erc20, juniorTranche, juniorOperator, jAmount, juniorInvestors)
    await supplyOrder(erc20, seniorTranche, seniorOperator, sAmount, seniorInvestors)

    // add one day (minimum times)
    await timeFly(365)
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
    console.log('Disburse senior investors')

    // await disburseToken(juniorOperator, juniorInvestors)
    await disburseToken(seniorOperator, seniorInvestors)

    const tokenAmount = async (token, users) => {
      let tokens = []
      
      for (let i = 0; i < users.length; i++) {
        let user = users[i]
        if (user.getAddress == undefined) {
          continue
        }
        const balance = await token.balanceOf(user.address)
        tokens.push(balance)
      }
      return tokens
    }

    // let jrAmounts = await tokenAmount(juniorToken, juniorInvestors)
    let srAmounts = await tokenAmount(seniorToken, seniorInvestors)
    console.log(`Senior token amount: ${srAmounts.map(sr => sr.toString())}`)

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

    // add one days
    console.log("Add 1 days")
    await timeFly(1)

    await coordinator.closeEpoch()
    // should not start the challenge period
    if (await coordinator.submissionPeriod() == true) {
      expect((await coordinator.submissionResult()).toNumber()).to.equal(0)
    }

    // collect
    await timeFly(20)
    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)
    let debt = await pile.connect(borrowerAccount).debt(loan)
    expect(debt.gt(threshold)).to.be.eq(true)
    const signerAddress = signer.getAddress()
    const collectAmount = ceiling
    await erc20.mint(signerAddress, collectAmount)
    expect((await erc20.balanceOf(signerAddress)).toString()).to.equal(collectAmount.toString())
    await erc20.approve(shelf.address, collectAmount)
    const fiTx = await collector.file('0x' + Buffer.from("loan").toString('hex').padEnd(64, '0'), loan, signerAddress, collectAmount)
    const fiReceipt = await fiTx.wait()
    checkoutReceipts.push({
      title: 'file',
      receipt: fiReceipt
    })
    console.log('Seize loan')
    const seTx = await collector.seize(loan)
    const seReceipt = await seTx.wait()
    checkoutReceipts.push({
      title: 'seize',
      receipt: seReceipt
    })
    console.log('Collect loan')
    const coTx = await collector['collect(uint256)'](loan)
    const coReceipt = await coTx.wait()
    checkoutReceipts.push({
      title: 'collect',
      receipt: coReceipt
    })

    await shelf.connect(borrowerAccount).close(loan)

    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)

    await coordinator.closeEpoch()
    // should not start the challenge period
    if (await coordinator.submissionPeriod() == true) {
      expect((await coordinator.submissionResult()).toNumber()).to.equal(0)
    }

    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)

    console.log('====== Gas Used')
    checkoutReceipts.forEach((cr) => {
      console.log(`| ${cr.title}: ${cr.receipt.gasUsed.toString()}`)
    })
    console.log('======         ')
  }, 100000)

  it("should setup loan / borrow without closeEpoch", async function () {
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
    const borrowerAccount = signers[1]
    const seniorInvestors = [signers[2], signers[3], signers[4], signers[5]]
    const validUntil = (new Date).getTime() + 30 * 86400 * 1000
    
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
      const threshold = await nftFeed.threshold(loan)
      return {
        nft,
        tokenID,
        maturityDate,
        tokenKey,
        loan,
        ceiling,
        threshold
      }
    }

    console.log('Invest the debt')

    console.log('Register investors')
    // await registerInvestors(juniorMemberlist, juniorInvestors, validUntil)
    await registerInvestors(seniorMemberlist, seniorInvestors, validUntil)

    // const jAmount = ceiling.mul(ten.pow(25)).mul(82).div(ONE) // 82%
    // const sAmount = ceiling.mul(ten.pow(25)).mul(18).div(ONE) // 18%

    // const jAmount = ceiling.mul(ten.pow(25)).mul(0).div(ONE) // 0%
    const sAmount = ten.mul(ether)

    // await supplyOrder(erc20, juniorTranche, juniorOperator, jAmount, juniorInvestors)
    await supplyOrder(erc20, seniorTranche, seniorOperator, sAmount, seniorInvestors)

    // add one day (minimum times)
    await timeFly(365)
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
    console.log('Disburse senior investors')

    // await disburseToken(juniorOperator, juniorInvestors)
    await disburseToken(seniorOperator, seniorInvestors)

    const tokenAmount = async (token, users) => {
      let tokens = []
      
      for (let i = 0; i < users.length; i++) {
        let user = users[i]
        if (user.getAddress == undefined) {
          continue
        }
        const balance = await token.balanceOf(user.address)
        tokens.push(balance)
      }
      return tokens
    }

    // let jrAmounts = await tokenAmount(juniorToken, juniorInvestors)
    let srAmounts = await tokenAmount(seniorToken, seniorInvestors)
    console.log(`Senior token amount: ${srAmounts.map(sr => sr.toString())}`)

    const {
      nft,
      tokenID,
      // maturityDate,
      // tokenKey,
      loan,
      ceiling,
      threshold
    } = await setupLoan()

    // make sure there are investment
    // withdraw loan
    console.log('Borrow and withdraw loan')
    const lockTx = await shelf.connect(borrowerAccount).lock(loan)
    const lockReceipt = await lockTx.wait()
    checkoutReceipts.push({
      title: 'lock',
       receipt: lockReceipt
    })
    console.log('Borrow: ', ceiling.toString())
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

    // add one days
    console.log("Add 1 days")
    await timeFly(1)

    await coordinator.closeEpoch()
    // should not start the challenge period
    if (await coordinator.submissionPeriod() == true) {
      expect((await coordinator.submissionResult()).toNumber()).to.equal(0)
    }

    // collect
    await timeFly(20)
    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)
    let debt = await pile.connect(borrowerAccount).debt(loan)
    expect(debt.gt(threshold)).to.be.eq(true)
    const signerAddress = signer.getAddress()
    const collectAmount = ceiling
    await erc20.mint(signerAddress, collectAmount)
    expect((await erc20.balanceOf(signerAddress)).toString()).to.equal(collectAmount.toString())
    await erc20.approve(shelf.address, collectAmount)
    const fiTx = await collector.file('0x' + Buffer.from("loan").toString('hex').padEnd(64, '0'), loan, signerAddress, collectAmount)
    const fiReceipt = await fiTx.wait()
    checkoutReceipts.push({
      title: 'file',
      receipt: fiReceipt
    })
    console.log('Seize loan')
    const seTx = await collector.seize(loan)
    const seReceipt = await seTx.wait()
    checkoutReceipts.push({
      title: 'seize',
      receipt: seReceipt
    })
    console.log('Collect loan')
    const coTx = await collector['collect(uint256)'](loan)
    const coReceipt = await coTx.wait()
    checkoutReceipts.push({
      title: 'collect',
      receipt: coReceipt
    })

    await shelf.connect(borrowerAccount).close(loan)

    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)

    await coordinator.closeEpoch()
    // should not start the challenge period
    if (await coordinator.submissionPeriod() == true) {
      expect((await coordinator.submissionResult()).toNumber()).to.equal(0)
    }

    ns = await navs()
    console.log(`NAV: ${ns.nav.toString()}, Reserve: ${(await coordinator.epochReserve()).toString()}, Senior token price: ${ns.seniorTokenPrice.toString()}, Junior token price: ${ns.juniorTokenPrice.toString()}`)
    seniorValue = await seniorValues()
    console.log(`Senior value debt: ${seniorValue.debt.toString()}, balance: ${seniorValue.balance.toString()}`)

    console.log('====== Gas Used')
    checkoutReceipts.forEach((cr) => {
      console.log(`| ${cr.title}: ${cr.receipt.gasUsed.toString()}`)
    })
    console.log('======         ')
  }, 100000)
})