/**
 * Context-Aware Forgetting Model
 *
 * context_factor is a modifier in (0, 1] that slows or accelerates forgetting.
 * Used by review.js to post-hoc adjust the scheduled interval.
 */

const supabase = require('../db');

const W_TOD = 0.25;
const W_CONSISTENCY = 0.45;
const W_INTERFERENCE = 0.30;

const HABIT_HOURS = {
  morning:   { start: 6,  end: 12 },
  afternoon: { start: 12, end: 18 },
  evening:   { start: 18, end: 22 },
  night:     { start: 22, end: 26 },
};

function todScore(currentHour, habit) {
  const range = HABIT_HOURS[habit] || HABIT_HOURS.morning;
  const h = currentHour % 24;
  const inRange = range.end <= 24
    ? h >= range.start && h < range.end
    : h >= range.start || h < (range.end - 24);
  return inRange ? 1.0 : 0.7;
}

async function consistencyScore(userId) {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('study_events')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', since);

    const distinctDates = new Set((data || []).map((r) => r.created_at.split('T')[0]));
    return Math.min(1.0, distinctDates.size / 14.0);
  } catch {
    return 0.5;
  }
}

async function interferenceScore(userId, currentConceptId) {
  try {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('review_sessions')
      .select('review_item_id')
      .eq('user_id', userId)
      .gte('created_at', since);

    if (!data || data.length === 0) return 0.0;

    const reviewItemIds = data.map((s) => s.review_item_id);
    const { data: riData } = await supabase
      .from('review_items')
      .select('concept_id')
      .in('id', reviewItemIds);

    const distinctConcepts = new Set(
      (riData || [])
        .map((r) => r.concept_id)
        .filter((id) => id !== currentConceptId)
    );
    return Math.min(1.0, distinctConcepts.size / 10.0);
  } catch {
    return 0.0;
  }
}

async function getContextFactor(userId, userProfile, conceptId) {
  const currentHour = new Date().getHours();
  const habit = userProfile?.sleep_study_habit || 'morning';

  const [consistency, interference] = await Promise.all([
    consistencyScore(userId),
    interferenceScore(userId, conceptId),
  ]);

  const tod = todScore(currentHour, habit);

  const factor =
    1.0
    - W_TOD * (tod - 0.5)
    - W_CONSISTENCY * (consistency - 0.5)
    + W_INTERFERENCE * interference;

  return Math.min(1.3, Math.max(0.7, parseFloat(factor.toFixed(3))));
}

function applyContextFactor(baseInterval, contextFactor) {
  return Math.max(1, Math.round(baseInterval / contextFactor));
}

module.exports = { getContextFactor, applyContextFactor, todScore };
