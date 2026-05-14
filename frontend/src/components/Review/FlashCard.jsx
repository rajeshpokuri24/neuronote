import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

export default function FlashCard({ card, onGrade, index, total }) {
  const [flipped, setFlipped] = useState(false);

  const grades = [
    { value: 1, label: 'Again', color: 'bg-red-600 hover:bg-red-500', desc: 'Forgot it' },
    { value: 2, label: 'Hard', color: 'bg-orange-600 hover:bg-orange-500', desc: 'Struggled' },
    { value: 3, label: 'Good', color: 'bg-green-600 hover:bg-green-500', desc: 'Got it' },
    { value: 4, label: 'Easy', color: 'bg-blue-600 hover:bg-blue-500', desc: 'Too easy' },
  ];

  const handleGrade = (grade) => {
    setFlipped(false);
    setTimeout(() => onGrade(grade), 100);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
      {/* Progress */}
      <div className="w-full flex items-center justify-between text-sm text-gray-400">
        <span>Card {index + 1} of {total}</span>
        <span>{card.type || 'flashcard'}</span>
      </div>

      {/* Flashcard */}
      <div
        className="flashcard-container w-full cursor-pointer"
        onClick={() => setFlipped(!flipped)}
        style={{ height: '280px' }}
      >
        <div className={`flashcard-inner w-full h-full ${flipped ? 'flipped' : ''}`}>
          {/* Front */}
          <div className="flashcard-front absolute inset-0 bg-navy-800 border border-navy-600 rounded-2xl p-8 flex flex-col items-center justify-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">Question</p>
            <p className="text-white text-xl text-center font-medium leading-relaxed">
              {card.front}
            </p>
            <p className="text-gray-500 text-sm mt-6 flex items-center gap-2">
              <RotateCcw size={14} />
              Click to reveal answer
            </p>
          </div>

          {/* Back */}
          <div className="flashcard-back bg-violet-900/30 border border-violet-500/40 rounded-2xl p-8 flex flex-col items-center justify-center">
            <p className="text-violet-300 text-xs uppercase tracking-wider mb-4">Answer</p>
            <p className="text-white text-lg text-center leading-relaxed">
              {card.back}
            </p>
          </div>
        </div>
      </div>

      {/* Grade buttons */}
      {flipped && (
        <div className="flex gap-3 w-full animate-slide-up">
          {grades.map((g) => (
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

      {!flipped && (
        <p className="text-gray-500 text-sm">
          Think about your answer, then click the card to reveal it
        </p>
      )}
    </div>
  );
}
