'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import IssueCard from '@/components/IssueCard';
import HealthScore from '@/components/HealthScore';
import { Issue, ReviewResult, type Language, type CheckResult } from '@/types';
import { MonacoEditor } from '@/components/CodeEditor';
import type { LoadedFile } from '@/components/UploadZone';
import ScratchWork, { isRunnable, type Check } from '@/components/ScratchWork';

const CodeEditor = dynamic(() => import('@/components/CodeEditor'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
type FileReviewState = {
  status: 'idle' | 'loading' | 'done' | 'error';
  result: ReviewResult | null;
  issues: Issue[];
  error: string;
  activeId: string | null;
  // Results of each correction's test from the last run in Scratch work
  checkResults: Record<string, CheckResult>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const extByLanguage: Record<Language, string> = {
  typescript: 'ts', javascript: 'js', python: 'py',
  cpp: 'cpp', csharp: 'cs', java: 'java',
};

const LANGUAGE_LABEL: Record<Language, string> = {
  typescript: 'TS', javascript: 'JS', python: 'PY',
  cpp: 'C++', csharp: 'C#', java: 'Java',
};

// Plain names for each kind of correction, with a one-line explanation
const SEV_LABEL = { error: 'Mistakes', warning: 'Risks', suggestion: 'Improvements' } as const;
const SEV_NOTE = {
  error: 'These will break, crash or give the wrong answer.',
  warning: 'These work for now, but could cause trouble later.',
  suggestion: 'Optional changes that make the code easier to read and look after.',
} as const;

function makeEmptyState(): FileReviewState {
  return { status: 'idle', result: null, issues: [], error: '', activeId: null, checkResults: {} };
}

async function fetchReview(code: string, language: Language): Promise<ReviewResult> {
  const res = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language }),
  });
  const data: ReviewResult = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message || 'Review failed.');
  return data;
}

function enrichIssues(issues: Issue[], srcLines: string[]): Issue[] {
  return issues.map((issue, i) => {
    const start = Math.max(1, Math.min(issue.line, srcLines.length || 1));
    const end = Math.max(start, Math.min(issue.endLine ?? issue.line, srcLines.length || 1));
    const beforeCode = srcLines.slice(start - 1, end).join('\n');
    return { ...issue, id: issue.id || String(i + 1), beforeCode };
  });
}

