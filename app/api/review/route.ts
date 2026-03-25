import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import type { Issue, ReviewResult, Severity } from '@/types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ALLOWED_LANGUAGES = new Set(['typescript', 'javascript', 'python', 'cpp', 'csharp', 'java']);
const MAX_CODE_CHARS = 50000;

const isSeverity = (v: unknown): v is Severity => v === 'error' || v === 'warning' || v === 'suggestion';

const CATEGORY_VALUES = new Set([
  'correctness',
  'security',
  'performance',
  'maintainability',
  'readability',
  'style',
  'best_practice',
]);

const isIssue = (v: unknown): v is Issue => {
  if (typeof v !== 'object' || v === null) return false;
  const issue = v as Record<string, unknown>;
  if (typeof issue.id !== 'string') return false;
  if (typeof issue.line !== 'number' || !Number.isFinite(issue.line) || issue.line < 1) return false;
  if (issue.endLine !== undefined) {
    if (typeof issue.endLine !== 'number' || !Number.isFinite(issue.endLine) || issue.endLine < issue.line) return false;
  }
  if (!isSeverity(issue.severity)) return false;
  if (typeof issue.category !== 'string' || !CATEGORY_VALUES.has(issue.category)) return false;
  if (typeof issue.confidence !== 'number' || !Number.isFinite(issue.confidence) || issue.confidence < 0 || issue.confidence > 100) return false;
  if (typeof issue.title !== 'string') return false;
  if (typeof issue.description !== 'string') return false;
  if (typeof issue.evidence !== 'object' || issue.evidence === null) return false;
  const evidence = issue.evidence as Record<string, unknown>;
  if (typeof evidence.excerpt !== 'string') return false;
  if (evidence.related !== undefined && typeof evidence.related !== 'string') return false;
  if (typeof issue.fix !== 'string') return false;
  if (issue.fixedCode !== undefined && typeof issue.fixedCode !== 'string') return false;
  if (issue.fixed !== undefined && typeof issue.fixed !== 'boolean') return false;
  if (issue.beforeCode !== undefined && typeof issue.beforeCode !== 'string') return false;
  if (issue.cwe !== undefined && typeof issue.cwe !== 'string') return false;
  if (issue.testSuggestion !== undefined && typeof issue.testSuggestion !== 'string') return false;
  return true;
};

const isReviewResult = (v: unknown): v is ReviewResult => {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.score !== 'number' || !Number.isFinite(r.score)) return false;
  if (typeof r.summary !== 'string') return false;
  if (typeof r.language !== 'string' || !ALLOWED_LANGUAGES.has(r.language)) return false;
  if (!Array.isArray(r.issues)) return false;
  if (r.issues.length < 1 || r.issues.length > 50) return false;
  if (r.refactorPlan !== undefined && typeof r.refactorPlan !== 'string') return false;
  if (r.testFramework !== undefined && typeof r.testFramework !== 'string') return false;
  if (r.generatedTests !== undefined && typeof r.generatedTests !== 'string') return false;
  if (r.securitySummary !== undefined && typeof r.securitySummary !== 'string') return false;
  return r.issues.every(isIssue);
};

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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = (body as { code?: unknown })?.code;
  const language = (body as { language?: unknown })?.language ?? 'typescript';

  if (typeof code !== 'string') {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  if (code.trim().length === 0) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  if (code.length > MAX_CODE_CHARS) {
    return NextResponse.json(
      { error: 'Code too large', message: `Max ${MAX_CODE_CHARS} characters.` },
      { status: 413 },
    );
  }

  if (typeof language !== 'string' || !ALLOWED_LANGUAGES.has(language)) {
    return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: 'Server misconfigured', message: 'Missing GROQ_API_KEY' },
      { status: 500 },
    );
  }

  const systemPrompt = `You are an expert ${language} code reviewer. Analyse the provided code and return ONLY valid JSON with no markdown, no explanation, no preamble.

Return this exact format:
{
  "score": 85,
  "summary": "One paragraph overview of the code quality",
  "language": "${language}",
  "refactorPlan": "A short, prioritized refactor direction (2-6 bullets)",
  "testFramework": "The recommended unit test framework/tooling for this language",
  "generatedTests": "Optional test skeleton/code (keep <= 200 lines). If too large, return an empty string.",
  "securitySummary": "Short security-focused recap (1-3 sentences)",
  "issues": [
    {
      "id": "1",
      "line": 12,
      "endLine": 15,
      "severity": "error",
      "category": "correctness",
      "confidence": 85,
      "title": "Short issue title",
      "description": "Clear explanation of why this is a problem",
      "evidence": {
        "excerpt": "Exact excerpt from the original code (1-3 lines) that triggered this issue"
      },
      "fix": "Specific actionable fix instruction",
      "fixedCode": "the corrected code snippet (optional, only if short; 2-8 lines max)",
      "cwe": "Optional CWE id label like 'CWE-119' for security issues only",
      "testSuggestion": "Optional language-specific test idea that would catch this issue"
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

ISSUE CATEGORY RULES:
- category must be one of: correctness, security, performance, maintainability, readability, style, best_practice

REVIEW RULES:
- Be specific — always reference the exact line number
- Be constructive — explain WHY it's a problem, not just WHAT
- Be practical — the fix should be actionable, not vague
- Cover: correctness, security, performance, maintainability, readability
- Find between 3 and 10 issues. Never return 0 issues for non-trivial code.
- Do not invent issues that don't exist
- Evidence excerpt MUST be copied from the provided code.
- The fixedCode field should only include the corrected snippet (2–8 lines max), not the entire file`;

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

      if (!isReviewResult(data)) {
        console.warn(`[review] model ${model} returned JSON with unexpected shape, trying next…`);
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
