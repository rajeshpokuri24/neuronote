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
const cronRoutes = require('./routes/cron');
const { sendDueReminders, sendForgettingAlerts } = require('./jobs/notifications');
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
app.use('/api/cron', cronRoutes);

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

// Locally (and on any other long-lived host) node-cron drives the daily jobs
// directly. On Vercel the process isn't long-lived, so these are also exposed
// as HTTP routes (see routes/cron.js) that Vercel Cron hits on the same
// schedule — see the "crons" entry in the root vercel.json.
if (!process.env.VERCEL) {
  cron.schedule('0 8 * * *', sendDueReminders);
  cron.schedule('0 18 * * *', sendForgettingAlerts);
}

// Warm the embedding model in the background so the first user request
// doesn't eat the cold-start cost. Failures are silent — RAG just stays off.
embeddings.warmup().then(() => {
  if (embeddings.isAvailable()) console.log('[embeddings] model warm');
});

// Only bind a port when run directly (`node src/index.js` / `npm run dev`).
// When Vercel's @vercel/node builder imports this file as a serverless
// function, it uses the exported `app` directly and must not see a listener.
if (require.main === module) {
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
  });
}

module.exports = app;
