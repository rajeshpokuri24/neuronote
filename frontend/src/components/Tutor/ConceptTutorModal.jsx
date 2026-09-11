import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader, Lightbulb, CheckCircle2, XCircle, ArrowRight, RotateCcw, HelpCircle, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { conceptsAPI } from '../../api';
import toast from 'react-hot-toast';

const DIFFICULTY_PLAN = ['easy', 'easy', 'medium', 'medium', 'hard'];

const MASTERY_LABEL = {
  not_started: 'Not Started',
  learning: 'Learning',
  needs_review: 'Needs Review',
  mastered: 'Mastered',
};
const MASTERY_COLOR = {
  not_started: 'bg-gray-500/20 text-gray-400',
  learning: 'bg-blue-500/20 text-blue-300',
  needs_review: 'bg-orange-500/20 text-orange-300',
  mastered: 'bg-green-500/20 text-green-300',
};

export default function ConceptTutorModal({ conceptId, conceptName, onClose, onMasteryUpdate }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('explaining'); // explaining | questioning | summary
  const [queueingReview, setQueueingReview] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(true);

  const [questionIdx, setQuestionIdx] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [transcript, setTranscript] = useState([]);

  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [masteryStatus, setMasteryStatus] = useState('learning');

  const [doubtOpen, setDoubtOpen] = useState(false);
  const [doubtText, setDoubtText] = useState('');
  const [doubtLoading, setDoubtLoading] = useState(false);
  const [doubtResult, setDoubtResult] = useState(null);

  useEffect(() => {
    conceptsAPI.updateMastery(conceptId, 'learning').then(() => onMasteryUpdate?.('learning')).catch(() => {});
    loadExplanation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadExplanation = async () => {
    setExplanationLoading(true);
    try {
      const res = await conceptsAPI.tutorExplain(conceptId);
      setExplanation(res.data.explanation);
    } catch {
      toast.error('Failed to load explanation');
    } finally {
      setExplanationLoading(false);
    }
  };

  const startQuestions = () => {
    setPhase('questioning');
    fetchQuestion(0, []);
  };

  const fetchQuestion = async (idx, askedSoFar) => {
    setQuestionLoading(true);
    setCurrentQuestion(null);
    setEvaluation(null);
    setAnswer('');
    setAttempt(0);
    try {
      const res = await conceptsAPI.tutorQuestion(
        conceptId,
        askedSoFar.map((q) => q.question),
        DIFFICULTY_PLAN[idx]
      );
      setCurrentQuestion({ ...res.data, difficulty: DIFFICULTY_PLAN[idx] });
    } catch {
      toast.error('Failed to load question');
    } finally {
      setQuestionLoading(false);
    }
  };

  const submitAnswer = async (value) => {
    const selected = value !== undefined ? value : answer;
    if (!selected.trim() || !currentQuestion) return;
    setAnswer(selected);
    setEvaluating(true);
    try {
      const res = await conceptsAPI.tutorEvaluate(conceptId, currentQuestion.question, selected);
      setEvaluation(res.data);
    } catch {
      toast.error('Failed to evaluate answer');
    } finally {
      setEvaluating(false);
    }
  };

  const retrySameQuestion = () => {
    setAttempt(1);
    setEvaluation(null);
    setAnswer('');
  };

  const advanceQuestion = async () => {
    const record = { question: currentQuestion.question, difficulty: currentQuestion.difficulty, correct: !!evaluation.correct };
    const newTranscript = [...transcript, record];
    setTranscript(newTranscript);

    const nextIdx = questionIdx + 1;
    if (nextIdx >= DIFFICULTY_PLAN.length) {
      setPhase('summary');
      await loadSummary(newTranscript);
    } else {
      setQuestionIdx(nextIdx);
      await fetchQuestion(nextIdx, newTranscript);
    }
  };

  const loadSummary = async (finalTranscript) => {
    setSummaryLoading(true);
    try {
      const res = await conceptsAPI.tutorSummary(conceptId, finalTranscript);
      setSummaryData(res.data);
      const correctCount = finalTranscript.filter((t) => t.correct).length;
      const rate = finalTranscript.length ? correctCount / finalTranscript.length : 0;
      const newStatus = rate >= 0.7 ? 'mastered' : 'needs_review';
      setMasteryStatus(newStatus);
      onMasteryUpdate?.(newStatus);
      try {
        await conceptsAPI.updateMastery(conceptId, newStatus);
      } catch {
        // Non-fatal — the summary itself is still shown even if persisting the badge fails.
      }
    } catch {
      toast.error('Failed to generate summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const reviewAgain = () => {
    setPhase('explaining');
    setQuestionIdx(0);
    setCurrentQuestion(null);
    setEvaluation(null);
    setTranscript([]);
    setSummaryData(null);
  };

  const handleQueueForReview = async () => {
    setQueueingReview(true);
    try {
      await conceptsAPI.queueForReview(conceptId);
      toast.success('Added to your Review queue');
      onClose();
      navigate('/review');
    } catch {
      toast.error('Failed to queue for review');
    } finally {
      setQueueingReview(false);
    }
  };

  const openDoubt = () => {
    setDoubtOpen(true);
    setDoubtText('');
    setDoubtResult(null);
  };

  const submitDoubt = async () => {
    if (!doubtText.trim()) return;
    setDoubtLoading(true);
    try {
      const res = await conceptsAPI.tutorDoubt(conceptId, doubtText);
      setDoubtResult(res.data);
    } catch {
      toast.error('Failed to clarify doubt');
    } finally {
      setDoubtLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 border border-navy-600 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-navy-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Lightbulb size={18} className="text-yellow-400 flex-shrink-0" />
            <h2 className="text-white font-semibold truncate">{conceptName}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${MASTERY_COLOR[masteryStatus]}`}>
              {MASTERY_LABEL[masteryStatus]}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {doubtOpen ? (
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">I have a doubt</p>
              {!doubtResult ? (
                <>
                  <textarea
                    autoFocus
                    value={doubtText}
                    onChange={(e) => setDoubtText(e.target.value)}
                    placeholder="What part are you confused about?"
                    rows={3}
                    className="input w-full resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button onClick={submitDoubt} disabled={!doubtText.trim() || doubtLoading} className="btn-primary text-sm">
                      {doubtLoading ? <Loader size={14} className="animate-spin" /> : 'Ask'}
                    </button>
                    <button onClick={() => setDoubtOpen(false)} className="btn-ghost text-sm">Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line mb-4">{doubtResult.clarification}</p>
                  {doubtResult.check_question && (
                    <div className="bg-navy-900 rounded-xl p-3 mb-4">
                      <p className="text-white text-sm font-medium mb-1">{doubtResult.check_question.question}</p>
                      <p className="text-gray-500 text-xs">Answer: {doubtResult.check_question.answer}</p>
                    </div>
                  )}
                  <button onClick={() => setDoubtOpen(false)} className="btn-primary text-sm">Back to lesson</button>
                </>
              )}
            </div>
          ) : phase === 'explaining' ? (
            explanationLoading ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader size={28} className="text-violet-400 animate-spin" />
                <p className="text-gray-400 text-sm">Preparing a complete explanation...</p>
              </div>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{explanation}</ReactMarkdown>
              </div>
            )
          ) : phase === 'questioning' ? (
            <div>
              <p className="text-gray-500 text-xs mb-3">Question {questionIdx + 1} of {DIFFICULTY_PLAN.length} · {currentQuestion?.difficulty || DIFFICULTY_PLAN[questionIdx]}</p>
              {questionLoading || !currentQuestion ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <Loader size={28} className="text-violet-400 animate-spin" />
                  <p className="text-gray-400 text-sm">Preparing your next question...</p>
                </div>
              ) : (
                <>
                  <p className="text-white text-base font-medium mb-4">{currentQuestion.question}</p>
                  {!evaluation ? (
                    currentQuestion.options?.length > 0 ? (
                      <div className="space-y-2">
                        {currentQuestion.options.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => submitAnswer(opt)}
                            disabled={evaluating}
                            className={`w-full text-left p-3 rounded-xl border text-sm transition-colors disabled:opacity-50 ${
                              evaluating && answer === opt
                                ? 'border-violet-500 bg-violet-500/10 text-white'
                                : 'border-navy-600 bg-navy-900 text-gray-200 hover:border-violet-500/50 hover:bg-navy-700'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                        {evaluating && (
                          <div className="flex items-center gap-2 text-gray-500 text-xs pt-1">
                            <Loader size={12} className="animate-spin" /> Checking your answer...
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <textarea
                          autoFocus
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="Type your answer..."
                          rows={3}
                          className="input w-full resize-none mb-3"
                        />
                        <button onClick={() => submitAnswer()} disabled={!answer.trim() || evaluating} className="btn-primary text-sm">
                          {evaluating ? <Loader size={14} className="animate-spin" /> : 'Submit Answer'}
                        </button>
                      </>
                    )
                  ) : (
                    <div className={`p-3 rounded-xl ${evaluation.correct ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <div className="flex items-start gap-2">
                        {evaluation.correct
                          ? <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                          : <XCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />}
                        <div>
                          <p className={`text-sm font-medium ${evaluation.correct ? 'text-green-300' : 'text-red-300'}`}>
                            {evaluation.correct ? 'Correct!' : 'Not quite'}
                          </p>
                          <p className="text-gray-300 text-sm mt-1">{evaluation.feedback}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        {!evaluation.correct && attempt === 0 ? (
                          <button onClick={retrySameQuestion} className="btn-secondary text-sm">Try Again</button>
                        ) : (
                          <button onClick={advanceQuestion} className="btn-primary text-sm flex items-center gap-1.5">
                            {questionIdx + 1 >= DIFFICULTY_PLAN.length ? 'Finish' : 'Next Question'}
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            // summary
            summaryLoading || !summaryData ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader size={28} className="text-violet-400 animate-spin" />
                <p className="text-gray-400 text-sm">Putting together your final review...</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Summary</p>
                  <p className="text-gray-200 text-sm leading-relaxed">{summaryData.summary}</p>
                </div>
                {summaryData.key_points?.length > 0 && (
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Key Points</p>
                    <ul className="list-disc list-inside space-y-1">
                      {summaryData.key_points.map((p, i) => (
                        <li key={i} className="text-gray-200 text-sm">{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summaryData.common_mistakes?.length > 0 && (
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Common Mistakes</p>
                    <ul className="list-disc list-inside space-y-1">
                      {summaryData.common_mistakes.map((p, i) => (
                        <li key={i} className="text-orange-300 text-sm">{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summaryData.final_questions?.length > 0 && (
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Final Questions to Review</p>
                    <ul className="list-decimal list-inside space-y-1">
                      {summaryData.final_questions.map((q, i) => (
                        <li key={i} className="text-gray-300 text-sm">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-navy-700 flex-shrink-0 flex items-center justify-between">
          {!doubtOpen && phase !== 'summary' ? (
            <button onClick={openDoubt} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-violet-400 transition-colors">
              <HelpCircle size={14} />
              I have a doubt
            </button>
          ) : <div />}

          {phase === 'explaining' && !explanationLoading && !doubtOpen && (
            <button onClick={startQuestions} className="btn-primary text-sm flex items-center gap-1.5">
              I understood, continue <ArrowRight size={14} />
            </button>
          )}
          {phase === 'summary' && !summaryLoading && (
            <div className="flex gap-2">
              <button onClick={reviewAgain} className="btn-secondary text-sm flex items-center gap-1.5">
                <RotateCcw size={14} /> Review Again
              </button>
              {masteryStatus === 'needs_review' && (
                <button
                  onClick={handleQueueForReview}
                  disabled={queueingReview}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  {queueingReview ? <Loader size={14} className="animate-spin" /> : <BookOpen size={14} />}
                  Add to Review Queue
                </button>
              )}
              <button onClick={onClose} className="btn-primary text-sm">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
