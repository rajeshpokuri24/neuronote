import { useEffect, useState, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Brain, BookOpen, RotateCcw, MessageCircle, BarChart2,
  Menu, X, LogOut, Settings, Bell, Share2, Calendar
} from 'lucide-react';
import useStore from '../store/useStore';
import { reviewAPI, notificationsAPI } from '../api';
import toast from 'react-hot-toast';

const navItems = [
  { path: '/', icon: Brain, label: 'Dashboard', exact: true },
  { path: '/notes', icon: BookOpen, label: 'Notes' },
  { path: '/review', icon: RotateCcw, label: 'Review', badge: true },
  { path: '/chat', icon: MessageCircle, label: 'AI Assistant' },
  { path: '/progress', icon: BarChart2, label: 'Progress' },
  { path: '/graph', icon: Share2, label: 'Concept Graph' },
  { path: '/calendar', icon: Calendar, label: 'Revision Calendar' },
];

export default function Layout() {
  const { user, logout, sidebarOpen, setSidebarOpen, dueItems, setDueItems } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [dueCount, setDueCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  // Load due count and notifications on mount
  useEffect(() => {
    reviewAPI.getDue()
      .then((r) => { setDueItems(r.data); setDueCount(r.data.length); })
      .catch(() => {});
    loadNotifications();
  }, []);

  // Close bell dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadNotifications = () => {
    notificationsAPI.getAll()
      .then((r) => {
        setNotifications(r.data.notifications || []);
        setUnreadCount(r.data.unread_count || 0);
      })
      .catch(() => {});
  };

  const handleMarkAllRead = async () => {
    await notificationsAPI.markAllRead().catch(() => {});
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  const handleMarkRead = async (id) => {
    await notificationsAPI.markRead(id).catch(() => {});
    setNotifications((n) => n.map((x) => x.id === id ? { ...x, read: true } : x));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  // Auto-close sidebar on mobile when navigating
  useEffect(() => {
    if (window.innerWidth < 768 && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, flex item on desktop */}
      <aside
        className={`
          bg-navy-900 border-r border-navy-700 flex flex-col transition-all duration-300 flex-shrink-0
          fixed md:relative z-30 h-full
          ${sidebarOpen ? 'w-60' : 'w-16 -translate-x-full md:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-navy-700">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Brain size={18} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <span className="text-white font-bold text-lg leading-none">NeuroNote</span>
              <p className="text-gray-500 text-xs mt-0.5">AI Learning System</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label, exact, badge }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium
                 ${isActive
                   ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                   : 'text-gray-400 hover:text-gray-200 hover:bg-navy-800'
                 }`
              }
            >
              <div className="relative flex-shrink-0">
                <Icon size={18} />
                {badge && dueCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white flex items-center justify-center text-xs font-bold"
                    style={{ background: '#ef4444', fontSize: '10px' }}
                  >
                    {dueCount > 9 ? '9+' : dueCount}
                  </span>
                )}
              </div>
              {sidebarOpen && (
                <span className="flex-1">{label}</span>
              )}
              {sidebarOpen && badge && dueCount > 0 && (
                <span className="ml-auto text-xs font-bold text-red-400">{dueCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bell — desktop sidebar */}
        {sidebarOpen && (
          <div ref={bellRef} className="px-3 pb-2 relative">
            <button
              onClick={() => setBellOpen((o) => !o)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-navy-800 transition-all"
            >
              <div className="relative flex-shrink-0">
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white font-bold" style={{ fontSize: 9 }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="flex-1">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs font-bold text-red-400">{unreadCount}</span>
              )}
            </button>
            {bellOpen && (
              <NotificationDropdown
                notifications={notifications}
                onMarkRead={handleMarkRead}
                onMarkAll={handleMarkAllRead}
                onClose={() => setBellOpen(false)}
              />
            )}
          </div>
        )}

        {/* Bottom: Settings + User */}
        <div className="p-3 border-t border-navy-700 space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium
               ${isActive
                 ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                 : 'text-gray-400 hover:text-gray-200 hover:bg-navy-800'
               }`
            }
          >
            <Settings size={18} className="flex-shrink-0" />
            {sidebarOpen && <span>Settings</span>}
          </NavLink>

          <div className={`flex items-center gap-3 px-3 py-2 ${sidebarOpen ? '' : 'justify-center'}`}>
            <div className="w-7 h-7 bg-violet-600/30 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-violet-300 text-xs font-bold">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            {sidebarOpen && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-200 text-xs font-medium truncate">{user?.name}</p>
                  <p className="text-gray-600 text-xs truncate">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Logout"
                >
                  <LogOut size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden bg-navy-950 flex flex-col">
        {/* Mobile top bar — hamburger to open drawer */}
        <div className="md:hidden flex items-center gap-3 p-3 border-b border-navy-700 bg-navy-900 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center">
            <Brain size={14} className="text-white" />
          </div>
          <span className="text-white font-semibold text-sm flex-1">NeuroNote</span>
          {/* Bell — mobile */}
          <div ref={bellRef} className="relative">
            <button
              onClick={() => setBellOpen((o) => !o)}
              className="relative text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ fontSize: 9 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {bellOpen && (
              <NotificationDropdown
                notifications={notifications}
                onMarkRead={handleMarkRead}
                onMarkAll={handleMarkAllRead}
                onClose={() => setBellOpen(false)}
              />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NotificationDropdown({ notifications, onMarkRead, onMarkAll, onClose }) {
  const TYPE_LABELS = {
    due_reminder: { label: 'Due', color: 'text-violet-400' },
    forgetting_alert: { label: 'Forgetting', color: 'text-red-400' },
    streak: { label: 'Streak', color: 'text-orange-400' },
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-navy-800 border border-navy-600 rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-700">
        <span className="text-white text-sm font-semibold">Notifications</span>
        {notifications.some((n) => !n.read) && (
          <button
            onClick={onMarkAll}
            className="text-violet-400 hover:text-violet-300 text-xs transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-navy-700">
        {notifications.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-500 text-sm">
            No notifications
          </div>
        ) : (
          notifications.map((n) => {
            const meta = TYPE_LABELS[n.type] || { label: n.type, color: 'text-gray-400' };
            return (
              <button
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className={`w-full text-left px-4 py-3 hover:bg-navy-700 transition-colors ${n.read ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                  )}
                  <div className={n.read ? 'pl-4' : ''}>
                    <p className={`text-xs font-semibold ${meta.color} mb-0.5`}>{meta.label}</p>
                    <p className="text-gray-200 text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{n.body}</p>}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
