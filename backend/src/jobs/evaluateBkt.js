/**
 * CLI wrapper around services/bktEval.js — prints BKT prediction accuracy
 * to the terminal. The same logic backs GET /api/review/accuracy.
 *
 * Usage: node src/jobs/evaluateBkt.js [userId]
 */
require('dotenv').config();
const { evaluateBkt } = require('../services/bktEval');

async function main() {
  const userId = process.argv[2] || null;
  const result = await evaluateBkt(userId);

  if (result.predictionsScored === 0) {
    console.log('No review sessions found — nothing to evaluate yet.');
    return;
  }

  console.log(`Review items evaluated: ${result.itemsEvaluated}`);
  console.log(`Predictions scored:     ${result.predictionsScored}`);
  console.log(`Base rate (% correct):  ${(result.baseRate * 100).toFixed(1)}%`);
  console.log(`Accuracy (0.5 thresh):  ${(result.accuracy * 100).toFixed(1)}%`);
  console.log(`AUC:                    ${result.auc !== null ? result.auc.toFixed(3) : 'n/a (only one class present)'}`);
  console.log(`Brier score (lower=better, 0-1): ${result.brier.toFixed(4)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
