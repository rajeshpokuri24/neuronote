const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/onboarding', authenticate, async (req, res) => {
  try {
    const { learning_speed, study_session_length, content_domain, sleep_study_habit, prior_srs_experience } = req.body;

    const { data, error } = await supabase
      .from('users')
      .update({
        learning_speed: learning_speed || 'average',
        study_session_length: study_session_length || 30,
        content_domain: content_domain || 'general',
        sleep_study_habit: sleep_study_habit || 'morning',
        prior_srs_experience: prior_srs_experience || false,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.user.id)
      .select('id, email, name, learning_speed, content_domain, onboarding_complete')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Onboarding failed' });
  }
});

router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: notesCount },
      { count: conceptsCount },
      { count: reviewsDue },
      { count: totalReviews },
      { data: recentSessionsData },
      { data: weeklyData },
      { data: streakData },
    ] = await Promise.all([
      supabase.from('notes').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('concepts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('review_items').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).or(`due_date.lte.${now},state.eq.new`),
      supabase.from('review_sessions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('review_sessions')
        .select('grade, created_at, review_item_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('review_sessions')
        .select('created_at, grade')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo),
      supabase.from('review_sessions')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false }),
    ]);

    // Enrich recent sessions with concept names
    let sessions = recentSessionsData || [];
    if (sessions.length > 0) {
      const riIds = sessions.map((s) => s.review_item_id);
      const { data: riData } = await supabase
        .from('review_items')
        .select('id, concepts(name)')
        .in('id', riIds);
      const riMap = {};
      (riData || []).forEach((ri) => { riMap[ri.id] = ri.concepts?.name; });
      sessions = sessions.map((s) => ({ ...s, concept_name: riMap[s.review_item_id] }));
    }

    // Streak calculation
    const distinctDates = [
      ...new Set((streakData || []).map((r) => r.created_at.split('T')[0])),
    ].sort().reverse();

    let streak = 0;
    for (let i = 0; i < distinctDates.length; i++) {
      const expected = new Date();
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];
      if (distinctDates[i] === expectedStr) streak++;
      else break;
    }

    // Weekly activity (group by day)
    const activityMap = {};
    (weeklyData || []).forEach((row) => {
      const dateStr = row.created_at.split('T')[0];
      if (!activityMap[dateStr]) activityMap[dateStr] = { count: 0, grades: [] };
      activityMap[dateStr].count++;
      activityMap[dateStr].grades.push(row.grade);
    });

    const daily_activity = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const day = activityMap[dateStr];
      return {
        date: dateStr,
        count: day?.count || 0,
        avg_grade: day ? parseFloat((day.grades.reduce((a, b) => a + b, 0) / day.grades.length).toFixed(2)) : 0,
      };
    });
    const weekly_reviews = daily_activity.reduce((s, d) => s + d.count, 0);

    const avgGrade = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.grade, 0) / sessions.length
      : 0;

    res.json({
      notes_count: notesCount || 0,
      concepts_count: conceptsCount || 0,
      reviews_due: reviewsDue || 0,
      total_reviews: totalReviews || 0,
      streak_days: streak,
      avg_grade: parseFloat(avgGrade.toFixed(2)),
      recent_sessions: sessions.slice(0, 5),
      weekly_reviews,
      daily_activity,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/profile', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, learning_speed, study_session_length, content_domain, sleep_study_habit, prior_srs_experience, success_rate, retention_score, onboarding_complete, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'User not found' });
    res.json(data);
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, learning_speed, study_session_length, content_domain, sleep_study_habit, prior_srs_experience } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (name) updates.name = name;
    if (learning_speed) updates.learning_speed = learning_speed;
    if (study_session_length) updates.study_session_length = study_session_length;
    if (content_domain) updates.content_domain = content_domain;
    if (sleep_study_habit) updates.sleep_study_habit = sleep_study_habit;
    if (prior_srs_experience !== undefined) updates.prior_srs_experience = prior_srs_experience;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, email, name, learning_speed, study_session_length, content_domain, sleep_study_habit, prior_srs_experience, onboarding_complete')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/activity', authenticate, async (req, res) => {
  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sessions } = await supabase
      .from('review_sessions')
      .select('created_at, grade')
      .eq('user_id', req.user.id)
      .gte('created_at', since);

    const activityMap = {};
    (sessions || []).forEach((row) => {
      const dateStr = row.created_at.split('T')[0];
      if (!activityMap[dateStr]) activityMap[dateStr] = { count: 0, grades: [] };
      activityMap[dateStr].count++;
      activityMap[dateStr].grades.push(row.grade);
    });

    const days = Array.from({ length: 91 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (90 - i));
      const dateStr = d.toISOString().split('T')[0];
      const day = activityMap[dateStr];
      return {
        date: dateStr,
        count: day?.count || 0,
        avg_grade: day ? parseFloat((day.grades.reduce((a, b) => a + b, 0) / day.grades.length).toFixed(2)) : 0,
      };
    });

    const total_days_active = Object.keys(activityMap).length;
    const total_reviews_period = days.reduce((s, d) => s + d.count, 0);
    res.json({ days, total_days_active, total_reviews_period });
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

