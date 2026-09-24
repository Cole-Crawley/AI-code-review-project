import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Issue, ReviewResult, Severity } from '@/types';

// Reads ANTHROPIC_API_KEY from .env.local
const anthropic = new Anthropic();

const ALLOWED_LANGUAGES = new Set(['typescript', 'javascript', 'python', 'cpp', 'csharp', 'java']);
const MAX_CODE_CHARS = 50000;

// The live demo runs on my own API key, so slow down anyone marking far more
// papers than a person would. Per-instance and best-effort: serverless
// instances come and go, and the spend limit on the Anthropic account is the
// real ceiling.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REVIEWS_PER_WINDOW = 15;
const recentReviews = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (recentReviews.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  recentReviews.set(ip, recent);
  return recent.length > MAX_REVIEWS_PER_WINDOW;
}

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
  if (issue.check !== undefined && typeof issue.check !== 'string') return false;
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
  // ADD THIS - fixedFullCode is optional but should be string if present
  if (r.fixedFullCode !== undefined && typeof r.fixedFullCode !== 'string') return false;
  for (const key of ['examples', 'edgeCases'] as const) {
    const list = r[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || !list.every(t => t && typeof t.label === 'string' && typeof t.code === 'string')) return false;
  }
  return r.issues.every(isIssue);
};

// Same model Distill uses
const MODEL = 'claude-sonnet-5';

// Structured output schema, so Claude's reply always has the shape the UI expects.
// isReviewResult below still checks the numeric ranges the schema can't express.
const ReviewSchema = z.object({
  score: z.number(),
  summary: z.string(),
  language: z.enum(['typescript', 'javascript', 'python', 'cpp', 'csharp', 'java']),
  refactorPlan: z.string(),
  testFramework: z.string(),
  generatedTests: z.string(),
  securitySummary: z.string(),
  fixedFullCode: z.string(),
  examples: z.array(z.object({ label: z.string(), code: z.string() })),
  edgeCases: z.array(z.object({ label: z.string(), code: z.string() })),
  issues: z.array(
    z.object({
      id: z.string(),
      line: z.number(),
      endLine: z.number(),
      severity: z.enum(['error', 'warning', 'suggestion']),
      category: z.enum(['correctness', 'security', 'performance', 'maintainability', 'readability', 'style', 'best_practice']),
      confidence: z.number(),
      title: z.string(),
      description: z.string(),
      evidence: z.object({ excerpt: z.string() }),
      fix: z.string(),
      fixedCode: z.string(),
      cwe: z.string(),
      testSuggestion: z.string(),
      check: z.string(),
    }),
  ),
});

