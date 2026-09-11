const Groq = require('groq-sdk');

let client;

function getClient() {
  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

// Primary model: best quality on Groq for structured tasks
const PRIMARY_MODEL = 'openai/gpt-oss-120b';
// Fast model: higher TPM limit, for large notes and simple tasks
const FAST_MODEL = 'openai/gpt-oss-20b';

// Max characters to send to AI (prevents TPM rate limit errors)
// ~4 chars per token; Groq free tier limit is ~6000 TPM for 70b
const MAX_CONTENT_CHARS = 8000;
const MAX_CONTEXT_CHARS = 3000;

function truncate(text, maxChars = MAX_CONTENT_CHARS) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[Content truncated for processing...]';
}

function parseRetryDelayMs(err) {
  const match = /try again in ([\d.]+)s/i.exec(err.message || '');
  if (match) return Math.min(Math.ceil(parseFloat(match[1]) * 1000) + 500, 15000);
  return 4000;
}

async function chat_completion(messages, model = PRIMARY_MODEL, maxTokens = 2048) {
  const groq = getClient();
  const call = () => groq.chat.completions.create({
    model,
    max_tokens: maxTokens,
    // gpt-oss models spend completion tokens on internal reasoning before the
    // actual answer; keep that low so small maxTokens budgets aren't eaten
    // entirely by reasoning, leaving nothing for the response itself.
    reasoning_effort: 'low',
    messages,
  });

  let response;
  try {
    response = await call();
  } catch (err) {
    // Groq's per-minute token limit is shared across every call this backend
    // makes; a burst of requests (e.g. the tutor flow) can trip it. Wait out
    // the model's own suggested delay and retry once before giving up.
    if (err.status === 429) {
      await new Promise((r) => setTimeout(r, parseRetryDelayMs(err)));
      response = await call();
    } else {
      throw err;
    }
  }
  return (response.choices[0].message.content || '').trim();
}

function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No valid JSON found in response');
  return JSON.parse(jsonMatch[0]);
}

/**
 * Run a completion and parse the result as JSON.
 * Retries once on parse failure with an explicit "return ONLY JSON" reminder.
 */
async function completionWithJsonRetry(messages, model = PRIMARY_MODEL, maxTokens = 2048) {
  const attempt = async (msgs) => {
    const raw = await chat_completion(msgs, model, maxTokens);
    return parseJSON(raw);
  };

  try {
    return await attempt(messages);
  } catch (firstErr) {
    // Inject a strong correction and retry once
    const correctionMessages = [
      ...messages,
      {
        role: 'assistant',
        content: '(previous response had a JSON parse error)',
      },
      {
        role: 'user',
        content: 'Your previous response was not valid JSON. Return ONLY the JSON object — no explanation, no markdown fences, no extra text.',
      },
    ];
    try {
      return await attempt(correctionMessages);
    } catch (secondErr) {
      throw new Error(`JSON parse failed after retry: ${secondErr.message}`);
    }
  }
}

/**
 * Extract concepts from note content
 */
async function extractConcepts(noteContent, noteTitle) {
  // Truncate large notes to avoid TPM rate limits; use fast model for large content
  const content = truncate(noteContent, MAX_CONTENT_CHARS);
  const model = noteContent.length > MAX_CONTENT_CHARS ? FAST_MODEL : PRIMARY_MODEL;

  return completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are an expert educational AI. Extract key concepts from study notes. Return ONLY valid JSON, no explanation.',
    },
    {
      role: 'user',
      content: `Extract key concepts from these notes titled "${noteTitle}".

Notes:
${content}

Return ONLY this JSON:
{
  "concepts": [
    {
      "name": "concept name (2-5 words)",
      "description": "clear explanation in 1-2 sentences",
      "complexity_score": 3,
      "related_concepts": ["related1", "related2"]
    }
  ],
  "summary": "2-3 sentence overview"
}

Rules:
- complexity_score: 1=very simple, 2=basic, 3=moderate, 4=complex, 5=highly abstract
- Extract 3-8 most important concepts
- Keep names short and clear`,
    },
  ], model);
}

/**
 * Generate flashcards for a concept
 */
async function generateFlashcards(concept, noteContext) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  const result = await completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are an expert at creating educational flashcards. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Create 5 flashcards for: "${concept.name}"

Description: ${concept.description}
Context: ${context}

Return ONLY this JSON:
{
  "flashcards": [
    {
      "front": "question or prompt",
      "back": "concise answer (1-3 sentences)",
      "type": "definition|application|comparison|example"
    }
  ]
}

Mix types: definitions, applications, examples, comparisons.
Answers must be concise and accurate.`,
    },
  ]);

  return result.flashcards;
}

/**
 * Explain a concept the student failed to recall, then give one check
 * question to test whether the explanation landed.
 */
async function explainConcept(concept, noteContext) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  return completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are a patient, clear tutor. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `The student didn't remember this concept: "${concept.name}"
Short description: ${concept.description}
Context: ${context}

Explain it clearly and simply, like teaching someone hearing it for the first time.
Then write one short check question to test if they now understand it.

