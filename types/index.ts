export type Language = 'typescript' | 'javascript' | 'python' | 'cpp' | 'csharp' | 'java';

export type Severity = 'error' | 'warning' | 'suggestion';

export type IssueCategory =
  | 'correctness'
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'readability'
  | 'style'
  | 'best_practice';

export type IssueEvidence = {
  // Short excerpt from the original code that triggered the issue.
  // The model should copy this from the provided code.
  excerpt: string;
  // Optional extra context around the excerpt (e.g., related lines).
  related?: string;
};

export type Issue = {
  id: string;
  line: number;
  endLine?: number;
  severity: Severity;
  category: IssueCategory;
  confidence: number; // 0..100
  title: string;
  description: string;
  evidence: IssueEvidence;
  fix: string;
  fixedCode?: string;
  fixed?: boolean;
  // Filled in the UI from the original source so devs can see a concrete "before" patch.
  beforeCode?: string;
  // Only set for security-related issues when known.
  cwe?: string;
  // Optional language/framework specific test guidance.
  testSuggestion?: string;
  // A plain JavaScript expression that is true once the issue is fixed and false
  // (or throws) while it's still there. Run after the whole file in the sandbox.
  // Empty when the issue can't be observed at runtime (types, style, security posture).
  check?: string;
};

export type CheckResult = {
  status: 'pass' | 'fail';
  // Why it failed, when the check threw.
  note?: string;
};

export type ReviewResult = {
  score: number;
  summary: string;
  issues: Issue[];
  language: Language;
  // Global recommendations to help devs go beyond one-off line fixes.
  refactorPlan?: string;
  testFramework?: string;
  generatedTests?: string;
  securitySummary?: string;
  fixedFullCode?: string;
  // Things to try in Scratch work. For JS/TS/Python "code" is an expression that
  // gets evaluated; for C++/C#/Java it's a snippet to paste into the user's project.
  examples?: TryItem[];
  edgeCases?: TryItem[];
};

export type TryItem = {
  // What the call is doing, in plain English
  label: string;
  code: string;
};