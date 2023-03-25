import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BasicNft__factory } from "../typechain-types";
import { Ship } from "../utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deploy } = await Ship.init(hre);

  console.log("----------------------------------------------------");
  const nft = await deploy(BasicNft__factory);

  console.log(`Basic NFT contract deployed to ${nft.address}`);
};

export default func;
func.tags = ["all", "nft"];
