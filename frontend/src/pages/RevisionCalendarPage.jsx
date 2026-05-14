import { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Loader, RotateCcw, Brain } from 'lucide-react';
import { reviewAPI } from '../api';
import { format, addDays, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function getLoadColor(count) {
  if (count === 0) return 'bg-navy-800 text-gray-600';
  if (count <= 5) return 'bg-violet-900/40 text-violet-300 border border-violet-700/40';
  if (count <= 15) return 'bg-violet-700/40 text-violet-200 border border-violet-600/40';
  if (count <= 30) return 'bg-violet-600/50 text-white border border-violet-500/50';
  return 'bg-violet-500/70 text-white border border-violet-400/60';
}

export default function RevisionCalendarPage() {
  const navigate = useNavigate();
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewOffset, setViewOffset] = useState(0); // weeks offset from today

  useEffect(() => {
    loadForecast();
  }, []);

  const loadForecast = async () => {
    setLoading(true);
    try {
      const r = await reviewAPI.getForecast(60);
      setForecast(r.data.forecast);
    } catch {
      toast.error('Failed to load forecast');
    } finally {
      setLoading(false);
    }
  };

  const forecastMap = Object.fromEntries(forecast.map((f) => [f.date, f]));

  // Build a 6-week view starting from the Sunday before today + viewOffset weeks
  const today = startOfDay(new Date());
  const viewStart = addDays(today, viewOffset * 7 - today.getDay());
  const weeks = Array.from({ length: 6 }, (_, wi) =>
    Array.from({ length: 7 }, (_, di) => {
      const d = addDays(viewStart, wi * 7 + di);
      const dateStr = d.toISOString().split('T')[0];
      const data = forecastMap[dateStr] || null;
      return { date: d, dateStr, data };
    })
  );

  const totalDue = forecast.reduce((s, f) => s + f.count, 0);
  const peakDay = forecast.reduce((m, f) => (f.count > (m?.count || 0) ? f : m), null);
  const avgPerDay = forecast.length > 0
    ? Math.round(totalDue / forecast.filter((f) => f.count > 0).length) || 0
    : 0;

  const monthLabel = () => {
    const m1 = MONTHS[viewStart.getMonth()];
    const end = addDays(viewStart, 41);
    const m2 = MONTHS[end.getMonth()];
    const y = viewStart.getFullYear();
    return m1 === m2 ? `${m1} ${y}` : `${m1} / ${m2} ${y}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Building revision calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar size={22} className="text-violet-400" />
            Revision Calendar
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Upcoming review load for the next 60 days
          </p>
        </div>
        <button
          onClick={() => navigate('/review')}
          className="btn-primary"
        >
          <RotateCcw size={15} />
          Start Review
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-violet-400">{totalDue}</p>
          <p className="text-gray-400 text-sm mt-0.5">Total due (60 days)</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-violet-400">{avgPerDay}</p>
          <p className="text-gray-400 text-sm mt-0.5">Avg per active day</p>
        </div>
        <div className="card text-center">
          {peakDay ? (
            <>
              <p className="text-2xl font-bold text-violet-400">{peakDay.count}</p>
              <p className="text-gray-400 text-sm mt-0.5">
                Peak on {format(new Date(peakDay.date + 'T12:00:00'), 'MMM d')}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-green-400">0</p>
              <p className="text-gray-400 text-sm mt-0.5">No items due</p>
            </>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewOffset((o) => o - 1)}
            className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-white font-semibold">{monthLabel()}</h2>
          <button
            onClick={() => setViewOffset((o) => o + 1)}
            className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-gray-600 text-xs font-medium py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
            {week.map(({ date, dateStr, data }) => {
              const isToday = dateStr === today.toISOString().split('T')[0];
              const isPast = date < today;
              const count = data?.count || 0;

              return (
                <div
                  key={dateStr}
                  className={`
                    relative rounded-lg p-1.5 text-center transition-all min-h-[52px] flex flex-col items-center justify-start
                    ${isPast ? 'opacity-40' : ''}
                    ${getLoadColor(count)}
                    ${isToday ? 'ring-2 ring-violet-400' : ''}
                  `}
                  title={count > 0
                    ? `${format(date, 'MMM d')}: ${count} reviews`
                    : format(date, 'MMM d')
                  }
                >
                  <span className={`text-xs font-medium ${isToday ? 'text-violet-300' : ''}`}>
                    {format(date, 'd')}
                  </span>
                  {count > 0 && (
                    <span className="text-xs font-bold mt-0.5">
                      {count}
                    </span>
                  )}
                  {count > 0 && data?.new_count > 0 && (
                    <span className="text-xs opacity-60" title={`${data.new_count} new`}>
                      +{data.new_count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-navy-700">
          <span className="text-gray-600 text-xs">Load:</span>
          {[
            { label: '0', cls: 'bg-navy-800' },
            { label: '1–5', cls: 'bg-violet-900/40 border border-violet-700/40' },
            { label: '6–15', cls: 'bg-violet-700/40 border border-violet-600/40' },
            { label: '16–30', cls: 'bg-violet-600/50 border border-violet-500/50' },
            { label: '30+', cls: 'bg-violet-500/70 border border-violet-400/60' },
          ].map(({ label, cls }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-4 h-4 rounded ${cls}`} />
              <span className="text-gray-500 text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Today's breakdown */}
      {(() => {
        const todayStr = today.toISOString().split('T')[0];
        const todayData = forecastMap[todayStr];
        if (!todayData || todayData.count === 0) return null;
        return (
          <div className="card border-violet-500/20">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Brain size={16} className="text-violet-400" />
              Today's Review Breakdown
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-violet-400">{todayData.new_count}</p>
                <p className="text-gray-500 text-xs">New</p>
              </div>
              <div>
                <p className="text-lg font-bold text-yellow-400">{todayData.learning_count}</p>
                <p className="text-gray-500 text-xs">Learning</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-400">{todayData.review_count}</p>
                <p className="text-gray-500 text-xs">Review</p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
