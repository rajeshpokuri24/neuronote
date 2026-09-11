/**
 * Scores the BKT mastery model's predictions against real review outcomes.
 *
 * review_sessions only stores the grade given, not the p_know the model
 * predicted *before* that review — so this replays the same deterministic
 * update used in routes/review.js (submit handler) over each review_item's
 * session history in order, recording the pre-update prediction against the
 * actual outcome at each step.
 */
const supabase = require('../db');

const P_LEARN = 0.3, P_SLIP = 0.1, P_GUESS = 0.25;
const P_CORRECT_KNOW = 1 - P_SLIP;
const P_CORRECT_NOT_KNOW = P_GUESS;

function bktStep(pKnow, correct) {
  const likelihood = correct ? P_CORRECT_KNOW : (1 - P_CORRECT_KNOW);
  const likelihoodNot = correct ? P_CORRECT_NOT_KNOW : (1 - P_CORRECT_NOT_KNOW);
  const denom = pKnow * likelihood + (1 - pKnow) * likelihoodNot;
  const pKnowGivenEv = denom > 0 ? (pKnow * likelihood) / denom : pKnow;
  return Math.min(1, pKnowGivenEv + (1 - pKnowGivenEv) * P_LEARN);
}

function auc(pairs) {
  const pos = pairs.filter((p) => p.actual === 1).map((p) => p.predicted);
  const neg = pairs.filter((p) => p.actual === 0).map((p) => p.predicted);
  if (pos.length === 0 || neg.length === 0) return null;
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (pos.length * neg.length);
}

/**
 * @param {string|null} userId — scope to one user, or null to pool everyone
 */
async function evaluateBkt(userId = null) {
  let query = supabase
    .from('review_sessions')
    .select('review_item_id, grade, created_at, user_id')
    .order('review_item_id', { ascending: true })
    .order('created_at', { ascending: true });
  if (userId) query = query.eq('user_id', userId);

  const { data: sessions, error } = await query;
  if (error) throw error;
  if (!sessions || sessions.length === 0) {
    return { itemsEvaluated: 0, predictionsScored: 0, baseRate: null, accuracy: null, auc: null, brier: null };
  }

  const byItem = new Map();
  for (const s of sessions) {
    if (!byItem.has(s.review_item_id)) byItem.set(s.review_item_id, []);
    byItem.get(s.review_item_id).push(s);
  }

  const pairs = [];
  for (const itemSessions of byItem.values()) {
    let pKnow = 0.0;
    for (const s of itemSessions) {
      const correct = s.grade >= 2 ? 1 : 0;
      const predictedPCorrect = pKnow * P_CORRECT_KNOW + (1 - pKnow) * P_CORRECT_NOT_KNOW;
      pairs.push({ predicted: predictedPCorrect, actual: correct });
      pKnow = bktStep(pKnow, correct);
    }
  }

  const n = pairs.length;
  const accuracy = pairs.filter((p) => (p.predicted >= 0.5 ? 1 : 0) === p.actual).length / n;
  const brier = pairs.reduce((sum, p) => sum + (p.predicted - p.actual) ** 2, 0) / n;
  const aucScore = auc(pairs);
  const baseRate = pairs.filter((p) => p.actual === 1).length / n;

  return {
    itemsEvaluated: byItem.size,
    predictionsScored: n,
    baseRate,
    accuracy,
    auc: aucScore,
    brier,
  };
}

module.exports = { evaluateBkt };
