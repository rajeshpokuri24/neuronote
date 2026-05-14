const Groq = require('groq-sdk');

let client;

function getClient() {
  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

// Primary model: best quality on Groq for structured tasks
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
// Fast model: higher TPM limit, for large notes and simple tasks
const FAST_MODEL = 'llama-3.1-8b-instant';

// Max characters to send to AI (prevents TPM rate limit errors)
// ~4 chars per token; Groq free tier limit is ~6000 TPM for 70b
const MAX_CONTENT_CHARS = 8000;
const MAX_CONTEXT_CHARS = 3000;

function truncate(text, maxChars = MAX_CONTENT_CHARS) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[Content truncated for processing...]';
}

async function chat_completion(messages, model = PRIMARY_MODEL, maxTokens = 2048) {
  const groq = getClient();
  const response = await groq.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages,
  });
  return response.choices[0].message.content.trim();
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
 */
async function summarizeConversation(conversationText) {
  const text = await chat_completion(
    [
      {
        role: 'user',
        content: `Summarize the key topics and decisions from this conversation in 2-3 sentences. Be concise and factual.\n\n${truncate(conversationText, 4000)}`,
      },
    ],
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
  chat,
  generateStudyBriefing,
  summarizeConversation,
};
