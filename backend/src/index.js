require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const supabase = require('./db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const notesRoutes = require('./routes/notes');
const reviewRoutes = require('./routes/review');
const chatRoutes = require('./routes/chat');
const conceptsRoutes = require('./routes/concepts');
const notificationsRoutes = require('./routes/notifications');
const { createNotification } = require('./routes/notifications');
const embeddings = require('./services/embeddings');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, please try again later.',
});
app.use('/api/', apiLimiter);

// AI endpoints get stricter limits (Groq API rate limits)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'AI request limit reached, please wait a moment.',
});
app.use('/api/notes/:id/process', aiLimiter);
app.use('/api/review/:id/generate', aiLimiter);
app.use('/api/chat/message', aiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/concepts', conceptsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    project: 'NeuroNote',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// FSRS retention constants
const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

// Daily cron at 8 AM — insert due-review notifications for every user
cron.schedule('0 8 * * *', async () => {
  try {
    const now = new Date().toISOString();
    const { data: dueItems } = await supabase
      .from('review_items')
      .select('user_id')
      .or(`due_date.lte.${now},state.eq.new`);

    // Group by user_id in JS
    const userCounts = {};
    (dueItems || []).forEach((ri) => {
      userCounts[ri.user_id] = (userCounts[ri.user_id] || 0) + 1;
    });

    const twenty = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    for (const [userId, count] of Object.entries(userCounts)) {
      if (count === 0) continue;

      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'due_reminder')
        .gte('created_at', twenty)
        .limit(1);
      if (existing && existing.length > 0) continue;

      await createNotification(
        userId,
        'due_reminder',
        `${count} concept${count > 1 ? 's' : ''} due for review`,
        'Open NeuroNote to keep your memory sharp. Your retention drops the longer you wait.'
      );
    }

    const userCount = Object.keys(userCounts).length;
    if (userCount > 0) {
      console.log(`[cron] Sent due-review notifications to ${userCount} user(s)`);
    }
  } catch (e) {
    console.error('[cron] Notification send failed:', e.message);
  }
});

// Forgetting-alert cron at 6 PM — warn users about items with very low retention
cron.schedule('0 18 * * *', async () => {
  try {
    const { data: atRiskItems } = await supabase
      .from('review_items')
      .select('user_id, last_review, stability')
      .in('state', ['review', 'relearning'])
      .not('last_review', 'is', null);

    // Compute retention in JS; flag items below 50%
    const userCounts = {};
    (atRiskItems || []).forEach((item) => {
      const elapsedDays = (Date.now() - new Date(item.last_review).getTime()) / 86400000;
      const stability = item.stability || 1;
      const ret = Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
      if (ret < 0.5) {
        userCounts[item.user_id] = (userCounts[item.user_id] || 0) + 1;
      }
    });

    const twenty = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    for (const [userId, cnt] of Object.entries(userCounts)) {
      if (cnt < 3) continue;

      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'forgetting_alert')
        .gte('created_at', twenty)
        .limit(1);
      if (recent && recent.length > 0) continue;

      await createNotification(
        userId,
        'forgetting_alert',
        `${cnt} concept${cnt > 1 ? 's are' : ' is'} fading fast`,
        'Your retention is below 50% on several topics. Review them now to prevent forgetting.'
      );
    }
  } catch (e) {
    console.error('[cron] Forgetting alert failed:', e.message);
  }
});

app.listen(PORT, async () => {
  // Reset any 'new' items that have a future due_date — they should always be due now
  try {
    const now = new Date().toISOString();
    await supabase
      .from('review_items')
      .update({ due_date: now })
      .eq('state', 'new')
      .gt('due_date', now);
  } catch (e) { /* non-fatal */ }

  console.log(`\n🧠 NeuroNote Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`\nSetup checklist:`);
  console.log(`  1. Copy .env.example to .env and fill in values`);
  console.log(`  2. Run: npm run db:setup`);
  console.log(`  3. Start frontend: cd ../frontend && npm run dev\n`);

  // Warm the embedding model in the background so the first user request
  // doesn't eat the cold-start cost. Failures are silent — RAG just stays off.
  embeddings.warmup().then(() => {
    if (embeddings.isAvailable()) console.log('[embeddings] model warm');
  });
});

module.exports = app;
