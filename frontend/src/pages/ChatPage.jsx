import { useEffect, useState, useRef } from 'react';
import { Send, Trash2, Brain, User, Loader, MessageCircle, BookOpen } from 'lucide-react';
import { chatAPI, notesAPI } from '../api';
import useStore from '../store/useStore';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { user, notes } = useStore();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [showNoteSelector, setShowNoteSelector] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      const res = await chatAPI.getHistory();
      setMessages(res.data);
    } catch {
      // First time, no history
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg = { role: 'user', content: input.trim(), id: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await chatAPI.sendMessage({
        message: userMsg.content,
        note_ids: selectedNotes,
      });

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.data.message, id: Date.now() + 1 },
      ]);
    } catch (err) {
      const error = err.response?.data?.error || 'Failed to get response';
      toast.error(error);
      setMessages((prev) => prev.slice(0, -1)); // Remove user message on error
      setInput(userMsg.content); // Restore input
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = async () => {
    if (!confirm('Clear all chat history?')) return;
    try {
      await chatAPI.clearHistory();
      setMessages([]);
      toast.success('Chat cleared');
    } catch {
      toast.error('Failed to clear chat');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const SUGGESTIONS = [
    'Summarize what I need to review today',
    'Explain the hardest concept in my notes',
    'Generate 3 practice questions for me',
    'What topics am I struggling with most?',
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-navy-700 bg-navy-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600/20 rounded-xl flex items-center justify-center">
            <Brain size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-white font-semibold">NeuroNote AI</h1>
            <p className="text-gray-400 text-xs">Powered by Groq · Knows your notes</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Note context selector */}
          <div className="relative">
            <button
              onClick={() => setShowNoteSelector(!showNoteSelector)}
              className={`btn-ghost text-sm ${selectedNotes.length > 0 ? 'text-violet-300' : ''}`}
            >
              <BookOpen size={14} />
              {selectedNotes.length > 0 ? `${selectedNotes.length} notes` : 'Add context'}
            </button>

            {showNoteSelector && (
              <div className="absolute right-0 top-10 bg-navy-800 border border-navy-600 rounded-xl shadow-xl p-3 w-64 z-50">
                <p className="text-gray-400 text-xs mb-2">Select notes for context:</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {notes.map((note) => (
                    <label key={note.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-navy-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedNotes.includes(note.id)}
                        onChange={(e) => {
                          setSelectedNotes(e.target.checked
                            ? [...selectedNotes, note.id]
                            : selectedNotes.filter((id) => id !== note.id)
                          );
                        }}
                        className="accent-violet-500"
                      />
                      <span className="text-gray-300 text-xs truncate">{note.title}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => setShowNoteSelector(false)}
                  className="w-full text-center text-violet-400 text-xs mt-2 hover:text-violet-300"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <button onClick={clearChat} className="btn-ghost text-sm text-red-400">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-violet-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Brain size={32} className="text-violet-400" />
              </div>
              <h2 className="text-white font-semibold text-lg">Hello, {user?.name?.split(' ')[0]}!</h2>
              <p className="text-gray-400 text-sm mt-2 max-w-sm">
                I have access to your notes and learning history. Ask me anything about your studies!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left p-3 bg-navy-800 border border-navy-600 rounded-xl text-gray-300
                             text-sm hover:border-violet-500/50 hover:bg-navy-700 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id || msg.created_at}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'assistant'
                    ? 'bg-violet-600/30'
                    : 'bg-navy-700'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <Brain size={16} className="text-violet-400" />
                ) : (
                  <User size={16} className="text-gray-400" />
                )}
              </div>

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-tr-sm'
                    : 'bg-navy-800 text-gray-200 rounded-tl-sm border border-navy-700'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-600/30 flex items-center justify-center flex-shrink-0">
              <Brain size={16} className="text-violet-400" />
            </div>
            <div className="bg-navy-800 border border-navy-700 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-navy-700 bg-navy-900">
        <form onSubmit={sendMessage} className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your notes, get explanations, practice questions..."
            rows={1}
            className="input resize-none flex-1 py-3 max-h-32"
            style={{ overflow: 'auto' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="btn-primary px-4 self-end"
          >
            {sending ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
        <p className="text-gray-600 text-xs mt-2 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
