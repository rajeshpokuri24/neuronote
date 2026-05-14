import { useState } from 'react';
import { Check, X, ChevronRight } from 'lucide-react';

export default function Quiz({ question, onGrade, index, total }) {
  const [selected, setSelected] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = submitted && question.type === 'mcq' && selected === question.correct;

  const handleSubmit = () => {
    if (question.type === 'mcq' && selected === null) return;
    if (question.type === 'open' && !textAnswer.trim()) return;
    setSubmitted(true);
  };

  const handleGrade = (grade) => {
    setSelected(null);
    setTextAnswer('');
    setSubmitted(false);
    onGrade(grade);
  };

  const gradeButtons = [
    { value: 1, label: 'Again', color: 'bg-red-600 hover:bg-red-500' },
    { value: 2, label: 'Hard', color: 'bg-orange-600 hover:bg-orange-500' },
    { value: 3, label: 'Good', color: 'bg-green-600 hover:bg-green-500' },
    { value: 4, label: 'Easy', color: 'bg-blue-600 hover:bg-blue-500' },
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      <div className="flex justify-between text-sm text-gray-400">
        <span>Question {index + 1} of {total}</span>
        <span className="capitalize">{question.type === 'mcq' ? 'Multiple Choice' : 'Open Ended'}</span>
      </div>

      <div className="card">
        <p className="text-white text-lg font-medium leading-relaxed mb-6">
          {question.question}
        </p>

        {question.type === 'mcq' ? (
          <div className="space-y-3">
            {question.options.map((opt, i) => {
              let optClass = 'border-navy-600 bg-navy-800 text-gray-300 hover:border-navy-500';
              if (submitted) {
                if (i === question.correct) {
                  optClass = 'border-green-500 bg-green-500/10 text-green-300';
                } else if (i === selected && selected !== question.correct) {
                  optClass = 'border-red-500 bg-red-500/10 text-red-300';
                }
              } else if (selected === i) {
                optClass = 'border-violet-500 bg-violet-500/10 text-violet-300';
              }

              return (
                <button
                  key={i}
                  onClick={() => !submitted && setSelected(i)}
                  disabled={submitted}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${optClass}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs flex-shrink-0">
                      {submitted && i === question.correct ? (
                        <Check size={12} />
                      ) : submitted && i === selected ? (
                        <X size={12} />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span className="text-sm">{opt.replace(/^[A-D]\)\s*/, '')}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            disabled={submitted}
            placeholder="Type your answer here..."
            rows={4}
            className="input resize-none"
          />
        )}

        {/* Explanation */}
        {submitted && question.explanation && (
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-blue-300 text-xs font-medium mb-1">Explanation</p>
            <p className="text-gray-300 text-sm">{question.explanation}</p>
          </div>
        )}

        {/* Model answer for open questions */}
        {submitted && question.type === 'open' && (
          <div className="mt-4 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <p className="text-violet-300 text-xs font-medium mb-1">Model Answer</p>
            <p className="text-gray-300 text-sm">{question.model_answer}</p>
            {question.key_points && (
              <div className="mt-2">
                <p className="text-violet-300 text-xs mb-1">Key Points:</p>
                <ul className="space-y-0.5">
                  {question.key_points.map((pt, i) => (
                    <li key={i} className="text-gray-400 text-xs flex items-start gap-1.5">
                      <Check size={10} className="text-green-400 mt-0.5 flex-shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={(question.type === 'mcq' && selected === null) ||
                    (question.type === 'open' && !textAnswer.trim())}
          className="btn-primary justify-center"
        >
          Submit Answer <ChevronRight size={16} />
        </button>
      ) : (
        <div className="flex gap-3">
          {gradeButtons.map((g) => (
            <button
              key={g.value}
              onClick={() => handleGrade(g.value)}
              className={`flex-1 ${g.color} text-white py-2.5 rounded-xl font-medium text-sm transition-all`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
