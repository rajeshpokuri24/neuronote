/**
 * FSRS-4.5 (Free Spaced Repetition Scheduler)
 * Implementation based on the FSRS algorithm paper
 * Reduces review load by 20-40% vs SM-2
 *
 * Grades: 1=Again, 2=Hard, 3=Good, 4=Easy
 * States: new, learning, review, relearning
 */

const DECAY = -0.5;
const FACTOR = 0.9 ** (1 / DECAY) - 1;

// Default FSRS-4.5 weights (can be personalized per user)
const DEFAULT_W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651,
  0.0589, 1.5330, 0.1544, 1.0070, 1.9390, 0.1100, 0.2900,
  2.2700, 0.2900, 2.9898, 0.5100, 0.3400,
];

/**
 * Retrieval probability at time t given stability S
 */
function retrievability(t, S) {
  return (1 + FACTOR * (t / S)) ** DECAY;
}

/**
 * Initial stability based on grade
 */
function initStability(grade, w) {
  return Math.max(w[grade - 1], 0.1);
}

/**
 * Initial difficulty based on grade
 */
function initDifficulty(grade, w) {
  return Math.min(Math.max(w[4] - Math.exp(w[5] * (grade - 1)) + 1, 1), 10);
}

/**
 * Next difficulty after review
 */
function nextDifficulty(D, grade, w) {
  const nextD = D - w[6] * (grade - 3);
  return Math.min(Math.max(meanReversion(w[4], nextD, w), 1), 10);
}

function meanReversion(init, current, w) {
  return w[7] * init + (1 - w[7]) * current;
}

/**
 * Next stability after successful recall (grade >= 2)
 */
function nextRecallStability(D, S, R, grade, w) {
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  return (
    S *
    (Math.exp(w[8]) *
      (11 - D) *
      Math.pow(S, -w[9]) *
      (Math.exp((1 - R) * w[10]) - 1) *
      hardPenalty *
      easyBonus +
      1)
  );
}

/**
 * Next stability after forgetting (grade = 1)
 */
function nextForgetStability(D, S, R, w) {
  return (
    w[11] *
    Math.pow(D, -w[12]) *
    (Math.pow(S + 1, w[13]) - 1) *
    Math.exp((1 - R) * w[14])
  );
}

/**
 * Calculate next interval (days) based on desired retention.
 * desiredRetention is user-specific (0.70–0.97); defaults to 0.9.
 */
function nextInterval(S, desiredRetention = 0.9) {
  const dr = Math.min(0.97, Math.max(0.70, desiredRetention));
  const interval = (S / FACTOR) * (dr ** (1 / DECAY) - 1);
  return Math.max(1, Math.round(interval));
}

/**
 * Main FSRS scheduling function
 * Returns updated item state after a review.
 * desiredRetention: user-specific target (0.70–0.97).
 */
function schedule(item, grade, w = DEFAULT_W, desiredRetention = 0.9) {
  const now = new Date();
  const elapsed = item.last_review
    ? Math.max(0, Math.round((now - new Date(item.last_review)) / (1000 * 60 * 60 * 24)))
    : 0;

  let { stability, difficulty, reps, lapses, state } = item;

  // Parse complexity: complex topics forget faster (lower initial stability)
  const complexityPenalty = item.complexity_score ? (item.complexity_score - 1) * 0.1 : 0;

  let newStability, newDifficulty, newState, newScheduledDays;

  if (state === 'new') {
    // First time seeing this concept
    newStability = Math.max(initStability(grade, w) - complexityPenalty, 0.1);
    newDifficulty = initDifficulty(grade, w);

    if (grade === 1) {
      newState = 'learning';
      newScheduledDays = 0; // Review again soon (same day)
    } else if (grade === 2) {
      newState = 'learning';
      newScheduledDays = 1;
    } else {
      newState = 'review';
      newScheduledDays = nextInterval(newStability, desiredRetention);
    }
  } else if (state === 'learning' || state === 'relearning') {
    newDifficulty = nextDifficulty(difficulty, grade, w);

    if (grade === 1) {
      newStability = initStability(1, w);
      newState = state; // Stay in learning
      newScheduledDays = 0;
    } else {
      const R = elapsed > 0 ? retrievability(elapsed, stability) : 0.9;
      newStability = grade >= 2
        ? nextRecallStability(difficulty, stability, R, grade, w)
        : nextForgetStability(difficulty, stability, R, w);
      newState = 'review';
      newScheduledDays = nextInterval(newStability, desiredRetention);
    }
  } else {
    // state === 'review'
    const R = elapsed > 0 ? retrievability(elapsed, stability) : 0.9;
    newDifficulty = nextDifficulty(difficulty, grade, w);

    if (grade === 1) {
      // Forgot it
      newStability = nextForgetStability(difficulty, stability, R, w);
      newState = 'relearning';
      newScheduledDays = 1;
      lapses += 1;
    } else {
      newStability = nextRecallStability(difficulty, stability, R, grade, w);
      newState = 'review';
      newScheduledDays = nextInterval(newStability, desiredRetention);
    }
  }

  reps += 1;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + newScheduledDays);

  return {
    stability: parseFloat(newStability.toFixed(4)),
    difficulty: parseFloat(newDifficulty.toFixed(4)),
    elapsed_days: elapsed,
    scheduled_days: newScheduledDays,
    reps,
    lapses,
    state: newState,
    due_date: dueDate,
    last_review: now,
  };
}

/**
 * Get initial FSRS item for a new concept
 * Adjusted based on learner profile and topic complexity
 */
function createReviewItem(conceptId, userId, complexityScore, learnerProfile) {
  const now = new Date();

  // New items are always due immediately — the user should see them right away
  // after processing a note. FSRS scheduling kicks in after the first review.
  return {
    concept_id: conceptId,
    user_id: userId,
    stability: 1.0,
    difficulty: Math.min(10, Math.max(1, complexityScore * 2)),
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    due_date: now,
    last_review: null,
  };
}

/**
 * Get items due for review
 */
function getDueItems(items) {
  const now = new Date();
  return items.filter((item) => new Date(item.due_date) <= now);
}

/**
 * Calculate current retrievability for display
 */
function getCurrentRetention(item) {
  if (!item.last_review || item.state === 'new') return 1.0;
  const elapsed = Math.round(
    (Date.now() - new Date(item.last_review).getTime()) / (1000 * 60 * 60 * 24)
  );
  return parseFloat(retrievability(elapsed, item.stability).toFixed(3));
}

module.exports = {
  schedule,
  createReviewItem,
  getDueItems,
  getCurrentRetention,
  retrievability,
  nextInterval,
  DEFAULT_W,
};
