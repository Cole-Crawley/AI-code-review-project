'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Issue, CheckResult } from '@/types';

interface IssueCardProps {
  issue: Issue;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onFix: () => void;
  onApplyFix?: (issue: Issue, fixedCode: string) => void;
  // Whether this language can run in Scratch work (JS, TS, Python)
  runnable?: boolean;
  // The result of this correction's test from the last run
  checkResult?: CheckResult;
}

// A small pen mark: a tick when the test passes, a cross when it still fails
function ResultMark({ result }: { result?: CheckResult }) {
  if (!result) return null;
  return result.status === 'pass'
    ? <svg className="r-mark r-pass" viewBox="0 0 24 24" aria-label="Fixed"><path d="M4 13l5 5L20 6" /></svg>
    : <svg className="r-mark r-fail" viewBox="0 0 24 24" aria-label="Still happening"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

// A correction on the marking sheet. Collapsed it's just the line and the problem;
// opening it shows the explanation, the offending code and the fix.
export default function IssueCard({ issue, index, isActive, onClick, onFix, onApplyFix, runnable = false, checkResult }: IssueCardProps) {
  const hasFixedCode = !!issue.fixedCode;
  const test = (issue.check ?? '').trim();
  const [copied, setCopied] = useState(false);

  const copyTest = async () => {
    try { await navigator.clipboard.writeText(test); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ }
  };

  if (issue.fixed) {
    return (
      <div className="correction is-fixed">
        <span className="line-mark">{issue.line}</span>
        <p className="c-title">{issue.title}</p>
        {checkResult ? <ResultMark result={checkResult} /> : <svg className="tick" viewBox="0 0 24 24" aria-label="Fixed"><path d="M3 13.5l5.5 5L21 5" /></svg>}
        <style jsx global>{styles}</style>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={`correction sev-${issue.severity} ${isActive ? 'is-open' : ''}`}
    >
      <button className="c-head" onClick={onClick} aria-expanded={isActive}>
        <span className="line-mark" title={`Line ${issue.line}`}>{issue.line}</span>
        <span className="c-title">{issue.title}</span>
        <ResultMark result={checkResult} />
      </button>

      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            className="c-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="c-desc">{issue.description}</p>
            {issue.evidence?.excerpt && <pre className="c-code">{issue.evidence.excerpt}</pre>}
            <p className="c-fix"><span className="pen">fix:</span> {issue.fix}</p>
            {test && runnable && (
              <div className="c-test">
                <p className="c-test-head">
                  <span className="pen">test:</span>
                  <span className="c-test-state">
                    {!checkResult ? 'Pick A in Scratch work to run it.' : checkResult.status === 'pass' ? 'Fixed.' : `Still happening${checkResult.note ? ` (${checkResult.note})` : '.'}`}
                  </span>
                </p>
                <code className="c-test-code">{test}</code>
              </div>
            )}
            {test && !runnable && (
              <div className="c-test">
                <p className="c-test-head">
                  <span className="pen">try it:</span>
                  <span className="c-test-state">Run this in your project to see the problem, then again after fixing it.</span>
                </p>
                <pre className="c-test-code">{test}</pre>
                <button className="c-done" onClick={(e) => { e.stopPropagation(); copyTest(); }} data-tip="Copy this test to your clipboard">{copied ? 'Copied' : 'Copy test'}</button>
              </div>
            )}
            <div className="c-actions">
              {hasFixedCode && (
                <button className="c-apply" onClick={(e) => { e.stopPropagation(); onApplyFix?.(issue, issue.fixedCode!); }} data-tip={runnable && test ? 'Rewrite these lines with the fix, then re-run the test' : 'Rewrite these lines on your paper with the fix'}>
                  Apply fix
                </button>
              )}
              <button className="c-done" onClick={(e) => { e.stopPropagation(); onFix(); }} data-tip="Tick it off without changing your code">
                Mark as done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <style jsx global>{styles}</style>
    </motion.div>
  );
}

const styles = `
  .correction { position: relative; border-bottom: 1px solid var(--line); }
  .correction:last-child { border-bottom: 0; }
  .c-head { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 12px 2px; background: none; border: 0; text-align: left; cursor: pointer; }
  .c-head:hover .c-title { color: var(--ink); }

  /* The line number, circled in the severity's pen colour */
  .line-mark { flex-shrink: 0; display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 4px; border: 1.5px solid currentColor; border-radius: 50%; font: 400 19px var(--font-pen); line-height: 1; transform: rotate(-4deg); }
  .sev-error .line-mark { color: var(--red); }
  .sev-warning .line-mark { color: var(--pencil); }
  .sev-suggestion .line-mark { color: var(--blue); }

  .c-title { margin: 0; padding-top: 4px; font: 400 15px/1.4 var(--font-serif); color: var(--ink-2); transition: color .15s; }
  .is-open .c-title { color: var(--ink); }

  .c-body { overflow: hidden; padding-left: 40px; }
  .c-desc { margin: 0 0 10px; font: 14px/1.6 var(--font-sans); color: var(--ink-2); }
  .c-code { margin: 0 0 10px; padding: 8px 10px; background: var(--paper); border: 1px solid var(--line); border-radius: 4px; font: 13px/1.5 var(--font-mono); color: var(--ink); white-space: pre-wrap; word-break: break-word; }
  .sev-error .c-code { text-decoration: line-through; text-decoration-color: rgba(200, 16, 46, 0.55); }
  .c-fix { margin: 0 0 12px; font: 14px/1.6 var(--font-sans); color: var(--ink); }
  .c-fix .pen { font-size: 19px; margin-right: 2px; }
  .c-actions { display: flex; gap: 14px; padding-bottom: 14px; }
  .c-apply { height: 32px; padding: 0 14px; border: 0; border-radius: var(--radius); background: var(--ink); color: var(--paper); font: 600 13px var(--font-sans); cursor: pointer; transition: background .15s; }
  .c-apply:hover { background: var(--red); }
  .c-done { background: none; border: 0; padding: 0; font: 500 13px var(--font-sans); color: var(--ink-2); cursor: pointer; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 4px; }
  .c-done:hover { color: var(--ink); text-decoration-color: var(--tick); }

  .is-fixed { display: flex; align-items: flex-start; gap: 12px; padding: 10px 2px; }
  .is-fixed .line-mark { color: var(--ink-3); }
  .is-fixed .c-title { color: var(--ink-3); text-decoration: line-through; text-decoration-color: var(--ink-3); flex: 1; }
  .c-test { margin: 0 0 12px; padding: 10px 12px; border: 1px dashed var(--line); border-radius: 4px; }
  .c-test-head { display: flex; align-items: baseline; gap: 6px; margin: 0 0 6px; font: 13px/1.5 var(--font-sans); color: var(--ink-2); }
  .c-test-head .pen { font-size: 19px; flex-shrink: 0; }
  .c-test-code { display: block; margin: 0 0 8px; font: 12.5px/1.5 var(--font-mono); color: var(--ink); white-space: pre-wrap; word-break: break-word; }
  code.c-test-code { margin: 0; }
  .r-mark { width: 20px; height: 20px; flex-shrink: 0; margin: 4px 0 0 auto; fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; transform: rotate(-6deg); }
  .r-pass { stroke: var(--tick); }
  .r-fail { stroke: var(--red); }
  .tick { width: 22px; height: 22px; flex-shrink: 0; margin-top: 3px; fill: none; stroke: var(--tick); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
`;