// ─── Review Page ──────────────────────────────────────────────────────────────
function ReviewPageInner() {
  const router = useRouter();

  // ── Source files from sessionStorage ─────────────────────────────────────
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [runSignal, setRunSignal] = useState(0);

  // Per-file review state, keyed by file index
  const [reviewMap, setReviewMap] = useState<Map<number, FileReviewState>>(new Map());
  // Per-file live code (Monaco edits)
  const [codeMap, setCodeMap] = useState<Map<number, string>>(new Map());

  const editorApiRef = useRef<MonacoEditor | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getState = (idx: number): FileReviewState =>
    reviewMap.get(idx) ?? makeEmptyState();

  const patchState = useCallback((idx: number, patch: Partial<FileReviewState>) => {
    setReviewMap(prev => {
      const next = new Map(prev);
      next.set(idx, { ...(prev.get(idx) ?? makeEmptyState()), ...patch });
      return next;
    });
  }, []);

  const getCode = (idx: number, fallback: string) =>
    codeMap.get(idx) ?? fallback;

  // ── Load files from session ───────────────────────────────────────────────
  useEffect(() => {
    let loaded: LoadedFile[] = [];
    try {
      const stored = sessionStorage.getItem('reviewFiles');
      if (stored) {
        const parsed: LoadedFile[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      }
    } catch { /* ignore */ }

    // Legacy single-file fallback
    if (loaded.length === 0) {
      const code = sessionStorage.getItem('reviewCode') || '';
      const language = (sessionStorage.getItem('reviewLanguage') || 'typescript') as Language;
      const filename = sessionStorage.getItem('reviewFilename') || '';
      if (code) loaded = [{ code, language, filename }];
    }

    if (loaded.length === 0) { router.push('/'); return; }

    setFiles(loaded);

    // Seed codeMap with original source
    const cm = new Map<number, string>();
    loaded.forEach((f, i) => cm.set(i, f.code));
    setCodeMap(cm);

    // Auto-trigger review for the first file
    triggerReview(0, loaded[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Trigger review for a file ─────────────────────────────────────────────
  const triggerReview = useCallback(async (idx: number, file: LoadedFile) => {
    patchState(idx, { status: 'loading', error: '' });
    try {
      const result = await fetchReview(file.code, file.language);
      const srcLines = file.code.split('\n');
      const issues = enrichIssues(result.issues, srcLines);
      patchState(idx, { status: 'done', result: { ...result, issues }, issues });
    } catch (err) {
      patchState(idx, { status: 'error', error: (err as Error).message || 'Something went wrong.' });
    }
  }, [patchState]);

  // ── Switch tab ────────────────────────────────────────────────────────────
  const switchTab = useCallback((idx: number) => {
    setActiveIdx(idx);
    // Lazy-trigger review if not yet started
    const state = reviewMap.get(idx);
    if ((!state || state.status === 'idle') && files[idx]) {
      triggerReview(idx, files[idx]);
    }
  }, [files, reviewMap, triggerReview]);

  // ── Active-file derived state ─────────────────────────────────────────────
  const activeFile = files[activeIdx];
  const activeCode = activeFile ? getCode(activeIdx, activeFile.code) : '';
  const activeState = getState(activeIdx);
  const { result, issues, status, error: reviewError, activeId } = activeState;

  const fixedCount = issues.filter(i => i.fixed).length;
  const activeIssues = issues.filter(i => !i.fixed);
  const grouped = {
    error: activeIssues.filter(i => i.severity === 'error'),
    warning: activeIssues.filter(i => i.severity === 'warning'),
    suggestion: activeIssues.filter(i => i.severity === 'suggestion'),
  };

  const runnable = activeFile ? isRunnable(activeFile.language) : false;
  const checks: Check[] = issues
    .filter(i => (i.check ?? '').trim())
    .map(i => ({ id: i.id, line: i.line, code: i.check!.trim() }));
  const checkResults = activeState.checkResults ?? {};

  const onCheckResults = useCallback((results: Record<string, CheckResult>) => {
    patchState(activeIdx, { checkResults: results });
  }, [activeIdx, patchState]);

  // Any edit to the paper makes the last test results out of date
  const onPaperChange = (v: string) => {
    setCodeMap(prev => new Map(prev).set(activeIdx, v));
    if (Object.keys(activeState.checkResults ?? {}).length) patchState(activeIdx, { checkResults: {} });
  };

  const liveScore = (() => {
    if (!result) return 0;
    const total = issues.length;
    if (total === 0) return result.score;
    const fixed = issues.filter(i => i.fixed).length;
    return Math.round(result.score + (100 - result.score) * (fixed / total));
  })();

  // ── Actions ───────────────────────────────────────────────────────────────
  const fixIssue = (id: string) => {
    patchState(activeIdx, {
      issues: issues.map(i => i.id === id ? { ...i, fixed: true } : i),
      activeId: null,
    });
  };

  const applyFix = useCallback((issue: Issue, fixedCode: string) => {
    // Get the current code
    const currentCode = activeCode;
    
    // Apply the fix to the code
    const lines = currentCode.split('\n');
    const startLine = issue.line - 1;
    const endLine = issue.endLine ? issue.endLine - 1 : startLine;
    
    // Replace the affected lines with the fixed code
    const fixedLines = fixedCode.split('\n');
    lines.splice(startLine, endLine - startLine + 1, ...fixedLines);
    
    const newCode = lines.join('\n');
    
    // Update the codeMap
    setCodeMap(prev => new Map(prev).set(activeIdx, newCode));
    
    // Update the files array
    setFiles(prev => {
      const updated = [...prev];
      if (updated[activeIdx]) {
        updated[activeIdx] = { ...updated[activeIdx], code: newCode };
      }
      return updated;
    });
    
    // Save to sessionStorage
    const updatedFiles = [...files];
    if (updatedFiles[activeIdx]) {
      updatedFiles[activeIdx] = { ...updatedFiles[activeIdx], code: newCode };
      sessionStorage.setItem('reviewFiles', JSON.stringify(updatedFiles));
    }
    
    // Mark the issue as fixed
    patchState(activeIdx, {
      issues: issues.map(i => i.id === issue.id ? { ...i, fixed: true } : i),
      activeId: null,
      checkResults: {},
    });
    if (activeFile && isRunnable(activeFile.language)) setRunSignal(n => n + 1);
  }, [activeIdx, activeCode, activeFile, files, issues, patchState]);

  const setActiveIssueId = (id: string | null) => {
    patchState(activeIdx, { activeId: id });
  };

  const copyReport = async () => {
    if (!result) return;
    try {
      const name = activeFile?.filename || `code.${extByLanguage[activeFile?.language ?? 'typescript']}`;
      const sev = { error: 'Error', warning: 'Warning', suggestion: 'Suggestion' } as const;
      const report = [
        `# ${name}: ${liveScore}/100`,
        '',
        result.summary,
        '',
        ...issues.map(i => `- ${i.fixed ? '[done] ' : ''}Line ${i.line}, ${sev[i.severity].toLowerCase()}: ${i.title}\n  ${i.fix}`),
        ...(result.securitySummary ? ['', '## Security', result.securitySummary] : []),
        ...(result.refactorPlan ? ['', '## Next time', result.refactorPlan] : []),
      ].join('\n');
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  // ── Per-file status dots (for tab strip) ──────────────────────────────────
  const fileDot = (idx: number) => {
    const s = reviewMap.get(idx);
    if (!s || s.status === 'idle') return 'idle';
    if (s.status === 'loading') return 'loading';
    if (s.status === 'error') return 'error';
    const errs = s.issues.filter(i => !i.fixed && i.severity === 'error').length;
    return errs ? 'error' : 'clean';
  };

  const isMulti = files.length > 1;

  if (!activeFile) return null;

  return (
    <main suppressHydrationWarning className="review">

      {/* ── Top bar ── */}
      <header className="topbar">
        <button onClick={() => router.push('/')} className="wordmark" aria-label="CodeMarker, back to start">
          CodeMarker
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13.5l5.5 5L21 5" /></svg>
        </button>

        {isMulti ? (
          <nav className="ftabs" aria-label="Files">
            {files.map((f, i) => (
              <button
                key={i}
                onClick={() => switchTab(i)}
                className={`ftab ${activeIdx === i ? 'is-active' : ''}`}
                aria-current={activeIdx === i ? 'page' : undefined}
              >
                <span className={`fdot fdot-${fileDot(i)}`} />
                {f.filename || `file ${i + 1}.${extByLanguage[f.language]}`}
              </button>
            ))}
          </nav>
        ) : (
          <span className="fname">{activeFile.filename || `code.${extByLanguage[activeFile.language]}`}</span>
        )}

        <div className="tb-actions">
          <button className="link-btn" onClick={() => editorApiRef.current?.undo()} data-tip="Undo your last change to the paper">Undo</button>
          <button className="link-btn" onClick={() => editorApiRef.current?.redo()} data-tip="Put back what you undid">Redo</button>
          <button className="link-btn" onClick={copyReport} disabled={!result} data-tip="Copy the marks as text, ready for a pull request or your notes" data-tip-align="end">{copied ? 'Copied' : 'Copy report'}</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="body">

        {/* ── The paper: code, then scratch work ── */}
        <div className="paper-col">
          <div className="paper">
            {status === 'loading' && (
              <div className="overlay" role="status">
                <svg className="marking-pen" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 26l10 10L40 12" /></svg>
                <p className="overlay-title">Marking your paper</p>
                <p className="overlay-sub">{isMulti ? `File ${activeIdx + 1} of ${files.length}` : 'This takes a few seconds'}</p>
              </div>
            )}

            {status === 'error' && (
              <div className="overlay" role="alert">
                <p className="overlay-title">This one couldn&apos;t be marked.</p>
                <p className="overlay-sub">{reviewError}</p>
                <div className="overlay-actions">
                  <button className="primary" onClick={() => triggerReview(activeIdx, activeFile)}>Try again</button>
                  <button className="link-btn" onClick={() => router.push('/')}>Back</button>
                </div>
              </div>
            )}

            <div className="editor">
              <CodeEditor
                key={activeIdx}
                code={activeCode}
                language={activeFile.language}
                issues={issues}
                activeIssueId={activeId}
                onChange={onPaperChange}
                onEditorReady={(api) => { editorApiRef.current = api; }}
              />
            </div>
          </div>

          {/* Scratch work: runs the paper and each correction's test where the language allows */}
          <ScratchWork
            key={activeIdx}
            code={activeCode}
            language={activeFile.language}
            checks={checks}
            examples={result?.examples ?? []}
            edgeCases={result?.edgeCases ?? []}
            fixedFullCode={result?.fixedFullCode}
            isOpen={consoleOpen}
            onToggle={() => setConsoleOpen(p => !p)}
            onResults={onCheckResults}
            runSignal={runSignal}
          />
        </div>

        {/* ── Marking sheet ── */}
        <aside className="marks" aria-label="Marks">
          {result && (
            <div className="marks-grade">
              <HealthScore score={liveScore} issueCount={issues.length} fixedCount={fixedCount} />
            </div>
          )}

          <div className="sidebar-scroll">
            {isMulti && (
              <div className="files-list">
                {files.map((f, i) => {
                  const s = reviewMap.get(i);
                  const open = s?.issues.filter(iss => !iss.fixed).length ?? 0;
                  return (
                    <button key={i} onClick={() => switchTab(i)} className={`fl-row ${activeIdx === i ? 'is-active' : ''}`}>
                      <span className={`fdot fdot-${fileDot(i)}`} />
                      <span className="fl-name">{f.filename || `file ${i + 1}`}</span>
                      <span className="fl-meta">
                        {s?.status === 'loading' ? 'marking' : s?.status === 'done' ? (open ? `${open} to fix` : 'clean') : s?.status === 'error' ? 'failed' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="corrections">
              {status === 'loading' && (
                <div className="skeletons" aria-hidden="true">
                  {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.1}s` }} />)}
                </div>
              )}

              {status === 'done' && activeIssues.length === 0 && fixedCount === 0 && (
                <div className="full-marks">
                  <p className="pen">Full marks.</p>
                  <p className="fm-sub">Nothing to correct in this file.</p>
                </div>
              )}

              <AnimatePresence>
                {status === 'done' && (['error', 'warning', 'suggestion'] as const).map(sev => {
                  const sevIssues = grouped[sev];
                  if (!sevIssues.length) return null;
                  return (
                    <motion.section key={sev} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group">
                      <h3 className={`g-title g-${sev}`}>{SEV_LABEL[sev]}<span>{sevIssues.length}</span></h3>
                      <p className="g-note">{SEV_NOTE[sev]}</p>
                      {sevIssues.map((issue, i) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          index={i}
                          isActive={activeId === issue.id}
                          onClick={() => setActiveIssueId(activeId === issue.id ? null : issue.id)}
                          onFix={() => fixIssue(issue.id)}
                          onApplyFix={issue.fixedCode ? applyFix : undefined}
                          runnable={runnable}
                          checkResult={checkResults[issue.id]}
                        />
                      ))}
                    </motion.section>
                  );
                })}
              </AnimatePresence>

              {fixedCount > 0 && (
                <section className="group">
                  <h3 className="g-title g-done">Done<span>{fixedCount}</span></h3>
                  <p className="g-note">Fixed, or ticked off by you.</p>
                  {issues.filter(i => i.fixed).map((issue, i) => (
                    <IssueCard key={issue.id} issue={issue} index={i} isActive={false} onClick={() => { }} onFix={() => { }} runnable={runnable} checkResult={checkResults[issue.id]} />
                  ))}
                </section>
              )}

              {status === 'done' && activeIssues.length > 0 && !activeId && (
                <p className="pen side-tip">open one to see what&apos;s wrong and how to fix it</p>
              )}
            </div>

            {/* Examiner's notes: the longer write-up, folded away until wanted */}
            {status === 'done' && result && (result.summary || result.securitySummary || result.refactorPlan || result.testFramework || result.generatedTests) && (
              <details className="notes">
                <summary>Examiner&apos;s notes</summary>
                {result.summary && (<><h4>Overall</h4><p>{result.summary}</p></>)}
                {result.securitySummary && (<><h4>Security</h4><p className="pre">{result.securitySummary}</p></>)}
                {result.refactorPlan && (<><h4>Next time</h4><p className="pre">{result.refactorPlan}</p></>)}
                {(result.testFramework || result.generatedTests) && (
                  <>
                    <h4>Tests</h4>
                    {result.testFramework && <p>Write them with {result.testFramework}.</p>}
                    {result.generatedTests && result.generatedTests.trim().length > 0 && <pre>{result.generatedTests}</pre>}
                  </>
                )}
              </details>
            )}
          </div>

          {status === 'done' && result && (
            <footer className="marks-foot">
              <button
                className="primary full"
                data-tip="Start again with new code"
                data-tip-pos="up"
                onClick={() => {
                  sessionStorage.removeItem('reviewFiles');
                  sessionStorage.removeItem('reviewCode');
                  sessionStorage.removeItem('reviewLanguage');
                  sessionStorage.removeItem('reviewFilename');
                  router.push('/');
                }}
              >
                Mark something else
              </button>
            </footer>
          )}
        </aside>
      </div>

      <style>{`
        .review { height: 100vh; overflow: hidden; background: var(--desk); color: var(--ink); display: flex; flex-direction: column; }

        .topbar { height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 20px; padding: 0 20px; border-bottom: 1px solid var(--line); background: var(--desk); }
        .wordmark { display: inline-flex; align-items: center; gap: 5px; background: none; border: 0; padding: 0; cursor: pointer; font: 600 17px var(--font-serif); color: var(--ink); letter-spacing: -0.01em; flex-shrink: 0; }
        .wordmark svg { width: 17px; height: 17px; fill: none; stroke: var(--red); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; transform: translateY(-2px) rotate(-6deg); }
        .fname { font: 14px var(--font-mono); color: var(--ink-2); }
        .ftabs { display: flex; gap: 2px; overflow-x: auto; min-width: 0; scrollbar-width: none; }
        .ftabs::-webkit-scrollbar { display: none; }
        .ftab { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; background: none; border: 0; border-radius: var(--radius); font: 13px var(--font-mono); color: var(--ink-3); cursor: pointer; white-space: nowrap; }
        .ftab:hover { color: var(--ink); }
        .ftab.is-active { background: var(--paper); color: var(--ink); box-shadow: 0 1px 2px rgba(29,28,26,0.08); }
        .fdot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--line); }
        .fdot-loading { background: var(--pencil); animation: pulse 1s ease-in-out infinite; }
        .fdot-error { background: var(--red); }
        .fdot-clean { background: var(--tick); }
        .tb-actions { display: flex; gap: 18px; margin-left: auto; flex-shrink: 0; }

        .link-btn { background: none; border: 0; padding: 4px 0; font: 500 13px var(--font-sans); color: var(--ink-2); cursor: pointer; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 4px; transition: color .15s, text-decoration-color .15s; }
        .link-btn:hover:not(:disabled) { color: var(--ink); text-decoration-color: var(--red); }
        .link-btn:disabled { color: var(--ink-3); opacity: .6; cursor: not-allowed; }
        .primary { height: 40px; padding: 0 20px; border: 0; border-radius: var(--radius); background: var(--ink); color: var(--paper); font: 600 14px var(--font-sans); cursor: pointer; transition: background .15s; }
        .primary:hover { background: var(--red); }
        .primary.full { width: 100%; }

        .body { flex: 1; min-height: 0; display: flex; gap: 20px; padding: 20px; }
        .paper-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
        .paper { position: relative; flex: 1; min-height: 0; background: var(--paper); border-radius: 4px; box-shadow: var(--shadow-sheet); overflow: hidden; }
        /* The exam margin line, drawn over the editor's gutter edge */
        .paper::after { content: ""; position: absolute; top: 0; bottom: 0; left: 58px; width: 1px; background: var(--margin); pointer-events: none; z-index: 2; }
        .editor { position: absolute; inset: 0; }

        .overlay { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; background: rgba(251, 249, 244, 0.92); backdrop-filter: blur(2px); }
        .overlay-title { margin: 8px 0 0; font: 400 24px var(--font-serif); color: var(--ink); }
        .overlay-sub { margin: 0; font: 14px var(--font-sans); color: var(--ink-3); max-width: 420px; }
        .overlay-actions { display: flex; gap: 18px; align-items: center; margin-top: 14px; }
        .marking-pen { width: 52px; height: 52px; fill: none; stroke: var(--red); stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 60; stroke-dashoffset: 60; animation: draw 1.4s var(--ease) infinite; }

        .marks { width: 360px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; background: var(--paper); border-radius: 4px; box-shadow: var(--shadow-sheet); overflow: hidden; }
        .marks-grade { border-bottom: 1px solid var(--line); flex-shrink: 0; }
        .sidebar-scroll { flex: 1; min-height: 0; overflow-y: auto; }

        .files-list { padding: 10px 12px; border-bottom: 1px solid var(--line); display: grid; gap: 2px; }
        .fl-row { display: flex; align-items: center; gap: 9px; padding: 7px 8px; background: none; border: 0; border-radius: var(--radius); cursor: pointer; text-align: left; }
        .fl-row:hover, .fl-row.is-active { background: var(--desk); }
        .fl-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 13px var(--font-mono); color: var(--ink); }
        .fl-meta { font: 12px var(--font-sans); color: var(--ink-3); }

        .corrections { padding: 6px 20px 16px; }
        .group { margin-top: 14px; }
        .g-title { display: flex; align-items: baseline; gap: 8px; margin: 0; padding-bottom: 2px; font: 600 13px var(--font-sans); color: var(--ink); }
        .g-title span { font-weight: 400; color: var(--ink-3); }
        .g-note { margin: 2px 0 2px 22px; font: 13px/1.45 var(--font-sans); color: var(--ink-3); }
        .g-title::before { content: ""; width: 14px; height: 3px; border-radius: 2px; transform: translateY(-3px) rotate(-8deg); background: currentColor; }
        .g-error::before { background: var(--red); }
        .g-warning::before { background: var(--pencil); }
        .g-suggestion::before { background: var(--blue); }
        .g-done::before { background: var(--tick); }
        .side-tip { margin: 16px 0 0; font-size: 19px; transform: rotate(-2deg); opacity: .85; }
        .full-marks { padding: 36px 0 20px; text-align: center; }
        .full-marks .pen { font-size: 40px; }
        .fm-sub { margin: 8px 0 0; font: 14px var(--font-sans); color: var(--ink-3); }

        .notes { margin: 4px 20px 20px; border-top: 1px solid var(--line); }
        .notes summary { list-style: none; cursor: pointer; padding: 14px 0 4px; font: 600 13px var(--font-sans); color: var(--ink-2); }
        .notes summary::-webkit-details-marker { display: none; }
        .notes summary::after { content: " +"; color: var(--ink-3); font-weight: 400; }
        .notes[open] summary::after { content: " −"; }
        .notes summary:hover { color: var(--ink); }
        .notes h4 { margin: 14px 0 4px; font: 500 15px var(--font-serif); color: var(--ink); }
        .notes p { margin: 0; font: 14px/1.6 var(--font-sans); color: var(--ink-2); }
        .notes .pre { white-space: pre-wrap; }
        .notes pre { margin: 8px 0 0; padding: 10px 12px; max-height: 240px; overflow: auto; background: var(--desk); border-radius: 4px; font: 12.5px/1.55 var(--font-mono); color: var(--ink); white-space: pre-wrap; word-break: break-word; }

        .marks-foot { padding: 14px 20px; border-top: 1px solid var(--line); flex-shrink: 0; }

        .skeletons { display: grid; gap: 10px; padding-top: 14px; }
        .skeleton { height: 44px; border-radius: 4px; background: linear-gradient(90deg, var(--desk) 0%, #F4F0E7 50%, var(--desk) 100%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }

        /* Scratch work (console) */
        .scratch { flex-shrink: 0; background: var(--paper); border-radius: 4px; box-shadow: var(--shadow-sheet); display: flex; flex-direction: column; overflow: hidden; }
        .scratch-bar { height: 44px; display: flex; align-items: center; gap: 14px; padding: 0 16px; cursor: ns-resize; flex-shrink: 0; }
        .scratch-title { font: 500 15px var(--font-serif); color: var(--ink); cursor: default; }
        .scratch-tip { font-size: 18px; cursor: default; }
        .scratch-actions { display: flex; align-items: center; gap: 16px; margin-left: auto; cursor: default; }
        .run-btn { height: 30px; padding: 0 14px; border: 1.5px solid var(--ink); border-radius: var(--radius); background: none; font: 600 13px var(--font-sans); color: var(--ink); cursor: pointer; transition: background .15s, color .15s; }
        .run-btn:hover:not(:disabled) { background: var(--ink); color: var(--paper); }
        .run-btn:disabled { opacity: .5; cursor: progress; }
        .scratch-body { overflow: hidden; border-top: 1px solid var(--line); display: flex; flex-direction: column; }
        .options { display: flex; flex-wrap: wrap; gap: 4px 22px; padding: 10px 16px 8px 58px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
        .opt { display: inline-flex; align-items: center; gap: 9px; background: none; border: 0; padding: 4px 2px; cursor: pointer; color: var(--ink-2); font: 500 14px var(--font-sans); transition: color .15s; }
        .opt:hover:not(:disabled), .opt.is-picked { color: var(--ink); }
        .opt:disabled { color: var(--ink-3); opacity: .55; cursor: not-allowed; }
        .opt-letter { position: relative; display: inline-grid; place-items: center; width: 24px; height: 24px; font: 600 14px var(--font-serif); }
        .opt:hover:not(:disabled) .opt-letter { color: var(--red); }
        .opt-circle { position: absolute; inset: -9px; width: calc(100% + 18px); height: calc(100% + 18px); overflow: visible; pointer-events: none; }
        .opt-circle path { fill: none; stroke: var(--red); stroke-width: 2.2; stroke-linecap: round; stroke-dasharray: 120; stroke-dashoffset: 120; animation: circle-it .45s cubic-bezier(.65,0,.35,1) forwards; }
        @keyframes circle-it { to { stroke-dashoffset: 0; } }
        .try { margin: 0; padding: 4px 0 6px; }
        .try-label { margin: 0; font: 500 14.5px/28px var(--font-sans); color: var(--ink-2); }
        .try-io { margin: 0; font: 14.5px/28px var(--font-mono); color: var(--ink); word-break: break-word; }
        .try-arrow { font-family: var(--font-pen); font-size: 18px; color: var(--ink-3); margin: 0 4px; }
        .try-value { color: var(--tick); }
        .try.is-crash .try-label, .try.is-crash .try-value { color: var(--red); }
        .copy-preview { margin: 6px 0 12px; padding: 12px 14px; max-height: none; overflow: auto; background: var(--desk); border-radius: 4px; font: 14px/1.6 var(--font-mono); color: var(--ink); white-space: pre-wrap; word-break: break-word; }
        .scratch-lines { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 20px 16px 58px;  }
        .sl { margin: 0; font: 14.5px/28px var(--font-mono); white-space: pre-wrap; word-break: break-word; color: var(--ink); }
        .sl-warn { color: var(--pencil); }
        .sl-error { color: var(--red); }
        .sl-info { color: var(--blue); }
        .sl-system { color: var(--ink-3); font-style: italic; }
        .sl-empty { color: var(--ink-3); font-style: italic; }
        .sl-pass { color: var(--tick); }
        .sl-fail { color: var(--red); }
        .sl-note { color: var(--ink-2); font-style: italic; }
        .scratch-note { margin: 0; padding: 14px 16px 16px; font: 14px/1.6 var(--font-sans); color: var(--ink-2); border-top: 1px solid var(--line); }

        @keyframes draw { 0% { stroke-dashoffset: 60; } 55%, 100% { stroke-dashoffset: 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        @media (max-width: 900px) {
          .review { height: auto; min-height: 100vh; overflow: visible; }
          .body { flex-direction: column; padding: 12px; }
          .paper { min-height: 60vh; }
          .marks { width: auto; }
          .tb-actions { gap: 12px; }
        }
      `}</style>
    </main>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div style={{ height: '100vh', background: 'var(--desk)' }} />}>
      <ReviewPageInner />
    </Suspense>
  );
}
