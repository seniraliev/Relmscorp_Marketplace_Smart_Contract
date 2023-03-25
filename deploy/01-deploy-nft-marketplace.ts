import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { NftMarketplace__factory } from "../typechain-types";
import { Ship } from "../utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deploy } = await Ship.init(hre);

  console.log("----------------------------------------------------");
  const marketPlace = await deploy(NftMarketplace__factory);

  console.log(`Marketplace contract deployed to ${marketPlace.address}`);
};

export default func;
func.tags = ["all", "marketplace"];