Return ONLY this JSON:
{
  "explanation": "clear, thorough explanation in plain language (3-6 sentences), use an analogy if it helps",
  "check_question": { "question": "short question", "answer": "concise correct answer" }
}`,
    },
  ]);
}

/**
 * Full AI-tutor session for a concept: a complete, exam-oriented explanation
 * from the basics up, followed by one-at-a-time escalating questions, doubt
 * clarification, and a final review — see the five functions below.
 */
async function tutorExplain(concept, noteContext) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  // Long free-form markdown crammed into a JSON string field is fragile —
  // the model frequently forgets to escape quotes/newlines in something
  // this long, breaking JSON.parse. Ask for plain markdown directly instead.
  const explanation = await chat_completion([
    {
      role: 'system',
      content: 'You are an expert tutor preparing a student for an exam. Respond with markdown only — no JSON, no preamble.',
    },
    {
      role: 'user',
      content: `Teach this concept completely, from scratch, to a student preparing for an exam: "${concept.name}"
Short description: ${concept.description}
Context from their notes: ${context}

Write a complete, step-by-step explanation:
- Start from the basics — assume no prior knowledge of this specific concept.
- Explain the meaning, purpose, and the important points.
- Give simple, concrete examples.
- If the topic is technical, include relevant formulas, algorithms (as pseudocode), a description of any useful diagram, advantages, disadvantages, and real applications.
- Cover important subtopics — do not skip them.
- Use markdown: headings, bullet lists, and code fences for formulas/pseudocode.`,
    },
  ], PRIMARY_MODEL, 2500);
  return { explanation };
}

async function tutorNextQuestion(concept, noteContext, askedQuestions, difficulty) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  const asked = (askedQuestions || []).join('\n- ') || '(none yet)';
  return completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are an expert exam tutor writing one test question at a time. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Concept: "${concept.name}"
Description: ${concept.description}
Context: ${context}

Already asked (do not repeat these or close variants):
- ${asked}

Write ONE new ${difficulty} multiple-choice question to test understanding of this concept. Mix conceptual ("what/why/how") and application-based ("given this scenario...") styles across the session. Write 4 options — one clearly correct, three plausible but wrong distractors (not silly/obvious). Do not prefix options with "A)"/"B)" etc, just the option text.

Return ONLY this JSON:
{ "question": "the question text", "type": "conceptual", "options": ["option 1", "option 2", "option 3", "option 4"] }`,
    },
  ]);
}

async function tutorEvaluateAnswer(concept, question, userAnswer) {
  return completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are a fair, encouraging exam tutor grading a short answer. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Concept: "${concept.name}"
Question: "${question}"
Student's answer: "${userAnswer}"

Judge whether the answer demonstrates real understanding (doesn't need to be word-perfect). Return ONLY this JSON:
{
  "correct": true,
  "feedback": "1-3 sentences: what was right or wrong, and the correct idea",
  "misunderstood": "the specific sub-point they got wrong, or null if correct"
}`,
    },
  ]);
}

async function tutorDoubtClarify(concept, noteContext, doubtText) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  return completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are a patient tutor resolving a specific point of confusion. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Concept: "${concept.name}"
Context: ${context}

The student is confused about this specific point: "${doubtText}"

Identify exactly what they're likely confused about, then explain just that part again, more simply than before, with a fresh example or analogy. Then write one small question to check they now get it.

Return ONLY this JSON:
{
  "clarification": "simpler re-explanation of just this point, with an analogy or example",
  "check_question": { "question": "short question", "answer": "concise correct answer" }
}`,
    },
  ]);
}

async function tutorSummary(concept, transcript) {
  const transcriptText = (transcript || [])
    .map((t, i) => `${i + 1}. [${t.difficulty}] ${t.question} — ${t.correct ? 'correct' : 'incorrect'}`)
    .join('\n');
  return completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are an exam tutor giving a final review of a study session. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Concept: "${concept.name}"
Description: ${concept.description}

This session's questions and results:
${transcriptText || '(no questions asked)'}

Write a final review:
- Summarize the entire concept concisely.
- List the most important points to remember.
- List common mistakes students make with this concept (informed by what they got wrong above, if anything).
- Write 3-5 final questions to check readiness for an exam.

Return ONLY this JSON:
{
  "summary": "concise overall summary",
  "key_points": ["point1", "point2"],
  "common_mistakes": ["mistake1", "mistake2"],
  "final_questions": ["question1", "question2", "question3"]
}`,
    },
  ]);
}

/**
 * Generate quiz questions for a concept
 */
async function generateQuiz(concept, noteContext) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  const result = await completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are an expert at creating educational quizzes. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Create 5 quiz questions for: "${concept.name}"

Description: ${concept.description}
Context: ${context}

Return ONLY this JSON:
{
  "questions": [
    {
      "question": "question text",
      "type": "mcq",
      "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
      "correct": 0,
      "explanation": "why this answer is correct"
    },
    {
      "question": "question text",
      "type": "open",
      "model_answer": "ideal answer",
      "key_points": ["point1", "point2"]
    }
  ]
}

Include 3 MCQ and 2 open-ended. MCQ distractors must be plausible. correct is 0-indexed.`,
    },
  ]);

  return result.questions;
}

