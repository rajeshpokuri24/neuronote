import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { userAPI } from '../api';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

const QUESTIONS = [
  {
    id: 'learning_speed',
    title: 'How quickly do you typically learn new concepts?',
    subtitle: 'This helps us calibrate your initial review schedule',
    options: [
      { value: 'fast', label: 'Fast Learner', desc: 'I grasp concepts quickly and need less repetition' },
      { value: 'average', label: 'Average Learner', desc: 'I learn at a steady pace with regular review' },
      { value: 'slow', label: 'Careful Learner', desc: 'I prefer to deeply understand before moving on' },
    ],
  },
  {
    id: 'study_session_length',
    title: 'How long are your typical study sessions?',
    subtitle: 'We\'ll schedule reviews to fit your sessions',
    options: [
      { value: 15, label: '15 minutes', desc: 'Short, focused bursts' },
      { value: 30, label: '30 minutes', desc: 'Standard session' },
      { value: 60, label: '1 hour', desc: 'Deep work sessions' },
      { value: 120, label: '2+ hours', desc: 'Extended study periods' },
    ],
  },
  {
    id: 'content_domain',
    title: 'What type of content do you mainly study?',
    subtitle: 'Helps the AI understand complexity scoring',
    options: [
      { value: 'technical', label: 'Technical / STEM', desc: 'CS, Math, Engineering, Science' },
      { value: 'conceptual', label: 'Conceptual / Theory', desc: 'Philosophy, Law, Business, Economics' },
      { value: 'language', label: 'Language / Humanities', desc: 'Languages, Literature, History' },
      { value: 'general', label: 'Mixed / General', desc: 'Various topics' },
    ],
  },
  {
    id: 'sleep_study_habit',
    title: 'When do you prefer to study?',
    subtitle: 'We\'ll send reminders at the right time',
    options: [
      { value: 'morning', label: 'Morning', desc: 'Before 12 PM' },
      { value: 'afternoon', label: 'Afternoon', desc: '12 PM - 6 PM' },
      { value: 'evening', label: 'Evening', desc: '6 PM - 10 PM' },
      { value: 'night', label: 'Night Owl', desc: 'After 10 PM' },
    ],
  },
  {
    id: 'prior_srs_experience',
    title: 'Have you used spaced repetition before?',
    subtitle: 'Tools like Anki, RemNote, or similar',
    options: [
      { value: true, label: 'Yes, I have', desc: 'I\'m familiar with Anki, RemNote, etc.' },
      { value: false, label: 'No, this is new', desc: 'First time using spaced repetition' },
    ],
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const { user, updateUser } = useStore();
  const navigate = useNavigate();

  const current = QUESTIONS[step];
  const progress = ((step) / QUESTIONS.length) * 100;

  const handleSelect = (value) => {
    setAnswers({ ...answers, [current.id]: value });
  };

  const handleNext = () => {
    if (answers[current.id] === undefined) {
      toast.error('Please select an option');
      return;
    }
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await userAPI.completeOnboarding(answers);
      updateUser({ ...res.data, onboarding_complete: true });
      toast.success('Profile set up! Welcome to NeuroNote.');
      navigate('/');
    } catch (err) {
      toast.error('Setup failed, please try again');
    } finally {
      setLoading(false);
    }
  };

  const isLast = step === QUESTIONS.length - 1;

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Brain size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set Up Your Learning Profile</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {step + 1} of {QUESTIONS.length} questions
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-navy-800 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="card animate-fade-in" key={step}>
          <h2 className="text-xl font-semibold text-white mb-1">{current.title}</h2>
          <p className="text-gray-400 text-sm mb-6">{current.subtitle}</p>

          <div className="space-y-3">
            {current.options.map((opt) => {
              const selected = answers[current.id] === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                    selected
                      ? 'border-violet-500 bg-violet-600/20 text-white'
                      : 'border-navy-600 bg-navy-800/50 text-gray-300 hover:border-navy-500 hover:bg-navy-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selected ? 'border-violet-400 bg-violet-500' : 'border-navy-500'
                      }`}
                    >
                      {selected && <Check size={12} className="text-white" />}
                    </div>
                    <div>
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-sm text-gray-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn-secondary">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="btn-primary flex-1 justify-center"
            disabled={loading || answers[current.id] === undefined}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isLast ? (
              <>Start Learning <Check size={16} /></>
            ) : (
              <>Next <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
