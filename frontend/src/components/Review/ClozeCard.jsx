import { useState } from 'react';
import { Eye, Check, X } from 'lucide-react';

const GRADES = [
  { value: 1, label: 'Again', color: 'bg-red-600 hover:bg-red-500', desc: 'Forgot it' },
  { value: 2, label: 'Hard', color: 'bg-orange-600 hover:bg-orange-500', desc: 'Struggled' },
  { value: 3, label: 'Good', color: 'bg-green-600 hover:bg-green-500', desc: 'Got it' },
  { value: 4, label: 'Easy', color: 'bg-blue-600 hover:bg-blue-500', desc: 'Too easy' },
];

export default function ClozeCard({ card, onGrade, index, total }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim() && !revealed) return;
    setSubmitted(true);
  };

  const handleReveal = () => {
    setRevealed(true);
    setSubmitted(true);
  };

  const handleGrade = (grade) => {
    setAnswer('');
    setSubmitted(false);
    setRevealed(false);
    onGrade(grade);
  };

  const trimmedAnswer = answer.trim().toLowerCase();
  const correctAnswer = (card.answer || '').toLowerCase();
  const isCorrect = submitted && !revealed && trimmedAnswer === correctAnswer;
  const isWrong = submitted && !revealed && trimmedAnswer !== correctAnswer && trimmedAnswer !== '';

  const parts = card.text.split('___');

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      <div className="flex justify-between text-sm text-gray-400">
        <span>Card {index + 1} of {total}</span>
        <span>Fill in the blank</span>
      </div>

      <div className="card">
        {/* Sentence with inline blank indicator */}
        <p className="text-white text-xl leading-relaxed mb-5 font-medium">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <span
                  className={`inline-block min-w-[80px] mx-1 px-2 py-0.5 rounded border-b-2 text-center font-bold
                    ${submitted
                      ? revealed
                        ? 'border-yellow-400 text-yellow-300 bg-yellow-400/10'
                        : isCorrect
                          ? 'border-green-400 text-green-300 bg-green-400/10'
                          : 'border-red-400 text-red-300 bg-red-400/10'
                      : 'border-violet-400 text-violet-300'
                    }`}
                >
                  {submitted ? card.answer : (answer || '___')}
                </span>
              )}
            </span>
          ))}
        </p>

        {card.hint && !submitted && (
          <p className="text-gray-500 text-xs mb-4">
            <span className="text-gray-600">Hint:</span> {card.hint}
          </p>
        )}

        {/* Input */}
        {!submitted && (
          <input
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Type the missing term..."
            className="input w-full"
          />
        )}

        {/* Result feedback */}
        {submitted && (
          <div className={`mt-4 p-3 rounded-xl flex items-start gap-2 ${
            revealed
              ? 'bg-yellow-500/10 border border-yellow-500/20'
              : isCorrect
                ? 'bg-green-500/10 border border-green-500/20'
                : 'bg-red-500/10 border border-red-500/20'
          }`}>
            {revealed
              ? <Eye size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              : isCorrect
                ? <Check size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                : <X size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            }
            <div>
              <p className={`text-sm font-medium ${revealed ? 'text-yellow-300' : isCorrect ? 'text-green-300' : 'text-red-300'}`}>
                {revealed ? `Answer: ${card.answer}` : isCorrect ? 'Correct!' : `Incorrect — answer: ${card.answer}`}
              </p>
              {isWrong && (
                <p className="text-gray-500 text-xs mt-0.5">Your answer: {answer}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {!submitted ? (
        <div className="flex gap-3">
          <button
            onClick={handleReveal}
            className="btn-secondary flex-1 justify-center"
          >
            <Eye size={14} /> Reveal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!answer.trim()}
            className="btn-primary flex-1 justify-center"
          >
            Check Answer
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          {GRADES.map((g) => (
            <button
              key={g.value}
              onClick={() => handleGrade(g.value)}
              className={`flex-1 ${g.color} text-white py-3 rounded-xl font-medium
                         transition-all duration-200 text-sm flex flex-col items-center gap-0.5`}
            >
              <span>{g.label}</span>
              <span className="text-xs opacity-70">{g.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
