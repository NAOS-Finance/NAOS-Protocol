const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils } = require('ethers');
const { parseEther } = utils;
const { ONE, MAXIMUM_U256, ZERO_ADDRESS, mineBlocks, timeFly } = require("./utils/utils");
const { parseUnits } = require("@ethersproject/units");
const { mnemonicToEntropy } = require("@ethersproject/hdnode");

let ERC20MockFactory, nUSDFactory;
let Transmuter, MockSwap, Adapter, YearnVault, YearnController;
let BetaInsurance, StakingPool;

describe("Beta Insurance Token", () => {
    before(async () => {
        ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
        NUSD = await ethers.getContractFactory("NToken");

        Transmuter = await ethers.getContractFactory("Transmuter");
        SwapMock = await ethers.getContractFactory("SwapMock");
        Adapter = await ethers.getContractFactory("contracts/Staking/adapters/YearnVaultAdapter.sol:YearnVaultAdapter");
        YearnVault = await ethers.getContractFactory("YearnVaultMock");
        YearnController = await ethers.getContractFactory("YearnControllerMock");

        BetaInsurance = await ethers.getContractFactory("BetaInsurance");
        StakingPool = await ethers.getContractFactory("StakingPoolsWithTransfer");
    });

    beforeEach(async () => {
        signers = await ethers.getSigners();
    });

    describe("Initialize", () => {
        let mock;
        let currency, token;
        let transmuter, betaInsurance;

        beforeEach(async () => {
            [deployer, mock, ...signers] = signers;
            mock = await mock.getAddress();
            betaInsurance = await BetaInsurance.deploy();
            currency = await ERC20MockFactory.deploy(
                "Mock DAI",
                "DAI",
                18
            );
            token = await NUSD.deploy();
            transmuter = await Transmuter.deploy(token.address, currency.address, mock);
        });

        it("it reverts if any address is zero address", async () => {
            await expect(betaInsurance.initialize(ZERO_ADDRESS, mock, mock, mock, mock, mock, mock, mock)).to.be.revertedWith("token cannot be 0x0");
            await expect(betaInsurance.initialize(mock, ZERO_ADDRESS, mock, mock, mock, mock, mock, mock)).to.be.revertedWith("currency cannot be 0x0");
            await expect(betaInsurance.initialize(mock, mock, ZERO_ADDRESS, mock, mock, mock, mock, mock)).to.be.revertedWith("NAOS Token cannot be 0x0");
            await expect(betaInsurance.initialize(mock, mock, mock, ZERO_ADDRESS, mock, mock, mock, mock)).to.be.revertedWith("WBNB cannot be 0x0");
            await expect(betaInsurance.initialize(mock, mock, mock, mock, ZERO_ADDRESS, mock, mock, mock)).to.be.revertedWith("swapRouter cannot be 0x0");
            await expect(betaInsurance.initialize(mock, mock, mock, mock, mock, ZERO_ADDRESS, mock, mock)).to.be.revertedWith("transmuter cannot be 0x0");
            await expect(betaInsurance.initialize(token.address, currency.address, mock, mock, mock, transmuter.address, ZERO_ADDRESS, mock)).to.be.revertedWith("governance cannot be 0x0");
            await expect(betaInsurance.initialize(token.address, currency.address, mock, mock, mock, transmuter.address, mock, ZERO_ADDRESS)).to.be.revertedWith("treasury cannot be 0x0");
        });

        it("it reverts if transmuter deployment is inconsistent", async () => {
            await expect(betaInsurance.initialize(token.address, token.address, mock, mock, mock, transmuter.address, mock, ZERO_ADDRESS)).to.be.revertedWith("");
            await expect(betaInsurance.initialize(currency.address, currency.address, mock, mock, mock, transmuter.address, mock, ZERO_ADDRESS)).to.be.revertedWith("");
        });

        it("it initials successfully", async () => {
            await betaInsurance.initialize(token.address, currency.address, mock, mock, mock, transmuter.address, mock, mock);
            expect(await betaInsurance.token()).equal(token.address);
            expect(await betaInsurance.currency()).equal(currency.address);
            expect(await betaInsurance.naos()).equal(mock);
            expect(await betaInsurance.wbnb()).equal(mock);
            expect(await betaInsurance.uniV2Router()).equal(mock);
            expect(await betaInsurance.transmuter()).equal(transmuter.address);
            expect(await betaInsurance.governance()).equal(mock);
            expect(await betaInsurance.treasury()).equal(mock);
        });
    });

    describe("set parameters", () => {
        let deployer, mock, governance, pendingGovernance;
        let currency, token;
        let transmuter, betaInsurance;

        beforeEach(async () => {
            [deployer, mock, governance, pendingGovernance, ...signers] = signers;
            mock = await mock.getAddress();
            betaInsurance = await BetaInsurance.deploy();
            currency = await ERC20MockFactory.deploy(
                "Mock DAI",
                "DAI",
                18
            );
            naos = await ERC20MockFactory.deploy(
                "NAOS Token",
                "NAOS",
                18
            );
            token = await NUSD.deploy();
            transmuter = await Transmuter.deploy(token.address, currency.address, mock);
            await betaInsurance.initialize(token.address, currency.address, naos.address, mock, mock, transmuter.address, governance.getAddress(), mock);
        });

        context("set governance", () => {
            it("it reverts if the sender is not governance", async () => {
                await expect(
                    betaInsurance.connect(deployer).setPendingGovernance(
                        pendingGovernance.getAddress()
                    )
                ).to.be.revertedWith("only governance.");
            });

            context("when sender is current governance", () => {
                beforeEach(() => {
                    betaInsurance = betaInsurance.connect(governance);
                });

                it("it reverts if pending governance is zero address", async () => {
                    await expect(
                        betaInsurance.setPendingGovernance(
                            ZERO_ADDRESS
                        )
                    ).to.be.revertedWith("0 gov");
                });

                it("it reverts if the accepter is not the pending governance", async () => {
                    await betaInsurance.setPendingGovernance(
                        pendingGovernance.getAddress()
                    );
                    await expect(betaInsurance.connect(deployer).acceptGovernance()
                    ).to.be.revertedWith("!pendingGovernance");
                });

                it("it changes governance successfully", async () => {
                    await betaInsurance.setPendingGovernance(
                        pendingGovernance.getAddress()
                    );
                    await betaInsurance.connect(pendingGovernance).acceptGovernance();
                    expect(await betaInsurance.governance()).equal(await pendingGovernance.getAddress());
                });

                it("it emits GovernanceUpdated event", async () => {
                    await betaInsurance.setPendingGovernance(
                        pendingGovernance.getAddress()
                    );
                    expect(betaInsurance.connect(pendingGovernance).acceptGovernance())
                        .emit(betaInsurance, "GovernanceUpdated")
                        .withArgs(await pendingGovernance.getAddress());
                });
            });
        });

        context("set admin", () => {
            it("it reverts if the sender is not governance", async () => {
                await expect(
                    betaInsurance.connect(deployer).setAdmin(
                        mock, true
                    )
                ).to.be.revertedWith("only governance.");
            });

            it("it sets admin successfully", async () => {
                await betaInsurance.connect(governance).setAdmin(
                    mock, true);
                expect(await betaInsurance.admins(mock)).equal(true);
            });
        });

        context("set EmergencyExit", () => {
            it("it reverts if the sender is not governance or admins", async () => {
                await expect(betaInsurance.setEmergencyExit(true)).to.be.revertedWith("sender should be governance or admins");
            });

            it("it sets EmergencyExit successfully", async () => {
                await betaInsurance.connect(governance).setEmergencyExit(true);
                expect(await betaInsurance.emergencyExit()).equal(true);
                await betaInsurance.connect(governance).setAdmin(await deployer.getAddress(), true);
                await betaInsurance.connect(deployer).setEmergencyExit(false);
                expect(await betaInsurance.emergencyExit()).equal(false);
            });
        });

        context("set Staking pool", () => {
            it("it reverts if the sender is not governance", async () => {
                await expect(betaInsurance.setStakingPool(mock, 1)).to.be.revertedWith("only governance.");
            });

            it("it reverts if the reward is not consistent", async () => {
                let stakingPool = await StakingPool.deploy(currency.address, governance.getAddress());
                await expect(betaInsurance.connect(governance).setStakingPool(stakingPool.address, 1)).to.be.revertedWith("inconsistent reward");
            });

            it("it sets staking pool successfully", async () => {
                let stakingPool = await StakingPool.deploy(naos.address, governance.getAddress());
                await betaInsurance.connect(governance).setStakingPool(stakingPool.address, 1);
                expect(await betaInsurance.stakingPool()).equal(stakingPool.address);
                expect(await betaInsurance.poolId()).equal(1);
            });
        });

        context("set transmuter", () => {
            let newTransmuter;
            beforeEach(async () => {
                newTransmuter = await Transmuter.deploy(token.address, currency.address, mock);
            });

            it("it reverts if the sender is not governance", async () => {
                await expect(betaInsurance.setTransmuter(newTransmuter.address)).to.be.revertedWith("only governance.");
            });

            it("it reverts if the transmuter address is zero address", async () => {
                await expect(betaInsurance.connect(governance).setTransmuter(ZERO_ADDRESS)).to.be.revertedWith("transmuter cannot be 0x0.");
            });

            it("it reverts if the token of transmuter is not consistent", async () => {
                let wrongTransmuter = await Transmuter.deploy(currency.address, token.address, mock);
                await expect(betaInsurance.connect(governance).setTransmuter(wrongTransmuter.address)).to.be.revertedWith("");
            });

            it("it sets tranmuster successfully", async () => {
                await betaInsurance.connect(governance).setTransmuter(newTransmuter.address);
                expect(await betaInsurance.transmuter()).equal(newTransmuter.address);
            });
        });

        context("set harvest fee", () => {
            it("it reverts if the sender is not governance", async () => {
                await expect(betaInsurance.setHarvestFee(1000)).to.be.revertedWith("only governance.");
            });

            it("it reverts if the harvest fee exceeds limit", async () => {
                await expect(betaInsurance.connect(governance).setHarvestFee(100000)).to.be.revertedWith("harvest fee above maximum.");
            });

            it("it sets harvest fee successfully", async () => {
                await betaInsurance.connect(governance).setHarvestFee(1000);
                expect(await betaInsurance.harvestFee()).equal(1000);
            });
        });
    });

    describe("deposit and withdraw tokens", () => {
        let deployer, mock, governance;
        let Alice, Bob
        let currency, token;
        let transmuter, betaInsurance;
        let mintAmount = parseEther("10000");
        let AliceDepositedAmount = parseEther("1000");
        let BobDepositedAmount = parseEther("3000");

        beforeEach(async () => {
            [deployer, mock, governance, Alice, Bob, ...signers] = signers;
            mock = await mock.getAddress();
            betaInsurance = await BetaInsurance.deploy();
            currency = await ERC20MockFactory.deploy(
                "Mock DAI",
                "DAI",
                18
            );
            naos = await ERC20MockFactory.deploy(
                "NAOS Token",
                "NAOS",
                18
            );
            token = await NUSD.deploy();
            transmuter = await Transmuter.deploy(token.address, currency.address, governance.getAddress());
            await betaInsurance.initialize(token.address, currency.address, naos.address, mock, mock, transmuter.address, governance.getAddress(), mock);

            await token.setWhitelist(deployer.getAddress(), true);
            await token.setCeiling(deployer.getAddress(), mintAmount.mul(10));
            await token.mint(Alice.getAddress(), mintAmount);
            await token.mint(Bob.getAddress(), mintAmount);
            await token.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
            await token.connect(Bob).approve(betaInsurance.address, MAXIMUM_U256);
        });

        it("it reverts if user has not enough tokens", async () => {
            await expect(betaInsurance.connect(Alice).deposit(mintAmount.mul(2))
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        context("user deposits successfully", () => {
            beforeEach(async () => {
                await betaInsurance.connect(Alice).deposit(AliceDepositedAmount);
            });

            it("it checks user get the beta token and insurance pool get the tokens", async () => {
                expect(await token.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount);
                expect(await token.balanceOf(Alice.getAddress())).equal(mintAmount.sub(AliceDepositedAmount));
                expect(await betaInsurance.balanceOf(Alice.getAddress())).equal(AliceDepositedAmount);
                expect(await betaInsurance.totalSupply()).equal(AliceDepositedAmount);
                expect(await betaInsurance.balance()).equal(AliceDepositedAmount);
            });

            context("another user deposits", () => {
                beforeEach(async () => {
                    await betaInsurance.connect(Bob).deposit(BobDepositedAmount);
                });

                it("it checks user get the beta token and insurance pool get the tokens", async () => {
                    expect(await token.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount.add(BobDepositedAmount));
                    expect(await token.balanceOf(Bob.getAddress())).equal(mintAmount.sub(BobDepositedAmount));
                    expect(await betaInsurance.balanceOf(Bob.getAddress())).equal(BobDepositedAmount);
                    expect(await betaInsurance.totalSupply()).equal(AliceDepositedAmount.add(BobDepositedAmount));
                    expect(await betaInsurance.balance()).equal(AliceDepositedAmount.add(BobDepositedAmount));
                });
            });

            context("another user deposits when the share of beta changes", () => {
                beforeEach(async () => {
                    await token.mint(betaInsurance.address, AliceDepositedAmount);
                    await betaInsurance.connect(Bob).deposit(BobDepositedAmount);
                });

                it("it checks user get the beta token and insurance pool get the tokens", async () => {
                    expect(await token.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount.add(AliceDepositedAmount).add(BobDepositedAmount));
                    expect(await token.balanceOf(Bob.getAddress())).equal(mintAmount.sub(BobDepositedAmount));

                    let BobShare = BobDepositedAmount.mul(AliceDepositedAmount).div(AliceDepositedAmount.mul(2));
                    expect(await betaInsurance.balanceOf(Bob.getAddress())).equal(BobShare);
                    expect(await betaInsurance.totalSupply()).equal(AliceDepositedAmount.add(BobShare));
                    expect(await betaInsurance.balance()).equal(AliceDepositedAmount.mul(2).add(BobDepositedAmount));
                });
            });
        });

        context("user withdraw amount", () => {
            beforeEach(async () => {
                await betaInsurance.connect(Alice).deposit(AliceDepositedAmount);
                await betaInsurance.connect(Bob).deposit(BobDepositedAmount);
                await betaInsurance.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
                await betaInsurance.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
            });

            it("it reverts if user withdraws too much", async () => {
                await expect(betaInsurance.connect(Alice).withdraw(BobDepositedAmount)).to.be.revertedWith("ERC20: burn amount exceeds balance");
            });

            context("user withdraws successfully", () => {
                beforeEach(async () => {
                    await betaInsurance.connect(Bob).withdraw(AliceDepositedAmount);
                });

                it("it checks user get the token and burn the betatokens", async () => {
                    expect(await token.balanceOf(betaInsurance.address)).equal(BobDepositedAmount);
                    expect(await token.balanceOf(Bob.getAddress())).equal(mintAmount.sub(BobDepositedAmount).add(AliceDepositedAmount));
                    expect(await betaInsurance.balanceOf(Bob.getAddress())).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                    expect(await betaInsurance.totalSupply()).equal(BobDepositedAmount);
                    expect(await betaInsurance.balance()).equal(BobDepositedAmount);
                });

                context("another user withdraws tokens", () => {
                    beforeEach(async () => {
                        await betaInsurance.connect(Alice).withdraw(AliceDepositedAmount);
                    });

                    it("it checks user get the token and burn the beta tokens", async () => {
                        expect(await token.balanceOf(betaInsurance.address)).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                        expect(await token.balanceOf(Alice.getAddress())).equal(mintAmount);
                        expect(await betaInsurance.balanceOf(Alice.getAddress())).equal(0);
                        expect(await betaInsurance.totalSupply()).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                        expect(await betaInsurance.balance()).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                    });
                })

                context("another user withdraws tokens when the share of beta changes", () => {
                    beforeEach(async () => {
                        await token.mint(betaInsurance.address, BobDepositedAmount);
                        await betaInsurance.connect(Alice).withdraw(AliceDepositedAmount);
                    });

                    it("it checks user get the token and burn the betatokens", async () => {
                        let tokenPrice = (await betaInsurance.balance()).div(await betaInsurance.totalSupply());
                        expect(await token.balanceOf(betaInsurance.address)).equal(BobDepositedAmount.mul(2).sub(AliceDepositedAmount.mul(tokenPrice)));
                        expect(await token.balanceOf(Alice.getAddress())).equal(mintAmount.add(AliceDepositedAmount));
                        expect(await betaInsurance.balanceOf(Alice.getAddress())).equal(0);
                        expect(await betaInsurance.totalSupply()).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                        expect(await betaInsurance.balance()).equal(BobDepositedAmount.mul(2).sub(AliceDepositedAmount.mul(tokenPrice)));
                    });
                });
            });

            context("if some tokens are staked in the transmuter", () => {
                beforeEach(async () => {
                    currency.mint(deployer.getAddress(), mintAmount);
                    currency.connect(deployer).approve(transmuter.address, MAXIMUM_U256);
                    transmuter.connect(governance).setWhitelist(deployer.getAddress(), true);
                })

                context("if untransmutable tokens are more than withdraw amount", () => {
                    beforeEach(async () => {
                        await betaInsurance.stakeIntoTransmuter();
                        await betaInsurance.connect(Bob).withdraw(AliceDepositedAmount);
                    });

                    it("it checks user get the token and burn the beta tokens", async () => {
                        expect(await token.balanceOf(betaInsurance.address)).equal(0);
                        expect(await token.balanceOf(await Bob.getAddress())).equal(mintAmount.sub(BobDepositedAmount).add(AliceDepositedAmount));
                        expect(await transmuter.depositedNTokens(betaInsurance.address)).equal(BobDepositedAmount);
                        expect(await betaInsurance.balanceOf(await Bob.getAddress())).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                        expect(await betaInsurance.totalSupply()).equal(BobDepositedAmount);
                        expect(await betaInsurance.balance()).equal(BobDepositedAmount);
                    });
                });

                context("if untransmutable tokens are less than withdraw amount", () => {
                    beforeEach(async () => {
                        await betaInsurance.stakeIntoTransmuter();
                        await transmuter.connect(deployer).distribute(deployer.address, BobDepositedAmount);
                        await mineBlocks(50);
                        await betaInsurance.connect(Bob).withdraw(BobDepositedAmount);
                    });

                    it("it checks user get the token and burn the beta tokens", async () => {
                        expect(await token.balanceOf(betaInsurance.address)).equal(0);
                        expect(await token.balanceOf(await Bob.getAddress())).equal(mintAmount.sub(BobDepositedAmount).add(AliceDepositedAmount));
                        expect(await transmuter.depositedNTokens(betaInsurance.address)).equal(0);
                        expect(await currency.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount);
                        expect(await currency.balanceOf(await Bob.getAddress())).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                        expect(await betaInsurance.balanceOf(await Bob.getAddress())).equal(0);
                        expect(await betaInsurance.totalSupply()).equal(AliceDepositedAmount);
                        expect(await betaInsurance.balance()).equal(AliceDepositedAmount);
                    });
                });

                context("if there is some tokens deposited in vault", () => {
                    let yearnVault, adapter;

                    beforeEach(async () => {
                        await betaInsurance.stakeIntoTransmuter();
                        await transmuter.connect(deployer).distribute(deployer.address, AliceDepositedAmount);
                        await mineBlocks(50);
                        await betaInsurance.transmuteAndClaim();
                        yearnController = await YearnController.deploy();
                        yearnVault = await YearnVault.deploy(currency.address, yearnController.address);
                        adapter = await Adapter.deploy(yearnVault.address, betaInsurance.address);
                        await betaInsurance.connect(governance).updateActiveVault(adapter.address);
                        await betaInsurance.flushActiveVault();
                        await betaInsurance.connect(Bob).withdraw(BobDepositedAmount);
                    });

                    it("it checks user get the token and burn the beta tokens", async () => {
                        expect(await token.balanceOf(betaInsurance.address)).equal(0);
                        expect(await token.balanceOf(await Bob.getAddress())).equal(mintAmount);
                        expect(await transmuter.depositedNTokens(betaInsurance.address)).equal(0);
                        expect(await currency.balanceOf(betaInsurance.address)).equal(0);
                        expect(await currency.balanceOf(yearnVault.address)).equal(AliceDepositedAmount);
                        expect(await currency.balanceOf(await Bob.getAddress())).equal(0);
                        expect(await betaInsurance.balanceOf(await Bob.getAddress())).equal(0);
                        expect(await betaInsurance.totalSupply()).equal(AliceDepositedAmount);
                        expect(await betaInsurance.balance()).equal(AliceDepositedAmount);
                    });

                    context("if all tokens are transmuted into currency and deposited into vault", () => {
                        let withdrawAmount = parseEther("500");
                        beforeEach(async () => {
                            await betaInsurance.connect(Alice).withdraw(withdrawAmount);
                        });

                        it("it checks user get the token and burn the beta tokens", async () => {
                            expect(await token.balanceOf(betaInsurance.address)).equal(0);
                            expect(await token.balanceOf(await Alice.getAddress())).equal(mintAmount.sub(AliceDepositedAmount));
                            expect(await transmuter.depositedNTokens(betaInsurance.address)).equal(0);
                            expect(await currency.balanceOf(betaInsurance.address)).equal(0);
                            expect(await currency.balanceOf(yearnVault.address)).equal(AliceDepositedAmount.sub(withdrawAmount));
                            expect(await currency.balanceOf(await Alice.getAddress())).equal(withdrawAmount);
                            expect(await betaInsurance.balanceOf(await Alice.getAddress())).equal(withdrawAmount);
                            expect(await betaInsurance.totalSupply()).equal(AliceDepositedAmount.sub(withdrawAmount));
                            expect(await betaInsurance.balance()).equal(AliceDepositedAmount.sub(withdrawAmount));
                        });
                    });
                });
            });
        });
    });

    describe("insurance policy", () => {
        let deployer, mock, governance;
        let Alice, Bob, Peter;
        let currency, token, naos;
        let transmuter, betaInsurance;
        let mintAmount = parseEther("10000");
        let AliceDepositedAmount = parseEther("1000");
        let BobDepositedAmount = parseEther("3000");
        let validPeriod = 86400 * 120;
        let premiumCurrencyAmount = parseEther("10")
        let premiumInNAOSAmount = parseEther("8")

        beforeEach(async () => {
            [deployer, mock, governance, Alice, Bob, Peter, ...signers] = signers;
            mock = await mock.getAddress();
            betaInsurance = await BetaInsurance.deploy();
            currency = await ERC20MockFactory.deploy(
                "Mock DAI",
                "DAI",
                18
            );
            naos = await ERC20MockFactory.deploy(
                "NAOS Token",
                "NAOS",
                18
            );
            token = await NUSD.deploy();
            transmuter = await Transmuter.deploy(token.address, currency.address, governance.getAddress());
            swapMock = await SwapMock.deploy(currency.address, naos.address);
            await betaInsurance.initialize(token.address, currency.address, naos.address, mock, swapMock.address, transmuter.address, governance.getAddress(), mock);

            await token.setWhitelist(deployer.getAddress(), true);
            await token.setCeiling(deployer.getAddress(), mintAmount.mul(10));
            await token.mint(Alice.getAddress(), mintAmount);
            await token.mint(Bob.getAddress(), mintAmount);
            await token.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
            await token.connect(Bob).approve(betaInsurance.address, MAXIMUM_U256);
            await betaInsurance.connect(Alice).deposit(AliceDepositedAmount);
            await betaInsurance.connect(Bob).deposit(BobDepositedAmount);
        });

        context("issuer applys for insurance policy", () => {
            beforeEach(async () => {
                await betaInsurance.connect(Peter).issue(ZERO_ADDRESS, 0, validPeriod, AliceDepositedAmount);
            });

            it("it checks the insurance policy is created", async () => {
                expect(await betaInsurance.getInsurancePolicyCount()).equal(1);
                let InsurancePolicy = await betaInsurance.insurancePolicyList(0);
                expect(InsurancePolicy.NFTContract).equal(ZERO_ADDRESS)
                expect(InsurancePolicy.issuer).equal(await Peter.getAddress());
                expect(InsurancePolicy.NFTID).equal(0)
                expect(InsurancePolicy.validPeriod).equal(validPeriod)
                expect(InsurancePolicy.insuranceAmount).equal(AliceDepositedAmount)
            });

            context("set the insurance premium", () => {
                it("it reverts if the sender is not the governance", async () => {
                    await expect(betaInsurance.setInsurancePremium(0, premiumCurrencyAmount, premiumInNAOSAmount)).to.be.revertedWith("only governance.");
                });

                it("it reverts if the insurance ID is invalid", async () => {
                    await expect(betaInsurance.connect(governance).setInsurancePremium(1, premiumCurrencyAmount, premiumInNAOSAmount)).to.be.revertedWith("invalid insurance index");
                });

                context("It sets the insurance premium successfully", () => {
                    beforeEach(async () => {
                        await betaInsurance.connect(governance).setInsurancePremium(0, premiumCurrencyAmount, premiumInNAOSAmount);
                    });

                    it("check the insurance policy", async () => {
                        let InsurancePolicy = await betaInsurance.insurancePolicyList(0);
                        InsurancePolicy.premiumCurrencyAmount = premiumCurrencyAmount;
                        InsurancePolicy.premiumNAOSAmount = premiumInNAOSAmount;
                        InsurancePolicy.premiumIsSet = true;
                    });

                    context("someone pays by currency", () => {
                        beforeEach(async () => {
                            await currency.mint(await Alice.getAddress(), premiumCurrencyAmount);
                            await currency.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
                            await naos.mint(swapMock.address, premiumInNAOSAmount)
                        });

                        it("it reverts if the insurance ID is invalid", async () => {
                            await expect(betaInsurance.connect(Alice).payPremiumByCurrency(1, premiumInNAOSAmount)).to.be.revertedWith("invalid insurance index");
                        });

                        it("it reverts if the insurance premium is not set", async () => {
                            await betaInsurance.connect(Peter).issue(ZERO_ADDRESS, 1, validPeriod, AliceDepositedAmount);
                            await expect(betaInsurance.connect(Alice).payPremiumByCurrency(1, premiumInNAOSAmount)).to.be.revertedWith("The insurance premium didn't set");
                        });

                        it("it reverts if there is no enough quota", async () => {
                            await betaInsurance.connect(Alice).withdraw(AliceDepositedAmount);
                            await betaInsurance.connect(Bob).withdraw(BobDepositedAmount);
                            await expect(betaInsurance.connect(Alice).payPremiumByCurrency(0, premiumInNAOSAmount)).to.be.revertedWith("no enough insurance quota");
                        });

                        context("it pays for insurance premium successfully", () => {
                            beforeEach(async () => {
                                await betaInsurance.connect(Alice).payPremiumByCurrency(0, premiumInNAOSAmount);
                            });

                            it("it reverts admin set insurance premium again", async () => {
                                await expect(betaInsurance.connect(governance).setInsurancePremium(0, premiumCurrencyAmount, premiumInNAOSAmount)).to.be.revertedWith("The insurance policy has been effective");
                            });

                            it("it reverts if the user pays again", async () => {
                                await expect(betaInsurance.connect(Alice).payPremiumByCurrency(0, premiumInNAOSAmount)).to.be.revertedWith("The insurance policy has been effective");
                                await expect(betaInsurance.connect(Alice).payPremiumByNAOS(0)).to.be.revertedWith("The insurance policy has been effective");
                            });

                            it("it has to lock insurance amount", async () => {
                                await betaInsurance.connect(Bob).withdraw(BobDepositedAmount);
                                await expect(betaInsurance.connect(Alice).withdraw(1)).to.be.revertedWith("no enough quota");
                            });

                            it("check the parameters", async () => {
                                let InsurancePolicy = await betaInsurance.insurancePolicyList(0);
                                let blockNumber = await ethers.provider.getBlockNumber();
                                let block = await ethers.provider.getBlock(blockNumber);
                                expect(InsurancePolicy.isValid).equal(true);
                                expect(InsurancePolicy.isLock).equal(true);
                                expect(InsurancePolicy.expiredTime).equal(InsurancePolicy.validPeriod.add(block.timestamp));
                                expect(await betaInsurance.getPremiumNAOSDistributionCount()).equal(1);
                                let premiumNAOSDistribution = await betaInsurance.premiumNAOSDistributionList(0);
                                expect(premiumNAOSDistribution.insuranceID).equal(0);
                                expect(premiumNAOSDistribution.NAOSAmount).equal(premiumInNAOSAmount);
                                expect(premiumNAOSDistribution.start).equal(block.timestamp);
                                expect(premiumNAOSDistribution.end).equal(InsurancePolicy.expiredTime);
                                expect(premiumNAOSDistribution.lastDistributedTimestamp).equal(block.timestamp);
                                expect(await naos.balanceOf(betaInsurance.address)).equal(premiumInNAOSAmount);
                                expect(await currency.balanceOf(await Alice.getAddress())).equal(0);
                                expect(await currency.balanceOf(swapMock.address)).equal(premiumCurrencyAmount);
                                expect(await betaInsurance.lockAmount()).equal(InsurancePolicy.insuranceAmount);
                            });

                            context("unlock insurance policy", () => {
                                it("it reverts if the insurance ID is invalid", async () => {
                                    await (expect(betaInsurance.unlock(5))).to.be.revertedWith("invalid insurance index");
                                });

                                it("it reverts if the insurance period is not expired", async () => {
                                    await (expect(betaInsurance.unlock(0))).to.be.revertedWith("cannot suspend unexpired insurance");
                                });

                                context("unlock successfully", () => {
                                    beforeEach(async () => {
                                        await timeFly(validPeriod + 1);
                                        await betaInsurance.unlock(0);
                                    });

                                    it("it checks parameters", async () => {
                                        expect(await betaInsurance.lockAmount()).equal(0);
                                        let InsurancePolicy = await betaInsurance.insurancePolicyList(0);
                                        expect(InsurancePolicy.isLock).equal(false);
                                    });

                                    it("it reverts if user unlocks again", async () => {
                                        await expect(betaInsurance.unlock(0)).to.be.revertedWith("The insurance has been unlock");
                                    });
                                });
                            });

                            context("token donate to staking pool", async () => {
                                let tolerance = 1000;

                                it("it distribute naos to staking pool linearly", async () => {
                                    let stakingPool = await StakingPool.deploy(naos.address, await governance.getAddress());
                                    await stakingPool.connect(governance).createPool(betaInsurance.address);
                                    await stakingPool.connect(governance).setRewardWeights([1]);
                                    await betaInsurance.connect(Alice).approve(stakingPool.address, MAXIMUM_U256);
                                    await betaInsurance.connect(Bob).approve(stakingPool.address, MAXIMUM_U256);
                                    await stakingPool.connect(Alice).deposit(0, AliceDepositedAmount);
                                    await stakingPool.connect(Bob).deposit(0, BobDepositedAmount);
                                    await betaInsurance.connect(governance).setStakingPool(stakingPool.address, 0);
                                    let _before = await betaInsurance.premiumNAOSDistributionList(0);
                                    await betaInsurance.distributeNAOSToStakingPool([0]);
                                    let _after = await betaInsurance.premiumNAOSDistributionList(0);
                                    let period = await _after.lastDistributedTimestamp.sub(_before.lastDistributedTimestamp);
                                    let distributedAmount = period.mul(_before.NAOSAmount).div(_before.end.sub(_before.start));
                                    let totalDeposited = AliceDepositedAmount.add(BobDepositedAmount);
                                    expect((await stakingPool.getStakeTotalUnclaimed(await Alice.getAddress(), 0)).sub(distributedAmount.mul(AliceDepositedAmount).div(totalDeposited)).abs()).to.be.at.most(tolerance);
                                    expect((await stakingPool.getStakeTotalUnclaimed(await Bob.getAddress(), 0)).sub(distributedAmount.mul(BobDepositedAmount).div(totalDeposited)).abs()).to.be.at.most(tolerance);
                                })
                            })
                        });
                    });

                    context("someone pays by naos", () => {
                        beforeEach(async () => {
                            await naos.mint(await Alice.getAddress(), premiumInNAOSAmount);
                            await naos.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
                        });

                        it("it reverts if the insurance ID is invalid", async () => {
                            await expect(betaInsurance.connect(Alice).payPremiumByNAOS(1)).to.be.revertedWith("invalid insurance index");
                        });

                        it("it reverts if the insurance premium is not set", async () => {
                            await betaInsurance.connect(Peter).issue(ZERO_ADDRESS, 1, validPeriod, AliceDepositedAmount);
                            await expect(betaInsurance.connect(Alice).payPremiumByNAOS(1)).to.be.revertedWith("The insurance premium didn't set");
                        });

                        it("it reverts if there is no enough quota", async () => {
                            await betaInsurance.connect(Alice).withdraw(AliceDepositedAmount);
                            await betaInsurance.connect(Bob).withdraw(BobDepositedAmount);
                            await expect(betaInsurance.connect(Alice).payPremiumByNAOS(0)).to.be.revertedWith("no enough insurance quota");
                        });

                        context("it pays for insurance premium successfully", () => {
                            beforeEach(async () => {
                                await betaInsurance.connect(Alice).payPremiumByNAOS(0);
                            });

                            it("it reverts admin set insurance premium again", async () => {
                                await expect(betaInsurance.connect(governance).setInsurancePremium(0, premiumCurrencyAmount, premiumInNAOSAmount)).to.be.revertedWith("The insurance policy has been effective");
                            });

                            it("it reverts if the user pays again", async () => {
                                await expect(betaInsurance.connect(Alice).payPremiumByCurrency(0, premiumInNAOSAmount)).to.be.revertedWith("The insurance policy has been effective");
                                await expect(betaInsurance.connect(Alice).payPremiumByNAOS(0)).to.be.revertedWith("The insurance policy has been effective");
                            });

                            it("it has to lock insurance amount", async () => {
                                await betaInsurance.connect(Bob).withdraw(BobDepositedAmount);
                                await expect(betaInsurance.connect(Alice).withdraw(1)).to.be.revertedWith("no enough quota");
                            });

                            it("check the parameters", async () => {
                                let InsurancePolicy = await betaInsurance.insurancePolicyList(0);
                                let blockNumber = await ethers.provider.getBlockNumber();
                                let block = await ethers.provider.getBlock(blockNumber);
                                expect(InsurancePolicy.isValid).equal(true);
                                expect(InsurancePolicy.isLock).equal(true);
                                expect(InsurancePolicy.expiredTime).equal(InsurancePolicy.validPeriod.add(block.timestamp));
                                expect(await betaInsurance.getPremiumNAOSDistributionCount()).equal(1);
                                let premiumNAOSDistribution = await betaInsurance.premiumNAOSDistributionList(0);
                                expect(premiumNAOSDistribution.insuranceID).equal(0);
                                expect(premiumNAOSDistribution.NAOSAmount).equal(premiumInNAOSAmount);
                                expect(premiumNAOSDistribution.start).equal(block.timestamp);
                                expect(premiumNAOSDistribution.end).equal(InsurancePolicy.expiredTime);
                                expect(premiumNAOSDistribution.lastDistributedTimestamp).equal(block.timestamp);
                                expect(await naos.balanceOf(betaInsurance.address)).equal(premiumInNAOSAmount);
                                expect(await naos.balanceOf(Alice.address)).equal(0);
                                expect(await betaInsurance.lockAmount()).equal(InsurancePolicy.insuranceAmount);
                            });
                        });
                    });

                    context("compensate", () => {
                        it("it reverts if the sender is not governance", async () => {
                            await expect(betaInsurance.compensate(0, 100)).to.be.revertedWith("only governance.");
                        });

                        it("it reverts if the user has not paid for the premium", async () => {
                            await expect(betaInsurance.connect(governance).compensate(0, 100)).to.be.revertedWith("The insurance policy is not effective");
                        });

                        context("when premium is paid", () => {
                            beforeEach(async () => {
                                await naos.mint(await Alice.getAddress(), premiumInNAOSAmount);
                                await naos.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
                                await betaInsurance.connect(Alice).payPremiumByNAOS(0);
                            });

                            it("it reverts if insurance ID is invalid", async () => {
                                await expect(betaInsurance.connect(governance).compensate(5, 100)).to.be.revertedWith("invalid insurance index");
                            });

                            it("it reverts if the compensation amount too high", async () => {
                                await expect(betaInsurance.connect(governance).compensate(0, BobDepositedAmount)).to.be.revertedWith("compensation amount too high");
                            });

                            it("it reverts if the insurance has been compensated", async () => {
                                await betaInsurance.connect(governance).compensate(0, 100);
                                await expect(betaInsurance.connect(governance).compensate(0, 100)).to.be.revertedWith("The insurance has been unlock");
                            });

                            it("it reverts if the insurance is expired", async () => {
                                await timeFly(86400 * 365);
                                await expect(betaInsurance.connect(governance).compensate(0, 100)).to.be.revertedWith("The insurance is expired");
                            });

                            it("it compensates successfully", async () => {
                                await betaInsurance.connect(governance).compensate(0, AliceDepositedAmount);
                                let InsurancePolicy = await betaInsurance.insurancePolicyList(0);
                                expect(InsurancePolicy.isLock).equal(false);
                                expect(await betaInsurance.lockAmount()).equal(0);
                                expect(await token.balanceOf(await Peter.getAddress())).equal(AliceDepositedAmount);
                                expect(await token.balanceOf(betaInsurance.address)).equal(BobDepositedAmount);
                            });

                            context("when there is currency in pool", () => {
                                let mintCurrencyAmount = AliceDepositedAmount.div(2);
                                beforeEach(async () => {
                                    await currency.mint(betaInsurance.address, mintCurrencyAmount);
                                });

                                it("it compensates currency first, and then tokens", async () => {
                                    await betaInsurance.connect(governance).compensate(0, AliceDepositedAmount);
                                    expect(await currency.balanceOf(await Peter.getAddress())).equal(AliceDepositedAmount.div(2));
                                    expect(await token.balanceOf(await Peter.getAddress())).equal(AliceDepositedAmount.div(2));
                                    expect(await token.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount.div(2).add(BobDepositedAmount));
                                });

                                it("it withdraw currency from vault and compensates currency first, and then tokens", async () => {
                                    yearnController = await YearnController.deploy();
                                    yearnVault = await YearnVault.deploy(currency.address, yearnController.address);
                                    adapter = await Adapter.deploy(yearnVault.address, betaInsurance.address);
                                    await currency.mint(governance.getAddress(), 1);
                                    await currency.connect(governance).approve(yearnVault.address, 1);
                                    await yearnVault.connect(governance).deposit(1);
                                    await betaInsurance.connect(governance).updateActiveVault(adapter.address);
                                    await betaInsurance.flushActiveVault();
                                    await betaInsurance.connect(governance).compensate(0, AliceDepositedAmount);
                                    expect(await currency.balanceOf(await Peter.getAddress())).equal(AliceDepositedAmount.div(2));
                                    expect(await token.balanceOf(await Peter.getAddress())).equal(AliceDepositedAmount.div(2));
                                    expect(await token.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount.div(2).add(BobDepositedAmount));
                                });
                            });
                        });
                    });
                });
            });
        });
    });

    describe("transmuter interaction", () => {
        let deployer, mock, governance;
        let Alice, Bob, Peter;
        let currency, token;
        let transmuter, betaInsurance;
        let mintAmount = parseEther("10000");
        let AliceDepositedAmount = parseEther("1000");
        let BobDepositedAmount = parseEther("3000");

        beforeEach(async () => {
            [deployer, mock, governance, Alice, Bob, ...signers] = signers;
            mock = await mock.getAddress();
            betaInsurance = await BetaInsurance.deploy();
            currency = await ERC20MockFactory.deploy(
                "Mock DAI",
                "DAI",
                18
            );
            naos = await ERC20MockFactory.deploy(
                "NAOS Token",
                "NAOS",
                18
            );
            token = await NUSD.deploy();
            transmuter = await Transmuter.deploy(token.address, currency.address, governance.getAddress());
            await betaInsurance.initialize(token.address, currency.address, naos.address, mock, mock, transmuter.address, governance.getAddress(), mock);

            await token.setWhitelist(deployer.getAddress(), true);
            await token.setCeiling(deployer.getAddress(), mintAmount.mul(10));
            await token.mint(Alice.getAddress(), mintAmount);
            await token.mint(Bob.getAddress(), mintAmount);
            await token.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
            await token.connect(Bob).approve(betaInsurance.address, MAXIMUM_U256);
            await betaInsurance.connect(Alice).deposit(AliceDepositedAmount);
            await betaInsurance.connect(Bob).deposit(BobDepositedAmount);
        });

        it("it reverts if there is no token deposited into  transmuter", async () => {
            await expect(betaInsurance.transmuteAndClaim()).to.be.revertedWith("no tokens staking in transmuter");
        });

        context("if there are some tokens depositing in transmuter", () => {
            beforeEach(async () => {
                await betaInsurance.stakeIntoTransmuter();
            });

            it("it checks the tokens are deposited into transmuter", async () => {
                expect(await token.balanceOf(betaInsurance.address)).equal(0);
                expect(await token.balanceOf(transmuter.address)).equal(AliceDepositedAmount.add(BobDepositedAmount));
                expect(await transmuter.depositedNTokens(betaInsurance.address)).equal(AliceDepositedAmount.add(BobDepositedAmount));
            });

            it("it reverts if there is no token in betaInsurance", async () => {
                await expect(betaInsurance.stakeIntoTransmuter()).to.be.revertedWith("no tokens for transmuter staking");
            });

            it("it reverts if there is no transmutable currency", async () => {
                await expect(betaInsurance.transmuteAndClaim()).to.be.revertedWith("there is no transmutable tokens");
            });

            context("distribute some tokens into transmuter", () => {
                beforeEach(async () => {
                    await currency.mint(await deployer.getAddress(), mintAmount);
                    await currency.connect(deployer).approve(transmuter.address, MAXIMUM_U256);
                    await transmuter.connect(governance).setWhitelist(await deployer.getAddress(), true);
                    await transmuter.connect(deployer).distribute(await deployer.getAddress(), BobDepositedAmount);
                    await mineBlocks(50);
                })
                it("it checks some tokens are transmuted into currency", async () => {
                    await betaInsurance.transmuteAndClaim();
                    expect(await token.balanceOf(betaInsurance.address)).equal(0);
                    expect(await token.balanceOf(transmuter.address)).equal(AliceDepositedAmount);
                    expect(await transmuter.depositedNTokens(betaInsurance.address)).equal(AliceDepositedAmount);
                    expect(await currency.balanceOf(transmuter.address)).equal(0);
                    expect(await currency.balanceOf(betaInsurance.address)).equal(BobDepositedAmount);
                    expect(await betaInsurance.balance()).equal(AliceDepositedAmount.add(BobDepositedAmount));
                });
                it("it checks some tokens are transmuted into currency after someone force transmutes", async () => {
                    await transmuter.connect(governance).setWhitelist(await deployer.getAddress(), true);
                    await transmuter.connect(deployer).distribute(await deployer.getAddress(), BobDepositedAmount);
                    await mineBlocks(50);
                    await transmuter.connect(deployer).forceTransmute(betaInsurance.address);
                    expect(await token.balanceOf(betaInsurance.address)).equal(0);
                    expect(await token.balanceOf(transmuter.address)).equal(0);
                    expect(await transmuter.depositedNTokens(betaInsurance.address)).equal(0);
                    expect(await currency.balanceOf(transmuter.address)).equal(BobDepositedAmount.sub(AliceDepositedAmount));
                    expect(await currency.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount.add(BobDepositedAmount));
                    expect(await betaInsurance.balance()).equal(AliceDepositedAmount.add(BobDepositedAmount));
                });
            });
        });
    });

    describe("vault interaction", () => {
        let deployer, mock, governance;
        let Alice, Bob, Peter;
        let currency, token;
        let transmuter, betaInsurance;
        let mintAmount = parseEther("10000");
        let AliceDepositedAmount = parseEther("1000");
        let BobDepositedAmount = parseEther("3000");
        beforeEach(async () => {
            [deployer, mock, governance, Alice, Bob, ...signers] = signers;
            mock = await mock.getAddress();
            betaInsurance = await BetaInsurance.deploy();
            currency = await ERC20MockFactory.deploy(
                "Mock DAI",
                "DAI",
                18
            );
            naos = await ERC20MockFactory.deploy(
                "NAOS Token",
                "NAOS",
                18
            );
            token = await NUSD.deploy();
            transmuter = await Transmuter.deploy(token.address, currency.address, governance.getAddress());
            await betaInsurance.initialize(token.address, currency.address, naos.address, mock, mock, transmuter.address, governance.getAddress(), mock);

            await token.setWhitelist(deployer.getAddress(), true);
            await token.setCeiling(deployer.getAddress(), mintAmount.mul(10));
            await token.mint(Alice.getAddress(), mintAmount);
            await token.mint(Bob.getAddress(), mintAmount);
            await token.connect(Alice).approve(betaInsurance.address, MAXIMUM_U256);
            await token.connect(Bob).approve(betaInsurance.address, MAXIMUM_U256);
            await betaInsurance.connect(Alice).deposit(AliceDepositedAmount);
        });

        it("it reverts if adapter address is zero address", async () => {
            await expect(betaInsurance.connect(governance).updateActiveVault(ZERO_ADDRESS)).to.be.revertedWith("active vault cannot be 0x0.");
        });

        context("set adapter", () => {
            let yearnController, yearnVault, adapter;
            beforeEach(async () => {
                yearnController = await YearnController.deploy();
                yearnVault = await YearnVault.deploy(currency.address, yearnController.address);
                adapter = await Adapter.deploy(yearnVault.address, betaInsurance.address);
                await betaInsurance.connect(governance).updateActiveVault(adapter.address);
            });

            it("it reverts if the sender is not governance", async () => {
                await expect(betaInsurance.updateActiveVault(adapter.address)).to.be.revertedWith("only governance.");
            });

            it("it reverts if the adapter currency address is inconsistent with betaInsurance", async () => {
                yearnVault = await YearnVault.deploy(token.address, yearnController.address);
                adapter = await Adapter.deploy(yearnVault.address, betaInsurance.address);
                await expect(betaInsurance.connect(governance).updateActiveVault(adapter.address)).to.be.revertedWith("vault: currency mismatch.");
            });

            it("it reverts if governance adds the same adapter again", async () => {
                await expect(betaInsurance.connect(governance).updateActiveVault(adapter.address)).to.be.revertedWith("Adapter already in use");
            });

            it("it checks the vault is set", async () => {
                expect(await betaInsurance.vaultCount()).equal(1);
                expect(await betaInsurance.getVaultAdapter(0)).equal(adapter.address);
                expect(await betaInsurance.getVaultTotalDeposited(0)).equal(0);
            });

            context("deposit currency into vault", () => {
                beforeEach(async () => {
                    await currency.mint(betaInsurance.address, AliceDepositedAmount);
                    await betaInsurance.flushActiveVault();
                });

                it("it deposits currency into vault", async () => {
                    expect(await currency.balanceOf(betaInsurance.address)).equal(0);
                    expect(await currency.balanceOf(yearnVault.address)).equal(AliceDepositedAmount);
                });

                context("harvest yield", () => {
                    let harvestFee = 2000;
                    let totalFee = 10000;

                    beforeEach(async () => {
                        await betaInsurance.connect(governance).setHarvestFee(harvestFee);
                        await currency.mint(yearnVault.address, AliceDepositedAmount);
                        await betaInsurance.connect(governance).setAdmin(governance.address, true);
                        await betaInsurance.connect(governance).harvest(0);
                    });

                    it("it checks the harvest amounts", async () => {
                        expect(await currency.balanceOf(yearnVault.address)).equal(AliceDepositedAmount);
                        expect(await currency.balanceOf(betaInsurance.address)).equal(AliceDepositedAmount.mul(totalFee - harvestFee).div(totalFee));
                        expect(await currency.balanceOf(mock)).equal(AliceDepositedAmount.mul(harvestFee).div(totalFee));
                        expect(await betaInsurance.balance()).equal(AliceDepositedAmount.add(AliceDepositedAmount).add(AliceDepositedAmount.mul(totalFee - harvestFee).div(totalFee)));
                    });
                });

                context("change adapter", () => {
                    beforeEach(async () => {
                        adapter = await Adapter.deploy(yearnVault.address, betaInsurance.address);
                        await betaInsurance.connect(governance).updateActiveVault(adapter.address);
                        await betaInsurance.connect(governance).setEmergencyExit(true);
                        await betaInsurance.connect(governance).recallFundsFromVault(0, AliceDepositedAmount.sub(100));
                    });

                    it("funds cannot be deposited into vault if emergency exit is set", async () => {
                        await expect(betaInsurance.flushActiveVault()).to.be.revertedWith("emergency pause enabled");
                    })

                    it("it deposits currency into vault", async () => {
                        await betaInsurance.connect(governance).setEmergencyExit(false);
                        await betaInsurance.flushActiveVault();
                        expect(await currency.balanceOf(betaInsurance.address)).equal(0);
                        expect(await currency.balanceOf(yearnVault.address)).equal(AliceDepositedAmount);
                        expect(await betaInsurance.getVaultTotalDeposited(0)).equal(100);
                        expect(await betaInsurance.getVaultTotalDeposited(1)).equal(AliceDepositedAmount.sub(100));
                    });
                });
            });
        });
    });
});