// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

error NftMarketPlace__PriceMustBeAboveZero();
error NftMarketPlace__NotApprovedForMarketPlace();
error NftMarketPlace__NotOwner();
error NftMarketPlace__CanNotBeOwner();
error NftMarketPlace__AlreadyListed(address nftAddress, uint256 tokenId);
error NftMarketPlace__NotListed(address nftAddress, uint256 tokenId);
error NftMarketPlace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);
error NftMarketPlace__OfferPriceNotMet(address nftAddress, uint256 tokenId, uint256 offerPrice);
error NftMarketPlace__MarketplaceProceedsTransferFailed();
error NftMarketPlace__CollectionOwnerProceedsTransferFailed();
error NftMarketPlace__SellerProceedsTransferFailed();
error NftMarketPlace__CancelOfferProceedsTransferFailed();
error NftMarketPlace__NotSignedByMarketplaceOwner();
error NftMarketplace__AlreadyOffered(address nftAddress, uint256 tokenId, address offerAddress);
error NftMarketplace__NoOffered(address nftAddress, uint256 tokenId, address offerAddress);


contract NftMarketplace is ReentrancyGuard, Ownable {
  using ECDSA for bytes32;

  /// @notice Types
  struct Listing {
    uint256 price;
    address seller;
  }

  /// @notice NFT variables
  // marketplace fee (0 - 10000)
  uint16 private _fee = 250;
  // NFT Contract address -> NFT TokenID -> Listing
  mapping(address => mapping(uint256 => Listing)) private s_listings;

  mapping(address => mapping(uint256 => mapping(address => uint256))) public offers;

  /// @notice Events
  event ItemListed(
    address indexed seller,
    address indexed nftAddress,
    uint256 indexed tokenId,
    uint256 price
  );
  event ItemCanceled(address indexed seller, address indexed nftAddress, uint256 indexed tokenId);
  event ItemBought(
    address indexed buyer,
    address indexed seller,
    address indexed nftAddress,
    uint256 tokenId,
    uint256 price
  );
  event ProceedsTransferred(address indexed seller, uint256 totalAmount, uint16 marketplaceFee, uint16 collectionFee);
  event ItemOffered(
    address indexed offerAddress,
    address indexed nftAddress,
    uint256 indexed tokenId,
    uint256 price
  );
  event ItemOfferCanceled(
    address indexed offerAddress,
    address indexed nftAddress,
    uint256 indexed tokenId
  );
  event ItemOfferAccepted(
    address indexed buyer,
    address indexed seller,
    address indexed nftAddress,
    uint256 tokenId,
    uint256 price
  );

  /// @notice Modifiers
  modifier isOwner(
    address nftAddress,
    uint256 tokenId,
    address spender
  ) {
    IERC721 nft = IERC721(nftAddress);
    address owner = nft.ownerOf(tokenId);
    if (spender != owner) {
      revert NftMarketPlace__NotOwner();
    }
    _;
  }

  modifier isNotOwner(
    address nftAddress,
    uint256 tokenId,
    address spender
  ) {
    IERC721 nft = IERC721(nftAddress);
    address owner = nft.ownerOf(tokenId);
    if (spender == owner) {
      revert NftMarketPlace__CanNotBeOwner();
    }
    _;
  }

  modifier notListed(
    address nftAddress,
    uint256 tokenId
  ) {
    Listing memory listing = s_listings[nftAddress][tokenId];
    if (listing.price > 0) {
      revert NftMarketPlace__AlreadyListed(nftAddress, tokenId);
    }
    _;
  }

  modifier isListed(address nftAddress, uint256 tokenId) {
    Listing memory listing = s_listings[nftAddress][tokenId];
    if (listing.price <= 0) {
      revert NftMarketPlace__NotListed(nftAddress, tokenId);
    }
    _;
  }

  //////////////////////
  //  Main Functions //
  /////////////////////

  /**
   * @notice Function to list an NFT on sell
   * @dev
   * - Should include notListed and isOwner modifiers
   * - Should check that NFT price is >= 0, if not -> revert
   * - Should check that contract address has approve on the NFT to be transfered, if not -> revert
   * - Update mapping
   * - Emit event
   */
  function listItem(
    address nftAddress,
    uint256 tokenId,
    uint256 price
  ) external notListed(nftAddress, tokenId) isOwner(nftAddress, tokenId, msg.sender) {
    if (price <= 0) {
      revert NftMarketPlace__PriceMustBeAboveZero();
    }
    IERC721 nft = IERC721(nftAddress);
    if (nft.getApproved(tokenId) != address(this)) {
      revert NftMarketPlace__NotApprovedForMarketPlace();
    }
    s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
    emit ItemListed(msg.sender, nftAddress, tokenId, price);
  }

  /**
   * @notice Function to buy an NFT
   * @dev
   * - Payable to be able to receive ETH
   * - Should include nonReentrant modifier from Openzeppelin (avoid Reentrancy attack)
   * - Should include isListed modifier
   * - Should check if msg.value > price
   * - Delete listing mapping (item is not listed anymore)
   * - Transfer NFT (using OpenZeppeling safeTransferFrom function)
   * - Send Ether to the user, marketplace owner and collection owner
   * - Emit event
   */
  function buyItem(
    bytes calldata signature,
    address collectionOwner,
    uint16 collectionFee,
    address nftAddress,
    uint256 tokenId
  ) external payable nonReentrant isListed(nftAddress, tokenId) {
    Listing memory listedItem = s_listings[nftAddress][tokenId];
    if (msg.value < listedItem.price) {
      revert NftMarketPlace__PriceNotMet(nftAddress, tokenId, listedItem.price);
    }
    delete (s_listings[nftAddress][tokenId]);
    IERC721(nftAddress).safeTransferFrom(listedItem.seller, msg.sender, tokenId);
    transferProceeds(signature, collectionOwner, collectionFee, listedItem.seller, listedItem.price);
    emit ItemBought(msg.sender, listedItem.seller, nftAddress, tokenId, listedItem.price);
  }

  /**
   * @notice Function cancel NFT sell listing
   * @dev
   * - Should include isListed modifier
   * - Should include isOwner
   * - Delete listing mapping (item is not listed anymore)
   * - Emit event
   */
  function cancelListing(
    address nftAddress,
    uint256 tokenId
  ) external isOwner(nftAddress, tokenId, msg.sender) isListed(nftAddress, tokenId) {
    delete (s_listings[nftAddress][tokenId]);
    emit ItemCanceled(msg.sender, nftAddress, tokenId);
  }

  /**
   * @notice Function update selling NFT price
   * @dev
   * - Should include nonReentrant modifier from Openzeppelin (avoid Reentrancy attack)
   * - Should include isListed modifier
   * - Should include isOwner
   * - Update mapping
   * - Emit event
   */
  function updateListing(
    address nftAddress,
    uint256 tokenId,
    uint256 newPrice
  ) external nonReentrant isOwner(nftAddress, tokenId, msg.sender) isListed(nftAddress, tokenId) {
    s_listings[nftAddress][tokenId].price = newPrice;
    emit ItemListed(msg.sender, nftAddress, tokenId, newPrice);
  }

  /**
   * @notice Function to transfer proceeds
   * @dev
   * - Should verify marketplace owner, if not -> revert
   * - Calculate transfer amount
   * - Transfer funds to seller, marketplace owner and collection owner
   * - Check transfer is correctly done, if not -> revert
   */
  function transferProceeds(
    bytes calldata signature,
    address collectionOwner,
    uint16 collectionFee,
    address seller,
    uint256 price
  ) private {
    if (!verifyMarketplaceOwner(signature, collectionOwner, collectionFee)) {
      revert NftMarketPlace__NotSignedByMarketplaceOwner();
    }
    uint256 marketplaceProceeds = (price * _fee) / 10000;
    uint256 collectionOwnerProceeds = (price * collectionFee) / 10000;
    uint256 sellerProceeds = price - marketplaceProceeds - collectionOwnerProceeds;
    (bool successMarketplaceProceedsTransfer, ) = payable(owner()).call{value: marketplaceProceeds}("");
    if (!successMarketplaceProceedsTransfer) {
      revert NftMarketPlace__MarketplaceProceedsTransferFailed();
    }
    (bool successCollecionOwnerProceedsTransfer, ) = payable(collectionOwner).call{value: collectionOwnerProceeds}("");
    if (!successCollecionOwnerProceedsTransfer) {
      revert NftMarketPlace__CollectionOwnerProceedsTransferFailed();
    }
    (bool successSellerProceedsTransfer, ) = payable(seller).call{value: sellerProceeds}("");
    if (!successSellerProceedsTransfer) {
      revert NftMarketPlace__SellerProceedsTransferFailed();
    }
    emit ProceedsTransferred(seller, price, _fee, collectionFee);
  }

  /**
   * @notice Function to verify marketplace owner to get collection fee
   * @dev
   * - Should encode collection owner address, fee, buyer address
   * - Get message from ECDSA library
   * - Recover address
   * - Return boolean if same as owner() true, not false
   */
  function verifyMarketplaceOwner(
    bytes calldata signature,
    address collectionOwner,
    uint16 collectionFee
  ) private view returns (bool) {
    bytes32 hash = keccak256(abi.encodePacked(collectionOwner, collectionFee, msg.sender));
    bytes32 message = ECDSA.toEthSignedMessageHash(hash);
    address recoveredAddress = ECDSA.recover(message, signature);
    return (recoveredAddress == owner());
  }

  function makeOffer(
    address nftAddress,
    uint256 tokenId,
    uint256 offerPrice
  ) external payable isNotOwner(nftAddress, tokenId, msg.sender){
    if(offers[nftAddress][tokenId][msg.sender] != 0)
      revert NftMarketplace__AlreadyOffered(nftAddress, tokenId, msg.sender);

    if (msg.value < offerPrice) {
      revert NftMarketPlace__OfferPriceNotMet(nftAddress, tokenId, offerPrice);
    }

    if(offerPrice == 0)  revert NftMarketPlace__PriceMustBeAboveZero();

    offers[nftAddress][tokenId][msg.sender] = offerPrice;
    
    emit ItemOffered(msg.sender, nftAddress, tokenId, offerPrice);
  }

  function cancelOffer (
    address nftAddress,
    uint256 tokenId
  ) external nonReentrant isNotOwner(nftAddress, tokenId, msg.sender){
    if(offers[nftAddress][tokenId][msg.sender] == 0)
      revert NftMarketplace__NoOffered(nftAddress, tokenId, msg.sender);

        (bool successCancelOfferProceedsTransfer, ) = payable(msg.sender).call{value: offers[nftAddress][tokenId][msg.sender]}("");
    if (!successCancelOfferProceedsTransfer) {
      revert NftMarketPlace__CancelOfferProceedsTransferFailed();
    }

    offers[nftAddress][tokenId][msg.sender] = 0;

    emit ItemOfferCanceled(msg.sender, nftAddress, tokenId);
  }

    
  function acceptOffer(bytes calldata signature, address nftAddress, uint256 tokenId, address collectionOwner, uint16 collectionFee, address offerAddress) external nonReentrant isOwner(nftAddress, tokenId, msg.sender){
    if(offers[nftAddress][tokenId][offerAddress] == 0)
      revert NftMarketplace__NoOffered(nftAddress, tokenId, offerAddress);

    uint256 offerPrice = offers[nftAddress][tokenId][offerAddress];
    offers[nftAddress][tokenId][offerAddress] = 0;
    IERC721(nftAddress).safeTransferFrom(msg.sender, offerAddress, tokenId);

    transferProceeds(signature, collectionOwner, collectionFee, msg.sender, offerPrice);
    emit ItemOfferAccepted(offerAddress, msg.sender, nftAddress, tokenId, offerPrice);
  }

  //////////////////////
  //  Getter Functions //
  /////////////////////

  function getListing(address nftAddress, uint256 tokenId) external view returns (Listing memory) {
    return s_listings[nftAddress][tokenId];
  }

  function getOffer(address nftAddress, uint256 tokenId, address offerAddress) external view returns (uint256){
    return offers[nftAddress][tokenId][offerAddress];
  }

  function getMarketplaceFee() external view returns (uint16) {
    return _fee;
  }

  //////////////////////
  //  Setter Functions //
  /////////////////////

  function setMarketplaceFee(uint16 newFee) external onlyOwner {
    _fee = newFee;
  }
}
