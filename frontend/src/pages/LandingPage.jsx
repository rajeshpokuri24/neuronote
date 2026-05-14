import { useNavigate } from 'react-router-dom';
import {
  Brain, RotateCcw, MessageCircle, GitBranch, Layers, Sparkles,
  TrendingUp, Shield, Zap, ChevronRight, BookOpen, Target, Award
} from 'lucide-react';

const FEATURES = [
  {
    icon: RotateCcw,
    title: 'FSRS-4.5 Spaced Repetition',
    desc: 'State-of-the-art algorithm that schedules reviews at optimal intervals, minimizing forgetting while maximizing retention efficiency.',
    color: 'violet',
  },
  {
    icon: Brain,
    title: 'AI-Powered Concept Extraction',
    desc: 'Automatically extracts key concepts from your notes using Groq LLaMA-3.3, building a personalized knowledge graph.',
    color: 'blue',
  },
  {
    icon: Layers,
    title: 'Adaptive Flashcards',
    desc: 'AI-generated flashcards tailored to your complexity level and learning speed profile, with active recall mechanics.',
    color: 'green',
  },
  {
    icon: GitBranch,
    title: 'Interactive Mind Maps',
    desc: 'Visual concept relationship maps generated from your notes, helping you see connections between ideas.',
    color: 'orange',
  },
  {
    icon: MessageCircle,
    title: 'AI Study Assistant',
    desc: 'Chat with an AI that knows your notes and learning history. Get explanations, practice questions, and personalized guidance.',
    color: 'pink',
  },
  {
    icon: TrendingUp,
    title: 'Retention Analytics',
    desc: 'Track your forgetting curves, knowledge state distribution, and review performance with detailed visual analytics.',
    color: 'teal',
  },
];

const STEPS = [
  { number: '01', title: 'Write Notes', desc: 'Use the Notion-style block editor to capture your study material.' },
  { number: '02', title: 'AI Processes', desc: 'NeuroNote AI extracts concepts, generates flashcards, quizzes, and mind maps.' },
  { number: '03', title: 'Adaptive Review', desc: 'FSRS algorithm schedules reviews at scientifically optimal intervals.' },
  { number: '04', title: 'Track Progress', desc: 'Monitor your retention curves and knowledge mastery over time.' },
];

const TEAM = [
  { name: 'Suraj Datta Narayana', usn: '1NH23CD099' },
  { name: 'Pooja P', usn: '1NH23CD113' },
  { name: 'Rohitha Mettu', usn: '1NH23CD133' },
  { name: 'Pokuri Rajesh Kumar', usn: '1NH23CD204' },
];

