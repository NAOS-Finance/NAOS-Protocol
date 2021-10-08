const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils } = require('ethers');
const { parseEther } = utils;
const { ONE, MAXIMUM_U256, ZERO_ADDRESS, zeroPadEnd, timeFly, mineBlocks } = require("./utils/utils");
const { parseUnits } = require("@ethersproject/units");

const reservePadded = zeroPadEnd(ethers.utils.toUtf8Bytes("reserve"), 32);
const epochTickerPadded = zeroPadEnd(ethers.utils.toUtf8Bytes("epochTicker"), 32);
const tokenPadded = zeroPadEnd(ethers.utils.toUtf8Bytes("token"), 32);
const memberlistPadded = zeroPadEnd(ethers.utils.toUtf8Bytes("memberlist"), 32);
const balancePadded = zeroPadEnd(ethers.utils.toUtf8Bytes("balance"), 32);

let ERC20MockFactory, SimpleToken;
let ReserveMock, EpochTickerMock, OperatorMock, Operator, Tranche, RestrictedToken, Memberlist;
let GalaxyStakingPools, BoostPoolFactory;

const closeAndUpdateEpoch = async (tranche, epochTicker, tokenPrice) => {
  const res = await tranche.callStatic.closeEpoch();
  await tranche.closeEpoch();
  const epochID = await epochTicker.currentEpoch();
  await epochTicker.incCurrentEpoch(1);
  await tranche.epochUpdate(epochID, ONE, ONE, tokenPrice, res.totalSupplyCurrency_, res.totalRedeemToken_.mul(tokenPrice).div(ONE));
  await epochTicker.incLastEpochExecuted(1);
}

