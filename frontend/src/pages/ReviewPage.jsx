import { useEffect, useState, useRef } from 'react';
import {
  RotateCcw, Layers, HelpCircle, GitBranch, PenLine, Trophy,
  Brain, ChevronRight, Sparkles, Loader, Star, Clock, Timer,
  Check, X,
} from 'lucide-react';
import { reviewAPI } from '../api';
import useStore from '../store/useStore';
import FlashCard from '../components/Review/FlashCard';
import ClozeCard from '../components/Review/ClozeCard';
import Quiz from '../components/Review/Quiz';
import MindMapView from '../components/MindMap/MindMapView';
import toast from 'react-hot-toast';

const REVIEW_TYPES = [
  { id: 'flashcard', icon: Layers, label: 'Flashcards', desc: 'Active recall with flip cards' },
  { id: 'cloze', icon: PenLine, label: 'Cloze', desc: 'Fill in the blank cards' },
  { id: 'quiz', icon: HelpCircle, label: 'Quiz', desc: 'MCQ and open-ended questions' },
  { id: 'mindmap', icon: GitBranch, label: 'Mind Map', desc: 'Visual concept connections' },
  { id: 'exam', icon: Trophy, label: 'Exam Mode', desc: 'Timed test — no hints shown' },
];

const EXAM_DURATIONS = [10, 20, 30]; // minutes

