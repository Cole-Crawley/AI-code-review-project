export type Severity = 'error' | 'warning' | 'suggestion';

export type Issue = {
  id: string;
  line: number;
  endLine?: number;
  severity: Severity;
  title: string;
  description: string;
  fix: string;
  fixedCode?: string;
  fixed?: boolean;
};

export type ReviewResult = {
  score: number;
  summary: string;
  issues: Issue[];
  language: string;
};