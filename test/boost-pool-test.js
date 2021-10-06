const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils } = require('ethers');
const { parseEther } = utils;

const ONE = BigNumber.from(1);
const MAXIMUM_U256 = ONE.shl(255);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const mineBlocks = async (numberBlocks) => {
  for (let i = 0; i < numberBlocks; i++) {
    await ethers.provider.send('evm_mine', []);
  }
}

const timeFly = async (seconds) => {
  return await ethers.provider.send('evm_increaseTime', [seconds]);
}

let ERC20MockFactory;
let BoostPoolFactory;

describe("BoostPool", () => {
  before(async () => {
    ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    BoostPoolFactory = await ethers.getContractFactory("BoostPool");
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
  });

  describe("constructor", () => {
    let deployer;
    let governance;
    let token;

    beforeEach(async () => {
      [deployer, governance, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));
    });

    it("it reverts if token is zero address", async () => {
      expect(
        BoostPoolFactory.connect(deployer).deploy(
          ZERO_ADDRESS,
          token.address,
          governance.getAddress()
        )
      ).revertedWith("BoostPool: token address cannot be 0x0");
    });

    it("it reverts if reward is zero address", async () => {
      expect(
        BoostPoolFactory.connect(deployer).deploy(
          token.address,
          ZERO_ADDRESS,
          governance.getAddress()
        )
      ).revertedWith("BoostPool: reward address cannot be 0x0");
    });

    it("it reverts if governance is zero address", async () => {
      expect(
        BoostPoolFactory.connect(deployer).deploy(
          token.address,
          token.address,
          ZERO_ADDRESS
        )
      ).revertedWith("BoostPool: governance address cannot be 0x0");
    });

    it("it deploys suceesfully when parameters are correct", async () => {
      const boostPool = await BoostPoolFactory.connect(deployer).deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
      expect(await boostPool.getPoolToken()).equal(token.address);
      expect(await boostPool.reward()).equal(token.address);
      expect(await boostPool.governance()).equal(await governance.getAddress());
      expect(await boostPool.cooldownPeriod()).equal(86400 * 5);
      expect(await boostPool.penaltyPercent()).equal(50);
    });
  });

  describe("set parameters", () => {
    let deployer;
    let governance;
    let pendingGovernance;
    let token;
    let boostPool;

    beforeEach(async () => {
      [deployer, governance, pendingGovernance, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));
      boostPool = await BoostPoolFactory.connect(deployer).deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
    });

    context("set governance", () => {
      it("it reverts if the sender is not governance", () => {
        expect(
          boostPool.connect(deployer).setPendingGovernance(
            pendingGovernance.getAddress()
          )
        ).revertedWith("BoostPool: only governance");
      });

      context("when sender is current governance", () => {
        beforeEach(() => {
          boostPool = boostPool.connect(governance);
        });

        it("it reverts if pending governance is zero address", () => {
          expect(
            boostPool.setPendingGovernance(
              ZERO_ADDRESS
            )
          ).revertedWith("BoostPool: pending governance address cannot be 0x0");
        });

        it("it reverts if the accepter is not the pending governance", async () => {
          await boostPool.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          expect(boostPool.connect(deployer).acceptGovernance()
          ).revertedWith("BoostPool: only pending governance");
        });

        it("it changes governance successfully", async () => {
          await boostPool.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          await boostPool.connect(pendingGovernance).acceptGovernance();
          expect(await boostPool.governance()).equal(await pendingGovernance.getAddress());
        });

        it("it emits GovernanceUpdated event", async () => {
          await boostPool.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          expect(boostPool.connect(pendingGovernance).acceptGovernance())
            .emit(boostPool, "GovernanceUpdated")
            .withArgs(await pendingGovernance.getAddress());
        });
      });
    });

    context("set reward rate", () => {
      let rewardRate = 100;

      it("it reverts if the sender is not governance", () => {
        expect(
          boostPool.connect(deployer).setRewardRate(
            rewardRate
          )
        ).revertedWith("BoostPool: only governance");
      });

      context("when sender is current governance", () => {
        beforeEach(() => {
          boostPool = boostPool.connect(governance);
        });

        it("it changes reward rate successfully", async () => {
          await boostPool.setRewardRate(
            rewardRate
          );
          expect(await boostPool.rewardRate()).equal(rewardRate);
        });

        it("it emits RewardRateUpdated event", async () => {
          expect(boostPool.setRewardRate(rewardRate))
            .emit(boostPool, "RewardRateUpdated")
            .withArgs(rewardRate);
        });
      });
    });

    context("set cooldown", () => {
      let cooldownPeriod = 100;

      it("it reverts if the sender is not governance", () => {
        expect(
          boostPool.connect(deployer).setCooldown(
            cooldownPeriod
          )
        ).revertedWith("BoostPool: only governance");
      });

      context("when sender is current governance", () => {
        beforeEach(() => {
          boostPool = boostPool.connect(governance);
        });

        it("it changes cool down period successfully", async () => {
          await boostPool.setCooldown(
            cooldownPeriod
          );
          expect(await boostPool.cooldownPeriod()).equal(cooldownPeriod);
        });

        it("it emits CooldownPeriodUpdated event", async () => {
          expect(boostPool.setCooldown(cooldownPeriod))
            .emit(boostPool, "CooldownPeriodUpdated")
            .withArgs(cooldownPeriod);
        });
      });
    });

    context("set penalty percent", () => {
      let penaltyPercent = 80;

      it("it reverts if the sender is not governance", () => {
        expect(
          boostPool.connect(deployer).setPenaltyPercent(
            penaltyPercent
          )
        ).revertedWith("BoostPool: only governance");
      });

      context("when sender is current governance", () => {
        beforeEach(() => {
          boostPool = boostPool.connect(governance);
        });

        it("it reverts if the penalty percent is greater than 100", () => {
          expect(
            boostPool.setPenaltyPercent(
              101
            )
          ).revertedWith("BoostPool: penalty percent should be less or equal to 100");
        });

        it("it changes penalty percent successfully", async () => {
          await boostPool.setPenaltyPercent(
            penaltyPercent
          );
          expect(await boostPool.penaltyPercent()).equal(penaltyPercent);
        });

        it("it emits PenaltyPercentUpdated event", async () => {
          expect(boostPool.setPenaltyPercent(penaltyPercent))
            .emit(boostPool, "PenaltyPercentUpdated")
            .withArgs(penaltyPercent);
        });
      });
    });
  })

  describe("deposit tokens", () => {
    let deployer;
    let governance;
    let Alice;
    let Bob;
    let token;
    let boostPool;
    let mintToken = parseEther('1000');
    let depositAmount = parseEther('500');
    let secondDepositAmount = parseEther('300');
    let BobDepositAmount = parseEther('456');

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));
      boostPool = await BoostPoolFactory.connect(deployer).deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(deployer).mint(Bob.getAddress(), mintToken);
      await token.connect(Alice).approve(boostPool.address, MAXIMUM_U256);
      await token.connect(Bob).approve(boostPool.address, MAXIMUM_U256);
      await boostPool.connect(Alice).deposit(depositAmount);
    });

    it("it increases total deposited amount", async () => {
      expect(await boostPool.getPoolTotalDeposited()).equal(depositAmount);
    });

    it("it increases deposited amount", async () => {
      expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(depositAmount);
    });

    it("it generate a user's deposited order", async () => {
      let blockNumber = await ethers.provider.getBlockNumber();
      let block = await ethers.provider.getBlock(blockNumber);
      expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(1);
      const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
      expect(userDepositedOrder.amount).equal(depositAmount);
      expect(userDepositedOrder.depositedTime).equal(block.timestamp);
      expect(userDepositedOrder.isWithdraw).equal(false);
    });

    it("it reduces user's token", async () => {
      expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(depositAmount));
      expect(await token.balanceOf(await boostPool.address)).equal(depositAmount);
    });

    context("deposit again", () => {
      beforeEach(async () => {
        await boostPool.connect(Alice).deposit(secondDepositAmount);
      });

      it("it increases total deposited amount", async () => {
        expect(await boostPool.getPoolTotalDeposited()).equal(depositAmount.add(secondDepositAmount));
      });

      it("it increases deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(depositAmount.add(secondDepositAmount));
      });

      it("it generate a user's deposited order", async () => {
        let blockNumber = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNumber);
        expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(2);
        const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 1);
        expect(userDepositedOrder.amount).equal(secondDepositAmount);
        expect(userDepositedOrder.depositedTime).equal(block.timestamp);
        expect(userDepositedOrder.isWithdraw).equal(false);
      });

      it("it reduces user's token", async () => {
        expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(depositAmount).sub(secondDepositAmount));
        expect(await token.balanceOf(await boostPool.address)).equal(depositAmount.add(secondDepositAmount));
      });
    })

    context("another user deposits", () => {
      beforeEach(async () => {
        await boostPool.connect(Bob).deposit(BobDepositAmount);
      });

      it("check origin user information", async () => {
        let blockNumber = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNumber - 1);
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(depositAmount);
        expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(1);
        const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
        expect(userDepositedOrder.amount).equal(depositAmount);
        expect(userDepositedOrder.depositedTime).equal(block.timestamp);
        expect(userDepositedOrder.isWithdraw).equal(false);
      });

      it("it increases total deposited amount", async () => {
        expect(await boostPool.getPoolTotalDeposited()).equal(depositAmount.add(BobDepositAmount));
      });

      it("it increases deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Bob.getAddress())).equal(BobDepositAmount);
      });

      it("it generate a user's deposited order", async () => {
        let blockNumber = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNumber);
        expect(await boostPool.getUserOrderCount(await Bob.getAddress())).equal(1);
        const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Bob.getAddress(), 0);
        expect(userDepositedOrder.amount).equal(BobDepositAmount);
        expect(userDepositedOrder.depositedTime).equal(block.timestamp);
        expect(userDepositedOrder.isWithdraw).equal(false);
      });

      it("it reduces user's token", async () => {
        expect(await token.balanceOf(await Bob.getAddress())).equal(mintToken.sub(BobDepositAmount));
        expect(await token.balanceOf(await boostPool.address)).equal(depositAmount.add(BobDepositAmount));
      });
    });
  })

  describe("withdraw tokens", () => {
    let deployer;
    let governance;
    let Alice;
    let token;
    let boostPool;
    let mintToken = parseEther('1000');
    let depositAmount = parseEther('500');
    let secondDepositAmount = parseEther('300');
    let thirdDepositAmount = parseEther('199');

    beforeEach(async () => {
      [deployer, governance, Alice, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));
      boostPool = await BoostPoolFactory.connect(deployer).deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(Alice).approve(boostPool.address, MAXIMUM_U256);
      await boostPool.connect(Alice).deposit(depositAmount);
      await boostPool.connect(Alice).deposit(secondDepositAmount);
    });

    it("it reverts if the withdraw index array is longer than deposited order count", () => {
      expect(boostPool.connect(Alice).withdraw([0, 1, 2])
      ).revertedWith("invalid index");
    });

    it("it reverts if the withdraw index is out of index", () => {
      expect(boostPool.connect(Alice).withdraw([3])
      ).revertedWith("invalid index");
    });

    it("it reverts if the lock time is not expired", () => {
      expect(boostPool.connect(Alice).withdraw([0])
      ).revertedWith("The lock time is not expired!");
    });

    it("it reverts if the lock time of one of the order is not expired", async () => {
      await timeFly(90 * 86400 + 1);
      await boostPool.connect(Alice).deposit(thirdDepositAmount);
      expect(boostPool.connect(Alice).withdraw([0, 2])
      ).revertedWith("The lock time is not expired!");
    });

    context("it withdraws successfully", () => {
      beforeEach(async () => {
        await timeFly(90 * 86400 + 1);
        await boostPool.connect(Alice).withdraw([0]);
      });

      it("it reverts if the deposited order has been withdrew", () => {
        expect(boostPool.connect(Alice).withdraw([0]))
          .revertedWith("The order has been withdrew");
      });

      it("it reduces total deposited amount", async () => {
        expect(await boostPool.getPoolTotalDeposited()).equal(secondDepositAmount);
      });

      it("it reduces deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(secondDepositAmount);
      });

      it("it updates a user's deposited order", async () => {
        expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(2);
        const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
        expect(userDepositedOrder.isWithdraw).equal(true);
      });

      it("it increases user's token", async () => {
        expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(secondDepositAmount));
        expect(await token.balanceOf(await boostPool.address)).equal(secondDepositAmount);
      });
    });

    context("it withdraws two orders at one transaction successfully", () => {
      beforeEach(async () => {
        await boostPool.connect(Alice).deposit(thirdDepositAmount);
        await timeFly(90 * 86400 + 1);
        await boostPool.connect(Alice).withdraw([0, 2]);
      });

      it("it reverts if the deposited order has been withdrew", () => {
        expect(boostPool.connect(Alice).withdraw([0]))
          .revertedWith("The order has been withdrew");
        expect(boostPool.connect(Alice).withdraw([2]))
          .revertedWith("The order has been withdrew");
      });

      it("it reduces total deposited amount", async () => {
        expect(await boostPool.getPoolTotalDeposited()).equal(secondDepositAmount);
      });

      it("it reduces deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(secondDepositAmount);
      });

      it("it updates a user's deposited order", async () => {
        let userDepositedOrder;
        expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(3);
        userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
        expect(userDepositedOrder.isWithdraw).equal(true);
        userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
        expect(userDepositedOrder.isWithdraw).equal(true);
      });

      it("it increases user's token", async () => {
        expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(secondDepositAmount));
        expect(await token.balanceOf(await boostPool.address)).equal(secondDepositAmount);
      });

      it("it can withdraw remaining order", async () => {
        await boostPool.connect(Alice).withdraw([1]);
        expect(await boostPool.getPoolTotalDeposited()).equal(0);
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(0);
      });
    });
  })

  describe("claim rewards", () => {
    let deployer;
    let governance;
    let Alice;
    let Bob;
    let token;
    let boostPool;
    let mintToken = parseEther('1000');
    let rewardToken = parseEther('100000');
    let depositAmount = parseEther('500');
    let BobDepositAmount = parseEther('300');
    let rewardRate = parseEther('600');

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));
      boostPool = await BoostPoolFactory.connect(deployer).deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
      await boostPool.connect(governance).setRewardRate(rewardRate);
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(deployer).mint(Bob.getAddress(), mintToken);
      await token.connect(deployer).mint(boostPool.address, rewardToken);
      await token.connect(Alice).approve(boostPool.address, MAXIMUM_U256);
      await token.connect(Bob).approve(boostPool.address, MAXIMUM_U256);
      await boostPool.connect(Alice).deposit(depositAmount);
      await boostPool.connect(Bob).deposit(BobDepositAmount);
      await mineBlocks(10);
    });

    it("user's reward matches the reward rate", async () => {
      let totalDeposited = depositAmount.add(BobDepositAmount);
      let AliceReward = rewardRate.add(rewardRate.mul(10).mul(depositAmount).div(totalDeposited));
      let BobReward = rewardRate.mul(10).mul(BobDepositAmount).div(totalDeposited);
      expect(await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).equal(AliceReward);
      expect(await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).equal(BobReward);
      expect(await boostPool.getStakeTotalUnclaimedImmediately(await Alice.getAddress())).equal(AliceReward.mul(await boostPool.penaltyPercent()).div(100));
      expect(await boostPool.getStakeTotalUnclaimedImmediately(await Bob.getAddress())).equal(BobReward.mul(await boostPool.penaltyPercent()).div(100));

    })

    context("claim reward immediately", () => {
      context("user has deposited token", () => {
        let unclaimAliceRewardBefore;
        let unclaimBobRewardBefore;
        let poolTokenBefore;
        let AliceTokenBefore;

        beforeEach(async () => {
          unclaimAliceRewardBefore = await boostPool.getStakeTotalUnclaimed(await Alice.getAddress());
          unclaimBobRewardBefore = await boostPool.getStakeTotalUnclaimed(await Bob.getAddress());
          poolTokenBefore = await token.balanceOf(boostPool.address);
          AliceTokenBefore = await token.balanceOf(await Alice.getAddress());
          await boostPool.connect(Alice).claimImmediately();
        });

        it("check the balance of users after user claims the reward immediately", async () => {
          let totalDeposited = depositAmount.add(BobDepositAmount);
          let unclaimAliceAmount = unclaimAliceRewardBefore.add(rewardRate.mul(depositAmount).div(totalDeposited));
          let unclaimBobAmount = unclaimBobRewardBefore.add(rewardRate.mul(BobDepositAmount).div(totalDeposited));
          let penalty = unclaimAliceAmount.mul(await boostPool.penaltyPercent()).div(100);
          expect(await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).equal(penalty.mul(depositAmount).div(totalDeposited));
          expect(await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).equal(unclaimBobAmount.add(penalty.mul(BobDepositAmount).div(totalDeposited)))
          expect(await token.balanceOf(boostPool.address)).equal(poolTokenBefore.sub(unclaimAliceAmount.sub(penalty)));
          expect(await token.balanceOf(await Alice.getAddress())).equal(AliceTokenBefore.add(unclaimAliceAmount.sub(penalty)));
        });

        it("it reverts if pools has no enough rewards", async () => {
          await boostPool.connect(governance).setRewardRate(rewardToken);
          await mineBlocks(10);
          await expect(boostPool.connect(Alice).claimImmediately()).to.be.revertedWith("pool has no enough rewards")
        })
      });

      context("user doesn't have deposited token", () => {
        let unclaimBobRewardBefore;
        let poolTokenBefore;
        let AliceTokenBefore;

        beforeEach(async () => {
          await timeFly(90 * 86400 + 1);
          await boostPool.connect(Alice).withdraw([0])
          unclaimAliceReward = await boostPool.getStakeTotalUnclaimed(await Alice.getAddress());
          unclaimBobRewardBefore = await boostPool.getStakeTotalUnclaimed(await Bob.getAddress());
          poolTokenBefore = await token.balanceOf(boostPool.address);
          AliceTokenBefore = await token.balanceOf(await Alice.getAddress());
          await boostPool.connect(Alice).claimImmediately();
        });

        it("check the balance of user after user claims the reward immediately", async () => {
          let unclaimBobAmount = unclaimBobRewardBefore.add(rewardRate);
          let penalty = unclaimAliceReward.mul(await boostPool.penaltyPercent()).div(100);
          expect(await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).equal(0);
          expect(await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).equal(unclaimBobAmount.add(penalty))
          expect(await token.balanceOf(boostPool.address)).equal(poolTokenBefore.sub(unclaimAliceReward.sub(penalty)));
          expect(await token.balanceOf(await Alice.getAddress())).equal(AliceTokenBefore.add(unclaimAliceReward.sub(penalty)));
        });
      })
    })

    context("claim reward after cooldown period is expired", () => {
      let deployer;
      let governance;
      let Alice;
      let Bob;
      let token;
      let boostPool;
      let mintToken = parseEther('1000');
      let rewardToken = parseEther('100000');
      let depositAmount = parseEther('500');
      let BobDepositAmount = parseEther('300');
      let rewardRate = parseEther('600');

      beforeEach(async () => {
        [deployer, governance, Alice, Bob, ...signers] = signers;

        token = (await ERC20MockFactory.connect(deployer).deploy(
          "Mock DAI",
          "DAI",
          18
        ));
        boostPool = await BoostPoolFactory.connect(deployer).deploy(
          token.address,
          token.address,
          governance.getAddress()
        );
        await boostPool.connect(governance).setRewardRate(rewardRate);
        await token.connect(deployer).mint(Alice.getAddress(), mintToken);
        await token.connect(deployer).mint(Bob.getAddress(), mintToken);
        await token.connect(deployer).mint(boostPool.address, rewardToken);
        await token.connect(Alice).approve(boostPool.address, MAXIMUM_U256);
        await token.connect(Bob).approve(boostPool.address, MAXIMUM_U256);
        await boostPool.connect(Alice).deposit(depositAmount);
        await boostPool.connect(Bob).deposit(BobDepositAmount);
        await mineBlocks(10);
        await boostPool.connect(Alice).startCoolDown();
      });

      it("it reverts if user starts cooldown again", () => {
        expect(boostPool.connect(Alice).startCoolDown()
        ).revertedWith("wait for the last cooldown period expired");
      });

      it("it reverts if user claims reward immediately", () => {
        expect(boostPool.connect(Alice).claimImmediately()
        ).revertedWith("wait for the last cooldown period expired");
      });

      it("it reverts if user claims reward", () => {
        expect(boostPool.connect(Alice).claim()
        ).revertedWith("not in the claim period!");
      });

      it("check the claim period", async () => {
        let blockNumber = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNumber);
        let period = await boostPool.getUserClaimPeriod(await Alice.getAddress());
        let coolDownPeriod = (await boostPool.cooldownPeriod()).toNumber();
        let claimPeriod = (await boostPool.CLAIM_PERIOD()).toNumber();
        expect(period.claimStart).equal(block.timestamp + coolDownPeriod);
        expect(period.claimEnd).equal(block.timestamp + coolDownPeriod + claimPeriod);
      });

      context("after cooldown period", () => {
        beforeEach(async () => {
          let period = await boostPool.getUserClaimPeriod(await Alice.getAddress());
          await timeFly(5 * 86400);
        });

        it("it reverts if user starts cooldown again", () => {
          expect(boostPool.connect(Alice).startCoolDown()
          ).revertedWith("wait for the last cooldown period expired");
        });

        it("it reverts if user misuses claimImmediately", () => {
          expect(boostPool.connect(Alice).claimImmediately()
          ).revertedWith("wait for the last cooldown period expired");
        });

        it("it reverts if pools has no enough rewards", async () => {
          await boostPool.connect(governance).setRewardRate(rewardToken);
          await mineBlocks(10);
          await expect(boostPool.connect(Alice).claim()).to.be.revertedWith("pool has no enough rewards")
        })

        context("it claims reward successfully", () => {
          let unclaimAliceRewardBefore;
          let unclaimBobRewardBefore;
          let poolTokenBefore;

          beforeEach(async () => {
            unclaimAliceRewardBefore = await boostPool.getStakeTotalUnclaimed(await Alice.getAddress());
            unclaimBobRewardBefore = await boostPool.getStakeTotalUnclaimed(await Bob.getAddress());
            poolTokenBefore = await token.balanceOf(boostPool.address);
            AliceTokenBefore = await token.balanceOf(await Alice.getAddress());
            await boostPool.connect(Alice).claim();
          });

          it("it reverts if user claims again", () => {
            expect(boostPool.connect(Alice).claim()
            ).revertedWith("not in the claim period!");
          })

          it("check the balance of user after user claims the reward", async () => {
            let totalDeposited = depositAmount.add(BobDepositAmount);
            let unclaimAliceAmount = unclaimAliceRewardBefore.add(rewardRate.mul(depositAmount).div(totalDeposited));
            expect(await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).equal(0);
            expect(await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).equal(unclaimBobRewardBefore.add(rewardRate.mul(BobDepositAmount).div(totalDeposited)));
            expect(await token.balanceOf(boostPool.address)).equal(poolTokenBefore.sub(unclaimAliceAmount));
            expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(depositAmount).add(unclaimAliceAmount));
          })

          it("claim period should be reset", async () => {
            let period = await boostPool.getUserClaimPeriod(await Alice.getAddress());
            expect(period.claimStart).equal(0);
            expect(period.claimEnd).equal(0);
          })
        });
      });

      context("after claim period", () => {
        let claimPeriodBefore;

        beforeEach(async () => {
          await timeFly(6 * 86400 + 1);
          claimPeriodBefore = await boostPool.getUserClaimPeriod(await Alice.getAddress());
        });

        it("it reverts if users claim the reward", () => {
          expect(boostPool.connect(Alice).claim()
          ).revertedWith("not in the claim period!");
        });

        it("user can claim reward immediately", async () => {
          await boostPool.connect(Alice).claimImmediately();
          let period = await boostPool.getUserClaimPeriod(await Alice.getAddress());
          expect(period.claimStart).equal(claimPeriodBefore.claimStart);
          expect(period.claimEnd).equal(claimPeriodBefore.claimEnd);
        });

        it("user can start cooldown again", async () => {
          await boostPool.connect(Alice).startCoolDown();
          let blockNumber = await ethers.provider.getBlockNumber();
          let block = await ethers.provider.getBlock(blockNumber);
          let period = await boostPool.getUserClaimPeriod(await Alice.getAddress());
          let coolDownPeriod = (await boostPool.cooldownPeriod()).toNumber();
          let claimPeriod = (await boostPool.CLAIM_PERIOD()).toNumber();
          expect(period.claimStart).equal(block.timestamp + coolDownPeriod);
          expect(period.claimEnd).equal(block.timestamp + coolDownPeriod + claimPeriod);
        })
      });
    });
  });

  context("donate rewards", () => {
    let deployer;
    let governance;
    let Alice;
    let Bob;
    let Peter;
    let token;
    let boostPool;
    let mintToken = parseEther('1000');
    let depositAmount = parseEther('500');
    let BobDepositAmount = parseEther('300');
    let donateAmount = parseEther('100');

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, Peter, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));
      boostPool = await BoostPoolFactory.connect(deployer).deploy(
        token.address,
        token.address,
        governance.getAddress()
      );
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(deployer).mint(Bob.getAddress(), mintToken);
      await token.connect(deployer).mint(Peter.getAddress(), mintToken);
      await token.connect(Alice).approve(boostPool.address, MAXIMUM_U256);
      await token.connect(Bob).approve(boostPool.address, MAXIMUM_U256);
      await token.connect(Peter).approve(boostPool.address, MAXIMUM_U256);
      await boostPool.connect(Alice).deposit(depositAmount);
      await boostPool.connect(Bob).deposit(BobDepositAmount);
    });

    it("it reverts if user donates too much", () => {
      expect(boostPool.connect(Peter).donateReward(mintToken.add(1))
      ).revertedWith("");
    });

    it("user donates successfully", async () => {
      let PeterTokenBefore = await token.balanceOf(await Peter.getAddress());
      let PoolTokenBefore = await token.balanceOf(boostPool.address);
      let AliceUnclaimBefore = await boostPool.getStakeTotalUnclaimed(await Alice.getAddress());
      let BobUnclaimBefore = await boostPool.getStakeTotalUnclaimed(await Bob.getAddress());
      let totalDeposited = depositAmount.add(BobDepositAmount);
      await boostPool.connect(Peter).donateReward(donateAmount);
      expect(await token.balanceOf(await Peter.getAddress())).equal(PeterTokenBefore.sub(donateAmount));
      expect(await token.balanceOf(boostPool.address)).equal(PoolTokenBefore.add(donateAmount));
      expect(await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).equal(AliceUnclaimBefore.add(donateAmount.mul(depositAmount).div(totalDeposited)));
      expect(await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).equal(BobUnclaimBefore.add(donateAmount.mul(BobDepositAmount).div(totalDeposited)));
    })
  });
});