import { useState } from 'react';
import { Loader, Lightbulb, Eye, Check, X } from 'lucide-react';

export default function ConceptHelpModal({ conceptName, loading, explanation, checkQuestion, onContinue }) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const trimmedAnswer = answer.trim().toLowerCase();
  const correctAnswer = (checkQuestion?.answer || '').toLowerCase();
  const isCorrect = checked && !revealed && trimmedAnswer === correctAnswer;
  const isWrong = checked && !revealed && trimmedAnswer !== correctAnswer && trimmedAnswer !== '';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 border border-navy-600 rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb size={18} className="text-yellow-400" />
          <h2 className="text-white font-semibold">{conceptName}</h2>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader size={24} className="text-violet-400 animate-spin" />
            <p className="text-gray-400 text-sm">Preparing an explanation...</p>
          </div>
        ) : (
          <>
            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{explanation}</p>

            {checkQuestion && (
              <div className="mt-5 pt-4 border-t border-navy-700">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Quick check</p>
                <p className="text-white text-sm font-medium mb-3">{checkQuestion.question}</p>

                {!checked ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && answer.trim() && setChecked(true)}
                      placeholder="Your answer..."
                      className="input flex-1 text-sm"
                    />
                    <button
                      onClick={() => setChecked(true)}
                      disabled={!answer.trim()}
                      className="btn-secondary text-sm"
                    >
                      Check
                    </button>
                    <button
                      onClick={() => { setRevealed(true); setChecked(true); }}
                      className="btn-ghost text-sm"
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                ) : (
                  <div className={`p-3 rounded-xl flex items-start gap-2 ${
                    revealed
                      ? 'bg-yellow-500/10 border border-yellow-500/20'
                      : isCorrect
                        ? 'bg-green-500/10 border border-green-500/20'
                        : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    {revealed
                      ? <Eye size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                      : isCorrect
                        ? <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                        : <X size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    }
                    <p className={`text-sm ${revealed ? 'text-yellow-300' : isCorrect ? 'text-green-300' : 'text-red-300'}`}>
                      {revealed || isWrong ? `Answer: ${checkQuestion.answer}` : 'Correct!'}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onContinue}
              className="btn-primary w-full justify-center mt-5"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
