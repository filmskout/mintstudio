// On-chain mint on 0G Chain (Galileo testnet, chainId 16602) via ethers.
// Two modes, both real transactions on 0G:
//  - ZG_NFT_CONTRACT set → ERC-721 mintWithURI(address,string)
//  - no contract         → provenance anchor tx: 0-value tx to self whose
//    calldata is the SHA-256 of the NFT metadata (verifiable on chainscan)
import { createHash } from "node:crypto";
import { ethers } from "ethers";

const ABI = ["function mintWithURI(address to, string uri) returns (uint256)"];
export const EXPLORER = "https://chainscan-galileo.0g.ai";

export async function mintOnChain({ rpc, pk, contract, metadata }) {
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const json = JSON.stringify(metadata);
  const metadataSha256 = createHash("sha256").update(json).digest("hex");

  let receipt, tokenURI = null, mode;
  if (contract) {
    mode = "erc721";
    const nft = new ethers.Contract(contract, ABI, wallet);
    tokenURI = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
    const tx = await nft.mintWithURI(wallet.address, tokenURI);
    receipt = await tx.wait();
  } else {
    mode = "anchor";
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0n,
      data: "0x" + metadataSha256,
    });
    receipt = await tx.wait();
  }

  return {
    simulated: false,
    chain: "0G Galileo testnet (chainId 16602)",
    mode,
    txHash: receipt.hash,
    metadataSha256,
    tokenURI,
    explorer: `${EXPLORER}/tx/${receipt.hash}`,
    minter: wallet.address,
    ts: Date.now(),
  };
}
