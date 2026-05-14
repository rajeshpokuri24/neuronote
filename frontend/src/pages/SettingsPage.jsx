import { useEffect, useState } from 'react';
import {
  Settings, User, Brain, Clock, BookOpen, Moon, Zap,
  Save, Loader, Check, Shield, LogOut, ChevronRight, Target
} from 'lucide-react';
import { userAPI } from '../api';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const LEARNING_SPEEDS = [
  { value: 'fast', label: 'Fast Learner', desc: 'Grasps concepts quickly, less repetition needed' },
  { value: 'average', label: 'Average', desc: 'Steady pace with regular review' },
  { value: 'slow', label: 'Careful Learner', desc: 'Deep understanding before moving on' },
];

const DOMAINS = [
  { value: 'technical', label: 'Technical / STEM', desc: 'CS, Math, Engineering, Science' },
  { value: 'conceptual', label: 'Conceptual / Theory', desc: 'Philosophy, Law, Business' },
  { value: 'language', label: 'Language / Humanities', desc: 'Languages, Literature, History' },
  { value: 'general', label: 'Mixed / General', desc: 'Various topics' },
];

const SESSION_LENGTHS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2+ hours' },
];

const STUDY_TIMES = [
  { value: 'morning', label: 'Morning', desc: 'Before 12 PM' },
  { value: 'afternoon', label: 'Afternoon', desc: '12 PM – 6 PM' },
  { value: 'evening', label: 'Evening', desc: '6 PM – 10 PM' },
  { value: 'night', label: 'Night Owl', desc: 'After 10 PM' },
];

