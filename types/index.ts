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
};