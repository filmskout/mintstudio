// 0G Compute client (JS port of .claude/skills/0g-compute-integration/examples/client.ts)
// ALL inference in WolfProof goes through call() — this satisfies the track's hard
// requirement (official 0G API) and gives every response a proofRef for the audit trail.

const BASE_URL = process.env.ZG_BASE_URL ?? "https://router-api.0g.ai/v1";

export const MODELS = {
  judge: "0gm-1.0-35b-a3b", // 0G's own model — explicit bonus point
  wolves: "minimax-m3", // thinking model — stripThink before display
  villagers: "glm-5.2",
};

export function stripThink(text) {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "");
}

function findTeeVerified(obj) {
  if (obj === null || typeof obj !== "object") return null;
  if (typeof obj.tee_verified === "boolean") return obj.tee_verified;
  for (const v of Object.values(obj)) {
    const found = findTeeVerified(v);
    if (found !== null) return found;
  }
  return null;
}

export async function call(model, messages, opts = {}) {
  const apiKey = process.env.ZG_API_KEY;
  if (!apiKey) throw new Error("ZG_API_KEY not set");
  const retries = opts.retries ?? 2;
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-0G-Provider-Sort": "latency",
          "X-0G-Provider-Allow-Fallbacks": "true",
        },
        body: JSON.stringify({
          model,
          messages,
          verify_tee: true, // TEE signature verification — the core demo point
          ...(opts.temperature !== undefined && { temperature: opts.temperature }),
          ...(opts.maxTokens !== undefined && { max_tokens: opts.maxTokens }),
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`0G router ${res.status}: ${await res.text()}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`0G router ${res.status}: ${await res.text()}`);

      const data = await res.json();
      return {
        output: stripThink(data.choices?.[0]?.message?.content ?? ""),
        proofRef: res.headers.get("zg-res-key") ?? data.id ?? null,
        teeVerified: findTeeVerified(data),
        model,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Ask a model for JSON and parse it robustly (handles code fences / stray prose). */
export async function callJSON(model, messages, opts = {}) {
  const result = await call(model, messages, opts);
  const text = result.output;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const braceMatch = candidate.match(/\{[\s\S]*\}/);
  let json = null;
  try {
    json = JSON.parse(braceMatch ? braceMatch[0] : candidate);
  } catch {
    // caller decides fallback
  }
  return { ...result, json };
}
