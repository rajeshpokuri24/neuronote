const supabase = require('../db');
const { createNotification } = require('../routes/notifications');

// FSRS retention constants
const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

function formatDueTime(dueDate) {
  const diffMs = new Date(dueDate).getTime() - Date.now();
  if (diffMs <= 0) return 'now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return new Date(dueDate).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Insert due-review notifications for every user with items due now, naming
// which concepts (and which note they came from) so the alert says exactly
// where and when the review is, not just a bare count.
async function sendDueReminders() {
  try {
    const now = new Date().toISOString();
    const { data: dueItems } = await supabase
      .from('review_items')
      .select('user_id, due_date, concepts(name, notes(title))')
      .or(`due_date.lte.${now},state.eq.new`)
      .order('due_date', { ascending: true });

    // Group by user_id in JS
    const byUser = {};
    (dueItems || []).forEach((ri) => {
      if (!byUser[ri.user_id]) byUser[ri.user_id] = [];
      byUser[ri.user_id].push(ri);
    });

    const twenty = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    for (const [userId, items] of Object.entries(byUser)) {
      if (items.length === 0) continue;

      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'due_reminder')
        .gte('created_at', twenty)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const names = items.map((i) => i.concepts?.name).filter(Boolean);
      const shown = names.slice(0, 3).join(', ');
      const remainder = names.length - 3;
      const where = remainder > 0 ? `${shown}, and ${remainder} more` : shown;
      const earliestDue = items[0].due_date;
      const noteTitles = [...new Set(items.map((i) => i.concepts?.notes?.title).filter(Boolean))];

      await createNotification(
        userId,
        'due_reminder',
        `${items.length} concept${items.length > 1 ? 's' : ''} due for review`,
        `${where || 'Your queued concepts'} — due ${formatDueTime(earliestDue)}` +
          (noteTitles.length ? ` (from "${noteTitles.slice(0, 2).join('", "')}")` : ''),
        '/review'
      );
    }

    const userCount = Object.keys(byUser).length;
    if (userCount > 0) {
      console.log(`[cron] Sent due-review notifications to ${userCount} user(s)`);
    }
  } catch (e) {
    console.error('[cron] Notification send failed:', e.message);
  }
}

// Warn users about items with very low (< 50%) predicted retention.
async function sendForgettingAlerts() {
  try {
    const { data: atRiskItems } = await supabase
      .from('review_items')
      .select('user_id, last_review, stability, due_date, concepts(name)')
      .in('state', ['review', 'relearning'])
      .not('last_review', 'is', null);

    // Compute retention in JS; flag items below 50%
    const byUser = {};
    (atRiskItems || []).forEach((item) => {
      const elapsedDays = (Date.now() - new Date(item.last_review).getTime()) / 86400000;
      const stability = item.stability || 1;
      const ret = Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
      if (ret < 0.5) {
        if (!byUser[item.user_id]) byUser[item.user_id] = [];
        byUser[item.user_id].push(item);
      }
    });

    const twenty = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    for (const [userId, items] of Object.entries(byUser)) {
      if (items.length < 3) continue;

      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'forgetting_alert')
        .gte('created_at', twenty)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const names = items.map((i) => i.concepts?.name).filter(Boolean);
      const shown = names.slice(0, 3).join(', ');
      const remainder = names.length - 3;
      const where = remainder > 0 ? `${shown}, and ${remainder} more` : shown;

      await createNotification(
        userId,
        'forgetting_alert',
        `${items.length} concept${items.length > 1 ? 's are' : ' is'} fading fast`,
        `${where} — below 50% retention. Review them now, before your next due date, to prevent forgetting.`,
        '/review'
      );
    }
  } catch (e) {
    console.error('[cron] Forgetting alert failed:', e.message);
  }
}

module.exports = { sendDueReminders, sendForgettingAlerts };
