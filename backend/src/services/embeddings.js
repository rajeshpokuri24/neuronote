/**
 * Embeddings service — local ONNX inference via @xenova/transformers.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (384 dims, ~25MB quantized).
 * No API key required. First call downloads the model to ./models.
 *
 * Falls back to a no-op (returns null) if the runtime can't load the model,
 * so the rest of the app keeps working.
 */

const path = require('path');

let pipelinePromise = null;
let embedder = null;
let disabled = false;

async function getEmbedder() {
  if (disabled) return null;
  if (embedder) return embedder;
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      try {
        // @xenova/transformers is ESM-only; use dynamic import from CJS
        const { pipeline, env } = await import('@xenova/transformers');
        // Cache models inside the backend dir so they persist across reinstalls
        env.cacheDir = path.join(__dirname, '..', '..', 'models');
        env.allowLocalModels = true;
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          quantized: true,
        });
        return embedder;
      } catch (err) {
        console.error('[embeddings] Failed to load model — embeddings disabled:', err.message);
        disabled = true;
        return null;
      }
    })();
  }
  return pipelinePromise;
}

/**
 * Encode a single string. Returns a Float32Array(384) or null on failure.
 */
async function embed(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const model = await getEmbedder();
  if (!model) return null;

  try {
    const output = await model(trimmed.slice(0, 4000), {
      pooling: 'mean',
      normalize: true,
    });
    return Array.from(output.data);
  } catch (err) {
    console.error('[embeddings] embed failed:', err.message);
    return null;
  }
}

/**
 * Encode multiple strings sequentially. Returns array of (Array<number> | null).
 * The model isn't designed for true batching from JS — running sequentially is
 * simpler and still fast (~30ms per text on CPU).
 */
async function embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const results = [];
  for (const t of texts) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await embed(t));
  }
  return results;
}

/**
 * Format a JS number array as the pgvector text representation: '[0.1,0.2,...]'.
 * Pass directly as a query parameter — Postgres will coerce to vector or text.
 */
function toPgVector(arr) {
  if (!arr || !Array.isArray(arr)) return null;
  return '[' + arr.map((n) => Number(n).toFixed(6)).join(',') + ']';
}

/**
 * Best-effort warm-up so the first user request doesn't pay the cold-start tax.
 * Failures are silent — the rest of the app still works.
 */
async function warmup() {
  try {
    await embed('warmup');
  } catch { /* ignore */ }
}

function isAvailable() {
  return !disabled;
}

module.exports = {
  embed,
  embedBatch,
  toPgVector,
  warmup,
  isAvailable,
  DIMENSIONS: 384,
};
