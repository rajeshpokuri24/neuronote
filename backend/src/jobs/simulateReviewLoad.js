/**
 * Simulates review load under SM-2 vs. this app's actual FSRS implementation
 * (services/fsrs.js), to get a real, reproducible number for "FSRS schedules
 * N% fewer reviews than SM-2 while holding the same retention" — instead of
 * quoting a figure nobody ran here.
 *
 * IMPORTANT — this is a synthetic benchmark, not a measurement of real users:
 * there's no dataset of real recall outcomes to replay, so a synthetic memory
 * model stands in for real students. The model is intentionally independent
 * of both schedulers (plain exponential decay + a generic spacing-effect
 * strengthening rule) so neither algorithm is graded against its own
 * assumptions — but it is still a model, not measured behavior. Treat the
 * output as "what this specific memory model implies," not ground truth.
 *
 * Usage: node src/jobs/simulateReviewLoad.js [agents] [concepts] [days] [seed]
 * Defaults: 500 agents, 200 concepts each, 90 days, seed=42
 */
const fsrs = require('../services/fsrs');

// --- seeded RNG (mulberry32) so runs are reproducible ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86400000;
const BASE_DATE = new Date('2020-01-01T00:00:00Z');
const dayToDate = (d) => new Date(BASE_DATE.getTime() + d * DAY_MS);

// --- ground-truth synthetic memory model ---
// Decay shape uses fsrs.retrievability() — the power-law forgetting curve is
// an established empirical model of human memory (Wixted & Ebbesen), not
// something invented for this scheduler, so reusing it as ground truth
// doesn't structurally favor FSRS. What *is* independent of both schedulers
// is how "true stability" evolves over time: a generic, simplified
// spacing-effect rule, not either algorithm's own fitted formulas.
function initTrueStability(rng) {
  return 1 + rng() * 2; // 1–3 days initial memory strength
}
function trueRetention(elapsedDays, trueS) {
  if (elapsedDays <= 0) return 1;
  return fsrs.retrievability(elapsedDays, trueS);
}
function updateTrueStability(trueS, elapsedDays, correct, rng) {
  if (correct) {
    const spacingRatio = Math.min(elapsedDays / trueS, 2.5);
    return trueS * (1 + 1.1 * spacingRatio) * (0.9 + rng() * 0.2);
  }
  return Math.max(trueS * 0.35, 0.5);
}
function gradeFromRecall(correct, rTrue) {
  if (!correct) return 1; // Again
  if (rTrue > 0.9) return 4; // Easy
  if (rTrue > 0.7) return 3; // Good
  return 2; // Hard — recalled, but it was close
}

// First exposure to a concept isn't a "recall" — there's no memory yet to
// test — so its initial grade is drawn independent of the (undefined) true
// retention, rather than forced to Easy. That avoids the artifact where a
// deterministic first-pass Easy rating gives FSRS an unrealistically huge
// first interval before any real forgetting has been observed.
function firstExposureGrade(rng) {
  const r = rng();
  if (r < 0.15) return 2; // Hard
  if (r < 0.75) return 3; // Good
  return 4; // Easy
}

// --- SM-2 (classic SuperMemo-2) ---
function sm2Update(item, quality) {
  let { repetitions, easiness, interval } = item;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easiness);
    repetitions += 1;
  }
  easiness = Math.max(1.3, easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  return { repetitions, easiness, interval };
}
const gradeToSm2Quality = { 1: 1, 2: 3, 3: 4, 4: 5 };

function simulate({ scheduler, agents, concepts, days, seed, desiredRetention = 0.85 }) {
  const rng = mulberry32(seed);
  let totalReviews = 0;
  let retentionSum = 0;
  let recallTests = 0; // reviews that actually tested memory (excludes first exposure)

  for (let a = 0; a < agents; a++) {
    for (let c = 0; c < concepts; c++) {
      let trueS = initTrueStability(rng);
      let dueDay = 0;
      let lastReviewDay = null;

      // FSRS item state
      let fsrsItem = {
        stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0,
        state: 'new', last_review: null, complexity_score: 1,
      };
      // SM-2 item state
      let sm2Item = { repetitions: 0, easiness: 2.5, interval: 0 };

      let day = 0;
      let guard = 0;
      while (day < days && guard < 400) {
        guard += 1;
        const isFirstExposure = lastReviewDay === null;
        const elapsed = isFirstExposure ? 0 : day - lastReviewDay;
        const rTrue = isFirstExposure ? 1 : trueRetention(elapsed, trueS);
        const correct = isFirstExposure ? true : rng() < rTrue;
        const grade = isFirstExposure ? firstExposureGrade(rng) : gradeFromRecall(correct, rTrue);

        totalReviews += 1;
        if (!isFirstExposure) {
          retentionSum += rTrue;
          recallTests += 1;
        }
        trueS = updateTrueStability(trueS, elapsed, correct, rng);

        let nextDueDay;
        if (scheduler === 'sm2') {
          const quality = gradeToSm2Quality[grade];
          sm2Item = sm2Update(sm2Item, quality);
          nextDueDay = day + Math.max(1, sm2Item.interval);
        } else {
          const now = dayToDate(day);
          const updated = fsrs.schedule(fsrsItem, grade, fsrs.DEFAULT_W, desiredRetention, now);
          fsrsItem = {
            stability: updated.stability,
            difficulty: updated.difficulty,
            reps: updated.reps,
            lapses: updated.lapses,
            state: updated.state,
            last_review: now,
            complexity_score: 1,
          };
          const scheduledDays = Math.round((updated.due_date - now) / DAY_MS);
          nextDueDay = day + Math.max(1, scheduledDays);
        }

        lastReviewDay = day;
        dueDay = nextDueDay;
        day = dueDay;
      }
    }
  }

  return {
    totalReviews,
    meanRetentionAtReview: recallTests > 0 ? retentionSum / recallTests : null,
  };
}

function main() {
  const agents = parseInt(process.argv[2], 10) || 500;
  const concepts = parseInt(process.argv[3], 10) || 200;
  const days = parseInt(process.argv[4], 10) || 90;
  const seed = parseInt(process.argv[5], 10) || 42;
  const desiredRetention = 0.85;

  console.log(`Simulating ${agents} agents x ${concepts} concepts over ${days} days (seed=${seed})...\n`);

  const t0 = Date.now();
  const sm2Result = simulate({ scheduler: 'sm2', agents, concepts, days, seed, desiredRetention });
  const fsrsResult = simulate({ scheduler: 'fsrs', agents, concepts, days, seed, desiredRetention });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  const reduction = (1 - fsrsResult.totalReviews / sm2Result.totalReviews) * 100;

  const fmtPct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
  console.log('SM-2:');
  console.log(`  Total reviews:            ${sm2Result.totalReviews.toLocaleString('en-US')}`);
  console.log(`  Mean retention at review: ${fmtPct(sm2Result.meanRetentionAtReview)}`);
  console.log('');
  console.log(`FSRS (desired retention ${desiredRetention * 100}%):`);
  console.log(`  Total reviews:            ${fsrsResult.totalReviews.toLocaleString('en-US')}`);
  console.log(`  Mean retention at review: ${fmtPct(fsrsResult.meanRetentionAtReview)}`);
  console.log('');
  console.log(`Review-load change (FSRS vs SM-2): ${reduction >= 0 ? '-' : '+'}${Math.abs(reduction).toFixed(1)}% reviews`);
  console.log(`(negative = fewer reviews than SM-2; positive = more)`);
  console.log(`\nDone in ${elapsedSec}s. This is a synthetic-model simulation — see file header before quoting the number.`);
}

main();