export default function ReviewPage() {
  const { dueItems, setDueItems, removeReviewedItem } = useStore();
  const [loading, setLoading] = useState(true);
  const [reviewType, setReviewType] = useState('flashcard');
  const [sessionItems, setSessionItems] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentContent, setCurrentContent] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [sessionMode, setSessionMode] = useState(false);
  const [sessionResults, setSessionResults] = useState([]);
  const [sessionComplete, setSessionComplete] = useState(false);

  // Exam-mode state
  const [examDuration, setExamDuration] = useState(20);
  const [examTimeLeft, setExamTimeLeft] = useState(0);
  const [examAnswers, setExamAnswers] = useState([]); // {itemId, selected, isCorrect}
  const [examFinished, setExamFinished] = useState(false);
  const [examQuestions, setExamQuestions] = useState([]); // loaded MCQ questions per item
  const [examLoading, setExamLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    loadDueItems();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const loadDueItems = async () => {
    try {
      const res = await reviewAPI.getDue();
      setDueItems(res.data);
      setSessionItems(res.data);
    } catch {
      toast.error('Failed to load review items');
    } finally {
      setLoading(false);
    }
  };

  // ── Normal session ──────────────────────────────────────────
  const startSession = async () => {
    if (sessionItems.length === 0) return;
    setSessionMode(true);
    setCurrentIdx(0);
    setCurrentCardIdx(0);
    setSessionResults([]);
    setSessionComplete(false);
    await loadContent(sessionItems[0].id, reviewType);
  };

  const loadContent = async (itemId, type) => {
    setContentLoading(true);
    setCurrentContent(null);
    try {
      const res = await reviewAPI.generate(itemId, type);
      setCurrentContent(res.data.content);
      setCurrentCardIdx(0);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate content');
    } finally {
      setContentLoading(false);
    }
  };

  const handleGrade = async (grade) => {
    const item = sessionItems[currentIdx];
    const startTime = Date.now();
    try {
      const res = await reviewAPI.submit(item.id, {
        grade,
        review_type: reviewType,
        response_time_ms: Date.now() - startTime,
      });
      setSessionResults((prev) => [...prev, {
        concept_name: item.concept_name,
        grade,
        next_review: res.data.next_review,
        message: res.data.message,
      }]);
      removeReviewedItem(item.id);
      const nextIdx = currentIdx + 1;
      if (nextIdx >= sessionItems.length) {
        setSessionComplete(true);
      } else {
        setCurrentIdx(nextIdx);
        await loadContent(sessionItems[nextIdx].id, reviewType);
      }
    } catch {
      toast.error('Failed to submit review');
    }
  };

  const handleSkip = () => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= sessionItems.length) {
      setSessionComplete(true);
    } else {
      setCurrentIdx(nextIdx);
      loadContent(sessionItems[nextIdx].id, reviewType);
    }
  };

  const handleCardGrade = (grade) => {
    if (currentContent && Array.isArray(currentContent) && currentCardIdx < currentContent.length - 1) {
      setCurrentCardIdx(currentCardIdx + 1);
    } else {
      handleGrade(grade);
    }
  };

  const handleQuestionGrade = (grade) => {
    if (currentContent && Array.isArray(currentContent) && currentCardIdx < currentContent.length - 1) {
      setCurrentCardIdx(currentCardIdx + 1);
    } else {
      handleGrade(grade);
    }
  };

  // ── Exam mode ───────────────────────────────────────────────
  const startExam = async () => {
    if (sessionItems.length === 0) return;
    setExamLoading(true);

    try {
      // Pre-load quiz questions for ALL due items (MCQ only from existing quiz content)
      const questions = [];
      for (const item of sessionItems.slice(0, 15)) { // cap at 15 for exam
        try {
          const res = await reviewAPI.generate(item.id, 'quiz');
          const mcqs = (res.data.content || []).filter((q) => q.type === 'mcq');
          if (mcqs.length > 0) {
            questions.push({ item, question: mcqs[0] }); // one question per concept
          }
        } catch { /* skip this item */ }
      }

      if (questions.length === 0) {
        toast.error('Could not generate exam questions. Try processing some notes first.');
        setExamLoading(false);
        return;
      }

      setExamQuestions(questions);
      setExamAnswers(Array(questions.length).fill(null).map(() => ({ selected: null, isCorrect: null })));
      setCurrentIdx(0);
      setExamFinished(false);
      setSessionMode(true);

      // Start countdown timer
      const totalSeconds = examDuration * 60;
      setExamTimeLeft(totalSeconds);
      timerRef.current = setInterval(() => {
        setExamTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setExamFinished(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error('Failed to start exam');
    } finally {
      setExamLoading(false);
    }
  };

  const handleExamAnswer = (questionIdx, selectedIdx) => {
    const q = examQuestions[questionIdx].question;
    const isCorrect = selectedIdx === q.correct;
    setExamAnswers((prev) => {
      const next = [...prev];
      next[questionIdx] = { selected: selectedIdx, isCorrect };
      return next;
    });
  };

  const submitExam = async () => {
    clearInterval(timerRef.current);
    setExamFinished(true);

    // Submit grades to FSRS for each answered question
    for (let i = 0; i < examQuestions.length; i++) {
      const { item } = examQuestions[i];
      const answer = examAnswers[i];
      if (answer?.selected === null) continue;
      const grade = answer.isCorrect ? 4 : 1;
      try {
        await reviewAPI.submit(item.id, { grade, review_type: 'quiz', response_time_ms: null });
        removeReviewedItem(item.id);
      } catch { /* non-fatal */ }
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getAvgGrade = () => {
    if (!sessionResults.length) return 0;
    return sessionResults.reduce((s, r) => s + r.grade, 0) / sessionResults.length;
  };

  const getGradeEmoji = (avg) => {
    if (avg >= 3.5) return '🌟';
    if (avg >= 2.5) return '✨';
    if (avg >= 1.5) return '📚';
    return '💪';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Exam results screen ──────────────────────────────────────
  if (sessionMode && reviewType === 'exam' && examFinished) {
    const answered = examAnswers.filter((a) => a.selected !== null);
    const correct = answered.filter((a) => a.isCorrect).length;
    const score = answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0;
    const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

    return (
      <div className="flex items-center justify-center h-full p-6 overflow-auto">
        <div className="max-w-2xl w-full py-6">
          <div className="text-center mb-6">
            <Trophy size={48} className="text-yellow-400 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-white mb-1">Exam Complete!</h1>
            <p className="text-gray-400">{answered.length} of {examQuestions.length} questions answered</p>
          </div>

          {/* Score ring */}
          <div className="flex justify-center mb-6">
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle
                  cx="56" cy="56" r="48" fill="none"
                  stroke={scoreColor}
                  strokeWidth="8"
                  strokeDasharray={`${(score / 100) * 301.6} 301.6`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-white font-bold text-2xl">{score}%</span>
                <span className="text-gray-500 text-xs">{correct}/{answered.length}</span>
              </div>
            </div>
          </div>

          {/* Question breakdown */}
          <div className="card mb-5">
            <h3 className="text-gray-300 font-medium mb-3 text-sm">Question Breakdown</h3>
            <div className="space-y-2 max-h-72 overflow-auto">
              {examQuestions.map((eq, i) => {
                const ans = examAnswers[i];
                const q = eq.question;
                return (
                  <div key={i} className="p-3 bg-navy-800 rounded-lg">
                    <div className="flex items-start gap-2 mb-2">
                      {ans?.selected === null ? (
                        <span className="text-gray-500 text-xs mt-0.5 flex-shrink-0">—</span>
                      ) : ans?.isCorrect ? (
                        <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <X size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-gray-300 text-xs font-medium truncate">{eq.item.concept_name}</p>
                        <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{q.question}</p>
                      </div>
                    </div>
                    {ans?.selected !== null && (
                      <div className="ml-5 space-y-0.5">
                        <p className="text-xs">
                          <span className="text-gray-600">Your answer: </span>
                          <span className={ans.isCorrect ? 'text-green-400' : 'text-red-400'}>
                            {q.options[ans.selected]?.replace(/^[A-D]\)\s*/, '')}
                          </span>
                        </p>
                        {!ans.isCorrect && (
                          <p className="text-xs">
                            <span className="text-gray-600">Correct: </span>
                            <span className="text-green-400">
                              {q.options[q.correct]?.replace(/^[A-D]\)\s*/, '')}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setSessionMode(false);
                setExamFinished(false);
                setExamQuestions([]);
                loadDueItems();
              }}
              className="btn-secondary flex-1 justify-center"
            >
              Back to Queue
            </button>
            <button
              onClick={() => {
                setSessionMode(false);
                setExamFinished(false);
                setExamQuestions([]);
                loadDueItems();
              }}
              className="btn-primary flex-1 justify-center"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Session complete (normal modes) ──────────────────────────
  if (sessionComplete) {
    const avg = getAvgGrade();
    const perfect = sessionResults.every((r) => r.grade >= 3);
    const gradeColors = { 1: '#ef4444', 2: '#f97316', 3: '#22c55e', 4: '#3b82f6' };
    const gradeLabels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

    return (
      <div className="flex items-center justify-center h-full p-6 overflow-auto">
        <div className="max-w-lg w-full text-center py-6">
          <div className="text-6xl mb-4">{getGradeEmoji(avg)}</div>
          <h1 className="text-2xl font-bold text-white mb-1">Session Complete!</h1>
          <p className="text-gray-400 mb-6">
            {sessionResults.length} concept{sessionResults.length !== 1 ? 's' : ''} reviewed
            {perfect ? ' — flawless!' : ''}
          </p>

          <div className="flex justify-center mb-6">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle
                  cx="48" cy="48" r="40" fill="none"
                  stroke={avg >= 3 ? '#22c55e' : avg >= 2 ? '#f97316' : '#ef4444'}
                  strokeWidth="8"
                  strokeDasharray={`${(avg / 4) * 251.2} 251.2`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-white font-bold text-xl">{avg.toFixed(1)}</span>
                <span className="text-gray-500 text-xs">/ 4.0</span>
              </div>
            </div>
          </div>

          <div className="card mb-5 text-left">
            <h3 className="text-gray-300 font-medium mb-3 text-sm">Results</h3>
            <div className="space-y-2">
              {sessionResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="text-gray-300 text-sm truncate flex-1">{r.concept_name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                    <span
                      className="px-2 py-0.5 rounded font-medium"
                      style={{ background: gradeColors[r.grade] + '22', color: gradeColors[r.grade] }}
                    >
                      {gradeLabels[r.grade]}
                    </span>
                    {r.next_review && (
                      <span className="text-gray-600">
                        next: {new Date(r.next_review) <= new Date()
                          ? 'soon'
                          : `${Math.round((new Date(r.next_review) - Date.now()) / 86400000)}d`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-navy-700 mt-3 pt-3 flex justify-between">
              <span className="text-gray-500 text-xs">Avg. performance</span>
              <span className="text-white font-medium text-sm">{avg.toFixed(1)} / 4.0</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setSessionMode(false); setSessionComplete(false); loadDueItems(); }}
              className="btn-secondary flex-1 justify-center"
            >
              Back to Queue
            </button>
            {dueItems.length > 0 && (
              <button onClick={startSession} className="btn-primary flex-1 justify-center">
                <RotateCcw size={16} /> Keep Going
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Exam session (active) ────────────────────────────────────
  if (sessionMode && reviewType === 'exam' && examQuestions.length > 0) {
    const q = examQuestions[currentIdx]?.question;
    const item = examQuestions[currentIdx]?.item;
    const currentAnswer = examAnswers[currentIdx];
    const answeredCount = examAnswers.filter((a) => a.selected !== null).length;
    const allAnswered = answeredCount === examQuestions.length;
    const progress = (currentIdx / examQuestions.length) * 100;
    const timerWarning = examTimeLeft > 0 && examTimeLeft <= 60;

    return (
      <div className="flex flex-col h-full">
        {/* Exam header */}
        <div className="p-4 border-b border-navy-700 bg-navy-900 flex-shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-yellow-400" />
                <span className="text-white font-semibold">Exam Mode</span>
                <span className="text-gray-500 text-sm">— no feedback shown</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-gray-400 text-sm">{answeredCount}/{examQuestions.length} answered</span>
                <div className={`flex items-center gap-1.5 font-mono text-sm font-bold ${timerWarning ? 'text-red-400' : 'text-violet-300'}`}>
                  <Timer size={14} />
                  {examTimeLeft > 0 ? formatTime(examTimeLeft) : 'Time\'s up!'}
                </div>
                <button
                  onClick={submitExam}
                  className="btn-primary text-sm py-1.5 px-3"
                >
                  {allAnswered ? 'Submit' : 'Finish Early'}
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-navy-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question navigation tabs */}
        <div className="border-b border-navy-700 bg-navy-950 overflow-x-auto flex-shrink-0">
          <div className="flex gap-1 p-2 max-w-2xl mx-auto">
            {examQuestions.map((_, i) => {
              const ans = examAnswers[i];
              return (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-8 h-8 rounded text-xs font-bold flex-shrink-0 transition-all ${
                    i === currentIdx
                      ? 'bg-violet-600 text-white'
                      : ans?.selected !== null
                        ? 'bg-navy-700 text-gray-300 border border-navy-600'
                        : 'bg-navy-800 text-gray-600'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question content */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-6 pt-8">
          <div className="w-full max-w-2xl">
            {q && (
              <div className="card">
                <p className="text-gray-400 text-xs mb-2 font-medium">{item?.concept_name}</p>
                <p className="text-white text-lg font-medium leading-relaxed mb-6">{q.question}</p>

                <div className="space-y-3">
                  {q.options.map((opt, i) => {
                    const selected = currentAnswer?.selected === i;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          handleExamAnswer(currentIdx, i);
                          // Auto-advance to next unanswered question
                          const nextUnanswered = examAnswers.findIndex(
                            (a, idx) => idx > currentIdx && a.selected === null
                          );
                          if (nextUnanswered !== -1) {
                            setTimeout(() => setCurrentIdx(nextUnanswered), 300);
                          }
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          selected
                            ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                            : 'border-navy-600 bg-navy-800 text-gray-300 hover:border-navy-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs flex-shrink-0">
                            {selected ? <Check size={12} /> : String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-sm">{opt.replace(/^[A-D]\)\s*/, '')}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                    className="btn-ghost text-sm disabled:opacity-30"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setCurrentIdx((i) => Math.min(examQuestions.length - 1, i + 1))}
                    disabled={currentIdx === examQuestions.length - 1}
                    className="btn-ghost text-sm disabled:opacity-30"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Normal session (flashcard / cloze / quiz / mindmap) ──────
  if (sessionMode) {
    const item = sessionItems[currentIdx];
    const progress = (currentIdx / sessionItems.length) * 100;

    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-navy-700 bg-navy-900">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-white font-semibold">{item?.concept_name}</h2>
                <p className="text-gray-400 text-xs">{item?.note_title}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm">{currentIdx + 1}/{sessionItems.length}</span>
                <button
                  onClick={handleSkip}
                  className="btn-ghost text-sm text-gray-500 hover:text-yellow-400"
                >
                  Skip
                </button>
                <button
                  onClick={() => { setSessionMode(false); loadDueItems(); }}
                  className="btn-ghost text-sm"
                >
                  Exit
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-navy-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto flex items-start justify-center p-6 pt-8">
          <div className="w-full max-w-2xl">
            {contentLoading ? (
              <div className="flex flex-col items-center gap-4 py-20">
                <Loader size={32} className="text-violet-400 animate-spin" />
                <p className="text-gray-400">Generating {reviewType} content...</p>
              </div>
            ) : currentContent ? (
              <>
                {reviewType === 'flashcard' && Array.isArray(currentContent) && (
                  <FlashCard
                    card={currentContent[currentCardIdx]}
                    onGrade={handleCardGrade}
                    index={currentCardIdx}
                    total={currentContent.length}
                  />
                )}
                {reviewType === 'cloze' && Array.isArray(currentContent) && (
                  <ClozeCard
                    card={currentContent[currentCardIdx]}
                    onGrade={handleCardGrade}
                    index={currentCardIdx}
                    total={currentContent.length}
                  />
                )}
                {reviewType === 'quiz' && Array.isArray(currentContent) && (
                  <Quiz
                    question={currentContent[currentCardIdx]}
                    onGrade={handleQuestionGrade}
                    index={currentCardIdx}
                    total={currentContent.length}
                  />
                )}
                {reviewType === 'mindmap' && currentContent.nodes && (
                  <div className="w-full">
                    <p className="text-gray-400 text-sm mb-4 text-center">
                      Study the mind map for: <strong className="text-white">{item?.concept_name}</strong>
                    </p>
                    <MindMapView data={currentContent} onGrade={handleGrade} />
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Queue / setup view ───────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <RotateCcw size={24} className="text-violet-400" />
            Review Queue
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {sessionItems.length} concept{sessionItems.length !== 1 ? 's' : ''} due for review
          </p>
        </div>
      </div>

      {sessionItems.length === 0 ? (
        <div className="text-center py-16">
          <Star size={48} className="text-green-400 mx-auto mb-4" />
          <h2 className="text-white font-semibold text-xl">All caught up!</h2>
          <p className="text-gray-400 text-sm mt-2">No reviews due right now. Check back later or add more notes.</p>
        </div>
      ) : (
        <>
          {/* Review type selector */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {REVIEW_TYPES.map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                onClick={() => setReviewType(id)}
                className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                  reviewType === id
                    ? 'border-violet-500 bg-violet-600/20 text-white'
                    : 'border-navy-600 bg-navy-900 text-gray-400 hover:border-navy-500'
                }`}
              >
                <Icon size={20} className={reviewType === id ? 'text-violet-400 mb-2' : 'text-gray-500 mb-2'} />
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs opacity-60 mt-0.5">{desc}</p>
              </button>
            ))}
          </div>

          {/* Exam duration picker (only shown for exam mode) */}
          {reviewType === 'exam' && (
            <div className="card mb-6">
              <div className="flex items-center gap-3 flex-wrap">
                <Timer size={16} className="text-yellow-400" />
                <span className="text-gray-300 text-sm font-medium">Exam duration:</span>
                {EXAM_DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setExamDuration(d)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      examDuration === d
                        ? 'border-yellow-500 bg-yellow-500/20 text-yellow-300'
                        : 'border-navy-600 bg-navy-800 text-gray-400 hover:border-navy-500'
                    }`}
                  >
                    {d} min
                  </button>
                ))}
                <span className="text-gray-500 text-xs ml-auto">
                  {Math.min(sessionItems.length, 15)} questions · no feedback until end
                </span>
              </div>
            </div>
          )}

          <button
            onClick={reviewType === 'exam' ? startExam : startSession}
            disabled={examLoading}
            className={`w-full justify-center text-base py-3 mb-6 ${
              reviewType === 'exam' ? 'btn-secondary border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10' : 'btn-primary'
            }`}
          >
            {examLoading ? (
              <><Loader size={18} className="animate-spin" /> Preparing exam...</>
            ) : reviewType === 'exam' ? (
              <><Trophy size={18} /> Start {examDuration}-min Exam</>
            ) : (
              <><Sparkles size={18} /> Start Review Session ({sessionItems.length} items)</>
            )}
          </button>

          {/* Queue list */}
          <h3 className="text-gray-300 font-medium mb-3">Due Items</h3>
          <div className="space-y-2">
            {sessionItems.slice(0, 10).map((item) => (
              <div key={item.id} className="card flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{item.concept_name}</p>
                  <p className="text-gray-500 text-xs">{item.note_title}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <ComplexityDots score={item.complexity_score} />
                  <RetentionBadge retention={item.current_retention} />
                  <span className={`badge badge-${item.state}`}>{item.state}</span>
                </div>
              </div>
            ))}
            {sessionItems.length > 10 && (
              <p className="text-gray-500 text-sm text-center py-2">
                +{sessionItems.length - 10} more items...
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RetentionBadge({ retention }) {
  const pct = Math.round(retention * 100);
  const color = pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-xs font-medium ${color}`}>{pct}%</span>;
}

function ComplexityDots({ score }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= score ? 'bg-violet-400' : 'bg-navy-600'}`}
        />
      ))}
    </div>
  );
}