router.get('/stats/weak-topics', authenticate, async (req, res) => {
  try {
    const { data: riData } = await supabase
      .from('review_items')
      .select('id, stability, reps, lapses, state, due_date, last_review, difficulty, concept_id')
      .eq('user_id', req.user.id)
      .in('state', ['review', 'relearning'])
      .gt('reps', 0)
      .limit(50);

    if (!riData || riData.length === 0) return res.json([]);

    const conceptIds = riData.map((ri) => ri.concept_id);
    const { data: conceptsData } = await supabase
      .from('concepts')
      .select('id, name, complexity_score, note_id, notes(title)')
      .in('id', conceptIds);

    const cMap = {};
    (conceptsData || []).forEach((c) => { cMap[c.id] = c; });

    const withRetention = riData.map((item) => {
      const concept = cMap[item.concept_id] || {};
      let current_retention;
      if (!item.last_review) {
        current_retention = 1.0;
      } else {
        const elapsedDays = (Date.now() - new Date(item.last_review).getTime()) / (86400 * 1000);
        const stability = item.stability || 1;
        current_retention = Math.pow(
          1 + (Math.pow(0.9, 1 / -0.5) - 1) * elapsedDays / stability,
          -0.5
        );
      }
      return {
        ...item,
        name: concept.name,
        complexity_score: concept.complexity_score,
        note_title: concept.notes?.title,
        current_retention,
      };
    });

    withRetention.sort((a, b) => a.current_retention - b.current_retention);
    res.json(withRetention.slice(0, 10));
  } catch (err) {
    console.error('Weak topics error:', err);
    res.status(500).json({ error: 'Failed to fetch weak topics' });
  }
});

router.get('/stats/time-spent', authenticate, async (req, res) => {
  try {
    const since = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sessions } = await supabase
      .from('review_sessions')
      .select('created_at, response_time_ms, grade')
      .eq('user_id', req.user.id)
      .gte('created_at', since)
      .not('response_time_ms', 'is', null);

    // Group by ISO week (Monday-based)
    const weekMap = {};
    (sessions || []).forEach((s) => {
      const d = new Date(s.created_at);
      const dayOfWeek = d.getDay();
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString();
      if (!weekMap[key]) weekMap[key] = { total_ms: 0, count: 0, grades: [] };
      weekMap[key].total_ms += s.response_time_ms;
      weekMap[key].count++;
      weekMap[key].grades.push(s.grade);
    });

    const weeks = Object.entries(weekMap)
      .map(([week_start, w]) => ({
        week_start,
        total_minutes: Math.round(w.total_ms / 60000),
        session_count: w.count,
        avg_grade: parseFloat((w.grades.reduce((a, b) => a + b, 0) / w.grades.length).toFixed(2)),
      }))
      .sort((a, b) => new Date(a.week_start) - new Date(b.week_start));

    const total_minutes = weeks.reduce((s, w) => s + w.total_minutes, 0);
    res.json({ weeks, total_minutes });
  } catch (err) {
    console.error('Time spent error:', err);
    res.status(500).json({ error: 'Failed to fetch time spent' });
  }
});

