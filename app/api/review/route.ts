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

// UPDATED: Only currently active models based on error logs
const MODEL_FALLBACK_CHAIN = [
  'llama-3.3-70b-versatile',   // Working but truncating
  'llama-3.1-8b-instant',      // Working but truncating  
];

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

IMPORTANT: Keep the response concise to avoid truncation. Limit issues to 3-5 most important ones.

Return this exact format:
{
  "score": 85,
  "summary": "One paragraph overview of the code quality",
  "language": "${language}",
  "refactorPlan": "A short, prioritized refactor direction (2-3 bullets)",
  "testFramework": "The recommended unit test framework",
  "generatedTests": "",
  "securitySummary": "Short security-focused recap",
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
      "fixedCode": "",
      "cwe": "",
      "testSuggestion": ""
    }
  ]
}`;

  const userPrompt = `Review this ${language} code. Keep response concise - focus on 3-5 most critical issues:\n\n\`\`\`${language}\n${code.substring(0, 8000)}\n\`\`\``;

  let lastError: Error | null = null;
  
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      console.log(`[review] Trying model: ${model}`);
      
      const completion = await groq.chat.completions.create({
        model,
        max_tokens: 3000, // Reduced to prevent truncation
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const text = completion.choices[0].message.content || '';
      const finishReason = completion.choices[0].finish_reason;

      if (finishReason === 'length') {
        console.warn(`[review] model ${model} hit token limit, trying next…`);
        continue;
      }

      // Extract and attempt to repair JSON
      let cleaned = extractJSONFromText(text);
      let data: unknown = null;
      
      // Try to parse as-is
      try {
        data = JSON.parse(cleaned);
      } catch (parseErr) {
        // Try to repair truncated JSON
        const repaired = repairTruncatedJSON(cleaned);
        if (repaired) {
          try {
            data = JSON.parse(repaired);
            console.log(`[review] Successfully repaired truncated JSON from ${model}`);
          } catch {
            console.warn(`[review] Could not repair JSON from ${model}`);
          }
        }
      }

      if (!data) {
        console.warn(`[review] model ${model} returned unparseable JSON`);
        continue;
      }

      if (!isReviewResult(data)) {
        console.warn(`[review] model ${model} returned invalid shape, trying next…`);
        continue;
      }

      console.log(`[review] Successfully parsed response from ${model}`);
      return NextResponse.json(data);

    } catch (err) {
      lastError = err as Error;
      
      if (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 429) {
        console.warn(`[review] model ${model} rate-limited, trying next…`);
        continue;
      }
      
      // Check for model decommissioned error
      if (typeof err === 'object' && err !== null && 'error' in err) {
        const errorObj = err as { error?: { code?: string } };
        if (errorObj.error?.code === 'model_decommissioned') {
          console.warn(`[review] model ${model} is decommissioned, skipping`);
          continue;
        }
      }
      
      console.error(`[review] model ${model} failed:`, err);
    }
  }

  console.error('[review] All models failed. Last error:', lastError);
  
  return NextResponse.json(
    { 
      error: 'ai_service_error', 
      message: 'Unable to get a valid review from AI services. Please try again later.' 
    },
    { status: 503 },
  );
}