describe("Galaxy Staking Pools", () => {
  before(async () => {
    const signer = await ethers.getSigner();
    ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    SimpleToken = await ethers.getContractFactory("SimpleToken");

    ReserveMock = await ethers.getContractFactory("ReserveMock");
    EpochTickerMock = await ethers.getContractFactory("EpochTickerMock");
    OperatorMock = await ethers.getContractFactory("OperatorMock");
    Operator = await ethers.getContractFactory("Operator");
    Tranche = await ethers.getContractFactory("Tranche");
    RestrictedToken = await ethers.getContractFactory("RestrictedToken");
    Memberlist = await ethers.getContractFactory("Memberlist");
    GalaxyStakingPools = await ethers.getContractFactory("GalaxyStakingPools");
    BoostPoolFactory = await ethers.getContractFactory("BoostPool");
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
  });

  describe("Initialize", () => {
    let deployer;
    let governance;
    let boostPool, galaxyStakingPools;

    beforeEach(async () => {
      [deployer, governance, mock, ...signers] = signers;
      currency = await ERC20MockFactory.deploy(
        "Mock DAI",
        "DAI",
        18
      );

      token = await ERC20MockFactory.deploy(
        "Mock NAOS",
        "NAOS",
        18
      );

      alpha = await ERC20MockFactory.deploy(
        "Alpha Token",
        "Alpha",
        18
      );

      boostPool = await BoostPoolFactory.deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
      galaxyStakingPools = await GalaxyStakingPools.deploy();
      await galaxyStakingPools.initialize(
        currency.address,
        token.address,
        alpha.address,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        mock.getAddress(),
        ZERO_ADDRESS,
        ZERO_ADDRESS
      );
    });

    it("check the parameters", async () => {
      expect(await galaxyStakingPools.currency()).equal(currency.address);
      expect(await galaxyStakingPools.token()).equal(token.address);
      expect(await galaxyStakingPools.alpha()).equal(alpha.address);
      expect(await galaxyStakingPools.epochUpdated()).equal(true);
    })
  });

  describe("set parameters", () => {
    let deployer;
    let governance;
    let pendingGovernance;
    let galaxyStakingPools;

    beforeEach(async () => {
      [deployer, governance, pendingGovernance, mock, ...signers] = signers;
      currency = await ERC20MockFactory.deploy(
        "Mock DAI",
        "DAI",
        18
      );

      token = await ERC20MockFactory.deploy(
        "Mock NAOS",
        "NAOS",
        18
      );
      alpha = await ERC20MockFactory.deploy(
        "Alpha Token",
        "Alpha",
        18
      );
      boostPool = await BoostPoolFactory.deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
      galaxyStakingPools = await GalaxyStakingPools.deploy();
      await galaxyStakingPools.initialize(
        currency.address,
        token.address,
        alpha.address,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        mock.getAddress(),
        ZERO_ADDRESS,
        governance.getAddress()
      );
    });

    context("set governance", async () => {
      it("it reverts if the sender is not governance", async () => {
        await expect(
          galaxyStakingPools.connect(deployer).setPendingGovernance(
            pendingGovernance.getAddress()
          )
        ).to.be.revertedWith("GalaxyStakingPools: !governance");
      });

      context("when sender is current governance", () => {
        beforeEach(() => {
          galaxyStakingPools = galaxyStakingPools.connect(governance);
        });

        it("it reverts if pending governance is zero address", async () => {
          await expect(
            galaxyStakingPools.setPendingGovernance(
              ZERO_ADDRESS
            )
          ).to.be.revertedWith("GalaxyStakingPools: governance address cannot be 0x0.");
        });

        it("it reverts if the accepter is not the pending governance", async () => {
          await galaxyStakingPools.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          await expect(galaxyStakingPools.connect(deployer).acceptGovernance()
          ).to.be.revertedWith("GalaxyStakingPools: !pendingGovernance");
        });

        it("it changes governance successfully", async () => {
          await galaxyStakingPools.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          await galaxyStakingPools.connect(pendingGovernance).acceptGovernance();
          expect(await galaxyStakingPools.governance()).equal(await pendingGovernance.getAddress());
        });

        it("it emits GovernanceUpdated event", async () => {
          await galaxyStakingPools.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          expect(galaxyStakingPools.connect(pendingGovernance).acceptGovernance())
            .emit(galaxyStakingPools, "GovernanceUpdated")
            .withArgs(await pendingGovernance.getAddress());
        });
      });
    });

    context("set Admin", () => {
      it("it reverts if the sender is not the governance", async () => {
        await expect(
          galaxyStakingPools.connect(deployer).setAdmin(
            pendingGovernance.getAddress(),
            true
          )
        ).to.be.revertedWith("GalaxyStakingPools: !governance");
      });

      it("it sets admin successfully", async () => {
        await galaxyStakingPools.connect(governance).setAdmin(
          pendingGovernance.getAddress(),
          true
        );
        expect(await galaxyStakingPools.admins(await pendingGovernance.getAddress())).equal(true);
      });
    });

    context("set Whitelist", () => {
      it("it reverts if the sender is not the admin", async () => {
        await expect(
          galaxyStakingPools.connect(deployer).setWhitelist(
            pendingGovernance.getAddress(),
            true
          )
        ).to.be.revertedWith("GalaxyStakingPools: !admin");
      });

      it("it sets admin successfully", async () => {
        await galaxyStakingPools.connect(governance).setAdmin(
          pendingGovernance.getAddress(),
          true
        );
        expect(await galaxyStakingPools.admins(await pendingGovernance.getAddress())).equal(true);
      });
    });

    context("create pool", () => {
      beforeEach(async () => {
        await galaxyStakingPools.connect(governance).createPool(300);
        await galaxyStakingPools.connect(governance).createPool(600);
      })

      context("set RewardRate", () => {
        let rewardRate = 100;

        it("it reverts if the sender is not governance", async () => {
          await expect(
            galaxyStakingPools.connect(deployer).setRewardRate(rewardRate)
          ).to.be.revertedWith("GalaxyStakingPools: !governance");
        });

        context("when sender is current governance", () => {
          beforeEach(() => {
            galaxyStakingPools = galaxyStakingPools.connect(governance);
          });

          it("it changes reward rate successfully", async () => {
            await galaxyStakingPools.setRewardRate(
              rewardRate
            );
            expect(await galaxyStakingPools.rewardRate()).equal(rewardRate);
          });

          it("it emits RewardRateUpdated event", async () => {
            expect(galaxyStakingPools.setRewardRate(rewardRate))
              .emit(galaxyStakingPools, "RewardRateUpdated")
              .withArgs(rewardRate);
          });
        });
      });

      context("set RewardWeights", () => {
        let rewardRate = 100;
        let rewardWeights = [1, 4];

        it("it reverts if the sender is not governance", async () => {
          await expect(
            galaxyStakingPools.connect(deployer).setRewardWeights(rewardWeights)
          ).to.be.revertedWith("GalaxyStakingPools: !governance");
        });

        context("when sender is current governance", () => {
          beforeEach(async () => {
            galaxyStakingPools = galaxyStakingPools.connect(governance);
            await galaxyStakingPools.setRewardRate(rewardRate);
          });

          it("it reverts if input weighs lenght mismatch", async () => {
            await expect(
              galaxyStakingPools.setRewardWeights([1])
            ).to.be.revertedWith("GalaxyStakingPools: weights length mismatch");
          });

          it("it changes reward weights successfully", async () => {
            await galaxyStakingPools.setRewardWeights(
              rewardWeights
            );
            let totalWeights = rewardWeights[0] + rewardWeights[1];
            expect(await galaxyStakingPools.getPoolRewardWeight(0)).equal(rewardWeights[0]);
            expect(await galaxyStakingPools.getPoolRewardWeight(1)).equal(rewardWeights[1]);
            expect(await galaxyStakingPools.getPoolRewardRate(0)).equal(rewardRate * rewardWeights[0] / totalWeights);
            expect(await galaxyStakingPools.getPoolRewardRate(1)).equal(rewardRate * rewardWeights[1] / totalWeights);
          });
        });
      });

      context("set DepositedCeiling", () => {
        let ceiling = 100;
        it("it reverts if the sender is not governance", async () => {
          await expect(
            galaxyStakingPools.connect(deployer).setDepositedCeiling(0, ceiling)
          ).to.be.revertedWith("GalaxyStakingPools: !governance");
        });

        context("when sender is current governance", () => {
          beforeEach(async () => {
            galaxyStakingPools = galaxyStakingPools.connect(governance);
          });

          it("it changes deposited ceiling successfully", async () => {
            await galaxyStakingPools.setDepositedCeiling(0, ceiling);
            expect(await galaxyStakingPools.getPoolCeiling(0)).equal(ceiling);
          });

          it("it emits DepositedCeilingUpdated event", async () => {
            expect(galaxyStakingPools.setDepositedCeiling(0, ceiling))
              .emit(galaxyStakingPools, "DepositedCeilingUpdated")
              .withArgs(0, ceiling);
          });
        });
      });
    })
  });

  describe("deposit tokens", () => {
    let governance;
    let Alice, Bob;
    let operatorMock, galaxyStakingPools;
    let mintAmount = parseEther("10000");
    let AliceDepositedAmount = parseEther("1000");
    let BobDepositedAmount = parseEther("3000");
    let pool0ExpiredTime = 300;
    let pool1ExpiredTime = 600;
    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;
      currency = await ERC20MockFactory.deploy(
        "Mock DAI",
        "DAI",
        18
      );
      token = await ERC20MockFactory.deploy(
        "Mock NAOS",
        "NAOS",
        18
      );
      alpha = await ERC20MockFactory.deploy(
        "Alpha Token",
        "Alpha",
        18
      );
      boostPool = await BoostPoolFactory.deploy(
        token.address,
        token.address,
        governance.getAddress()
      );

      epochTickerMock = await EpochTickerMock.deploy();
      operatorMock = await OperatorMock.deploy(currency.address, alpha.address);

      galaxyStakingPools = await GalaxyStakingPools.deploy();
      await galaxyStakingPools.initialize(
        currency.address,
        token.address,
        alpha.address,
        boostPool.address,
        epochTickerMock.address,
        operatorMock.address,
        operatorMock.address,
        governance.getAddress()
      );
      await galaxyStakingPools.connect(governance).createPool(pool0ExpiredTime);
      await galaxyStakingPools.connect(governance).createPool(pool1ExpiredTime);
      await galaxyStakingPools.connect(governance).setRewardWeights([1, 4]);

      await currency.mint(Alice.getAddress(), mintAmount);
      await currency.mint(Bob.getAddress(), mintAmount);
      await currency.connect(Alice).approve(galaxyStakingPools.address, MAXIMUM_U256);
      await currency.connect(Bob).approve(galaxyStakingPools.address, MAXIMUM_U256);
    });

    it("it reverts if user is not whiteListed", async () => {
      expect(galaxyStakingPools.connect(Alice).deposit(0, AliceDepositedAmount)).revertedWith("GalaxyStakingPools: !whitelist");
    })

    context("Set user into whitelist", () => {
      beforeEach(async () => {
        await galaxyStakingPools.connect(governance).setAdmin(await governance.getAddress(), true);
        await galaxyStakingPools.connect(governance).setWhitelist(await Alice.getAddress(), true);
        await galaxyStakingPools.connect(governance).setWhitelist(await Bob.getAddress(), true);
      });

      it("it reverts if epoch is not updated", async () => {
        await expect(galaxyStakingPools.connect(Alice).deposit(0, AliceDepositedAmount)
        ).to.be.revertedWith("Wait for epoch updated");
      });

      context("Update epoch", async () => {
        beforeEach(async () => {
          await galaxyStakingPools.updateEpoch();
        });

        it("it reverts if deposited amount equals to 0", async () => {
          await expect(galaxyStakingPools.connect(Alice).deposit(0, 0)
          ).to.be.revertedWith("supply amount should be greater than 0");
        });

        it("it reverts if pood Id is invalid", async () => {
          await expect(galaxyStakingPools.connect(Alice).deposit(2, AliceDepositedAmount)
          ).to.be.revertedWith("invalid pool id");
        });

        it("it reverts if deposited amount exceeds ceiling", async () => {
          await expect(galaxyStakingPools.connect(Alice).deposit(0, AliceDepositedAmount)
          ).revertedWith("exceed deposited ceiling");
        });

        context("Set pool's deposited ceiling", () => {
          let AliceBlock, BobBlock;
          beforeEach(async () => {
            await galaxyStakingPools.connect(governance).setDepositedCeiling(0, mintAmount.mul(2));
            await galaxyStakingPools.connect(governance).setDepositedCeiling(1, mintAmount.mul(2));
            await galaxyStakingPools.connect(Alice).deposit(0, AliceDepositedAmount);
            let blockNumber = await ethers.provider.getBlockNumber();
            AliceBlock = await ethers.provider.getBlock(blockNumber);
            await galaxyStakingPools.connect(Bob).deposit(1, BobDepositedAmount);
            blockNumber = await ethers.provider.getBlockNumber();
            BobBlock = await ethers.provider.getBlock(blockNumber);
          });

          it("it increases total deposited amount and weight", async () => {
            expect(await galaxyStakingPools.getPoolTotalDeposited(0)).equal(AliceDepositedAmount);
            expect(await galaxyStakingPools.getPoolTotalDepositedWeight(0)).equal(AliceDepositedAmount.mul(4).div(10));
            expect(await galaxyStakingPools.getPoolTotalDeposited(1)).equal(BobDepositedAmount);
            expect(await galaxyStakingPools.getPoolTotalDepositedWeight(1)).equal(BobDepositedAmount.mul(4).div(10));
          });

          it("it increases user's deposited amount and weight", async () => {
            expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(AliceDepositedAmount);
            expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 0)).equal(AliceDepositedAmount.mul(4).div(10));
            expect(await galaxyStakingPools.getStakeTotalDeposited(await Bob.getAddress(), 1)).equal(BobDepositedAmount);
            expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 1)).equal(BobDepositedAmount.mul(4).div(10));
          });

          it("it increases totalSupplyCurrency", async () => {
            expect(await galaxyStakingPools.totalSupplyCurrency()).equal(AliceDepositedAmount.add(BobDepositedAmount));
          })

          it("it generates user's deposited orders", async () => {
            let userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(0);
            expect(userDepositedOrder.owner).equal(await Alice.getAddress());
            expect(userDepositedOrder.poolId).equal(0);
            expect(userDepositedOrder.amount).equal(AliceDepositedAmount);
            expect(userDepositedOrder.expireTime).equal(AliceBlock.timestamp + pool0ExpiredTime);
            expect(userDepositedOrder.redeemToken).equal(0);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(0);
            expect(userDepositedOrder.epoch).equal(1);
            expect(userDepositedOrder.isRedeem).equal(false);
            userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(1);
            expect(userDepositedOrder.owner).equal(await Bob.getAddress());
            expect(userDepositedOrder.poolId).equal(1);
            expect(userDepositedOrder.amount).equal(BobDepositedAmount);
            expect(userDepositedOrder.expireTime).equal(BobBlock.timestamp + pool1ExpiredTime);
            expect(userDepositedOrder.redeemToken).equal(0);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(0);
            expect(userDepositedOrder.epoch).equal(1);
            expect(userDepositedOrder.isRedeem).equal(false);
          });

          it("it reduces user's token", async () => {
            expect(await currency.balanceOf(await Alice.getAddress())).equal(mintAmount.sub(AliceDepositedAmount));
            expect(await currency.balanceOf(await Bob.getAddress())).equal(mintAmount.sub(BobDepositedAmount));
            expect(await currency.balanceOf(operatorMock.address)).equal(AliceDepositedAmount.add(BobDepositedAmount));
          });

          context("user has second deposited order in different pools", () => {
            beforeEach(async () => {
              await galaxyStakingPools.connect(Alice).deposit(1, BobDepositedAmount);
              let blockNumber = await ethers.provider.getBlockNumber();
              AliceBlock = await ethers.provider.getBlock(blockNumber);
              await galaxyStakingPools.connect(Bob).deposit(0, AliceDepositedAmount);
              blockNumber = await ethers.provider.getBlockNumber();
              BobBlock = await ethers.provider.getBlock(blockNumber);
            });

            it("it increases total deposited amount and weight", async () => {
              expect(await galaxyStakingPools.getPoolTotalDeposited(0)).equal(AliceDepositedAmount.add(AliceDepositedAmount));
              expect(await galaxyStakingPools.getPoolTotalDepositedWeight(0)).equal(AliceDepositedAmount.add(AliceDepositedAmount).mul(4).div(10));
              expect(await galaxyStakingPools.getPoolTotalDeposited(1)).equal(BobDepositedAmount.add(BobDepositedAmount));
              expect(await galaxyStakingPools.getPoolTotalDepositedWeight(1)).equal(BobDepositedAmount.add(BobDepositedAmount).mul(4).div(10));
            });

            it("it increases deposited amount and weight", async () => {
              expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(AliceDepositedAmount);
              expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 1)).equal(BobDepositedAmount);
              expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 0)).equal(AliceDepositedAmount.mul(4).div(10));
              expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 1)).equal(BobDepositedAmount.mul(4).div(10));
              expect(await galaxyStakingPools.getStakeTotalDeposited(await Bob.getAddress(), 0)).equal(AliceDepositedAmount);
              expect(await galaxyStakingPools.getStakeTotalDeposited(await Bob.getAddress(), 1)).equal(BobDepositedAmount);
              expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 0)).equal(AliceDepositedAmount.mul(4).div(10));
              expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 1)).equal(BobDepositedAmount.mul(4).div(10));
            });

            it("it generates user's deposited orders", async () => {
              let userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(2);
              expect(userDepositedOrder.owner).equal(await Alice.getAddress());
              expect(userDepositedOrder.poolId).equal(1);
              expect(userDepositedOrder.amount).equal(BobDepositedAmount);
              expect(userDepositedOrder.expireTime).equal(AliceBlock.timestamp + pool1ExpiredTime);
              expect(userDepositedOrder.redeemToken).equal(0);
              expect(userDepositedOrder.remainingRedeemToken).equal(0);
              expect(userDepositedOrder.redeemedCurrency).equal(0);
              expect(userDepositedOrder.epoch).equal(1);
              expect(userDepositedOrder.isRedeem).equal(false);
              userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(3);
              expect(userDepositedOrder.owner).equal(await Bob.getAddress());
              expect(userDepositedOrder.poolId).equal(0);
              expect(userDepositedOrder.amount).equal(AliceDepositedAmount);
              expect(userDepositedOrder.expireTime).equal(BobBlock.timestamp + pool0ExpiredTime);
              expect(userDepositedOrder.redeemToken).equal(0);
              expect(userDepositedOrder.remainingRedeemToken).equal(0);
              expect(userDepositedOrder.redeemedCurrency).equal(0);
              expect(userDepositedOrder.epoch).equal(1);
              expect(userDepositedOrder.isRedeem).equal(false);
            });

            it("it reduces user's token", async () => {
              expect(await currency.balanceOf(await Alice.getAddress())).equal(mintAmount.sub(AliceDepositedAmount).sub(BobDepositedAmount));
              expect(await currency.balanceOf(await Bob.getAddress())).equal(mintAmount.sub(BobDepositedAmount).sub(AliceDepositedAmount));
              expect(await currency.balanceOf(operatorMock.address)).equal(AliceDepositedAmount.add(BobDepositedAmount).add(AliceDepositedAmount).add(BobDepositedAmount));
            });

            it("it increases totalSupplyCurrency", async () => {
              expect(await galaxyStakingPools.totalSupplyCurrency()).equal(AliceDepositedAmount.add(AliceDepositedAmount).add(BobDepositedAmount).add(BobDepositedAmount));
            });
          })
        });
      });
    });
  });

  describe("redeem tokens", () => {
    let deployer, governance;
    let Alice, Bob;
    let alpha, tranche, galaxyStakingPools;
    let epochTickerMock, reserveMock;
    let mintAmount = parseEther("10000");
    let AliceDepositedAmount = parseEther("1000");
    let BobDepositedAmount = parseEther("3000");
    let DuplicatedAmount = parseEther("200");
    let pool0ExpiredTime = 300;
    let pool1ExpiredTime = 600;

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;
      currency = await ERC20MockFactory.deploy(
        "Mock DAI",
        "DAI",
        18
      );
      token = await ERC20MockFactory.deploy(
        "Mock NAOS",
        "NAOS",
        18
      );
      alpha = await RestrictedToken.deploy(
        "Alpha Token",
        "Alpha"
      );
      boostPool = await BoostPoolFactory.deploy(
        token.address,
        token.address,
        governance.getAddress()
      );

      reserveMock = await ReserveMock.deploy(currency.address);
      epochTickerMock = await EpochTickerMock.deploy();
      tranche = await Tranche.deploy(currency.address, alpha.address);
      await tranche.depend(reservePadded, reserveMock.address);
      await tranche.depend(epochTickerPadded, epochTickerMock.address);
      operator = await Operator.deploy(tranche.address);
      await operator.depend(tokenPadded, alpha.address);

      galaxyStakingPools = await GalaxyStakingPools.deploy();
      await galaxyStakingPools.initialize(
        currency.address,
        token.address,
        alpha.address,
        boostPool.address,
        epochTickerMock.address,
        tranche.address,
        operator.address,
        governance.getAddress()
      );
      await galaxyStakingPools.connect(governance).createPool(pool0ExpiredTime);
      await galaxyStakingPools.connect(governance).createPool(pool1ExpiredTime);
      await galaxyStakingPools.connect(governance).setRewardWeights([1, 1]);
      memberlist = await Memberlist.deploy();
      await alpha.depend(memberlistPadded, memberlist.address);
      await alpha.rely(tranche.address);
      await memberlist.updateMember(galaxyStakingPools.address, Math.floor(new Date().getTime() / 1000 + 86400 * 10));
      await memberlist.updateMember(tranche.address, Math.floor(new Date().getTime() / 1000 + 86400 * 10));
      await currency.approve(tranche.address, MAXIMUM_U256);
      await currency.mint(await deployer.getAddress(), mintAmount);
      await tranche.rely(operator.address);
      await closeAndUpdateEpoch(tranche, epochTickerMock, ONE);

      await currency.mint(Alice.getAddress(), mintAmount);
      await currency.mint(Bob.getAddress(), mintAmount);
      await currency.connect(Alice).approve(galaxyStakingPools.address, MAXIMUM_U256);
      await currency.connect(Bob).approve(galaxyStakingPools.address, MAXIMUM_U256);
      await galaxyStakingPools.connect(governance).setAdmin(await governance.getAddress(), true);
      await galaxyStakingPools.connect(governance).setWhitelist(await Alice.getAddress(), true);
      await galaxyStakingPools.connect(governance).setWhitelist(await Bob.getAddress(), true);
      await galaxyStakingPools.updateEpoch();

      await galaxyStakingPools.connect(governance).setDepositedCeiling(0, mintAmount.mul(2));
      await galaxyStakingPools.connect(governance).setDepositedCeiling(1, mintAmount.mul(2));
      await galaxyStakingPools.connect(Alice).deposit(0, AliceDepositedAmount);
      await galaxyStakingPools.connect(Alice).deposit(0, BobDepositedAmount);
      await galaxyStakingPools.connect(Alice).deposit(1, BobDepositedAmount);
    });

    it("it reverts if the lock time is not expired", () => {
      expect(galaxyStakingPools.connect(Alice).redeem(0, [0])).revertedWith("The lock time is not expired!");
    });

    context("After lock time", () => {
      beforeEach(async () => {
        await timeFly(600);
        galaxyStakingPools = galaxyStakingPools.connect(Alice);
      });

      it("it reverts if input order count greater than order count", async () => {
        await expect(galaxyStakingPools.redeem(0, [0, 1, 2, 3])).to.be.revertedWith("invalid index");
      });

      it("it reverts if input order index out of range", async () => {
        await expect(galaxyStakingPools.redeem(0, [4])).to.be.revertedWith("invalid index");
      });

      it("it reverts if the owner is invalid", async () => {
        await expect(galaxyStakingPools.connect(Bob).redeem(0, [0])).to.be.revertedWith("invalid owner");
      });

      it("it reverts if the input orders deposited in different pool", async () => {
        await expect(galaxyStakingPools.redeem(1, [0])).to.be.revertedWith("inconsistent pool id");
      });

      it("it reverts if the epoch has not been updated", async () => {
        await expect(galaxyStakingPools.redeem(0, [0])).to.be.revertedWith("SafeMath: division by zero");
      });

      context("After epoch has been updated adn redeem orders", () => {
        beforeEach(async () => {
          await closeAndUpdateEpoch(tranche, epochTickerMock, ONE);
          await galaxyStakingPools.updateEpoch();
          await galaxyStakingPools.redeem(0, [0, 1]);
          await galaxyStakingPools.redeem(1, [2]);
        });

        it("it reverts if order has been redeemed", async () => {
          await expect(galaxyStakingPools.redeem(0, [1])
          ).revertedWith("The order has been redeemed");
        })

        it("it registers to redeem multi orders successfully", async () => {
          let userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(0);
          let epochTokenPrice = await galaxyStakingPools.epochTokenPrice(userDepositedOrder.epoch);
          let order0RedeemToken = userDepositedOrder.amount.mul(ONE).div(epochTokenPrice);
          expect(userDepositedOrder.redeemToken).equal(order0RedeemToken);
          expect(userDepositedOrder.remainingRedeemToken).equal(order0RedeemToken);
          expect(userDepositedOrder.redeemedCurrency).equal(0);
          expect(userDepositedOrder.isRedeem).equal(true);
          userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(1);
          let order1RedeemToken = userDepositedOrder.amount.mul(ONE).div(epochTokenPrice);
          expect(userDepositedOrder.redeemToken).equal(order1RedeemToken);
          expect(userDepositedOrder.remainingRedeemToken).equal(order1RedeemToken);
          expect(userDepositedOrder.redeemedCurrency).equal(0);
          expect(userDepositedOrder.isRedeem).equal(true);
          userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(2);
          let order2RedeemToken = userDepositedOrder.amount.mul(ONE).div(epochTokenPrice);
          expect(userDepositedOrder.redeemToken).equal(order2RedeemToken);
          expect(userDepositedOrder.remainingRedeemToken).equal(order2RedeemToken);
          expect(userDepositedOrder.redeemedCurrency).equal(0);
          expect(userDepositedOrder.isRedeem).equal(true);
          expect(await alpha.balanceOf(galaxyStakingPools.address)).equal(0);
          expect(await currency.balanceOf(reserveMock.address)).equal(AliceDepositedAmount.add(BobDepositedAmount).add(BobDepositedAmount));
          expect(await galaxyStakingPools.totalRedeemTokenAmount()).equal(order0RedeemToken.add(order1RedeemToken).add(order2RedeemToken));
        });

        context("user can withdraw currency after epoch has been updated", () => {
          let userUnclaimedCurrency = AliceDepositedAmount.add(BobDepositedAmount).add(BobDepositedAmount);
          beforeEach(async () => {
            await reserveMock["setReturn(bytes32,uint256)"](balancePadded, userUnclaimedCurrency);
            await closeAndUpdateEpoch(tranche, epochTickerMock, ONE);
            await galaxyStakingPools.updateEpoch();
          });

          it("it increase user's unclaimed currency", async () => {
            expect(await galaxyStakingPools.userUnclaimedCurrency(await Alice.getAddress())).equal(userUnclaimedCurrency);
            expect(await currency.balanceOf(galaxyStakingPools.address)).equal(userUnclaimedCurrency);
            await galaxyStakingPools.connect(Alice).withdraw();
            expect(await galaxyStakingPools.userUnclaimedCurrency(await Alice.getAddress())).equal(0);
            expect(await currency.balanceOf(galaxyStakingPools.address)).equal(0);
            expect(await currency.balanceOf(await Alice.getAddress())).equal(mintAmount);
          });
        });

        context("it there is no enough tokens for redemption", () => {
          beforeEach(async () => {
            await reserveMock["setReturn(bytes32,uint256)"](balancePadded, BobDepositedAmount);
            const res = await tranche.callStatic.closeEpoch();
            await tranche.closeEpoch();
            const epochID = await epochTickerMock.currentEpoch();
            await epochTickerMock.incCurrentEpoch(1);
            await tranche.epochUpdate(epochID, ONE, ONE.mul(3).div(10), ONE, res.totalSupplyCurrency_, res.totalRedeemToken_);
            await epochTickerMock.incLastEpochExecuted(1);
            await galaxyStakingPools.updateEpoch();
          });

          it("it updates a user's deposited order", async () => {
            let remainingTokenAmount = AliceDepositedAmount.add(BobDepositedAmount).add(BobDepositedAmount).mul(3).div(10);
            let userUnclaimedCurreny = remainingTokenAmount;

            let userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(0);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(userDepositedOrder.amount);
            remainingTokenAmount = remainingTokenAmount.sub(userDepositedOrder.amount);

            userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(1);
            expect(userDepositedOrder.remainingRedeemToken).equal(userDepositedOrder.redeemToken.sub(remainingTokenAmount));
            expect(userDepositedOrder.redeemedCurrency).equal(remainingTokenAmount);

            userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(2);
            expect(userDepositedOrder.remainingRedeemToken).equal(userDepositedOrder.redeemToken);
            expect(userDepositedOrder.redeemedCurrency).equal(0);

            expect(await galaxyStakingPools.redeemOrderListPendingIndex()).equal(1);
            expect(await galaxyStakingPools.redeemOrderCount()).equal(3);
            expect(await galaxyStakingPools.totalRedeemTokenAmount()).equal(AliceDepositedAmount.add(BobDepositedAmount).add(BobDepositedAmount).mul(7).div(10));
            expect(await galaxyStakingPools.userUnclaimedCurrency(await Alice.getAddress())).equal(userUnclaimedCurreny);
            await galaxyStakingPools.connect(Alice).withdraw();
            expect(await currency.balanceOf(await Alice.getAddress())).equal(mintAmount.sub(AliceDepositedAmount.add(BobDepositedAmount).add(BobDepositedAmount)).add(userUnclaimedCurreny));
            expect(await currency.balanceOf(galaxyStakingPools.address)).equal(0);
          });
        });

        context("if alpha token price is different with origin", () => {
          it("alpha token price is higher than origin", async () => {
            let newPrice = ONE.mul(11).div(10);
            let currencyAmount = AliceDepositedAmount.add(BobDepositedAmount).add(BobDepositedAmount).mul(11).div(10);
            await reserveMock["setReturn(bytes32,uint256)"](balancePadded, currencyAmount);
            await currency.mint(reserveMock.address, mintAmount);
            await closeAndUpdateEpoch(tranche, epochTickerMock, newPrice);
            await galaxyStakingPools.updateEpoch();

            let userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(0);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(userDepositedOrder.amount.mul(11).div(10));

            userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(1);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(userDepositedOrder.amount.mul(11).div(10));

            userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(2);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(userDepositedOrder.amount.mul(11).div(10));

            expect(await galaxyStakingPools.getPoolTotalDeposited(0)).equal(0);
            expect(await galaxyStakingPools.getPoolTotalDeposited(1)).equal(0);
            expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(0);
            expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 1)).equal(0);
            expect(await galaxyStakingPools.userUnclaimedCurrency(await Alice.getAddress())).equal(currencyAmount);
            await galaxyStakingPools.withdraw();
            expect(await currency.balanceOf(await Alice.getAddress())).equal(mintAmount.add(currencyAmount.div(11)));
          });

          it("alpha token price is lower than origin", async () => {
            let newPrice = ONE.mul(9).div(10);
            let currencyAmount = AliceDepositedAmount.add(BobDepositedAmount).add(BobDepositedAmount).mul(9).div(10);
            await reserveMock["setReturn(bytes32,uint256)"](balancePadded, currencyAmount);
            await closeAndUpdateEpoch(tranche, epochTickerMock, newPrice);
            await galaxyStakingPools.updateEpoch();

            let userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(0);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(userDepositedOrder.amount.mul(9).div(10));

            userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(1);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(userDepositedOrder.amount.mul(9).div(10));

            userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(2);
            expect(userDepositedOrder.remainingRedeemToken).equal(0);
            expect(userDepositedOrder.redeemedCurrency).equal(userDepositedOrder.amount.mul(9).div(10));

            expect(await galaxyStakingPools.getPoolTotalDeposited(0)).equal(0);
            expect(await galaxyStakingPools.getPoolTotalDeposited(1)).equal(0);
            expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(0);
            expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 1)).equal(0);
            expect(await galaxyStakingPools.userUnclaimedCurrency(await Alice.getAddress())).equal(currencyAmount);
            await galaxyStakingPools.withdraw();
            expect(await currency.balanceOf(await Alice.getAddress())).equal(mintAmount.sub(currencyAmount.div(9)));
          })
        });
      });
    });

    context("if redeem orders count is more than MAX_EXECUTION", () => {
      beforeEach(async () => {
        for (let i = 0; i < 21; i++) {
          await galaxyStakingPools.connect(Bob).deposit(0, DuplicatedAmount);
        }
        await timeFly(600);
        await closeAndUpdateEpoch(tranche, epochTickerMock, ONE);
        await galaxyStakingPools.updateEpoch();
        await galaxyStakingPools.connect(Bob).redeem(0, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
        await reserveMock["setReturn(bytes32,uint256)"](balancePadded, DuplicatedAmount.mul(25));
        await closeAndUpdateEpoch(tranche, epochTickerMock, ONE);
        await galaxyStakingPools.updateEpoch();
      });

      it("it should update again", async () => {
        expect(await galaxyStakingPools.epochUpdated()).equal(false);
        expect(await galaxyStakingPools.redeemOrderCount()).equal(21);
        expect(await galaxyStakingPools.redeemOrderListPendingIndex()).equal(20);
        let userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(22);
        let redeemCurrencyAmount = DuplicatedAmount.mul(await galaxyStakingPools.epochTokenPrice(userDepositedOrder.epoch)).div(ONE);
        expect(userDepositedOrder.remainingRedeemToken).equal(0);
        expect(userDepositedOrder.redeemedCurrency).equal(redeemCurrencyAmount);
        userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(23);
        expect(userDepositedOrder.remainingRedeemToken).equal(redeemCurrencyAmount);
        expect(userDepositedOrder.redeemedCurrency).equal(0);
        await galaxyStakingPools.updateEpoch();
        expect(await galaxyStakingPools.epochUpdated()).equal(true);
        expect(await galaxyStakingPools.redeemOrderListPendingIndex()).equal(21);
        userDepositedOrder = await galaxyStakingPools.getDepositedOrderByIndex(23);
        expect(userDepositedOrder.remainingRedeemToken).equal(0);
        expect(userDepositedOrder.redeemedCurrency).equal(redeemCurrencyAmount);

        expect(await galaxyStakingPools.userUnclaimedCurrency(await Bob.getAddress())).equal(redeemCurrencyAmount.mul(21));
        await galaxyStakingPools.connect(Bob).withdraw();
        expect(await currency.balanceOf(galaxyStakingPools.address)).equal(0);
        expect(await currency.balanceOf(await Bob.getAddress())).equal(mintAmount);
      });
    });
  });

  describe("claim rewards", () => {
    let deployer, governance;
    let Alice, Bob;
    let token;
    let boostPool, galaxyStakingPools;
    let epochTickerMock;
    let mintAmount = parseEther("10000");
    let AliceDepositedAmount = parseEther("1000");
    let BobDepositedAmount = parseEther("3000");
    let pool0ExpiredTime = 300;
    let pool1ExpiredTime = 600;
    let lockTime0 = 90 * 86400;
    let lockTime1 = 365 * 86400;
    let weighted0 = 2;
    let weighted1 = 4;

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;
      currency = await ERC20MockFactory.deploy(
        "Mock DAI",
        "DAI",
        18
      );
      token = await ERC20MockFactory.deploy(
        "Mock NAOS",
        "NAOS",
        18
      );
      alpha = await ERC20MockFactory.deploy(
        "Alpha Token",
        "Alpha",
        18
      );
      boostPool = await BoostPoolFactory.deploy(
        token.address,
        token.address,
        governance.getAddress()
      );

      epochTickerMock = await EpochTickerMock.deploy();
      operatorMock = await OperatorMock.deploy(currency.address, alpha.address);

      galaxyStakingPools = await GalaxyStakingPools.deploy();
      await galaxyStakingPools.initialize(
        currency.address,
        token.address,
        alpha.address,
        boostPool.address,
        epochTickerMock.address,
        operatorMock.address,
        operatorMock.address,
        governance.getAddress()
      );
      await galaxyStakingPools.connect(governance).createPool(pool0ExpiredTime);
      await galaxyStakingPools.connect(governance).createPool(pool1ExpiredTime);
      await galaxyStakingPools.connect(governance).setRewardWeights([1, 4]);

      await boostPool.connect(governance).setLockTimeWeighted(lockTime0, weighted0);
      await boostPool.connect(governance).setLockTimeWeighted(lockTime1, weighted1);

      await currency.mint(Alice.getAddress(), mintAmount);
      await currency.mint(Bob.getAddress(), mintAmount);
      await currency.connect(Alice).approve(galaxyStakingPools.address, MAXIMUM_U256);
      await currency.connect(Bob).approve(galaxyStakingPools.address, MAXIMUM_U256);
      await galaxyStakingPools.connect(governance).setAdmin(await governance.getAddress(), true);
      await galaxyStakingPools.connect(governance).setWhitelist(await Alice.getAddress(), true);
      await galaxyStakingPools.connect(governance).setWhitelist(await Bob.getAddress(), true);
      await galaxyStakingPools.updateEpoch();

      await galaxyStakingPools.connect(governance).setDepositedCeiling(0, mintAmount.mul(2));
      await galaxyStakingPools.connect(governance).setDepositedCeiling(1, mintAmount.mul(2));
      await galaxyStakingPools.connect(Alice).deposit(0, AliceDepositedAmount);
      await galaxyStakingPools.connect(Bob).deposit(0, BobDepositedAmount);
      await galaxyStakingPools.connect(Alice).deposit(1, BobDepositedAmount);
      await galaxyStakingPools.connect(Bob).deposit(1, AliceDepositedAmount);
    });

    it("it has right boost weight", async () => {
      expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(AliceDepositedAmount);
      expect(await galaxyStakingPools.getStakeTotalDeposited(await Alice.getAddress(), 1)).equal(BobDepositedAmount);
      expect(await galaxyStakingPools.getStakeTotalDeposited(await Bob.getAddress(), 0)).equal(BobDepositedAmount);
      expect(await galaxyStakingPools.getStakeTotalDeposited(await Bob.getAddress(), 1)).equal(AliceDepositedAmount);

      expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 0)).equal(AliceDepositedAmount.mul(4).div(10));
      expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 1)).equal(BobDepositedAmount.mul(4).div(10));
      expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 0)).equal(BobDepositedAmount.mul(4).div(10));
      expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 1)).equal(AliceDepositedAmount.mul(4).div(10));
    });

    context("There is some tokens staking in the boost pool", () => {
      beforeEach(async () => {
        await token.mint(await deployer.getAddress(), mintAmount);
        await token.mint(await Alice.getAddress(), AliceDepositedAmount);
        await token.mint(await Bob.getAddress(), BobDepositedAmount);
        await token.connect(deployer).approve(boostPool.address, MAXIMUM_U256);
        await token.connect(Alice).approve(boostPool.address, MAXIMUM_U256);
        await token.connect(Bob).approve(boostPool.address, MAXIMUM_U256);
        await boostPool.connect(deployer).deposit(mintAmount, 0);
        await boostPool.connect(Alice).deposit(AliceDepositedAmount, 0);
        await boostPool.connect(Bob).deposit(BobDepositedAmount, 1);
      });

      it("it doesn't boost before interacting with galaxy staking pools", async () => {
        expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 0)).equal(AliceDepositedAmount.mul(4).div(10));
        expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 1)).equal(BobDepositedAmount.mul(4).div(10));
        expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 0)).equal(BobDepositedAmount.mul(4).div(10));
        expect(await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 1)).equal(AliceDepositedAmount.mul(4).div(10));
      });

      context("after boost", () => {
        beforeEach(async () => {
          await galaxyStakingPools.connect(Alice).activateBoost(0, await Alice.getAddress());
          await galaxyStakingPools.connect(Alice).activateBoosts(await Bob.getAddress());
          await token.mint(galaxyStakingPools.address, mintAmount);
        });

        it("it boosts after interacting with galaxy staking pools", async () => {
          let boostPoolTotalDepositedWeight = await boostPool.getPoolTotalDepositedWeight();
          let AliceBoostPoolDepositedWeight = (await boostPool.getStakeTotalDepositedWeight(await Alice.getAddress()));
          let BobBoostPoolDepositedWeight = (await boostPool.getStakeTotalDepositedWeight(await Bob.getAddress()));
          let pool0ToTatalDeposited = await galaxyStakingPools.getPoolTotalDeposited(0);
          let pool1ToTatalDeposited = await galaxyStakingPools.getPoolTotalDeposited(1);
          let AlicePool0TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 0);
          let AlicePool1TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 1);
          let BobPool0TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 0);
          let BobPool1TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 1);


          expect(AlicePool0TotalDepositedWeight).equal(AliceDepositedAmount.mul(4).div(10).add(pool0ToTatalDeposited.mul(AliceBoostPoolDepositedWeight).div(boostPoolTotalDepositedWeight).mul(6).div(10)));
          expect(AlicePool1TotalDepositedWeight).equal(BobDepositedAmount.mul(4).div(10));
          expect(BobPool0TotalDepositedWeight).equal(BobDepositedAmount.mul(4).div(10).add(pool0ToTatalDeposited.mul(BobBoostPoolDepositedWeight).div(boostPoolTotalDepositedWeight).mul(6).div(10)));
          let estimatedBobPool1DepositedWeight = AliceDepositedAmount.mul(4).div(10).add(pool1ToTatalDeposited.mul(BobBoostPoolDepositedWeight).div(boostPoolTotalDepositedWeight).mul(6).div(10));
          estimatedBobPool1DepositedWeight = (estimatedBobPool1DepositedWeight > AliceDepositedAmount) ? AliceDepositedAmount : estimatedBobPool1DepositedWeight;
          expect(BobPool1TotalDepositedWeight).equal(estimatedBobPool1DepositedWeight);
          expect(await galaxyStakingPools.getPoolTotalDepositedWeight(0)).equal(AlicePool0TotalDepositedWeight.add(BobPool0TotalDepositedWeight));
          expect(await galaxyStakingPools.getPoolTotalDepositedWeight(1)).equal(AlicePool1TotalDepositedWeight.add(BobPool1TotalDepositedWeight));
        });

        it("it calculates and gets the right rewards", async () => {
          let rewardRate = parseEther("1");
          let mintBlock = 10;
          let tolerance = 10000;
          await galaxyStakingPools.connect(governance).setRewardRate(rewardRate);
          await mineBlocks(mintBlock);
          let AlicePool0TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 0);
          let AlicePool1TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Alice.getAddress(), 1);
          let BobPool0TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 0);
          let BobPool1TotalDepositedWeight = await galaxyStakingPools.getStakeTotalDepositedWeight(await Bob.getAddress(), 1);
          let pool0RewardRate = await galaxyStakingPools.getPoolRewardRate(0);
          let pool1RewardRate = await galaxyStakingPools.getPoolRewardRate(1);
          let pool0TotalDepositedWeight = await galaxyStakingPools.getPoolTotalDepositedWeight(0);
          let pool1TotalDepositedWeight = await galaxyStakingPools.getPoolTotalDepositedWeight(1);

          expect((await galaxyStakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 0))
            .sub(pool0RewardRate.mul(AlicePool0TotalDepositedWeight).div(pool0TotalDepositedWeight).mul(mintBlock))
            .abs()).to.be.at.most(tolerance)
          expect((await galaxyStakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 1))
            .sub(pool1RewardRate.mul(AlicePool1TotalDepositedWeight).div(pool1TotalDepositedWeight).mul(mintBlock))
            .abs()).to.be.at.most(tolerance);
          expect((await galaxyStakingPools.getStakeTotalUnclaimed(await Bob.getAddress(), 0))
            .sub(pool0RewardRate.mul(BobPool0TotalDepositedWeight).div(pool0TotalDepositedWeight).mul(mintBlock))
            .abs()).to.be.at.most(tolerance);
          expect((await galaxyStakingPools.getStakeTotalUnclaimed(await Bob.getAddress(), 1))
            .sub(pool1RewardRate.mul(BobPool1TotalDepositedWeight).div(pool1TotalDepositedWeight).mul(mintBlock))
            .abs()).to.be.at.most(tolerance);

          await galaxyStakingPools.connect(Alice).claim(0);
          let AliceFirstClaimAmount = await token.balanceOf(await Alice.getAddress());
          expect(AliceFirstClaimAmount
            .sub(pool0RewardRate.mul(AlicePool0TotalDepositedWeight).div(pool0TotalDepositedWeight).mul(mintBlock + 1))
            .abs()).to.be.at.most(tolerance);
          await galaxyStakingPools.connect(Alice).claim(1);
          expect((await token.balanceOf(await Alice.getAddress()))
            .sub(AliceFirstClaimAmount.add(pool1RewardRate.mul(AlicePool1TotalDepositedWeight).div(pool1TotalDepositedWeight).mul(mintBlock + 2)))
            .abs()).to.be.at.most(tolerance);

          newPool1TotalDepositedWeight = await galaxyStakingPools.getPoolTotalDepositedWeight(1);

          await galaxyStakingPools.connect(Bob).claim(0);
          let BobFirstClaimAmount = await token.balanceOf(await Bob.getAddress());
          expect(BobFirstClaimAmount
            .sub(pool0RewardRate.mul(BobPool0TotalDepositedWeight).div(pool0TotalDepositedWeight).mul(mintBlock + 3))
            .abs()).to.be.at.most(tolerance);
          await galaxyStakingPools.connect(Bob).claim(1);
          expect((await token.balanceOf(await Bob.getAddress()))
            .sub(BobFirstClaimAmount.add(pool1RewardRate.mul(BobPool1TotalDepositedWeight).div(pool1TotalDepositedWeight).mul(mintBlock + 2))
              .add(pool1RewardRate.mul(BobPool1TotalDepositedWeight).div(newPool1TotalDepositedWeight).mul(2)))
            .abs()).to.be.at.most(tolerance);
        });
      });
    });
  });
});