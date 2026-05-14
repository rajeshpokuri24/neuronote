import { useEffect, useState } from 'react';
import {
  BarChart2, Brain, Target, TrendingUp, Calendar, Award,
  BookOpen, RotateCcw, Flame, Clock, Activity
} from 'lucide-react';
import { userAPI, reviewAPI } from '../api';
import { formatDistanceToNow, format } from 'date-fns';

// FSRS retention: R(t) = (1 + t / (S * FACTOR))^DECAY
const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
function retention(t, stability) {
  if (stability <= 0) return 1;
  return Math.pow(1 + t / (stability * FACTOR), DECAY);
}

export default function ProgressPage() {
  const [stats, setStats] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, itemsRes, histRes, activityRes] = await Promise.all([
        userAPI.getStats(),
        reviewAPI.getAll(),
        reviewAPI.getHistory(),
        userAPI.getActivity(),
      ]);
      setStats(statsRes.data);
      setAllItems(itemsRes.data);
      setHistory(histRes.data);
      setActivity(activityRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const stateDistribution = () => {
    const counts = { new: 0, learning: 0, review: 0, relearning: 0 };
    allItems.forEach((item) => { counts[item.state] = (counts[item.state] || 0) + 1; });
    return counts;
  };

  const gradeDistribution = () => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    history.slice(0, 100).forEach((s) => { counts[s.grade] = (counts[s.grade] || 0) + 1; });
    return counts;
  };

  const getRetentionColor = (r) => {
    if (r >= 0.8) return 'text-green-400';
    if (r >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStateColor = (s) => {
    const map = { new: 'bg-blue-500', learning: 'bg-yellow-500', review: 'bg-green-500', relearning: 'bg-red-500' };
    return map[s] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const dist = stateDistribution();
  const grades = gradeDistribution();
  const total = allItems.length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 size={24} className="text-violet-400" />
            Learning Progress
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">Your knowledge retention analytics</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 bg-navy-900 rounded-xl p-1 w-fit border border-navy-700">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'streak', label: 'Streak Calendar' },
          { id: 'concepts', label: 'Concepts' },
          { id: 'history', label: 'History' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-violet-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={BookOpen} label="Total Notes" value={stats?.notes_count || 0} color="blue" />
            <MetricCard icon={Brain} label="Concepts" value={stats?.concepts_count || 0} color="violet" />
            <MetricCard icon={RotateCcw} label="Total Reviews" value={stats?.total_reviews || 0} color="green" />
            <MetricCard icon={Flame} label="Day Streak" value={stats?.streak_days || 0} suffix="days" color="orange" />
          </div>

          {/* State distribution */}
          <div className="card">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Target size={16} className="text-violet-400" />
              Knowledge State Distribution
            </h3>
            {total === 0 ? (
              <p className="text-gray-500 text-sm">No concepts yet. Process some notes to get started.</p>
            ) : (
              <>
                <div className="h-4 rounded-full overflow-hidden flex mb-4">
                  {Object.entries(dist).map(([state, count]) => (
                    count > 0 && (
                      <div
                        key={state}
                        className={`${getStateColor(state)} transition-all`}
                        style={{ width: `${(count / total) * 100}%` }}
                        title={`${state}: ${count}`}
                      />
                    )
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(dist).map(([state, count]) => (
                    <div key={state} className="text-center">
                      <div className={`w-3 h-3 rounded-full ${getStateColor(state)} mx-auto mb-1`} />
                      <p className="text-white font-bold">{count}</p>
                      <p className="text-gray-400 text-xs capitalize">{state}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Grade distribution */}
          <div className="card">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Award size={16} className="text-violet-400" />
              Review Performance (last 100)
            </h3>
            {history.length === 0 ? (
              <p className="text-gray-500 text-sm">No reviews yet. Start reviewing to see your performance.</p>
            ) : (
              <div className="space-y-3">
                {[
                  { g: 4, label: 'Easy', color: 'bg-blue-500' },
                  { g: 3, label: 'Good', color: 'bg-green-500' },
                  { g: 2, label: 'Hard', color: 'bg-orange-500' },
                  { g: 1, label: 'Again', color: 'bg-red-500' },
                ].map(({ g, label, color }) => {
                  const count = grades[g] || 0;
                  const total100 = history.slice(0, 100).length;
                  const pct = total100 > 0 ? (count / total100) * 100 : 0;
                  return (
                    <div key={g} className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm w-12">{label}</span>
                      <div className="flex-1 h-3 bg-navy-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-full transition-all duration-1000`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-gray-400 text-sm w-16 text-right">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Forgetting curve */}
          <div className="card">
            <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
              <TrendingUp size={16} className="text-violet-400" />
              Retention Curves
            </h3>
            <p className="text-gray-500 text-xs mb-4">
              Memory decay over time — each line is a concept. Reviews boost retention back up.
            </p>
            <ForgettingCurveChart items={allItems} />
          </div>

          {/* Due forecast */}
          <div className="card">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-violet-400" />
              Upcoming Reviews
            </h3>
            <DueForecast items={allItems} />
          </div>
        </div>
      )}

      {activeTab === 'streak' && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-3xl font-bold text-white">{stats?.streak_days || 0}</p>
              <p className="text-gray-400 text-sm mt-1 flex items-center justify-center gap-1">
                <Flame size={14} className="text-orange-400" /> Day Streak
              </p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-white">{activity?.total_days_active || 0}</p>
              <p className="text-gray-400 text-sm mt-1">Active days (90d)</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-white">{activity?.total_reviews_period || 0}</p>
              <p className="text-gray-400 text-sm mt-1">Reviews (90d)</p>
            </div>
          </div>

          {/* Calendar heatmap */}
          <div className="card">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Activity size={16} className="text-violet-400" />
              Review Activity — Last 13 Weeks
            </h3>
            {activity ? (
              <StreakCalendar days={activity.days} />
            ) : (
              <p className="text-gray-500 text-sm">Loading activity data...</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'concepts' && (
        <div className="space-y-2">
          {allItems.length === 0 ? (
            <div className="text-center py-12">
              <Brain size={40} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">No concepts yet. Process your notes with AI.</p>
            </div>
          ) : (
            allItems.map((item) => (
              <div key={item.id} className="card flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium">{item.concept_name}</p>
                  <p className="text-gray-500 text-xs">{item.note_title}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-sm">
                  <div className="text-center">
                    <p className="text-gray-400 text-xs">Stability</p>
                    <p className="text-white">{parseFloat(item.stability).toFixed(1)}d</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 text-xs">Reviews</p>
                    <p className="text-white">{item.reps}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 text-xs">Retention</p>
                    <p className={getRetentionColor(item.current_retention)}>
                      {Math.round(item.current_retention * 100)}%
                    </p>
                  </div>
                  <span className={`badge badge-${item.state}`}>{item.state}</span>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Due</p>
                    <p className="text-white text-xs">
                      {new Date(item.due_date) <= new Date()
                        ? 'Now'
                        : formatDistanceToNow(new Date(item.due_date), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-2">
          {history.length === 0 ? (
            <div className="text-center py-12">
              <Clock size={40} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">No review history yet.</p>
            </div>
          ) : (
            history.map((session) => {
              const gradeColors = { 1: 'text-red-400', 2: 'text-orange-400', 3: 'text-green-400', 4: 'text-blue-400' };
              const gradeLabels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
              return (
                <div key={session.id} className="flex items-center justify-between p-3 bg-navy-900 rounded-xl border border-navy-700">
                  <div>
                    <p className="text-white text-sm">{session.concept_name}</p>
                    <p className="text-gray-500 text-xs capitalize">{session.review_type} · {format(new Date(session.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                  <span className={`font-medium text-sm ${gradeColors[session.grade]}`}>
                    {gradeLabels[session.grade]}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color, suffix }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
    green: 'text-green-400 bg-green-500/10',
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
      <p className="text-gray-400 text-sm">{label}</p>
    </div>
  );
}

function StreakCalendar({ days }) {
  // days: array of 91 {date, count, avg_grade} objects
  // Build a 13-col × 7-row grid (Sun–Sat, oldest week first)
  const today = new Date().toISOString().split('T')[0];

  // Pad to start on Sunday
  const firstDate = new Date(days[0].date + 'T12:00:00');
  const startPad = firstDate.getDay(); // 0=Sun
  const cells = [...Array(startPad).fill(null), ...days];

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  const cellColor = (count) => {
    if (!count) return 'rgba(255,255,255,0.04)';
    const intensity = count / maxCount;
    if (intensity < 0.25) return 'rgba(124,58,237,0.25)';
    if (intensity < 0.5) return 'rgba(124,58,237,0.45)';
    if (intensity < 0.75) return 'rgba(124,58,237,0.7)';
    return 'rgba(124,58,237,0.95)';
  };

  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div>
      <div className="flex gap-1">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-1 mr-1">
          {DAY_LABELS.map((l, i) => (
            <div key={i} className="w-3 h-3 flex items-center justify-center">
              <span style={{ fontSize: '8px', color: 'rgba(156,163,175,0.5)' }}>{i % 2 === 1 ? l : ''}</span>
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {Array.from({ length: 7 }, (_, di) => {
                const cell = week[di];
                if (!cell) return (
                  <div key={di} className="w-3 h-3 rounded-sm" style={{ background: 'transparent' }} />
                );
                const isToday = cell.date === today;
                return (
                  <div
                    key={di}
                    className="w-3 h-3 rounded-sm relative group cursor-default"
                    style={{
                      background: cellColor(cell.count),
                      outline: isToday ? '1px solid rgba(167,139,250,0.8)' : 'none',
                    }}
                    title={`${cell.date}: ${cell.count} review${cell.count !== 1 ? 's' : ''}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3">
        <span style={{ fontSize: '10px', color: 'rgba(156,163,175,0.5)' }}>Less</span>
        {[0, 0.2, 0.5, 0.8, 1].map((v) => (
          <div key={v} className="w-3 h-3 rounded-sm" style={{ background: cellColor(v * maxCount) }} />
        ))}
        <span style={{ fontSize: '10px', color: 'rgba(156,163,175,0.5)' }}>More</span>
      </div>
    </div>
  );
}

function ForgettingCurveChart({ items }) {
  if (items.length === 0) {
    return <p className="text-gray-600 text-sm text-center py-6">No concepts yet — process some notes to see retention curves.</p>;
  }

  const W = 600;
  const H = 180;
  const padL = 44;
  const padR = 16;
  const padT = 12;
  const padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxDay = 30;

  const toX = (day) => padL + (day / maxDay) * chartW;
  const toY = (r) => padT + (1 - r) * chartH;

  // Sample up to 12 concepts for readability
  const sample = items.slice(0, 12);

  const paths = sample.map((item) => {
    const S = parseFloat(item.stability) || 1;
    const lastReview = item.last_review ? new Date(item.last_review) : new Date();
    const daysSince = Math.max(0, (Date.now() - lastReview.getTime()) / 86400000);

    const pts = [];
    for (let t = 0; t <= maxDay; t += 0.6) {
      const r = retention(t + daysSince, S);
      pts.push([toX(t), toY(Math.max(0, r))]);
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  });

  // Average stability for the "mean" curve
  const avgS = items.reduce((s, i) => s + (parseFloat(i.stability) || 1), 0) / items.length;
  const avgPts = [];
  for (let t = 0; t <= maxDay; t += 0.5) {
    avgPts.push([toX(t), toY(Math.max(0, retention(t, avgS)))]);
  }
  const avgPath = avgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  const retColors = ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: '600px', display: 'block' }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1.0].map((r) => (
        <g key={r}>
          <line x1={padL} y1={toY(r)} x2={W - padR} y2={toY(r)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <text x={padL - 6} y={toY(r) + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.2)">
            {Math.round(r * 100)}%
          </text>
        </g>
      ))}

      {/* Day labels */}
      {[0, 7, 14, 21, 30].map((d) => (
        <text key={d} x={toX(d)} y={H - 8} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.2)">
          {d}d
        </text>
      ))}

      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      {/* Individual concept curves */}
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={retColors[i % retColors.length]} strokeWidth="1" opacity="0.35" />
      ))}

      {/* Average curve */}
      <path d={avgPath} fill="none" stroke="#a78bfa" strokeWidth="2.5"
        style={{ filter: 'drop-shadow(0 0 5px rgba(167,139,250,0.45))' }}
      />

      {/* Today marker */}
      <line x1={toX(0)} y1={padT} x2={toX(0)} y2={H - padB} stroke="rgba(167,139,250,0.4)" strokeWidth="1.5" strokeDasharray="3,2" />
      <text x={toX(0) + 4} y={padT + 10} fontSize="8" fill="rgba(167,139,250,0.6)">Today</text>

      {/* Legend */}
      <line x1={W - padR - 120} y1={padT + 8} x2={W - padR - 100} y2={padT + 8} stroke="#a78bfa" strokeWidth="2" />
      <text x={W - padR - 96} y={padT + 12} fontSize="8" fill="rgba(255,255,255,0.4)">Avg retention</text>
      <line x1={W - padR - 120} y1={padT + 22} x2={W - padR - 100} y2={padT + 22} stroke="#6366f1" strokeWidth="1" opacity="0.4" />
      <text x={W - padR - 96} y={padT + 26} fontSize="8" fill="rgba(255,255,255,0.3)">Per concept</text>
    </svg>
  );
}

function DueForecast({ items }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  const countForDay = (day) => {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    return items.filter((item) => {
      const due = new Date(item.due_date);
      return due >= start && due <= end;
    }).length;
  };

  const counts = days.map((d) => ({ date: d, count: countForDay(d) }));
  const max = Math.max(...counts.map((c) => c.count), 1);

  return (
    <div className="flex gap-3 items-end">
      {counts.map(({ date, count }, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-gray-400 text-xs">{count}</span>
          <div
            className="w-full rounded-t bg-violet-500/60 min-h-[4px] transition-all duration-500"
            style={{ height: `${Math.max((count / max) * 80, 4)}px` }}
          />
          <span className="text-gray-500 text-xs">
            {i === 0 ? 'Today' : format(date, 'EEE')}
          </span>
        </div>
      ))}
    </div>
  );
}