const colorMap = {
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  pink: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
  teal: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' },
};

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(to bottom, #0a0e1a, #0d1224, #0a0e1a)', color: '#f3f4f6' }}
    >
      {/* Nav */}
      <nav
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'rgba(10,14,26,0.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <Brain size={18} color="white" />
          </div>
          <span className="font-bold text-lg" style={{ color: 'white' }}>NeuroNote</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: '#9ca3af' }}
            onMouseEnter={(e) => (e.target.style.color = 'white')}
            onMouseLeave={(e) => (e.target.style.color = '#9ca3af')}
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              color: 'white',
            }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 py-24 text-center overflow-hidden">
        {/* Glow orbs */}
        <div
          style={{
            position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: '600px', height: '600px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div className="relative max-w-4xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
            style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa' }}
          >
            <Sparkles size={12} />
            Powered by FSRS-4.5 &amp; Groq AI
          </div>

          <h1
            className="text-5xl md:text-6xl font-bold mb-6 leading-tight"
            style={{ color: 'white' }}
          >
            Learn Smarter,{' '}
            <span
              style={{ background: 'linear-gradient(135deg, #a78bfa, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              Remember Forever
            </span>
          </h1>

          <p
            className="text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
            style={{ color: '#9ca3af' }}
          >
            NeuroNote combines neuroscience-backed spaced repetition with AI to transform your notes
            into a personalized adaptive learning system that fights the forgetting curve.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => navigate('/register')}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base transition-all"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: 'white',
                boxShadow: '0 0 30px rgba(124,58,237,0.35)',
              }}
            >
              Start Learning Free
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#d1d5db',
              }}
            >
              Sign In
            </button>
          </div>

          {/* Hero stats */}
          <div className="flex items-center justify-center gap-8 mt-16 flex-wrap">
            {[
              { icon: Shield, label: 'FSRS-4.5 Algorithm', sub: 'Scientifically proven' },
              { icon: Zap, label: 'Groq LLaMA-3.3', sub: 'Ultra-fast AI' },
              { icon: Target, label: 'Adaptive Learning', sub: 'Personalized to you' },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.2)' }}
                >
                  <Icon size={18} color="#a78bfa" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium" style={{ color: 'white' }}>{label}</p>
                  <p className="text-xs" style={{ color: '#6b7280' }}>{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Forgetting Curve Illustration */}
      <section className="px-6 py-12">
        <div
          className="max-w-3xl mx-auto rounded-2xl p-8"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold" style={{ color: 'white' }}>The Ebbinghaus Forgetting Curve</h3>
            <p className="text-sm mt-1" style={{ color: '#6b7280' }}>NeuroNote reviews at optimal moments to maximize retention</p>
          </div>
          <ForgettingCurveIllustration />
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold" style={{ color: 'white' }}>Everything you need to master any subject</h2>
            <p className="mt-3" style={{ color: '#9ca3af' }}>Built on cognitive science research and cutting-edge AI</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => {
              const c = colorMap[color];
              return (
                <div
                  key={title}
                  className="p-6 rounded-2xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: c.bg.replace('bg-', '').includes('/') ? undefined : undefined, backgroundColor: 'rgba(124,58,237,0.12)' }}
                  >
                    <Icon size={20} className={c.text} />
                  </div>
                  <h3 className="font-semibold mb-2" style={{ color: 'white' }}>{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6b7280' }}>{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20" style={{ background: 'rgba(255,255,255,0.01)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold" style={{ color: 'white' }}>How NeuroNote works</h2>
            <p className="mt-3" style={{ color: '#9ca3af' }}>From raw notes to mastered knowledge in 4 steps</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {STEPS.map(({ number, title, desc }, i) => (
              <div key={number} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <div
                    className="hidden md:block absolute top-5 left-[60%] w-[80%] h-px"
                    style={{ background: 'linear-gradient(to right, rgba(124,58,237,0.4), transparent)' }}
                  />
                )}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-4"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
                >
                  {number}
                </div>
                <h3 className="font-semibold mb-2" style={{ color: 'white' }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <div
          className="max-w-2xl mx-auto p-12 rounded-3xl"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(79,70,229,0.15))',
            border: '1px solid rgba(124,58,237,0.25)',
          }}
        >
          <Brain size={40} color="#a78bfa" className="mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-4" style={{ color: 'white' }}>
            Ready to beat the forgetting curve?
          </h2>
          <p className="mb-8" style={{ color: '#9ca3af' }}>
            Join NeuroNote and start building a memory system that works with your brain, not against it.
          </p>
          <button
            onClick={() => navigate('/register')}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base mx-auto transition-all"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              color: 'white',
              boxShadow: '0 0 30px rgba(124,58,237,0.4)',
            }}
          >
            <Sparkles size={18} />
            Create Free Account
          </button>
        </div>
      </section>

      {/* Team */}
      <section className="px-6 py-12 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-xs mb-6" style={{ color: '#4b5563' }}>
            COLLEGE PROJECT — NEW HORIZON COLLEGE OF ENGINEERING, CSE (DATA SCIENCE)
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {TEAM.map(({ name, usn }) => (
              <div
                key={usn}
                className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
                >
                  {name[0]}
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: '#d1d5db' }}>{name}</p>
                  <p className="text-xs" style={{ color: '#4b5563' }}>{usn}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t text-center" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Brain size={14} color="#7c3aed" />
          <span className="text-sm font-medium" style={{ color: '#6b7280' }}>NeuroNote</span>
        </div>
        <p className="text-xs" style={{ color: '#374151' }}>
          AI-Powered Adaptive Learning &amp; Memory Retention System
        </p>
      </footer>
    </div>
  );
}

