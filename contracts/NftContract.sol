// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract NftContract is ERC721URIStorage {
  uint256 private s_tokenCounter;

  event NftContractCreated(
    address indexed creator,
    address indexed contractAddress,
    string name,
    string symbol
  );

  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
    s_tokenCounter = 0;
    emit NftContractCreated(msg.sender, address(this), name_, symbol_);
  }

  function mintNft(string memory tokenURI) public returns (uint256) {
    _safeMint(msg.sender, s_tokenCounter);
    _setTokenURI(s_tokenCounter, tokenURI);
    s_tokenCounter = s_tokenCounter + 1;
    return s_tokenCounter - 1;
  }

  function getTokenCounter() public view returns (uint256) {
    return s_tokenCounter;
  }
}
