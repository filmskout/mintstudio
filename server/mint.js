// Real on-chain mint via BOT Chain (EVM-compatible). Used only when BOTCHAIN_* env is set.
// Minimal ERC-721 mintWithURI(address,string) call via ethers.
import { ethers } from "ethers";

const ABI = ["function mintWithURI(address to, string uri) returns (uint256)"];

export async function mintOnChain({ rpc, pk, contract, metadata }) {
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const nft = new ethers.Contract(contract, ABI, wallet);
  const tokenURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
  const tx = await nft.mintWithURI(wallet.address, tokenURI);
  const receipt = await tx.wait();
  return {
    simulated: false,
    txHash: receipt.hash,
    tokenURI,
    explorer: `https://scan.botchain.ai/tx/${receipt.hash}`,
    ts: Date.now(),
  };
}