function ForgettingCurveIllustration() {
  const W = 700;
  const H = 180;
  const padL = 40;
  const padR = 20;
  const padT = 15;
  const padB = 35;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Ebbinghaus decay R(t) = e^(-t/S)
  const S_no_review = 2; // without review, stability = 2 days
  const S_after_review = [4, 9, 20]; // after each review, stability grows
  const reviewDays = [2, 5, 12]; // when reviews happen
  const maxDay = 28;

  const toX = (day) => padL + (day / maxDay) * chartW;
  const toY = (r) => padT + (1 - r) * chartH;

  // Without-review decay curve
  const noReviewPoints = [];
  for (let t = 0; t <= maxDay; t += 0.5) {
    noReviewPoints.push([toX(t), toY(Math.exp(-t / S_no_review))]);
  }
  const noReviewPath = noReviewPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  // With-review boosted curve
  const withReviewPath = buildWithReviewPath(reviewDays, S_after_review, maxDay, toX, toY);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: '700px', display: 'block', margin: '0 auto' }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1.0].map((r) => (
        <g key={r}>
          <line
            x1={padL} y1={toY(r)} x2={W - padR} y2={toY(r)}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1"
          />
          <text x={padL - 6} y={toY(r) + 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.25)">
            {Math.round(r * 100)}%
          </text>
        </g>
      ))}

      {/* Day labels */}
      {[0, 7, 14, 21, 28].map((d) => (
        <text key={d} x={toX(d)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.25)">
          Day {d}
        </text>
      ))}

      {/* Without review */}
      <path d={noReviewPath} fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" strokeDasharray="5,3" />

      {/* With review */}
      <path d={withReviewPath} fill="none" stroke="#a78bfa" strokeWidth="2.5"
        style={{ filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.5))' }}
      />

      {/* Review event markers */}
      {reviewDays.map((d, i) => (
        <g key={d}>
          <line
            x1={toX(d)} y1={padT} x2={toX(d)} y2={H - padB}
            stroke="rgba(124,58,237,0.35)" strokeWidth="1" strokeDasharray="3,2"
          />
          <circle cx={toX(d)} cy={toY(0.4 + i * 0.1)} r="4"
            fill="#7c3aed" stroke="#a78bfa" strokeWidth="1.5"
          />
        </g>
      ))}

      {/* Axis */}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

      {/* Legend */}
      <g transform={`translate(${W - padR - 180}, ${padT})`}>
        <line x1="0" y1="7" x2="20" y2="7" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x="25" y="11" fontSize="9" fill="rgba(255,255,255,0.4)">Without review</text>
        <line x1="0" y1="22" x2="20" y2="22" stroke="#a78bfa" strokeWidth="2" />
        <text x="25" y="26" fontSize="9" fill="rgba(255,255,255,0.5)">With NeuroNote</text>
        <circle cx="10" cy="37" r="3" fill="#7c3aed" stroke="#a78bfa" strokeWidth="1" />
        <text x="18" y="41" fontSize="9" fill="rgba(255,255,255,0.35)">Review event</text>
      </g>
    </svg>
  );
}

function buildWithReviewPath(reviewDays, stabilityAfter, maxDay, toX, toY) {
  const segments = [];
  let currentS = 2;
  let segStart = 0;
  let baseRetention = 1;

  const reviewSet = new Set(reviewDays);

  for (let i = 0; i <= reviewDays.length; i++) {
    const segEnd = i < reviewDays.length ? reviewDays[i] : maxDay;
    const points = [];
    for (let t = segStart; t <= segEnd; t += 0.4) {
      const elapsed = t - segStart;
      const r = Math.min(1, baseRetention * Math.exp(-elapsed / currentS));
      points.push([toX(t), toY(r)]);
    }
    segments.push(...points);

    if (i < reviewDays.length) {
      const elapsed = reviewDays[i] - segStart;
      baseRetention = Math.min(1, baseRetention * Math.exp(-elapsed / currentS));
      // Review boosts retention back toward 1
      baseRetention = Math.min(1, baseRetention + (1 - baseRetention) * 0.85);
      currentS = stabilityAfter[i];
      segStart = reviewDays[i];
    }
  }

  return segments.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}