export default function SettingsPage() {
  const { user, updateUser, logout } = useStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');

  const [form, setForm] = useState({
    name: '',
    learning_speed: 'average',
    study_session_length: 30,
    content_domain: 'general',
    sleep_study_habit: 'morning',
    prior_srs_experience: false,
  });
  const [desiredRetention, setDesiredRetention] = useState(0.9);
  const [savingRetention, setSavingRetention] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await userAPI.getProfile();
      const p = res.data;
      setForm({
        name: p.name || '',
        learning_speed: p.learning_speed || 'average',
        study_session_length: p.study_session_length || 30,
        content_domain: p.content_domain || 'general',
        sleep_study_habit: p.sleep_study_habit || 'morning',
        prior_srs_experience: p.prior_srs_experience || false,
      });
      setDesiredRetention(parseFloat(p.desired_retention) || 0.9);
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const res = await userAPI.updateProfile(form);
      updateUser(res.data);
      setSaved(true);
      toast.success('Settings saved!');
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSaveRetention = async () => {
    setSavingRetention(true);
    try {
      await userAPI.updateRetentionTarget(desiredRetention);
      toast.success('Retention target saved!');
    } catch {
      toast.error('Failed to save retention target');
    } finally {
      setSavingRetention(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const sections = [
    { id: 'profile', icon: User, label: 'Profile' },
    { id: 'learning', icon: Brain, label: 'Learning Preferences' },
    { id: 'account', icon: Shield, label: 'Account' },
  ];

  return (
    <div className="flex h-full">
      {/* Sidebar nav */}
      <div className="w-52 border-r border-navy-700 bg-navy-900 p-4 flex-shrink-0">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Settings size={16} className="text-violet-400" />
          Settings
        </h2>
        <nav className="space-y-1">
          {sections.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                activeSection === id
                  ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-navy-800'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* ── Profile ── */}
          {activeSection === 'profile' && (
            <>
              <SectionHeader icon={User} title="Profile" desc="Your name and display information" />

              <div className="card space-y-4">
                <div>
                  <label className="text-gray-300 text-sm font-medium block mb-1.5">Full Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    className="input"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="text-gray-300 text-sm font-medium block mb-1.5">Email</label>
                  <input
                    value={user?.email || ''}
                    disabled
                    className="input opacity-50 cursor-not-allowed"
                  />
                  <p className="text-gray-600 text-xs mt-1">Email cannot be changed</p>
                </div>
                <div>
                  <label className="text-gray-300 text-sm font-medium block mb-1.5">SRS Experience</label>
                  <div className="flex gap-3">
                    {[
                      { val: true, label: 'Yes — used Anki/RemNote before' },
                      { val: false, label: 'No — new to spaced repetition' },
                    ].map(({ val, label }) => (
                      <button
                        key={String(val)}
                        onClick={() => set('prior_srs_experience', val)}
                        className={`flex-1 p-3 rounded-xl border text-sm text-left transition-all ${
                          form.prior_srs_experience === val
                            ? 'border-violet-500 bg-violet-600/20 text-white'
                            : 'border-navy-600 bg-navy-800 text-gray-400 hover:border-navy-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Learning Preferences ── */}
          {activeSection === 'learning' && (
            <>
              <SectionHeader icon={Brain} title="Learning Preferences" desc="Calibrates your FSRS schedule and AI responses" />

              {/* Learning Speed */}
              <div className="card">
                <label className="text-gray-300 text-sm font-medium block mb-3 flex items-center gap-2">
                  <Zap size={14} className="text-violet-400" />
                  Learning Speed
                </label>
                <div className="space-y-2">
                  {LEARNING_SPEEDS.map(({ value, label, desc }) => (
                    <OptionRow
                      key={value}
                      selected={form.learning_speed === value}
                      onClick={() => set('learning_speed', value)}
                      label={label}
                      desc={desc}
                    />
                  ))}
                </div>
              </div>

              {/* Content Domain */}
              <div className="card">
                <label className="text-gray-300 text-sm font-medium block mb-3 flex items-center gap-2">
                  <BookOpen size={14} className="text-violet-400" />
                  Content Domain
                </label>
                <div className="space-y-2">
                  {DOMAINS.map(({ value, label, desc }) => (
                    <OptionRow
                      key={value}
                      selected={form.content_domain === value}
                      onClick={() => set('content_domain', value)}
                      label={label}
                      desc={desc}
                    />
                  ))}
                </div>
              </div>

              {/* Study Session Length */}
              <div className="card">
                <label className="text-gray-300 text-sm font-medium block mb-3 flex items-center gap-2">
                  <Clock size={14} className="text-violet-400" />
                  Typical Study Session
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SESSION_LENGTHS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => set('study_session_length', value)}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                        form.study_session_length === value
                          ? 'border-violet-500 bg-violet-600/20 text-white'
                          : 'border-navy-600 bg-navy-800 text-gray-400 hover:border-navy-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Study Time */}
              <div className="card">
                <label className="text-gray-300 text-sm font-medium block mb-3 flex items-center gap-2">
                  <Moon size={14} className="text-violet-400" />
                  Preferred Study Time
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STUDY_TIMES.map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => set('sleep_study_habit', value)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        form.sleep_study_habit === value
                          ? 'border-violet-500 bg-violet-600/20 text-white'
                          : 'border-navy-600 bg-navy-800 text-gray-400 hover:border-navy-500'
                      }`}
                    >
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs opacity-60 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Desired Retention Target */}
              <div className="card">
                <label className="text-gray-300 text-sm font-medium block mb-1 flex items-center gap-2">
                  <Target size={14} className="text-violet-400" />
                  Memory Retention Target
                </label>
                <p className="text-gray-500 text-xs mb-4">
                  Controls how often you review. Higher = more reviews, slower forgetting.
                  The scheduler uses this as your personal retention goal.
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="70"
                    max="97"
                    step="1"
                    value={Math.round(desiredRetention * 100)}
                    onChange={(e) => setDesiredRetention(parseInt(e.target.value) / 100)}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-white font-bold text-lg w-14 text-right">
                    {Math.round(desiredRetention * 100)}%
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 text-xs mt-1 mb-4">
                  <span>70% — fewer reviews</span>
                  <span>97% — very frequent</span>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveRetention}
                    disabled={savingRetention}
                    className="btn-primary py-1.5 px-4 text-sm"
                  >
                    {savingRetention ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                    Save Target
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Account ── */}
          {activeSection === 'account' && (
            <>
              <SectionHeader icon={Shield} title="Account" desc="Account management and security" />

              <div className="card space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-gray-200 text-sm font-medium">Account Email</p>
                    <p className="text-gray-500 text-xs mt-0.5">{user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-navy-700">
                  <div>
                    <p className="text-gray-200 text-sm font-medium">Learning Profile</p>
                    <p className="text-gray-500 text-xs mt-0.5 capitalize">
                      {form.learning_speed} learner · {form.content_domain} domain
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveSection('learning')}
                    className="text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="pt-2 border-t border-navy-700">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Save button — not shown on account tab */}
          {activeSection !== 'account' && (
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? (
                  <Loader size={16} className="animate-spin" />
                ) : saved ? (
                  <Check size={16} />
                ) : (
                  <Save size={16} />
                )}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, desc }) {
  return (
    <div className="mb-2">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Icon size={20} className="text-violet-400" />
        {title}
      </h1>
      <p className="text-gray-400 text-sm mt-0.5">{desc}</p>
    </div>
  );
}

function OptionRow({ selected, onClick, label, desc }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
        selected
          ? 'border-violet-500 bg-violet-600/20 text-white'
          : 'border-navy-600 bg-navy-800 text-gray-300 hover:border-navy-500'
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          selected ? 'border-violet-400 bg-violet-500' : 'border-navy-500'
        }`}
      >
        {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
    </button>
  );
}
