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
      expect(await boostPool.cooldownPeriod()).equal(86400 * 7);
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

    context("create lock time weighted list", () => {
      let lockTime0 = 3600;
      let lockTime1 = 7200;
      let weighted0 = 1;
      let weighted1 = 2;

      it("it reverts if the sender is not governance", () => {
        expect(
          boostPool.connect(deployer).setLockTimeWeighted(
            lockTime0, weighted0
          )
        ).revertedWith("BoostPool: only governance");
      });

      context("when sender is current governance", () => {
        beforeEach(() => {
          boostPool = boostPool.connect(governance);
        });

        it("it creates the pools successfully", async () => {
          await boostPool.setLockTimeWeighted(lockTime0, weighted0);
          expect(await boostPool.getLockTimeWeightedListLength()).equal(1);
          await boostPool.setLockTimeWeighted(lockTime1, weighted1);
          expect(await boostPool.getLockTimeWeightedListLength()).equal(2);
          let lockTimeWeighted = await boostPool.getLockTimeWeightedByIndex(0);
          expect(lockTimeWeighted.lockTime).equal(lockTime0);
          expect(lockTimeWeighted.weighted).equal(weighted0);
          lockTimeWeighted = await boostPool.getLockTimeWeightedByIndex(1);
          expect(lockTimeWeighted.lockTime).equal(lockTime1);
          expect(lockTimeWeighted.weighted).equal(weighted1);
        })
      });
    })
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
    let lockTime0 = 3600;
    let lockTime1 = 7200;
    let weighted0 = 2;
    let weighted1 = 4;

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
      await boostPool.connect(governance).setLockTimeWeighted(lockTime0, weighted0);
      await boostPool.connect(governance).setLockTimeWeighted(lockTime1, weighted1);
      await boostPool.connect(Alice).deposit(depositAmount, 0);
    });

    it("it increases total deposited amount", async () => {
      expect(await boostPool.getPoolTotalDeposited()).equal(depositAmount);
      expect(await boostPool.getPoolTotalDepositedWeight()).equal(depositAmount.mul(weighted0));
    });

    it("it increases deposited amount", async () => {
      expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(depositAmount);
      expect(await boostPool.getStakeTotalDepositedWeight(await Alice.getAddress())).equal(depositAmount.mul(weighted0));

    });

    it("it generate a user's deposited order", async () => {
      let blockNumber = await ethers.provider.getBlockNumber();
      let block = await ethers.provider.getBlock(blockNumber);
      expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(1);
      const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
      expect(userDepositedOrder.amount).equal(depositAmount);
      expect(userDepositedOrder.expiredTime).equal(block.timestamp + lockTime0);
      expect(userDepositedOrder.weighted).equal(weighted0);
      expect(userDepositedOrder.isWithdraw).equal(false);
    });

    it("it reduces user's token", async () => {
      expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(depositAmount));
      expect(await token.balanceOf(await boostPool.address)).equal(depositAmount);
    });

    context("deposit again", () => {
      beforeEach(async () => {
        await boostPool.connect(Alice).deposit(secondDepositAmount, 1);
      });

      it("it increases total deposited amount", async () => {
        expect(await boostPool.getPoolTotalDeposited()).equal(depositAmount.add(secondDepositAmount));
        expect(await boostPool.getPoolTotalDepositedWeight()).equal(depositAmount.mul(weighted0).add(secondDepositAmount.mul(weighted1)));
      });

      it("it increases deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(depositAmount.add(secondDepositAmount));
        expect(await boostPool.getStakeTotalDepositedWeight(await Alice.getAddress())).equal(depositAmount.mul(weighted0).add(secondDepositAmount.mul(weighted1)));
      });

      it("it generate a user's deposited order", async () => {
        let blockNumber = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNumber);
        expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(2);
        const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 1);
        expect(userDepositedOrder.amount).equal(secondDepositAmount);
        expect(userDepositedOrder.expiredTime).equal(block.timestamp + lockTime1);
        expect(userDepositedOrder.weighted).equal(weighted1);
        expect(userDepositedOrder.isWithdraw).equal(false);
      });

      it("it reduces user's token", async () => {
        expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(depositAmount).sub(secondDepositAmount));
        expect(await token.balanceOf(await boostPool.address)).equal(depositAmount.add(secondDepositAmount));
      });
    })

    context("another user deposits", () => {
      beforeEach(async () => {
        await boostPool.connect(Bob).deposit(BobDepositAmount, 1);
      });

      it("check origin user information", async () => {
        let blockNumber = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNumber - 1);
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(depositAmount);
        expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(1);
        const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
        expect(userDepositedOrder.amount).equal(depositAmount);
        expect(userDepositedOrder.expiredTime).equal(block.timestamp + lockTime0);
        expect(userDepositedOrder.weighted).equal(weighted0);
        expect(userDepositedOrder.isWithdraw).equal(false);
      });

      it("it increases total deposited amount", async () => {
        expect(await boostPool.getPoolTotalDeposited()).equal(depositAmount.add(BobDepositAmount));
        expect(await boostPool.getPoolTotalDepositedWeight()).equal(depositAmount.mul(weighted0).add(BobDepositAmount.mul(weighted1)));
      });

      it("it increases deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Bob.getAddress())).equal(BobDepositAmount);
        expect(await boostPool.getStakeTotalDepositedWeight(await Bob.getAddress())).equal(BobDepositAmount.mul(weighted1));
      });

      it("it generate a user's deposited order", async () => {
        let blockNumber = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNumber);
        expect(await boostPool.getUserOrderCount(await Bob.getAddress())).equal(1);
        const userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Bob.getAddress(), 0);
        expect(userDepositedOrder.amount).equal(BobDepositAmount);
        expect(userDepositedOrder.expiredTime).equal(block.timestamp + lockTime1);
        expect(userDepositedOrder.weighted).equal(weighted1);
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
    let lockTime0 = 90 * 86400;
    let lockTime1 = 365 * 86400;
    let weighted0 = 2;
    let weighted1 = 4;

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
      await boostPool.connect(governance).setLockTimeWeighted(lockTime0, weighted0);
      await boostPool.connect(governance).setLockTimeWeighted(lockTime1, weighted1);
      await boostPool.connect(Alice).deposit(depositAmount, 0);
      await boostPool.connect(Alice).deposit(secondDepositAmount, 1);
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
      await timeFly(lockTime0 + 1);
      await boostPool.connect(Alice).deposit(thirdDepositAmount, 1);
      expect(boostPool.connect(Alice).withdraw([0, 2])
      ).revertedWith("The lock time is not expired!");
    });

    context("it withdraws successfully", () => {
      beforeEach(async () => {
        await timeFly(lockTime0 + 1);
        await boostPool.connect(Alice).withdraw([0]);
      });

      it("it reverts if the deposited order has been withdrew", () => {
        expect(boostPool.connect(Alice).withdraw([0]))
          .revertedWith("The order has been withdrew");
      });

      it("it reduces total deposited amount", async () => {
        expect(await boostPool.getPoolTotalDeposited()).equal(secondDepositAmount);
        expect(await boostPool.getPoolTotalDepositedWeight()).equal(secondDepositAmount.mul(weighted1));
      });

      it("it reduces deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(secondDepositAmount);
        expect(await boostPool.getStakeTotalDepositedWeight(await Alice.getAddress())).equal(secondDepositAmount.mul(weighted1));
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
        await boostPool.connect(Alice).deposit(thirdDepositAmount, 1);
        await timeFly(lockTime1 + 1);
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
        expect(await boostPool.getPoolTotalDepositedWeight()).equal(secondDepositAmount.mul(weighted1));
      });

      it("it reduces deposited amount", async () => {
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(secondDepositAmount);
        expect(await boostPool.getStakeTotalDepositedWeight(await Alice.getAddress())).equal(secondDepositAmount.mul(weighted1));
      });

      it("it updates a user's deposited order", async () => {
        let userDepositedOrder;
        expect(await boostPool.getUserOrderCount(await Alice.getAddress())).equal(3);
        userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 0);
        expect(userDepositedOrder.isWithdraw).equal(true);
        userDepositedOrder = await boostPool.getUserDepositOrderByIndex(await Alice.getAddress(), 2);
        expect(userDepositedOrder.isWithdraw).equal(true);
      });

      it("it increases user's token", async () => {
        expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(secondDepositAmount));
        expect(await token.balanceOf(await boostPool.address)).equal(secondDepositAmount);
      });

      it("it can withdraw remaining order", async () => {
        await boostPool.connect(Alice).withdraw([1]);
        expect(await boostPool.getPoolTotalDeposited()).equal(0);
        expect(await boostPool.getPoolTotalDepositedWeight()).equal(0);
        expect(await boostPool.getStakeTotalDeposited(await Alice.getAddress())).equal(0);
        expect(await boostPool.getStakeTotalDepositedWeight(await Alice.getAddress())).equal(0);
      });
    });
  });

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
    let lockTime0 = 90 * 86400;
    let lockTime1 = 365 * 86400;
    let weighted0 = 2;
    let weighted1 = 4;
    let tolerance = 1000;

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
      await boostPool.connect(governance).setLockTimeWeighted(lockTime0, weighted0);
      await boostPool.connect(governance).setLockTimeWeighted(lockTime1, weighted1);
      await boostPool.connect(Alice).deposit(depositAmount, 0);
      await boostPool.connect(Bob).deposit(BobDepositAmount, 1);
      await mineBlocks(10);
    });

    it("user's reward matches the reward rate", async () => {
      let totalDepositedWeight = await boostPool.getPoolTotalDepositedWeight();
      expect(totalDepositedWeight).equal(depositAmount.mul(weighted0).add(BobDepositAmount.mul(weighted1)));
      let AliceReward = rewardRate.add(rewardRate.mul(10).mul(depositAmount.mul(weighted0)).div(totalDepositedWeight));
      let BobReward = rewardRate.mul(10).mul(BobDepositAmount.mul(weighted1)).div(totalDepositedWeight);
      expect((await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).sub(AliceReward).abs()).to.be.at.most(tolerance);
      expect((await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).sub(BobReward).abs()).to.be.at.most(tolerance);
      expect((await boostPool.getStakeTotalUnclaimedImmediately(await Alice.getAddress())).sub(AliceReward.mul(await boostPool.penaltyPercent()).div(100)).abs()).to.be.at.most(tolerance);
      expect((await boostPool.getStakeTotalUnclaimedImmediately(await Bob.getAddress())).sub(BobReward.mul(await boostPool.penaltyPercent()).div(100)).abs()).to.be.at.most(tolerance);
    });

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
          let totalDepositedWeight = await boostPool.getPoolTotalDepositedWeight();
          let unclaimAliceAmount = unclaimAliceRewardBefore.add(rewardRate.mul(depositAmount.mul(weighted0)).div(totalDepositedWeight));
          let unclaimBobAmount = unclaimBobRewardBefore.add(rewardRate.mul(BobDepositAmount.mul(weighted1)).div(totalDepositedWeight));
          let penalty = unclaimAliceAmount.mul(await boostPool.penaltyPercent()).div(100);
          expect((await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).sub(penalty.mul(depositAmount.mul(weighted0)).div(totalDepositedWeight)).abs()).to.be.at.most(tolerance);
          expect((await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).sub(unclaimBobAmount.add(penalty.mul(BobDepositAmount.mul(weighted1)).div(totalDepositedWeight))).abs()).to.be.at.most(tolerance);
          expect((await token.balanceOf(boostPool.address)).sub(poolTokenBefore.sub(unclaimAliceAmount.sub(penalty))).abs()).to.be.at.most(tolerance);
          expect((await token.balanceOf(await Alice.getAddress())).sub(AliceTokenBefore.add(unclaimAliceAmount.sub(penalty))).abs()).to.be.at.most(tolerance);
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
      });
    });

    context("claim reward after cooldown period is expired", () => {
      beforeEach(async () => {
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
          await timeFly(7 * 86400);
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
            let totalDepositedWeight = depositAmount.mul(weighted0).add(BobDepositAmount.mul(weighted1));
            let unclaimAliceAmount = unclaimAliceRewardBefore.add(rewardRate.mul(depositAmount.mul(weighted0)).div(totalDepositedWeight));
            expect(await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).equal(0);
            expect((await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).sub(unclaimBobRewardBefore.add(rewardRate.mul(BobDepositAmount.mul(weighted1)).div(totalDepositedWeight))).abs()).to.be.at.most(tolerance);
            expect((await token.balanceOf(boostPool.address)).sub(poolTokenBefore.sub(unclaimAliceAmount)).abs()).to.be.at.most(tolerance);
            expect((await token.balanceOf(await Alice.getAddress())).sub(mintToken.sub(depositAmount).add(unclaimAliceAmount)).abs()).to.be.at.most(tolerance);
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
          await timeFly(8 * 86400 + 1);
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
    let lockTime0 = 90 * 86400;
    let lockTime1 = 365 * 86400;
    let weighted0 = 2;
    let weighted1 = 4;
    let tolerance = 1000;

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
      await boostPool.connect(governance).setLockTimeWeighted(lockTime0, weighted0);
      await boostPool.connect(governance).setLockTimeWeighted(lockTime1, weighted1);
      await boostPool.connect(Alice).deposit(depositAmount, 0);
      await boostPool.connect(Bob).deposit(BobDepositAmount, 1);
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
      let totalDepositedWeight = depositAmount.mul(weighted0).add(BobDepositAmount.mul(weighted1));
      await boostPool.connect(Peter).donateReward(donateAmount);
      expect(await token.balanceOf(await Peter.getAddress())).equal(PeterTokenBefore.sub(donateAmount));
      expect(await token.balanceOf(boostPool.address)).equal(PoolTokenBefore.add(donateAmount));
      expect((await boostPool.getStakeTotalUnclaimed(await Alice.getAddress())).sub(AliceUnclaimBefore.add(donateAmount.mul(depositAmount.mul(weighted0)).div(totalDepositedWeight))).abs()).to.be.at.most(tolerance);
      expect((await boostPool.getStakeTotalUnclaimed(await Bob.getAddress())).sub(BobUnclaimBefore.add(donateAmount.mul(BobDepositAmount.mul(weighted1)).div(totalDepositedWeight))).abs()).to.be.at.most(tolerance);
    });
  });
});