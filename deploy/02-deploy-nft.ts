import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { NftContract__factory } from "../typechain-types";
import { Ship } from "../utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deploy } = await Ship.init(hre);

  console.log("----------------------------------------------------");
  const nft = await deploy(NftContract__factory, {
    args: ["Gold NFT", "GNFT"],
  });

  console.log(`NFT contract deployed to ${nft.address}`);
};

export default func;
func.tags = ["all", "nft"];
