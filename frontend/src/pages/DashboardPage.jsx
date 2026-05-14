import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, BookOpen, RotateCcw, Flame, Target, TrendingUp,
  MessageCircle, ArrowRight, Clock, Star, Activity, AlertTriangle, Share2, Navigation
} from 'lucide-react';
import { userAPI, reviewAPI, chatAPI } from '../api';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { user } = useStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [dueItems, setDueItems] = useState([]);
  const [briefing, setBriefing] = useState('');
  const [weakTopics, setWeakTopics] = useState([]);
  const [learningPath, setLearningPath] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [statsRes, dueRes] = await Promise.all([
        userAPI.getStats(),
        reviewAPI.getDue(),
      ]);
      setStats(statsRes.data);
      setDueItems(dueRes.data.slice(0, 5));

      // Load briefing + weak topics in background
      if (dueRes.data.length > 0) {
        chatAPI.getBriefing()
          .then((r) => setBriefing(r.data.briefing))
          .catch(() => {});
      }
      userAPI.getWeakTopics()
        .then((r) => setWeakTopics(r.data.slice(0, 5)))
        .catch(() => {});
      userAPI.getLearningPath()
        .then((r) => setLearningPath(r.data))
        .catch(() => {});
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTimeOfDay = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getRetentionColor = (retention) => {
    if (retention >= 0.8) return 'text-green-400';
    if (retention >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStateColor = (state) => {
    const map = { new: 'badge-new', learning: 'badge-learning', review: 'badge-review', relearning: 'badge-relearning' };
    return map[state] || 'badge-new';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {getTimeOfDay()}, {user?.name?.split(' ')[0]}! 👋
          </h1>
          <p className="text-gray-400 mt-0.5">Here's your learning overview</p>
        </div>
        {dueItems.length > 0 && (
          <button
            onClick={() => navigate('/review')}
            className="btn-primary"
          >
            <RotateCcw size={16} />
            Review Now ({stats?.reviews_due})
          </button>
        )}
      </div>

      {/* AI Briefing */}
      {briefing && (
        <div className="bg-violet-600/10 border border-violet-500/30 rounded-xl p-4 flex gap-3">
          <Brain size={20} className="text-violet-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-violet-300 text-sm font-medium mb-1">AI Study Briefing</p>
            <p className="text-gray-300 text-sm">{briefing}</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={BookOpen}
          label="Notes"
          value={stats?.notes_count || 0}
          color="blue"
        />
        <StatCard
          icon={Brain}
          label="Concepts"
          value={stats?.concepts_count || 0}
          color="violet"
        />
        <StatCard
          icon={RotateCcw}
          label="Due Today"
          value={stats?.reviews_due || 0}
          color={stats?.reviews_due > 0 ? 'red' : 'green'}
        />
        <StatCard
          icon={Flame}
          label="Day Streak"
          value={stats?.streak_days || 0}
          suffix="days"
          color="orange"
        />
      </div>

      {/* Weak topics alert */}
      {weakTopics.length > 0 && (
        <div className="card border-red-500/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              Fading Fast — Low Retention
            </h2>
            <button
              onClick={() => navigate('/review')}
              className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1"
            >
              Review now <ArrowRight size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {weakTopics.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
                title={`${t.note_title} · Retention: ${Math.round((t.current_retention || 0) * 100)}%`}
              >
                <span className="text-red-300 text-xs font-medium">{t.name}</span>
                <span className="text-red-500 text-xs">{Math.round((t.current_retention || 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended learning path */}
      {learningPath.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Navigation size={16} className="text-violet-400" />
              Recommended Study Path
            </h2>
            <button
              onClick={() => navigate('/review')}
              className="text-violet-400 hover:text-violet-300 text-xs flex items-center gap-1"
            >
              Start reviewing <ArrowRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {learningPath.slice(0, 5).map((item, idx) => (
              <div key={item.id} className="flex items-center gap-3 p-2.5 bg-navy-800 rounded-lg">
                <span className="text-violet-400 text-xs font-bold w-5 flex-shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-sm font-medium truncate">{item.concept_name}</p>
                  <p className="text-gray-500 text-xs">{item.reason}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium ${
                    item.retention >= 80 ? 'text-green-400' :
                    item.retention >= 60 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {item.retention}%
                  </span>
                  {item.is_due && (
                    <span className="text-xs bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded">Due</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Due for review */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <RotateCcw size={18} className="text-violet-400" />
              Due for Review
            </h2>
            {dueItems.length > 0 && (
              <button
                onClick={() => navigate('/review')}
                className="text-violet-400 hover:text-violet-300 text-sm flex items-center gap-1"
              >
                View all <ArrowRight size={14} />
              </button>
            )}
          </div>

          {dueItems.length === 0 ? (
            <div className="text-center py-8">
              <Star size={32} className="text-green-400 mx-auto mb-3" />
              <p className="text-white font-medium">All caught up!</p>
              <p className="text-gray-400 text-sm mt-1">No reviews due. Great work!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dueItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-navy-800 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-gray-200 text-sm font-medium truncate">
                      {item.concept_name}
                    </p>
                    <p className="text-gray-500 text-xs">{item.note_title}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={getStateColor(item.state)}>{item.state}</span>
                    <span className={`text-xs ${getRetentionColor(item.current_retention)}`}>
                      {Math.round(item.current_retention * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction
              icon={BookOpen}
              label="New Note"
              desc="Start writing"
              color="blue"
              onClick={() => navigate('/notes')}
            />
            <QuickAction
              icon={RotateCcw}
              label="Review"
              desc={`${stats?.reviews_due || 0} due`}
              color="violet"
              onClick={() => navigate('/review')}
            />
            <QuickAction
              icon={MessageCircle}
              label="AI Chat"
              desc="Get help"
              color="green"
              onClick={() => navigate('/chat')}
            />
            <QuickAction
              icon={TrendingUp}
              label="Progress"
              desc="View stats"
              color="orange"
              onClick={() => navigate('/progress')}
            />
            <QuickAction
              icon={Share2}
              label="Concept Graph"
              desc="Visual map"
              color="violet"
              onClick={() => navigate('/graph')}
            />
          </div>

          {/* 7-day activity */}
          {stats?.daily_activity && (
            <div className="card">
              <h3 className="text-gray-300 text-sm font-medium mb-3 flex items-center gap-2">
                <Activity size={14} className="text-violet-400" />
                7-Day Activity
              </h3>
              <WeeklyHeatmap data={stats.daily_activity} />
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-navy-700">
                <span className="text-gray-500 text-xs">This week</span>
                <span className="text-white text-sm font-medium">{stats.weekly_reviews} reviews</span>
              </div>
            </div>
          )}

          {/* Performance summary */}
          {stats && (
            <div className="card">
              <h3 className="text-gray-300 text-sm font-medium mb-3 flex items-center gap-2">
                <Target size={14} className="text-violet-400" />
                Performance
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total Reviews</span>
                  <span className="text-white text-sm font-medium">{stats.total_reviews}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Avg. Grade</span>
                  <span className="text-white text-sm font-medium">
                    {stats.avg_grade > 0 ? `${stats.avg_grade}/4` : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Learning Speed</span>
                  <span className="text-violet-300 text-sm font-medium capitalize">
                    {user?.learning_speed || 'average'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, suffix }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
    green: 'text-green-400 bg-green-500/10',
    red: 'text-red-400 bg-red-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
  };

  return (
    <div className="card">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon size={20} className={colors[color].split(' ')[0]} />
      </div>
      <p className="text-2xl font-bold text-white">
        {value}
        {suffix && <span className="text-sm text-gray-400 ml-1">{suffix}</span>}
      </p>
      <p className="text-gray-400 text-sm mt-0.5">{label}</p>
    </div>
  );
}

function WeeklyHeatmap({ data }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex gap-1.5 items-end">
      {data.map((day, i) => {
        const intensity = day.count / max;
        const isToday = day.date === new Date().toISOString().split('T')[0];
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="relative group">
              <div
                className="w-full rounded-sm transition-all duration-300"
                style={{
                  height: `${Math.max(intensity * 48, 4)}px`,
                  minHeight: '4px',
                  background: day.count === 0
                    ? 'rgba(255,255,255,0.05)'
                    : `rgba(139,92,246,${0.2 + intensity * 0.75})`,
                  outline: isToday ? '1px solid rgba(167,139,250,0.6)' : 'none',
                }}
              />
              {day.count > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-navy-700 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {day.count} reviews
                </div>
              )}
            </div>
            <span className="text-gray-600 text-xs">{format(new Date(day.date + 'T12:00:00'), 'EEE')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

function QuickAction({ icon: Icon, label, desc, color, onClick }) {
  const colors = {
    blue: 'border-blue-500/30 hover:bg-blue-500/10 text-blue-400',
    violet: 'border-violet-500/30 hover:bg-violet-500/10 text-violet-400',
    green: 'border-green-500/30 hover:bg-green-500/10 text-green-400',
    orange: 'border-orange-500/30 hover:bg-orange-500/10 text-orange-400',
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border bg-navy-900 transition-all duration-200 text-left ${colors[color]}`}
    >
      <Icon size={20} className="mb-2" />
      <p className="text-white text-sm font-medium">{label}</p>
      <p className="text-gray-500 text-xs">{desc}</p>
    </button>
  );
}
