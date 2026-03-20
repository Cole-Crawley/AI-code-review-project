import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL_FALLBACK_CHAIN = [
  'llama-3.1-8b-instant',
  'llama3-8b-8192',
  'gemma2-9b-it',
];

function isRateLimitError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === 429
  );
}

export async function POST(req: NextRequest) {
  const { code, language = 'typescript' } = await req.json();

  if (!code || code.trim().length === 0) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const systemPrompt = `You are an expert ${language} code reviewer. Analyse the provided code and return ONLY valid JSON with no markdown, no explanation, no preamble.

Return this exact format:
{
  "score": 85,
  "summary": "One paragraph overview of the code quality",
  "language": "${language}",
  "issues": [
    {
      "id": "1",
      "line": 12,
      "endLine": 15,
      "severity": "error",
      "title": "Short issue title",
      "description": "Clear explanation of why this is a problem",
      "fix": "Specific actionable fix instruction",
      "fixedCode": "the corrected code snippet (optional, only if short)"
    }
  ]
}

SCORING:
- Start at 100
- Deduct 15 per error, 7 per warning, 2 per suggestion
- Minimum score is 0

SEVERITY RULES:
- "error": bugs, security issues, crashes, incorrect logic, missing error handling
- "warning": performance issues, bad practices, code smells, potential bugs
- "suggestion": style, readability, naming, best practices, minor improvements

REVIEW RULES:
- Be specific — always reference the exact line number
- Be constructive — explain WHY it's a problem, not just WHAT
- Be practical — the fix should be actionable, not vague
- Cover: correctness, security, performance, maintainability, readability
- Find between 3 and 10 issues. Never return 0 issues for non-trivial code.
- Do not invent issues that don't exist
- The fixedCode field should only include the corrected snippet (2–5 lines max), not the entire file`;

  const userPrompt = `Review this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        max_tokens: 4000,
        temperature: 0.2, // low temperature for consistent structured output
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
      });

      const text        = completion.choices[0].message.content || '';
      const clean       = text.replace(/```json|```/g, '').trim();
      const finishReason = completion.choices[0].finish_reason;

      if (finishReason === 'length') {
        console.warn(`[review] model ${model} hit token limit, trying next…`);
        continue;
      }

      let data: unknown;
      try {
        data = JSON.parse(clean);
      } catch {
        console.warn(`[review] model ${model} returned unparseable JSON, trying next…`);
        continue;
      }

      return NextResponse.json(data);

    } catch (err) {
      if (!isRateLimitError(err)) {
        console.error(`[review] model ${model} failed:`, err);
        continue;
      }
      console.warn(`[review] model ${model} rate-limited, trying next…`);
    }
  }

  return NextResponse.json(
    { error: 'rate_limit', message: 'AI usage limit reached. Please try again in a few minutes.' },
    { status: 429 },
  );
}