/**
 * Generate mind map data
 */
async function generateMindMap(concept, relatedConcepts, noteContext) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  return completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are an expert at creating educational mind maps. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Create a mind map for: "${concept.name}"

Related: ${relatedConcepts.map((c) => c.name).join(', ')}
Context: ${context}

Return ONLY this JSON:
{
  "nodes": [
    {"id": "root", "label": "${concept.name}", "type": "root", "description": "brief description"},
    {"id": "n1", "label": "subtopic", "type": "branch", "description": "explanation"},
    {"id": "n2", "label": "detail", "type": "leaf", "description": "detail"}
  ],
  "edges": [
    {"id": "e1", "source": "root", "target": "n1", "label": "includes"},
    {"id": "e2", "source": "n1", "target": "n2", "label": "requires"}
  ]
}

Rules: root=main concept, branch=major subtopics (3-5), leaf=specific details.
Edge labels: "includes", "leads to", "requires", "is a type of", "produces".
Total 8-15 nodes.`,
    },
  ]);
}

/**
 * Chat with context from user's notes
 */
async function chat(messages, notesContext, userProfile) {
  const truncatedContext = truncate(notesContext, 6000);
  const systemPrompt = `You are NeuroNote's AI learning assistant. You have access to the user's study notes.

USER PROFILE:
- Learning speed: ${userProfile.learning_speed || 'average'}
- Domain focus: ${userProfile.content_domain || 'general'}
- Success rate: ${Math.round((userProfile.success_rate || 0.5) * 100)}%

RELEVANT NOTES:
${truncatedContext}

Your role:
1. Explain concepts using the user's OWN notes as reference
2. Generate practice questions on demand
3. Give study session briefings
4. Adapt explanations to the user's learning speed
5. Be concise, encouraging, and accurate`;

  const text = await chat_completion(
    [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    PRIMARY_MODEL,
    1500
  );

  return text;
}

/**
 * Generate a study briefing when user opens the app
 */
async function generateStudyBriefing(dueItems, userProfile, recentActivity) {
  const text = await chat_completion(
    [
      {
        role: 'user',
        content: `Write a brief 2-3 sentence study briefing for a student.

Due for review: ${dueItems.length} concepts
Most urgent: ${dueItems.slice(0, 3).map((i) => i.concept_name).join(', ')}
Success rate: ${Math.round((userProfile.success_rate || 0.5) * 100)}%
Learning speed: ${userProfile.learning_speed || 'average'}
Recent activity: ${recentActivity}

Be specific about the concepts and motivating. Keep it short.`,
      },
    ],
    FAST_MODEL,
    200
  );

  return text;
}

/**
 * Summarize an old conversation segment into 2-3 sentences for use as context.
 * When `previousSummary` is given, folds it in so the summary accumulates
 * across calls instead of resetting each time older messages are compacted.
 */
async function summarizeConversation(conversationText, previousSummary = '') {
  const prompt = previousSummary
    ? `Here is a running summary of a conversation so far:\n${truncate(previousSummary, 1500)}\n\nUpdate it to also cover these new messages. Return one updated summary of the key topics and decisions in 3-4 sentences. Be concise and factual.\n\n${truncate(conversationText, 4000)}`
    : `Summarize the key topics and decisions from this conversation in 2-3 sentences. Be concise and factual.\n\n${truncate(conversationText, 4000)}`;

  const text = await chat_completion(
    [{ role: 'user', content: prompt }],
    FAST_MODEL,
    200
  );
  return text;
}

/**
 * Generate cloze deletion cards for a concept (fill-in-the-blank)
 */
async function generateCloze(concept, noteContext) {
  const context = truncate(noteContext, MAX_CONTEXT_CHARS);
  const result = await completionWithJsonRetry([
    {
      role: 'system',
      content: 'You are an expert at creating cloze deletion flashcards for spaced repetition. Return ONLY valid JSON.',
    },
    {
      role: 'user',
      content: `Create 5 cloze deletion cards for: "${concept.name}"

Description: ${concept.description}
Context: ${context}

A cloze card shows a sentence with one key term replaced by ___. The blank tests the most important term.

Return ONLY this JSON:
{
  "cards": [
    {
      "text": "The ___ is responsible for cellular energy production.",
      "answer": "mitochondria",
      "hint": "organelle"
    }
  ]
}

Rules:
- Each card tests ONE specific term or short phrase (1-4 words max)
- The surrounding sentence must provide good context clues
- hint is a 1-2 word category label to show when stuck
- Make 5 diverse cards covering different aspects of the concept`,
    },
  ]);
  return result.cards;
}

module.exports = {
  extractConcepts,
  generateFlashcards,
  generateQuiz,
  generateCloze,
  generateMindMap,
  explainConcept,
  tutorExplain,
  tutorNextQuestion,
  tutorEvaluateAnswer,
  tutorDoubtClarify,
  tutorSummary,
  chat,
  generateStudyBriefing,
  summarizeConversation,
};