// Helper to attempt to repair truncated JSON
function repairTruncatedJSON(text: string): string | null {
  // Count opening vs closing braces
  const openBraces = (text.match(/\{/g) || []).length;
  const closeBraces = (text.match(/\}/g) || []).length;
  
  // If we have more opening than closing, try to close it
  if (openBraces > closeBraces) {
    // Add missing closing braces
    let repaired = text;
    for (let i = 0; i < openBraces - closeBraces; i++) {
      repaired += '}';
    }
    
    // Also check if we need to close arrays
    const openBrackets = (text.match(/\[/g) || []).length;
    const closeBrackets = (text.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        repaired += ']';
      }
    }
    
    // Remove any trailing commas before closing braces
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');
    
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // If still invalid, try to extract valid JSON up to last complete field
      const lastValidBrace = text.lastIndexOf('}');
      if (lastValidBrace > 0) {
        const partial = text.substring(0, lastValidBrace + 1);
        try {
          JSON.parse(partial);
          return partial;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Extract JSON from response
function extractJSONFromText(text: string): string {
  // Remove code blocks
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  
  // Try to find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  return cleaned.trim();
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests', message: "That's a lot of marking in a short time. Try again in a few minutes." },
      { status: 429 },
    );
  }

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
      { error: 'Code too large', message: `That's too long to mark. Keep it under ${MAX_CODE_CHARS.toLocaleString()} characters.` },
      { status: 413 },
    );
  }

  if (typeof language !== 'string' || !ALLOWED_LANGUAGES.has(language)) {
    return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Server misconfigured', message: 'Missing ANTHROPIC_API_KEY' },
      { status: 500 },
    );
  }

  const systemPrompt = `You are an expert ${language} code reviewer. Analyse the provided code and return ONLY valid JSON with no markdown, no explanation, no preamble.

IMPORTANT: Keep the response concise to avoid truncation. Limit issues to 3-5 most important ones.

PLAIN ENGLISH: Write every human-readable field (title, description, fix, summary, securitySummary, refactorPlan, labels) for someone who is new to programming. Use short, everyday sentences. Avoid jargon; if a technical word is unavoidable, explain it in the same sentence (for example "a non-null assertion, the ! that tells TypeScript to trust a value is there"). Never use em dashes.
- "title": a short plain sentence describing what goes wrong, from the user's point of view. For example "Crashes when the user isn't found", not "Unsafe non-null assertion".
- "description": what happens, when it happens, and why it matters, in two or three sentences.
- "fix": what to change, in plain words, in one or two sentences.
- "refactorPlan": two or three short plain suggestions, each on its own line starting with "- ".
- Severity means: "error" will break, crash or give a wrong answer; "warning" works for now but could cause trouble later; "suggestion" is optional and makes the code clearer or easier to maintain.

CRITICAL: In addition to individual fixes, provide a "fixedFullCode" field containing the ENTIRE code with ALL fixes applied. This should be the complete, corrected version of the code.

LINE NUMBERS: Each line of the code is prefixed with its number and a bar, like "18| ". Use those numbers for "line" and "endLine". Never include the prefixes in "excerpt", "fixedCode" or "fixedFullCode".

FIXES: "fixedCode" replaces lines "line" to "endLine" inclusive, exactly and nothing else. If your fix changes a line outside that range (a function signature, say), widen "line" and "endLine" to cover it. Keep the original indentation.

CHECKS: Give each issue a "check", a small test that proves whether the issue is still there. Use an empty string when running code can't reveal the issue (types, naming, style, general security posture). What to write depends on the language:
- JavaScript or TypeScript: one plain JavaScript expression (no TypeScript syntax). It is evaluated after the whole file has run, in the same scope, and must be true once the issue is fixed and false or throw while it's still present. For example "(() => { try { return getRole(99) === undefined; } catch { return false; } })()".
- Python: one Python expression, evaluated with the file's globals after the file has run. It must be truthy once fixed and falsy or raise while the issue is present. For example "(lambda xs: (normalize_names(xs), xs[0] == ' x ')[1])([' x '])".
- C++, C# or Java: a few lines the developer can paste into a main method or test to see the bug, with a comment saying what the output should be once it's fixed. Keep it under 8 lines.
Checks must not use the network, randomness, timers, input() or printing, and must be self-contained apart from what the file defines.

EXAMPLES AND TRICKY INPUTS: Also return "examples" (2 to 4 items) and "edgeCases" (2 to 4 items). Each item has a plain-English "label" saying what it tries, like "Look up the admin user" or "Look up a user who doesn't exist", and a "code".
- "examples" call the file's main functions with normal, sensible inputs so the user can see what the code does.
- "edgeCases" call them with awkward inputs that often break code: empty lists, missing items, zero, negative numbers, very long or blank text, duplicate entries.
- For JavaScript or TypeScript, "code" is one plain JavaScript expression whose value is worth seeing, evaluated after the whole file has run.
- For Python, "code" is one Python expression, evaluated with the file's globals after the file has run.
- For C++, C# or Java, "code" is a few lines to paste into a main method that print the result.
- Don't mutate shared data in a way that changes later items, and don't use the network, randomness, timers or input().

SCORE: 100 means there is nothing to fix. If you report any issue, the score must be below 100.

Return this exact format:
{
  "score": 85,
  "summary": "One paragraph overview of the code quality",
  "language": "${language}",
  "refactorPlan": "A short, prioritized refactor direction (2-3 bullets)",
  "testFramework": "The recommended unit test framework",
  "generatedTests": "",
  "securitySummary": "Short security-focused recap",
  "fixedFullCode": "THE ENTIRE CODE WITH ALL FIXES APPLIED",
  "examples": [{ "label": "Plain description", "code": "expression" }],
  "edgeCases": [{ "label": "Plain description", "code": "expression" }],
  "issues": [
    {
      "id": "1",
      "line": 12,
      "endLine": 15,
      "severity": "error",
      "category": "correctness",
      "confidence": 85,
      "title": "Short title",
      "description": "Clear explanation",
      "evidence": {
        "excerpt": "Exact code excerpt"
      },
      "fix": "Actionable fix instruction",
      "fixedCode": "The corrected code snippet for this specific issue",
      "cwe": "",
      "testSuggestion": "",
      "check": ""
    }
  ]
}`;

  const numbered = code.substring(0, 8000).split('\n').map((l, i) => `${i + 1}| ${l}`).join('\n');
  const userPrompt = `Review this ${language} code. Keep the response concise and focus on the 3-5 most important issues:\n\n\`\`\`${language}\n${numbered}\n\`\`\``;

  try {
    const message = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(ReviewSchema) },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    if (message.stop_reason === 'max_tokens') console.warn('[review] response hit max_tokens');
    const data = message.parsed_output;

    if (data && isReviewResult(data)) {
      return NextResponse.json(data);
    }
    console.warn('[review] response was not a valid review');
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many papers at once. Try again in a minute.' },
        { status: 429 },
      );
    }
    // Hitting the account's monthly spend limit (or running out of credit) comes back
    // as a 400 with one of these messages. Say so plainly instead of "try again".
    if (err instanceof Anthropic.APIError && err.status === 400 && /usage limit|credit balance/i.test(err.message)) {
      return NextResponse.json(
        {
          error: 'demo_limit',
          message: "The live demo has used up this month's marking allowance. It resets at the start of next month.",
        },
        { status: 503 },
      );
    }
    console.error('[review] Claude request failed:', err);
  }

  return NextResponse.json(
    { 
      error: 'ai_service_error', 
      message: "The marking didn't come back complete. Try again." 
    },
    { status: 503 },
  );
}