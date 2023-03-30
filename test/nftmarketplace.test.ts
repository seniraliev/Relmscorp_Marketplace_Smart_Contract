import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BasicNft, BasicNft__factory, NftMarketplace, NftMarketplace__factory } from "../typechain-types";
import { deployments, ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Ship } from "../utils";
import { BytesLike } from "ethers";
import { PromiseOrValue } from "../typechain-types/common";

chai.use(solidity);
const { expect, assert } = chai;

let ship: Ship;
let basicNft: BasicNft;
let nftMarketplace: NftMarketplace;

let deployer: SignerWithAddress;
let alice: SignerWithAddress;
let vault: SignerWithAddress;
let collectionOwner: SignerWithAddress;

const setup = deployments.createFixture(async (hre) => {
  ship = await Ship.init(hre);
  const { accounts, users } = ship;
  await deployments.fixture(["all"]);

  return {
    ship,
    accounts,
    users,
  };
});

describe("NFT marketplace unit tests", () => {
  const PRICE = ethers.utils.parseEther("0.1");
  const NEW_PRICE = ethers.utils.parseEther("0.2");
  const OFFER_PRICE_1 = ethers.utils.parseEther("0.08");
  const OFFER_PRICE_2 = ethers.utils.parseEther("0.09");
  const OFFER_PRICE_3 = ethers.utils.parseEther("0.1");
  const TOKEN_ID_1 = 0; //listed item
  const TOKEN_ID_2 = 1; //not listed item
  const TOKEN_ID_3 = 2; //minted by alice
  const TOKEN_ID_4 = 3; //minted by alice
  const TOKEN_ID_5 = 4; //minted by alice
  const COLLECTION_FEE = 150;
  let signature1: PromiseOrValue<BytesLike>;
  let signature2: PromiseOrValue<BytesLike>;

  before(async () => {
    const scaffold = await setup();

    deployer = scaffold.accounts.deployer;
    alice = scaffold.accounts.alice;
    vault = scaffold.accounts.vault;
    collectionOwner = scaffold.users[0];

    basicNft = await ship.connect(BasicNft__factory);
    await basicNft.mintNft();
    await basicNft.mintNft();
    nftMarketplace = await ship.connect(NftMarketplace__factory);
    await basicNft.approve(nftMarketplace.address, TOKEN_ID_1);
    const hash1 = ethers.utils.solidityKeccak256(
      ["address", "uint16", "address"],
      [deployer.address, COLLECTION_FEE, alice.address],
    );
    signature1 = deployer.signMessage(ethers.utils.arrayify(hash1));
    const hash2 = ethers.utils.solidityKeccak256(
      ["address", "uint16", "address"],
      [collectionOwner.address, COLLECTION_FEE, vault.address],
    );
    signature2 = deployer.signMessage(ethers.utils.arrayify(hash2));
  });

  describe("listItem", () => {
    it("emits an event after listing an item", async () => {
      expect(await nftMarketplace.listItem(basicNft.address, TOKEN_ID_1, PRICE)).to.emit(
        nftMarketplace,
        "ItemListed",
      );
    });
    it("exclusively items that have not been listed", async () => {
      const error = `NftMarketPlace__AlreadyListed("${basicNft.address}", ${TOKEN_ID_1})`;
      await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID_1, PRICE)).to.be.revertedWith(error);
    });
    it("should be owner of item to list", async () => {
      const error = "NftMarketPlace__NotOwner";
      await expect(
        nftMarketplace.connect(alice).listItem(basicNft.address, TOKEN_ID_2, PRICE),
      ).to.be.revertedWith(error);
    });
    it("Price must be be more than 0", async () => {
      const error = "NftMarketPlace__PriceMustBeAboveZero";
      await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID_2, 0)).to.be.revertedWith(error);
    });
    it("Item should be approved to be listed", async () => {
      const error = "NftMarketPlace__NotApprovedForMarketPlace";
      await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID_2, PRICE)).to.be.revertedWith(error);
    });
    it("should be listed with correct price and seller", async () => {
      const listedItem = await nftMarketplace.getListing(basicNft.address, TOKEN_ID_1);
      expect(listedItem.price.toString()).to.equal(PRICE.toString());
      expect(listedItem.seller).to.equal(deployer.address);
    });
  });
  describe("buyItem", () => {
    it("Item price should be met to buy", async () => {
      const error = `NftMarketPlace__PriceNotMet("${basicNft.address}", ${TOKEN_ID_1}, ${PRICE})`;
      await expect(
        nftMarketplace
          .connect(alice)
          .buyItem(signature1, deployer.address, COLLECTION_FEE, basicNft.address, TOKEN_ID_1, { value: 0 }),
      ).to.be.revertedWith(error);
    });
    it("emits two events after buying an item", async () => {
      expect(
        await nftMarketplace
          .connect(alice)
          .buyItem(signature1, deployer.address, COLLECTION_FEE, basicNft.address, TOKEN_ID_1, {
            value: PRICE,
          }),
      )
        .to.emit(nftMarketplace, "ItemBought")
        .to.emit(nftMarketplace, "ProceedsTransferred");
    });
    it("Item should be not listed after be purchased", async () => {
      const listedItem = await nftMarketplace.getListing(basicNft.address, TOKEN_ID_1);
      expect(listedItem.price.toString()).to.equal("0");
      expect(listedItem.seller).to.equal(ethers.constants.AddressZero);
    });
    it("Check ownership after purchasing nft", async () => {
      expect(await basicNft.ownerOf(TOKEN_ID_1)).to.equal(alice.address);
    });
    it("Check balance of buyer, seller and marketplace owner", async () => {
      await basicNft.connect(alice).mintNft();
      await basicNft.connect(alice).approve(nftMarketplace.address, TOKEN_ID_3);
      await nftMarketplace.connect(alice).listItem(basicNft.address, TOKEN_ID_3, PRICE);
      const beforeSellerBalance = await alice.getBalance();
      const beforeBuyerBalance = await vault.getBalance();
      const beforeCollectionOwnerBalance = await collectionOwner.getBalance();
      const beforeMarketplaceOwnerBalance = await deployer.getBalance();
      const marketPlaceFee = await nftMarketplace.getMarketplaceFee();
      const buyTx = await nftMarketplace
        .connect(vault)
        .buyItem(signature2, collectionOwner.address, COLLECTION_FEE, basicNft.address, TOKEN_ID_3, {
          value: PRICE,
        });
      const afterSellerBalance = await alice.getBalance();
      const afterBuyerBalance = await vault.getBalance();
      const afterCollectionOwnerBalance = await collectionOwner.getBalance();
      const afterMarketplaceOwnerBalance = await deployer.getBalance();
      expect(buyTx).to.emit(nftMarketplace, "ItemBought").to.emit(nftMarketplace, "ProceedsTransferred");
      const { cumulativeGasUsed, effectiveGasPrice } = await buyTx.wait();
      const gasFee = cumulativeGasUsed.mul(effectiveGasPrice);
      expect(afterSellerBalance.sub(beforeSellerBalance)).to.be.equal(
        PRICE.mul(10000 - marketPlaceFee - COLLECTION_FEE).div(10000),
      );
      expect(afterMarketplaceOwnerBalance.sub(beforeMarketplaceOwnerBalance)).to.be.equal(
        PRICE.mul(marketPlaceFee).div(10000),
      );
      expect(afterCollectionOwnerBalance.sub(beforeCollectionOwnerBalance)).to.be.equal(
        PRICE.mul(COLLECTION_FEE).div(10000),
      );
      expect(beforeBuyerBalance.sub(afterBuyerBalance)).to.be.equal(PRICE.add(gasFee));
    });
    it("item should be listed to purchase it", async () => {
      const error = `NftMarketPlace__NotListed("${basicNft.address}", ${TOKEN_ID_2})`;
      await expect(
        nftMarketplace
          .connect(alice)
          .buyItem(signature1, deployer.address, COLLECTION_FEE, basicNft.address, TOKEN_ID_2, {
            value: PRICE,
          }),
      ).to.be.revertedWith(error);
    });
  });
  describe("cancelListing", () => {
    it("item should be listed to cancel listing", async () => {
      const error = `NftMarketPlace__NotListed("${basicNft.address}", ${TOKEN_ID_1})`;
      await expect(
        nftMarketplace.connect(alice).cancelListing(basicNft.address, TOKEN_ID_1),
      ).to.be.revertedWith(error);
    });
    it("should be owner of item to cancel listing", async () => {
      const error = "NftMarketPlace__NotOwner";
      await expect(nftMarketplace.cancelListing(basicNft.address, TOKEN_ID_1)).to.revertedWith(error);
    });
    it("emits an event after cancel listing", async () => {
      await basicNft.connect(alice).approve(nftMarketplace.address, TOKEN_ID_1);
      await nftMarketplace.connect(alice).listItem(basicNft.address, TOKEN_ID_1, PRICE);
      expect(await nftMarketplace.connect(alice).cancelListing(basicNft.address, TOKEN_ID_1)).to.be.emit(
        nftMarketplace,
        "ItemCanceled",
      );
    });
    it("should be removed from listing", async () => {
      const listedItem = await nftMarketplace.getListing(basicNft.address, TOKEN_ID_1);
      expect(listedItem.price.toString()).to.equal("0");
      expect(listedItem.seller).to.equal(ethers.constants.AddressZero);
    });
  });
  describe("updateListing", () => {
    it("item should be listed to update listing", async () => {
      const error = `NftMarketPlace__NotListed("${basicNft.address}", ${TOKEN_ID_1})`;
      await expect(
        nftMarketplace.connect(alice).updateListing(basicNft.address, TOKEN_ID_1, NEW_PRICE),
      ).to.be.revertedWith(error);
    });
    it("should be owner of item to update listing", async () => {
      const error = "NftMarketPlace__NotOwner";
      await expect(nftMarketplace.updateListing(basicNft.address, TOKEN_ID_1, NEW_PRICE)).to.revertedWith(
        error,
      );
    });
    it("emits an event after update listing", async () => {
      await basicNft.connect(alice).approve(nftMarketplace.address, TOKEN_ID_1);
      await nftMarketplace.connect(alice).listItem(basicNft.address, TOKEN_ID_1, PRICE);
      expect(
        await nftMarketplace.connect(alice).updateListing(basicNft.address, TOKEN_ID_1, NEW_PRICE),
      ).to.be.emit(nftMarketplace, "ItemListed");
    });
    it("Price should be updated", async () => {
      const listedItem = await nftMarketplace.getListing(basicNft.address, TOKEN_ID_1);
      expect(listedItem.price.toString()).to.equal(NEW_PRICE);
      expect(listedItem.seller).to.equal(alice.address);
    });
  });
  describe("setMarketplaceFee", () => {
    it("Fee should be changed to new fee", async () => {
      const newFee = 300; // fee changed from 2.5% to 3%
      await nftMarketplace.setMarketplaceFee(newFee);
      expect(await nftMarketplace.getMarketplaceFee()).to.equal(newFee);
    });
  });
  describe("OfferItem", () => {
    it("emits an event after offering", async () => {
      expect(
        await nftMarketplace.connect(vault).makeOffer(basicNft.address, TOKEN_ID_1, OFFER_PRICE_1, {
          value: OFFER_PRICE_1,
        }),
      ).to.emit(nftMarketplace, "ItemOffered");
    });
    it("exclusively items that have not been offered", async () => {
      const error = `NftMarketplace__AlreadyOffered("${basicNft.address}", ${TOKEN_ID_1}, "${vault.address}")`;
      await expect(
        nftMarketplace.connect(vault).makeOffer(basicNft.address, TOKEN_ID_1, OFFER_PRICE_1, {
          value: OFFER_PRICE_1,
        }),
      ).to.be.revertedWith(error);
    });
    it("Owner can't offer the item", async () => {
      const error = "NftMarketPlace__CanNotBeOwner";
      await expect(
        nftMarketplace.makeOffer(basicNft.address, TOKEN_ID_2, OFFER_PRICE_1, {
          value: OFFER_PRICE_1,
        }),
      ).to.be.revertedWith(error);
    });
    it("Price must be be more than 0", async () => {
      const error = "NftMarketPlace__PriceMustBeAboveZero";
      await expect(
        nftMarketplace.connect(alice).makeOffer(basicNft.address, TOKEN_ID_2, 0),
      ).to.be.revertedWith(error);
    });
  });
  describe("cancelOffering", () => {
    it("item should be offered to cancel offering", async () => {
      const error = `NftMarketplace__NoOffered("${basicNft.address}", ${TOKEN_ID_2}, "${alice.address}")`;
      await expect(
        nftMarketplace.connect(alice).cancelOffer(basicNft.address, TOKEN_ID_2),
      ).to.be.revertedWith(error);
    });
    it("emits an event after cancel listing", async () => {
      const oldBalance = await ethers.provider.getBalance(nftMarketplace.address);
      await nftMarketplace.connect(alice).makeOffer(basicNft.address, TOKEN_ID_2, OFFER_PRICE_2, {
        value: OFFER_PRICE_2,
      });
      const newBalance = await ethers.provider.getBalance(nftMarketplace.address);

      expect(newBalance.sub(oldBalance).gte(OFFER_PRICE_2)).to.be.eq(true);

      const oldAliceBalance = await alice.getBalance();

      expect(await nftMarketplace.connect(alice).cancelOffer(basicNft.address, TOKEN_ID_2)).to.be.emit(
        nftMarketplace,
        "ItemOfferCanceled",
      );

      const newAliceBalance = await alice.getBalance();

      expect(newAliceBalance.gt(oldAliceBalance)).to.be.eq(true);
    });
  });
  // describe("acceptOffer", () => {
  //   it("there should be offer to accept offer", async () => {
  //     await basicNft.mintNft();
  //     await basicNft.mintNft();
  //     const error = `NftMarketplace__NoOffered("${basicNft.address}", ${TOKEN_ID_4}, "${alice.address}")`;
  //     await expect(
  //       nftMarketplace.acceptOffer(
  //         basicNft.address,
  //         TOKEN_ID_4,
  //         deployer.address,
  //         COLLECTION_FEE,
  //         alice.address,
  //       ),
  //     ).to.be.revertedWith(error);
  //   });
  //   it("emits two events after accepting an offer", async () => {
  //     const balance = await ethers.provider.getBalance(nftMarketplace.address);

  //     await nftMarketplace.connect(alice).makeOffer(basicNft.address, TOKEN_ID_4, OFFER_PRICE_2, {
  //       value: OFFER_PRICE_2,
  //     });

  //     await basicNft.approve(nftMarketplace.address, TOKEN_ID_4);
  //     expect(
  //       await nftMarketplace.acceptOffer(
  //         basicNft.address,
  //         TOKEN_ID_4,
  //         collectionOwner.address,
  //         COLLECTION_FEE,
  //         alice.address,
  //       ),
  //     )
  //       .to.emit(nftMarketplace, "ItemOfferAccepted")
  //       .to.emit(nftMarketplace, "ProceedsTransferred");
  //   });
  //   it("Offer should be removed after accept offer", async () => {
  //     const offerPrice = await nftMarketplace.getOffer(basicNft.address, TOKEN_ID_4, alice.address);
  //     expect(offerPrice.toString()).to.equal("0");
  //   });
  //   it("Check ownership after accept offer", async () => {
  //     expect(await basicNft.ownerOf(TOKEN_ID_4)).to.equal(alice.address);
  //     // console.log(await ethers.provider.getBalance(nftMarketplace.address));
  //     // console.log((await alice.getBalance()).toString());
  //     // console.log((await deployer.getBalance()).toString());
  //     // console.log((await collectionOwner.getBalance()).toString());
  //   });
  // });
});
