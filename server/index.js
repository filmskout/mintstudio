// MintStudio server — verifiable AI creation (0G) → NFT mint (0G Galileo testnet / simulated)
import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { call, callJSON } from "./zg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const IMG_DIR = path.join(DATA_DIR, "images");
fs.mkdirSync(IMG_DIR, { recursive: true });

const app = express();
const PORT = process.env.PORT ?? 8703;
const TITLE_MODEL = process.env.TITLE_MODEL ?? "0gm-1.0-35b-a3b";   // 0G's own model: title + caption
const PROMPT_MODEL = process.env.PROMPT_MODEL ?? "deepseek-v4-pro";  // image prompt engineering
const IMAGE_MODEL = process.env.IMAGE_MODEL ?? "z-image-turbo";
const BASE_URL = process.env.ZG_BASE_URL ?? "https://router-api.0g.ai/v1";

app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/images", express.static(IMG_DIR));
app.use(express.json());

// gallery persisted to disk so redeploys keep minted works
const GALLERY_FILE = path.join(DATA_DIR, "gallery.json");
let gallery = [];
try { gallery = JSON.parse(fs.readFileSync(GALLERY_FILE, "utf8")); } catch { /* fresh start */ }
const saveGallery = () => fs.writeFileSync(GALLERY_FILE, JSON.stringify(gallery, null, 2));

// ---- Step 1: verifiable creation (text + image, both on 0G) ----
app.post("/api/create", async (req, res) => {
  const idea = String(req.body?.idea ?? "").trim().slice(0, 200);
  if (!idea) return res.status(400).json({ error: "idea required" });
  try {
    // 1a. title + caption on 0GM (0G's own model, verified)
    const titleR = await callJSON(TITLE_MODEL, [
      { role: "system", content: 'You are a poetic art curator. Given a creative idea, reply ONLY with JSON: {"title":"<max 8 words, same language as the idea>","caption":"<poetic caption, max 30 words, same language as the idea>"}' },
      { role: "user", content: idea },
    ], { temperature: 0.9, maxTokens: 4000 });
    if (!titleR.json?.title) throw new Error("curator JSON unusable");

    // 1b. image prompt on deepseek (verified) — multi-model collaboration
    const promptR = await callJSON(PROMPT_MODEL, [
      { role: "system", content: 'You are an image-prompt engineer. Given a creative idea and its title, reply ONLY with JSON: {"imagePrompt":"<detailed English image generation prompt, max 60 words>"}' },
      { role: "user", content: `Idea: ${idea}\nTitle: ${titleR.json.title}` },
    ], { temperature: 0.8, maxTokens: 2500 });
    if (!promptR.json?.imagePrompt) throw new Error("prompt-engineer JSON unusable");
    const meta = { json: { ...titleR.json, imagePrompt: promptR.json.imagePrompt } };

    // 1b. image via 0G z-image-turbo
    const imgRes = await fetch(`${BASE_URL}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZG_API_KEY}` },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt: meta.json.imagePrompt, n: 1, size: "1024x1024" }),
    });
    if (!imgRes.ok) throw new Error(`image gen ${imgRes.status}: ${(await imgRes.text()).slice(0, 200)}`);
    const imgData = await imgRes.json();
    const b64 = imgData.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");
    const id = crypto.randomUUID().slice(0, 8);
    fs.writeFileSync(path.join(IMG_DIR, `${id}.png`), Buffer.from(b64, "base64"));
    const imageProofRef = imgRes.headers.get("zg-res-key") ?? imgData.id ?? null;

    const work = {
      id, idea,
      title: meta.json.title, caption: meta.json.caption, imagePrompt: meta.json.imagePrompt,
      image: `images/${id}.png`,
      provenance: {
        text: { model: titleR.model, proofRef: titleR.proofRef, teeVerified: titleR.teeVerified },
        prompt: { model: promptR.model, proofRef: promptR.proofRef, teeVerified: promptR.teeVerified },
        image: { model: IMAGE_MODEL, proofRef: imageProofRef },
        endpoint: "router-api.0g.ai/v1",
      },
      minted: null,
      createdAt: Date.now(),
    };
    gallery.unshift(work); saveGallery();
    res.json(work);
  } catch (err) {
    res.status(502).json({ error: String(err?.message ?? err) });
  }
});

// ---- Step 2: mint (0G Galileo testnet when wallet configured; simulated otherwise) ----
app.post("/api/mint/:id", async (req, res) => {
  const work = gallery.find((w) => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: "not found" });
  if (work.minted) return res.json(work);

  const metadata = {
    name: work.title,
    description: `${work.caption}\n\nAI provenance (0G verifiable inference): text proofRef=${work.provenance.text.proofRef}, prompt proofRef=${work.provenance.prompt?.proofRef ?? "n/a"}, image proofRef=${work.provenance.image.proofRef}`,
    image: work.image,
    attributes: [
      { trait_type: "text_model", value: work.provenance.text.model },
      { trait_type: "prompt_model", value: work.provenance.prompt?.model ?? "n/a" },
      { trait_type: "prompt_proof_ref", value: work.provenance.prompt?.proofRef ?? "n/a" },
      { trait_type: "image_model", value: work.provenance.image.model },
      { trait_type: "text_proof_ref", value: work.provenance.text.proofRef },
      { trait_type: "image_proof_ref", value: work.provenance.image.proofRef },
      { trait_type: "tee_verified", value: String(work.provenance.text.teeVerified) },
    ],
  };

  const rpc = process.env.ZG_CHAIN_RPC ?? "https://evmrpc-testnet.0g.ai";
  const pk = process.env.ZG_CHAIN_PRIVATE_KEY;
  const contract = process.env.ZG_NFT_CONTRACT || null; // optional — anchor-tx mode without it
  if (pk) {
    try {
      const { mintOnChain } = await import("./mint.js");
      work.minted = await mintOnChain({ rpc, pk, contract, metadata });
    } catch (err) {
      return res.status(502).json({ error: `on-chain mint failed: ${err.message}. Unset ZG_CHAIN_PRIVATE_KEY to use simulated mint.` });
    }
  } else {
    // simulated mint — clearly labeled; metadata hash is real & reproducible
    const hash = crypto.createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
    work.minted = {
      simulated: true,
      txHash: `0xSIM${hash.slice(0, 60)}`,
      tokenURI: `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`,
      metadataHash: hash,
      note: "simulated mint (no ZG_CHAIN_PRIVATE_KEY env) — metadata & hash are real; provenance proofRefs come from live 0G inference",
      ts: Date.now(),
    };
  }
  saveGallery();
  res.json(work);
});

app.get("/api/gallery", (req, res) => res.json(gallery.slice(0, 50)));

app.listen(PORT, () => console.log(`MintStudio listening on :${PORT}`));