router.put('/settings/retention', authenticate, async (req, res) => {
  try {
    const { desired_retention } = req.body;
    const dr = parseFloat(desired_retention);
    if (isNaN(dr) || dr < 0.7 || dr > 0.97) {
      return res.status(400).json({ error: 'desired_retention must be between 0.70 and 0.97' });
    }
    const { error } = await supabase
      .from('users')
      .update({ desired_retention: dr, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (error) throw error;
    res.json({ desired_retention: dr });
  } catch (err) {
    console.error('Update retention error:', err);
    res.status(500).json({ error: 'Failed to update retention target' });
  }
});

router.get('/learning-path', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: riData } = await supabase
      .from('review_items')
      .select('id, concept_id, state, stability, difficulty, reps, lapses, due_date, last_review')
      .eq('user_id', userId);

    if (!riData || riData.length === 0) return res.json([]);

    const conceptIds = riData.map((ri) => ri.concept_id);
    const { data: conceptsData } = await supabase
      .from('concepts')
      .select('id, name, complexity_score, note_id, notes(title)')
      .in('id', conceptIds);

    const cMap = {};
    (conceptsData || []).forEach((c) => { cMap[c.id] = c; });

    const DECAY = -0.5;
    const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
    const now = Date.now();

    const scored = riData.map((item) => {
      const concept = cMap[item.concept_id] || {};
      const isDue = new Date(item.due_date) <= new Date();

      let retention = 1.0;
      if (item.last_review) {
        const elapsedDays = (now - new Date(item.last_review).getTime()) / 86400000;
        const stability = item.stability || 1;
        retention = Math.max(0, Math.pow(1 + FACTOR * elapsedDays / stability, DECAY));
      }

      let priority;
      let reason;
      if (item.state === 'relearning') {
        priority = 0.95 - (item.lapses || 0) * 0.01;
        reason = 'Needs reinforcement — recently failed';
      } else if (item.state === 'learning') {
        priority = 0.85;
        reason = 'In progress — keep the momentum';
      } else if (item.state === 'new') {
        const complexity = concept.complexity_score || 5;
        priority = 0.4 + complexity / 100;
        reason = 'New concept to learn';
      } else if (isDue) {
        priority = 0.65 + (1 - retention) * 0.3;
        reason = `Due now — ${Math.round(retention * 100)}% retention`;
      } else {
        priority = retention * 0.4;
        reason = `Upcoming — ${Math.round(retention * 100)}% retention`;
      }

      return {
        id: item.id,
        concept_name: concept.name,
        note_title: concept.notes?.title,
        state: item.state,
        stability: item.stability,
        reps: item.reps,
        lapses: item.lapses,
        due_date: item.due_date,
        retention: Math.round(retention * 100),
        complexity_score: concept.complexity_score,
        priority,
        reason,
        is_due: isDue,
      };
    });

    scored.sort((a, b) => b.priority - a.priority);
    res.json(scored.slice(0, 10));
  } catch (err) {
    console.error('Learning path error:', err);
    res.status(500).json({ error: 'Failed to generate learning path' });
  }
});

router.put('/learner-model', authenticate, async (req, res) => {
  try {
    const { success_rate, retention_score } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (success_rate !== undefined) updates.success_rate = success_rate;
    if (retention_score !== undefined) updates.retention_score = retention_score;

    const { error } = await supabase.from('users').update(updates).eq('id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Learner model update error:', err);
    res.status(500).json({ error: 'Failed to update learner model' });
  }
});

module.exports = router;
