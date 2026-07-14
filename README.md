# MintStudio — Verifiable AI Art → NFT with On-Chain Provenance

> AI³ Growth Hackathon 2026 · Track: **Build with 0G Private Computer**
>
> 全链路 0G:文本模型(TEE 可验证)写标题/文案/生图提示词 → 0G 自家图像模型 z-image-turbo 出图 → 一键铸 NFT,metadata 内嵌两个 0G proofRef —— 链上作品自带"AI 出处证明"。

**Live demo**: https://games.bigapple.store:8443/mintstudio/

## What it is

1. **Create (verified)** — type an idea. `deepseek-v4-pro` (0G, `verify_tee: true`) writes title, caption and a detailed image prompt; **`z-image-turbo`** (0G's own image model) paints it. Both proofRefs are displayed on the artwork card.
2. **Mint** — one click packages the work into ERC-721 metadata whose attributes embed `text_proof_ref`, `image_proof_ref` and `tee_verified`, then mints it **on 0G Chain itself** (Galileo testnet, chainId 16602) — an ERC-721 `mintWithURI` when `ZG_NFT_CONTRACT` is set, otherwise a provenance **anchor transaction** whose calldata is the metadata SHA-256, viewable on [chainscan-galileo.0g.ai](https://chainscan-galileo.0g.ai). Without a wallet key it falls back to a clearly-labeled **simulated** mint with a real, reproducible metadata SHA-256.
3. **Gallery** — every minted work shows its provenance box + tx.

**Why it matters (Web3 × NFT)**: AI-generated NFTs have a provenance problem — anyone can claim any model made anything. MintStudio's NFTs carry cryptographic references to the actual TEE-verified inferences that produced them: **provable AI provenance as a first-class NFT trait**.

## 0G Private Computer 模型接入方式 (Track hard requirement)

The **entire creative pipeline runs on 0G** — no third-party AI API:

| Step | Model | Endpoint |
|---|---|---|
| Title / caption / image prompt | `deepseek-v4-pro` | `POST https://router-api.0g.ai/v1/chat/completions` with `"verify_tee": true` |
| Image | `z-image-turbo` (0G image model) | `POST https://router-api.0g.ai/v1/images/generations` |

Auth: `Authorization: Bearer $ZG_API_KEY` (pc.0g.ai dashboard, wallet-funded). Each response's `ZG-Res-Key` header is kept as the **proofRef** and written into the NFT metadata.

## Run locally

```bash
npm install
export ZG_API_KEY="sk-..."          # from https://pc.0g.ai
# optional — real on-chain mint (otherwise simulated, clearly labeled):
# export ZG_CHAIN_PRIVATE_KEY=0x...   # 0G Galileo testnet wallet (faucet.0g.ai); RPC defaults to evmrpc-testnet.0g.ai
# export ZG_NFT_CONTRACT=0x...        # optional ERC-721; without it mint = provenance anchor tx
npm start                            # http://localhost:8703
```

## Architecture

```
public/index.html   # composer + gallery (vanilla JS)
server/index.js     # POST /api/create (0G text+image), POST /api/mint/:id, GET /api/gallery
server/mint.js      # ethers v6 → 0G Galileo: ERC-721 mintWithURI or anchor tx (loaded when ZG_CHAIN_PRIVATE_KEY set)
server/zg.js        # shared 0G client → {output, proofRef, teeVerified}
data/               # generated images + gallery.json (persisted)
```

## Iteration plan

1. Deploy a dedicated ERC-721 on 0G Galileo → 0G mainnet
2. Public verification page: recompute metadata hash + link proofRefs to pc.0g.ai verifier when its Proof ID lookup ships
3. Royalty split to the model provider — provenance-based revenue sharing
4. Collections: themed drops where the whole set shares one verifiable generation session

## License

MIT
