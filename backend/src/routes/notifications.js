const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, created_at')
      .eq('user_id', req.user.id)
      .order('read', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    const notifications = data || [];
    const unread_count = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unread_count });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.patch('/read-all', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', req.user.id)
      .eq('read', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

router.delete('/', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Clear notifications error:', err);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

async function createNotification(userId, type, title, body = null) {
  try {
    await supabase
      .from('notifications')
      .insert({ user_id: userId, type, title, body });
  } catch (err) {
    console.error('[notifications] insert failed:', err.message);
  }
}

module.exports = router;
module.exports.createNotification = createNotification;
