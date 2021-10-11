const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils } = require('ethers');
const { parseEther } = utils;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAXIMUM_U256 = BigNumber.from(1).shl(255);

const mineBlocks = async (numberBlocks) => {
  for (let i = 0; i < numberBlocks; i++) {
    await ethers.provider.send('evm_mine', []);
  }
}

describe("StakingPoolsWithTransfer", () => {
  before(async () => {
    ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    StakingPoolsFactory = await ethers.getContractFactory("StakingPoolsWithTransfer");
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
  });

  describe("constructor", () => {
    let deployer;
    let governance;
    let token, reward;

    beforeEach(async () => {
      [deployer, governance, ...signers] = signers;

      reward = (await ERC20MockFactory.connect(deployer).deploy(
        "NAOS Token",
        "NAOS",
        18
      ));
    });

    it("it reverts if reward is zero address", async () => {
      await expect(
        StakingPoolsFactory.connect(deployer).deploy(
          ZERO_ADDRESS,
          governance.getAddress()
        )
      ).to.be.revertedWith("StakingPools: reward address cannot be 0x0");
    });

    it("it reverts if governance is zero address", async () => {
      await expect(
        StakingPoolsFactory.connect(deployer).deploy(
          reward.address,
          ZERO_ADDRESS
        )
      ).to.be.revertedWith("StakingPools: governance address cannot be 0x0");
    });

    it("it deploys suceesfully when parameters are correct", async () => {
      const StakingPools = await StakingPoolsFactory.connect(deployer).deploy(
        reward.address,
        governance.getAddress()
      );
      expect(await StakingPools.reward()).equal(reward.address);
      expect(await StakingPools.governance()).equal(await governance.getAddress());
    });
  });

  describe("set parameters", () => {
    let deployer, governance, pendingGovernance;
    let token, reward;
    let stakingPools;

    beforeEach(async () => {
      [deployer, governance, pendingGovernance, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));

      reward = (await ERC20MockFactory.connect(deployer).deploy(
        "NAOS Token",
        "NAOS",
        18
      ));

      stakingPools = await StakingPoolsFactory.connect(deployer).deploy(
        reward.address,
        governance.getAddress()
      );
    });

    context("set governance", () => {
      it("it reverts if the sender is not governance", async () => {
        await expect(
          stakingPools.connect(deployer).setPendingGovernance(
            pendingGovernance.getAddress()
          )
        ).to.be.revertedWith("StakingPools: only governance");
      });

      context("when sender is current governance", () => {
        beforeEach(() => {
          stakingPools = stakingPools.connect(governance);
        });

        it("it reverts if pending governance is zero address", async () => {
          await expect(
            stakingPools.setPendingGovernance(
              ZERO_ADDRESS
            )
          ).to.be.revertedWith("StakingPools: pending governance address cannot be 0x0");
        });

        it("it reverts if the accepter is not the pending governance", async () => {
          await stakingPools.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          await expect(stakingPools.connect(deployer).acceptGovernance()
          ).to.be.revertedWith("StakingPools: only pending governance");
        });

        it("it changes governance successfully", async () => {
          await stakingPools.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          await stakingPools.connect(pendingGovernance).acceptGovernance();
          expect(await stakingPools.governance()).equal(await pendingGovernance.getAddress());
        });

        it("it emits GovernanceUpdated event", async () => {
          await stakingPools.setPendingGovernance(
            pendingGovernance.getAddress()
          );
          expect(stakingPools.connect(pendingGovernance).acceptGovernance())
            .emit(stakingPools, "GovernanceUpdated")
            .withArgs(await pendingGovernance.getAddress());
        });
      });
    });

    context("create pools", () => {
      it("it reverts if the sender is not the governance", async () => {
        await expect(stakingPools.connect(deployer).createPool(token.address)
        ).to.be.revertedWith("StakingPools: only governance");
      })

      context("when sender is current governance", () => {
        beforeEach(() => {
          stakingPools = stakingPools.connect(governance);
        })

        it("it reverts if the token address is zero address", async () => {
          await expect(stakingPools.createPool(ZERO_ADDRESS)
          ).to.be.revertedWith("StakingPools: token address cannot be 0x0");
        });

        context("it creates pool successfully", () => {
          beforeEach(async () => {
            await stakingPools.createPool(token.address);
          });

          it("it checks the pool token is correct", async () => {
            expect(await stakingPools.getPoolToken(0)).equal(token.address);
          });

          it("it reverts if add the same tokens again", async () => {
            await expect(stakingPools.createPool(token.address)
            ).to.be.revertedWith("StakingPools: token already has a pool");
          });

          context("set reward weights", () => {
            beforeEach(async () => {
              await stakingPools.createPool(reward.address);
            });

            it("it reverts if the sender is not the governance", async () => {
              await expect(stakingPools.connect(deployer).setRewardWeights([1, 4])
              ).to.be.revertedWith("StakingPools: only governance");
            });

            it("it reverts if weights length mismatch", async () => {
              await expect(stakingPools.setRewardWeights([1])
              ).to.be.revertedWith("StakingPools: weights length mismatch");
              await expect(stakingPools.setRewardWeights([1, 4, 5])
              ).to.be.revertedWith("StakingPools: weights length mismatch");
            });

            it("it sets reward weights successfully", async () => {
              await stakingPools.setRewardWeights([1, 4]);
              expect(await stakingPools.getPoolRewardWeight(0)).equal(1);
              expect(await stakingPools.getPoolRewardWeight(1)).equal(4);
            });
          });

          context("set reward rate", () => {
            beforeEach(async () => {
              await stakingPools.createPool(reward.address);
            });

            it("it reverts if the sender is not governance", async () => {
              await expect(stakingPools.connect(deployer).setRewardRate(100)
              ).to.be.revertedWith("StakingPools: only governance");
            });

            it("it sets reward rates successfully", async () => {
              await stakingPools.setRewardRate(100);
              expect(await stakingPools.rewardRate()).equal(100);
              await stakingPools.setRewardWeights([1, 4]);
              expect(await stakingPools.getPoolRewardRate(0)).equal(20);
              expect(await stakingPools.getPoolRewardRate(1)).equal(80);
            });
          });
        });
      });
    });
  });

  describe("deposit tokens", () => {
    let deployer, governance;
    let Alice, Bob;
    let token, reward;
    let stakingPools;
    let mintToken = parseEther('1000');
    let AliceDepositAmount = parseEther('500');
    let BobDepositAmount = parseEther('300');

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));

      reward = (await ERC20MockFactory.connect(deployer).deploy(
        "NAOS Token",
        "NAOS",
        18
      ));
      stakingPools = await StakingPoolsFactory.connect(deployer).deploy(
        reward.address,
        governance.getAddress()
      );
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(deployer).mint(Bob.getAddress(), mintToken);
      await token.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await token.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(deployer).mint(Alice.getAddress(), mintToken);
      await reward.connect(deployer).mint(Bob.getAddress(), mintToken);
      await reward.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await stakingPools.connect(governance).createPool(token.address);
      await stakingPools.connect(governance).createPool(reward.address);
      await stakingPools.connect(governance).setRewardWeights([1, 4]);

      await stakingPools.connect(Alice).deposit(0, AliceDepositAmount);
      await stakingPools.connect(Alice).deposit(1, AliceDepositAmount);
    });

    it("it increases total deposited amount", async () => {
      expect(await stakingPools.getPoolTotalDeposited(0)).equal(AliceDepositAmount);
      expect(await stakingPools.getPoolTotalDeposited(1)).equal(AliceDepositAmount);
    });

    it("it increases deposited amount", async () => {
      expect(await stakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(AliceDepositAmount);
      expect(await stakingPools.getStakeTotalDeposited(await Alice.getAddress(), 1)).equal(AliceDepositAmount);
      expect(await token.balanceOf(stakingPools.address)).equal(AliceDepositAmount);
      expect(await reward.balanceOf(stakingPools.address)).equal(AliceDepositAmount);
    });

    it("it reduces user's token", async () => {
      expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(AliceDepositAmount));
      expect(await reward.balanceOf(await Alice.getAddress())).equal(mintToken.sub(AliceDepositAmount));
    });

    context("deposit again", () => {
      beforeEach(async () => {
        await stakingPools.connect(Alice).deposit(0, AliceDepositAmount);
        await stakingPools.connect(Bob).deposit(1, BobDepositAmount);
      });

      it("it increases total deposited amount", async () => {
        expect(await stakingPools.getPoolTotalDeposited(0)).equal(AliceDepositAmount.add(AliceDepositAmount));
        expect(await stakingPools.getPoolTotalDeposited(1)).equal(AliceDepositAmount.add(BobDepositAmount));
        expect(await token.balanceOf(stakingPools.address)).equal(AliceDepositAmount.add(AliceDepositAmount));
        expect(await reward.balanceOf(stakingPools.address)).equal(AliceDepositAmount.add(BobDepositAmount));
      });

      it("it increases deposited amount", async () => {
        expect(await stakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(AliceDepositAmount.add(AliceDepositAmount));
        expect(await stakingPools.getStakeTotalDeposited(await Alice.getAddress(), 1)).equal(AliceDepositAmount);
        expect(await stakingPools.getStakeTotalDeposited(await Bob.getAddress(), 0)).equal(0);
        expect(await stakingPools.getStakeTotalDeposited(await Bob.getAddress(), 1)).equal(BobDepositAmount);
      });

      it("it reduces user's token", async () => {
        expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken.sub(AliceDepositAmount).sub(AliceDepositAmount));
        expect(await reward.balanceOf(await Alice.getAddress())).equal(mintToken.sub(AliceDepositAmount));
        expect(await token.balanceOf(await Bob.getAddress())).equal(mintToken);
        expect(await reward.balanceOf(await Bob.getAddress())).equal(mintToken.sub(BobDepositAmount));
      });
    });
  });

  describe("withdraw tokens", () => {
    let deployer, governance;
    let Alice, Bob;
    let token, reward;
    let stakingPools;
    let mintToken = parseEther('1000');
    let AliceDepositAmount = parseEther('500');
    let BobDepositAmount = parseEther('800');

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));

      reward = (await ERC20MockFactory.connect(deployer).deploy(
        "NAOS Token",
        "NAOS",
        18
      ));
      stakingPools = await StakingPoolsFactory.connect(deployer).deploy(
        reward.address,
        governance.getAddress()
      );
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(deployer).mint(Bob.getAddress(), mintToken);
      await token.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await token.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(deployer).mint(Alice.getAddress(), mintToken);
      await reward.connect(deployer).mint(Bob.getAddress(), mintToken);
      await reward.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await stakingPools.connect(governance).createPool(token.address);
      await stakingPools.connect(governance).createPool(reward.address);
      await stakingPools.connect(governance).setRewardWeights([1, 4]);

      await stakingPools.connect(Alice).deposit(0, AliceDepositAmount);
      await stakingPools.connect(Alice).deposit(1, AliceDepositAmount);
      await stakingPools.connect(Bob).deposit(0, BobDepositAmount);
      await stakingPools.connect(Bob).deposit(1, BobDepositAmount);
    });

    it("it reverts if withdraw too many money", async () => {
      await expect(stakingPools.connect(Alice).withdraw(0, AliceDepositAmount.add(1))
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    context("it withdraws successfully", () => {
      beforeEach(async () => {
        await stakingPools.connect(Alice).withdraw(0, AliceDepositAmount);
        await stakingPools.connect(Bob).withdraw(1, AliceDepositAmount);
      });


      it("it reduces total deposited amount", async () => {
        expect(await stakingPools.getPoolTotalDeposited(0)).equal(BobDepositAmount);
        expect(await stakingPools.getPoolTotalDeposited(1)).equal(BobDepositAmount);
        expect(await token.balanceOf(stakingPools.address)).equal(BobDepositAmount);
        expect(await reward.balanceOf(stakingPools.address)).equal(BobDepositAmount);
      });

      it("it reduces deposited amount", async () => {
        expect(await stakingPools.getStakeTotalDeposited(await Alice.getAddress(), 0)).equal(0);
        expect(await stakingPools.getStakeTotalDeposited(await Alice.getAddress(), 1)).equal(AliceDepositAmount);
        expect(await stakingPools.getStakeTotalDeposited(await Bob.getAddress(), 0)).equal(BobDepositAmount);
        expect(await stakingPools.getStakeTotalDeposited(await Bob.getAddress(), 1)).equal(BobDepositAmount.sub(AliceDepositAmount));

      });

      it("it increases user's token", async () => {
        expect(await token.balanceOf(await Alice.getAddress())).equal(mintToken);
        expect(await reward.balanceOf(await Alice.getAddress())).equal(mintToken.sub(AliceDepositAmount));
        expect(await token.balanceOf(await Bob.getAddress())).equal(mintToken.sub(BobDepositAmount));
        expect(await reward.balanceOf(await Bob.getAddress())).equal(mintToken.sub(BobDepositAmount).add(AliceDepositAmount));
      });
    })
  });

  describe("claim rewards", () => {
    let deployer, governance;
    let Alice, Bob;
    let token, reward;
    let stakingPools;
    let mintToken = parseEther('2000');
    let AliceDepositAmount = parseEther('500');
    let BobDepositAmount = parseEther('1500');
    let rewardRate = parseEther('1');

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));

      reward = (await ERC20MockFactory.connect(deployer).deploy(
        "NAOS Token",
        "NAOS",
        18
      ));
      stakingPools = await StakingPoolsFactory.connect(deployer).deploy(
        reward.address,
        governance.getAddress()
      );
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(deployer).mint(Bob.getAddress(), mintToken);
      await token.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await token.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(deployer).mint(Alice.getAddress(), mintToken);
      await reward.connect(deployer).mint(Bob.getAddress(), mintToken);
      await reward.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await stakingPools.connect(governance).createPool(token.address);
      await stakingPools.connect(governance).createPool(reward.address);
      await stakingPools.connect(governance).setRewardWeights([1, 4]);

      await stakingPools.connect(Alice).deposit(0, AliceDepositAmount);
      await stakingPools.connect(Alice).deposit(1, AliceDepositAmount);
      await stakingPools.connect(Bob).deposit(0, BobDepositAmount);
      await stakingPools.connect(Bob).deposit(1, BobDepositAmount);
      await stakingPools.connect(governance).setRewardRate(rewardRate);
      await mineBlocks(10);
    });

    it("user's reward matches the reward rate", async () => {
      let totalDeposited = AliceDepositAmount.add(BobDepositAmount);
      let AlicePool0Reward = rewardRate.div(5).mul(10).mul(AliceDepositAmount).div(totalDeposited);
      let AlicePool1Reward = rewardRate.mul(4).div(5).mul(10).mul(AliceDepositAmount).div(totalDeposited);
      let BobPool0Reward = rewardRate.div(5).mul(10).mul(BobDepositAmount).div(totalDeposited);
      let BobPool1Reward = rewardRate.mul(4).div(5).mul(10).mul(BobDepositAmount).div(totalDeposited);
      expect(await stakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 0)).equal(AlicePool0Reward);
      expect(await stakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 1)).equal(AlicePool1Reward);
      expect(await stakingPools.getStakeTotalUnclaimed(await Bob.getAddress(), 0)).equal(BobPool0Reward);
      expect(await stakingPools.getStakeTotalUnclaimed(await Bob.getAddress(), 1)).equal(BobPool1Reward);
    });

    it("it claims the rewards successfully", async () => {
      await reward.mint(stakingPools.address, mintToken);
      let AlicePool0Reward = await stakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 0);
      let AliceRewardAmount = await reward.balanceOf(Alice.getAddress());
      let stakingPoolTokenBefore = await reward.balanceOf(stakingPools.address);
      await stakingPools.connect(Alice).claim(0);
      AlicePool0Reward = AlicePool0Reward.add(rewardRate.div(5).mul(AliceDepositAmount).div(AliceDepositAmount.add(BobDepositAmount)));
      expect(await reward.balanceOf(Alice.getAddress())).equal(AliceRewardAmount.add(AlicePool0Reward));
      expect(await reward.balanceOf(stakingPools.address)).equal(stakingPoolTokenBefore.sub(AlicePool0Reward));
    });

    it("it withdraws and claims the rewards", async () => {
      await reward.mint(stakingPools.address, mintToken);
      let BobPool1Reward = await stakingPools.getStakeTotalUnclaimed(await Bob.getAddress(), 1);
      let BobRewardAmount = await reward.balanceOf(Bob.getAddress());
      let stakingPoolTokenBefore = await reward.balanceOf(stakingPools.address);
      await stakingPools.connect(Bob).withdraw(1, BobDepositAmount);
      BobPool1Reward = BobPool1Reward.add(rewardRate.mul(4).div(5).mul(BobDepositAmount).div(AliceDepositAmount.add(BobDepositAmount)));
      expect(await reward.balanceOf(Bob.getAddress())).equal(BobRewardAmount.add(BobPool1Reward).add(BobDepositAmount));
      expect(await reward.balanceOf(stakingPools.address)).equal(stakingPoolTokenBefore.sub(BobDepositAmount).sub(BobPool1Reward));
    });

    it("it exits and claims the rewards", async () => {
      await reward.mint(stakingPools.address, mintToken);
      let AlicePool1Reward = await stakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 1);
      let AliceRewardAmount = await reward.balanceOf(Alice.getAddress());
      let stakingPoolTokenBefore = await reward.balanceOf(stakingPools.address);
      await stakingPools.connect(Alice).exit(1);
      AlicePool1Reward = AlicePool1Reward.add(rewardRate.mul(4).div(5).mul(AliceDepositAmount).div(AliceDepositAmount.add(BobDepositAmount)));
      expect(await reward.balanceOf(Alice.getAddress())).equal(AliceRewardAmount.add(AlicePool1Reward).add(AliceDepositAmount));
      expect(await reward.balanceOf(stakingPools.address)).equal(stakingPoolTokenBefore.sub(AlicePool1Reward).sub(AliceDepositAmount));
    });
  });

  describe("donate rewards", () => {
    let deployer, governance;
    let Alice, Bob;
    let token, reward;
    let stakingPools;
    let mintToken = parseEther('2000');
    let AliceDepositAmount = parseEther('500');
    let BobDepositAmount = parseEther('1500');

    beforeEach(async () => {
      [deployer, governance, Alice, Bob, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Mock DAI",
        "DAI",
        18
      ));

      reward = (await ERC20MockFactory.connect(deployer).deploy(
        "NAOS Token",
        "NAOS",
        18
      ));
      stakingPools = await StakingPoolsFactory.connect(deployer).deploy(
        reward.address,
        governance.getAddress()
      );
      await token.connect(deployer).mint(Alice.getAddress(), mintToken);
      await token.connect(deployer).mint(Bob.getAddress(), mintToken);
      await token.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await token.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(deployer).mint(Alice.getAddress(), mintToken);
      await reward.connect(deployer).mint(Bob.getAddress(), mintToken);
      await reward.connect(deployer).mint(deployer.getAddress(), mintToken);
      await reward.connect(Alice).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(Bob).approve(stakingPools.address, MAXIMUM_U256);
      await reward.connect(deployer).approve(stakingPools.address, MAXIMUM_U256);
      await stakingPools.connect(governance).createPool(token.address);
      await stakingPools.connect(governance).createPool(reward.address);
      await stakingPools.connect(governance).setRewardWeights([1, 4]);

      await stakingPools.connect(Alice).deposit(0, AliceDepositAmount);
      await stakingPools.connect(Alice).deposit(1, AliceDepositAmount);
      await stakingPools.connect(Bob).deposit(0, BobDepositAmount);
      await stakingPools.connect(Bob).deposit(1, BobDepositAmount);
    });

    it("it reverts if user donates too much", async () => {
      await expect(stakingPools.connect(governance).donateReward(0, mintToken.add(1))
      ).to.be.revertedWith("");
    });

    it("user donates successfully", async () => {
      let DeployerRewardBefore = await reward.balanceOf(await deployer.getAddress());
      let PoolTokenBefore = await reward.balanceOf(stakingPools.address);
      let totalDeposited = AliceDepositAmount.add(BobDepositAmount);
      await stakingPools.connect(deployer).donateReward(0, AliceDepositAmount);
      expect(await reward.balanceOf(await deployer.getAddress())).equal(DeployerRewardBefore.sub(AliceDepositAmount));
      expect(await reward.balanceOf(stakingPools.address)).equal(PoolTokenBefore.add(AliceDepositAmount));
      expect(await stakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 0)).equal(AliceDepositAmount.mul(AliceDepositAmount).div(totalDeposited));
      expect(await stakingPools.getStakeTotalUnclaimed(await Bob.getAddress(), 0)).equal(AliceDepositAmount.mul(BobDepositAmount).div(totalDeposited));
      await stakingPools.connect(deployer).donateReward(1, BobDepositAmount);
      expect(await reward.balanceOf(await deployer.getAddress())).equal(DeployerRewardBefore.sub(AliceDepositAmount).sub(BobDepositAmount));
      expect(await reward.balanceOf(stakingPools.address)).equal(PoolTokenBefore.add(AliceDepositAmount).add(BobDepositAmount));
      expect(await stakingPools.getStakeTotalUnclaimed(await Alice.getAddress(), 1)).equal(BobDepositAmount.mul(AliceDepositAmount).div(totalDeposited));
      expect(await stakingPools.getStakeTotalUnclaimed(await Bob.getAddress(), 1)).equal(BobDepositAmount.mul(BobDepositAmount).div(totalDeposited));
    });
  });
});