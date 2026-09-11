const express = require('express');
const { sendDueReminders, sendForgettingAlerts } = require('../jobs/notifications');

const router = express.Router();

// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron
// invocations once CRON_SECRET is set as a project env var — check for that.
function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.get('/due-reminders', requireCronSecret, async (req, res) => {
  await sendDueReminders();
  res.json({ ok: true });
});

router.get('/forgetting-alerts', requireCronSecret, async (req, res) => {
  await sendForgettingAlerts();
  res.json({ ok: true });
});

module.exports = router;
