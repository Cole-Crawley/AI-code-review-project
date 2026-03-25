'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import IssueCard from '@/components/IssueCard';
import HealthScore from '@/components/HealthScore';
import { Issue, ReviewResult, type Language } from '@/types';
import { MonacoEditor } from '@/components/CodeEditor';
import type { LoadedFile } from '@/components/UploadZone';

const CodeEditor = dynamic(() => import('@/components/CodeEditor'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConsoleLine {
  id: number;
  type: 'log' | 'warn' | 'error' | 'info' | 'system';
  args: string[];
}

type FileReviewState = {
  status: 'idle' | 'loading' | 'done' | 'error';
  result: ReviewResult | null;
  issues: Issue[];
  error: string;
  activeId: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
let lineId = 0;

function stripTypes(src: string): string {
  return src
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/\bexport\s+(default\s+)?/g, '')
    .replace(/^\s*(export\s+)?(interface|type)\s+\w+[\s\S]*?^\}/gm, '')
    .replace(/\)\s*:\s*[\w<>\[\]|&, .?]+(?=\s*\{)/g, ')')
    .replace(/([\w$]+)\s*:\s*[\w<>\[\]|&, .?]+(?=[,)=])/g, '$1')
    .replace(/:\s*[\w<>\[\]|&, .?]+(?=\s*=)/g, '')
    .replace(/<[A-Za-z][A-Za-z0-9_, ]*>/g, '')
    .replace(/\bas\s+[\w<>\[\]|&. ]+/g, '')
    .replace(/!/g, '')
    .trim();
}

const extByLanguage: Record<Language, string> = {
  typescript: 'ts', javascript: 'js', python: 'py',
  cpp: 'cpp', csharp: 'cs', java: 'java',
};

const LANGUAGE_LABEL: Record<Language, string> = {
  typescript: 'TS', javascript: 'JS', python: 'PY',
  cpp: 'C++', csharp: 'C#', java: 'Java',
};

const SEV_COLOR = { error: '#FF0099', warning: '#F59E0B', suggestion: '#1E90FF' } as const;
const SEV_LABEL = { error: 'Errors', warning: 'Warnings', suggestion: 'Suggestions' } as const;

function makeEmptyState(): FileReviewState {
  return { status: 'idle', result: null, issues: [], error: '', activeId: null };
}

async function fetchReview(code: string, language: Language): Promise<ReviewResult> {
  const res  = await fetch('/api/review', {
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
    const start      = Math.max(1, Math.min(issue.line, srcLines.length || 1));
    const end        = Math.max(start, Math.min(issue.endLine ?? issue.line, srcLines.length || 1));
    const beforeCode = srcLines.slice(start - 1, end).join('\n');
    return { ...issue, id: issue.id || String(i + 1), beforeCode };
  });
}

// ─── Console Panel ────────────────────────────────────────────────────────────
function LegacyConsolePanel({ code, language, isOpen, onToggle }: {
  code: string; language: string; isOpen: boolean; onToggle: () => void;
}) {
  const [lines,   setLines]   = useState<ConsoleLine[]>([]);
  const [running, setRunning] = useState(false);
  const [panelH,  setPanelH]  = useState(200);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragRef   = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.source !== 'codrev-sandbox') return;
      const { type, args } = e.data as { type: ConsoleLine['type']; args: string[]; source: string };
      setLines(prev => [...prev, { id: lineId++, type, args }]);
      if (type === 'system' || type === 'error') setRunning(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  const run = useCallback(() => {
    setLines([]);
    setRunning(true);
    const hasJsx = /<\s*[A-Za-z][A-Za-z0-9.]*[\s/>]/.test(code) || /return\s*\([\s\S]*</.test(code);
    if (hasJsx) {
      setLines([
        { id: lineId++, type: 'warn',   args: ["JSX detected — the browser sandbox can't run JSX directly."] },
        { id: lineId++, type: 'system', args: ['Tip: extract pure logic functions (no JSX) and run those instead.'] },
      ]);
      setRunning(false);
      return;
    }
    const js   = language === 'typescript' ? stripTypes(code) : code;
    const html = `<!DOCTYPE html><html><body><script>
      const _p=(t,a)=>window.parent.postMessage({source:'codrev-sandbox',type:t,args:a.map(x=>{try{return typeof x==='object'?JSON.stringify(x,null,2):String(x)}catch{return String(x)}})}, '*');
      ['log','warn','error','info'].forEach(m=>{console[m]=(...a)=>_p(m,a)});
      window.onerror=(msg,_,l,c)=>{_p('error',[msg+' (line '+l+':'+c+')']);return true};
      window.onunhandledrejection=e=>_p('error',['Unhandled rejection: '+e.reason]);
      try{
        const fn=new(Object.getPrototypeOf(async function(){}).constructor)(${JSON.stringify(js)});
        Promise.resolve(fn()).then(()=>_p('system',['✓ done in '+performance.now().toFixed(1)+'ms'])).catch(e=>_p('error',[e?.message||String(e)]));
      }catch(e){_p('error',[e?.message||String(e)])}
    <\/script></body></html>`;
    if (iframeRef.current) iframeRef.current.srcdoc = html;
  }, [code, language]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: panelH };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPanelH(Math.max(120, Math.min(500, dragRef.current.startH + dragRef.current.startY - ev.clientY)));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const typeColor = { log: '#E2E8F0', info: '#1E90FF', warn: '#F59E0B', error: '#FF0099', system: '#00FF85' };
  const typeIcon  = { log: '', info: 'ℹ ', warn: '⚠ ', error: '✕ ', system: '→ ' };

  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)', background: '#080808', display: 'flex', flexDirection: 'column' }}>
      <div onMouseDown={onMouseDown} style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, cursor: 'ns-resize', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)', width: 28, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'default' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, transition: 'all 0.2s', background: running ? '#00FF85' : lines.some(l => l.type === 'error') ? '#FF0099' : 'rgba(255,255,255,0.15)', boxShadow: running ? '0 0 8px rgba(0,255,133,0.7)' : 'none', animation: running ? 'consolePulse 1s ease-in-out infinite' : 'none' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>console</span>
          {lines.length > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 100 }}>{lines.length}</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
          {lines.length > 0 && <button onClick={() => setLines([])} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.25)', background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>✕ clear</button>}
          <button onClick={run} disabled={running} style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: running ? 'rgba(0,255,133,0.4)' : '#0D0D0D', background: running ? 'rgba(0,255,133,0.1)' : '#00FF85', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: running ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: running ? 'none' : '0 0 14px rgba(0,255,133,0.35)', letterSpacing: '0.05em', transition: 'all 0.15s' }}>
            {running ? <><span style={{ width: 10, height: 10, border: '1.5px solid rgba(0,255,133,0.2)', borderTopColor: '#00FF85', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> running…</> : <>▶ run</>}
          </button>
          <button onClick={onToggle} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.2)', background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>{isOpen ? '↓ hide' : '↑ show'}</button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div style={{ height: panelH, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: '1px solid rgba(255,255,255,0.05)' }} initial={{ height: 0, opacity: 0 }} animate={{ height: panelH, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            {lines.length === 0 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,0.15)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {running ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(0,255,133,0.2)', borderTopColor: '#00FF85', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> executing…</> : <>▶ press run to execute your code</>}
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {lines.map((line, i) => (
                <div key={line.id} style={{ display: 'flex', alignItems: 'baseline', padding: '2px 0', background: line.type === 'error' ? 'rgba(255,0,153,0.04)' : line.type === 'warn' ? 'rgba(245,158,11,0.03)' : 'transparent' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.12)', width: 36, textAlign: 'right', paddingRight: 12, flexShrink: 0, userSelect: 'none' }}>{i + 1}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: typeColor[line.type], flexShrink: 0, width: 14 }}>{typeIcon[line.type]}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: typeColor[line.type], lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', paddingRight: 16 }}>{line.args.join(' ')}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <iframe ref={iframeRef} sandbox="allow-scripts" style={{ display: 'none' }} title="sandbox" />
      <style>{`@keyframes consolePulse { 0%,100%{opacity:1} 50%{opacity:0.35} } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Review Page ──────────────────────────────────────────────────────────────
function ReviewPageInner() {
  const router = useRouter();

  // ── Source files from sessionStorage ─────────────────────────────────────
  const [files,      setFiles]      = useState<LoadedFile[]>([]);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [copied,     setCopied]     = useState(false);

  // Per-file review state — keyed by file index
  const [reviewMap, setReviewMap] = useState<Map<number, FileReviewState>>(new Map());
  // Per-file live code (Monaco edits)
  const [codeMap,   setCodeMap]   = useState<Map<number, string>>(new Map());

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
      const code     = sessionStorage.getItem('reviewCode') || '';
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
      const result   = await fetchReview(file.code, file.language);
      const srcLines = file.code.split('\n');
      const issues   = enrichIssues(result.issues, srcLines);
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
  const activeFile  = files[activeIdx];
  const activeCode  = activeFile ? getCode(activeIdx, activeFile.code) : '';
  const activeState = getState(activeIdx);
  const { result, issues, status, error: reviewError, activeId } = activeState;

  const fixedCount   = issues.filter(i => i.fixed).length;
  const activeIssues = issues.filter(i => !i.fixed);
  const grouped      = {
    error:      activeIssues.filter(i => i.severity === 'error'),
    warning:    activeIssues.filter(i => i.severity === 'warning'),
    suggestion: activeIssues.filter(i => i.severity === 'suggestion'),
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

  const applyFix = (issue: Issue, fixedCode: string) => {
    editorApiRef.current?.applyFix(issue, fixedCode);
  };

  const setActiveIssueId = (id: string | null) => {
    patchState(activeIdx, { activeId: id });
  };

  const copyReport = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  // ── Per-file status dots (for tab strip) ──────────────────────────────────
  const fileDot = (idx: number) => {
    const s = reviewMap.get(idx);
    if (!s || s.status === 'idle')    return 'rgba(255,255,255,0.2)';
    if (s.status === 'loading')       return '#F59E0B';
    if (s.status === 'error')         return '#FF0099';
    const errs = s.issues.filter(i => !i.fixed && i.severity === 'error').length;
    return errs ? '#FF0099' : '#00FF85';
  };

  const isMulti = files.length > 1;

  if (!activeFile) return null;

  return (
    <main suppressHydrationWarning style={{ height: '100vh', overflow: 'hidden', background: '#0D0D0D', color: '#FFFFFF', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div className="noise-overlay" />

      {/* ── Top bar ── */}
      <div className="topbar">
        <button onClick={() => router.push('/')} className="back-btn">← back</button>
        <div className="topbar-divider" />

        {/* ── File tabs (multi) or filename (single) ── */}
        {isMulti ? (
          <div className="file-tabs-bar">
            {files.map((f, i) => (
              <button
                key={i}
                onClick={() => switchTab(i)}
                className={`ftab ${activeIdx === i ? 'ftab-active' : ''}`}
              >
                <span className="ftab-dot" style={{ background: fileDot(i), boxShadow: fileDot(i) !== 'rgba(255,255,255,0.2)' ? `0 0 6px ${fileDot(i)}80` : 'none' }} />
                <span className="ftab-lang">{LANGUAGE_LABEL[f.language]}</span>
                <span className="ftab-name">{f.filename || `file ${i + 1}.${extByLanguage[f.language]}`}</span>
                {reviewMap.get(i)?.status === 'loading' && (
                  <span className="ftab-spinner" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="topbar-file">
            <span className="file-dot" style={{ background: fileDot(0) }} />
            <span className="file-name">{activeFile.filename || `code.${extByLanguage[activeFile.language]}`}</span>
          </div>
        )}

        <div className="topbar-actions">
          {[
            { label: '↩ undo',  action: () => editorApiRef.current?.undo() },
            { label: '↪ redo',  action: () => editorApiRef.current?.redo() },
            { label: copied ? '✓ copied' : '⎘ copy report', action: copyReport, disabled: !result },
          ].map(({ label, action, disabled }) => (
            <button key={label} onClick={action} className="action-btn" style={disabled ? { opacity: 0.35, cursor: 'not-allowed' } : undefined} disabled={!!disabled}>{label}</button>
          ))}
        </div>

        {status === 'done' && result && (
          <div className="topbar-badges">
            {(['error', 'warning', 'suggestion'] as const).map(sev => {
              const count = grouped[sev].length;
              if (!count) return null;
              return <span key={sev} className="sev-badge" style={{ color: SEV_COLOR[sev], background: `${SEV_COLOR[sev]}18`, border: `1px solid ${SEV_COLOR[sev]}35` }}>{count} {sev}{count !== 1 ? 's' : ''}</span>;
            })}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── Editor + Console column ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

          {status === 'loading' && (
            <div className="loading-overlay">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
                <div className="loading-ring" />
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.8)', margin: '0 0 4px', fontFamily: 'var(--font-mono)' }}>reviewing your code…</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                    {isMulti ? `file ${activeIdx + 1} of ${files.length}` : 'running AI analysis'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <p style={{ color: '#FF0099', fontSize: 14, margin: 0, fontFamily: 'var(--font-mono)' }}>{reviewError}</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => triggerReview(activeIdx, activeFile)} style={{ fontSize: 12, color: '#00FF85', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', textDecoration: 'underline' }}>↻ retry</button>
                <button onClick={() => router.push('/')} style={{ fontSize: 12, color: '#1E90FF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', textDecoration: 'underline' }}>← back</button>
              </div>
            </div>
          )}

          {/* Monaco — remounts when activeIdx changes via key */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <CodeEditor
              key={activeIdx}
              code={activeCode}
              language={activeFile.language}
              issues={issues}
              activeIssueId={activeId}
              onChange={(v) => setCodeMap(prev => new Map(prev).set(activeIdx, v))}
              onEditorReady={(api) => { editorApiRef.current = api; }}
            />
          </div>

          {/* Console — only for JS/TS */}
          {(activeFile.language === 'javascript' || activeFile.language === 'typescript') && (
            <LegacyConsolePanel
              code={activeCode}
              language={activeFile.language}
              isOpen={consoleOpen}
              onToggle={() => setConsoleOpen(p => !p)}
            />
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="sidebar">
          {result && (
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <HealthScore score={liveScore} issueCount={issues.length} fixedCount={fixedCount} />
            </div>
          )}

          {/* Multi-file overview strip */}
          {isMulti && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <p className="section-label" style={{ marginBottom: 8 }}>All files</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {files.map((f, i) => {
                  const s = reviewMap.get(i);
                  const errCount = s?.issues.filter(iss => !iss.fixed && iss.severity === 'error').length ?? 0;
                  const warnCount = s?.issues.filter(iss => !iss.fixed && iss.severity === 'warning').length ?? 0;
                  return (
                    <button
                      key={i}
                      onClick={() => switchTab(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: activeIdx === i ? 'rgba(0,255,133,0.06)' : 'transparent',
                        border: `1px solid ${activeIdx === i ? 'rgba(0,255,133,0.15)' : 'rgba(255,255,255,0.05)'}`,
                        borderRadius: 8, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', width: '100%',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: fileDot(i), flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: activeIdx === i ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.filename || `file ${i + 1}`}
                      </span>
                      {s?.status === 'loading' && <span style={{ fontSize: 10, color: '#F59E0B', fontFamily: 'var(--font-mono)' }}>…</span>}
                      {s?.status === 'done' && (errCount > 0 || warnCount > 0) && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: errCount ? '#FF0099' : '#F59E0B' }}>
                          {errCount > 0 ? `${errCount}E` : ''}{errCount > 0 && warnCount > 0 ? ' ' : ''}{warnCount > 0 ? `${warnCount}W` : ''}
                        </span>
                      )}
                      {s?.status === 'done' && errCount === 0 && warnCount === 0 && (
                        <span style={{ fontSize: 10, color: '#00FF85', fontFamily: 'var(--font-mono)' }}>✓</span>
                      )}
                      {s?.status === 'idle' && (
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)' }}>tap</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {result?.summary && (
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <p className="section-label">Summary</p>
              <p style={{ fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, margin: 0 }}>{result.summary}</p>
            </div>
          )}

          {result?.securitySummary && (
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <p className="section-label">Security</p>
              <p style={{ fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{result.securitySummary}</p>
            </div>
          )}

          {result?.refactorPlan && (
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <p className="section-label">Refactor plan</p>
              <p style={{ fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{result.refactorPlan}</p>
            </div>
          )}

          {(result?.testFramework || result?.generatedTests) && (
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <p className="section-label">Tests</p>
              <p style={{ fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, margin: 0 }}>
                {result.testFramework ? `Framework: ${result.testFramework}` : 'Suggested test coverage'}.
              </p>
              {result.generatedTests && result.generatedTests.trim().length > 0 && (
                <pre style={{ margin: '10px 0 0', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)', color: '#E2E8F0', fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' }}>
                  {result.generatedTests}
                </pre>
              )}
            </div>
          )}

          {/* Issues list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
            {status === 'loading' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.1}s` }} />)}
              </div>
            )}
            {status === 'done' && activeIssues.length === 0 && fixedCount === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <span style={{ display: 'block', fontSize: 28, color: '#00FF85', textShadow: '0 0 20px rgba(0,255,133,0.5)', marginBottom: 10 }}>✓</span>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#00FF85', margin: '0 0 4px', fontFamily: 'var(--font-mono)' }}>all clear!</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>your code looks clean</p>
              </div>
            )}
            <AnimatePresence>
              {status === 'done' && (['error', 'warning', 'suggestion'] as const).map(sev => {
                const sevIssues = grouped[sev];
                if (!sevIssues.length) return null;
                return (
                  <motion.div key={sev} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: SEV_COLOR[sev] }}>{SEV_LABEL[sev]}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', padding: '1px 7px', borderRadius: 100, fontFamily: 'var(--font-mono)' }}>{sevIssues.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sevIssues.map((issue, i) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          index={i}
                          isActive={activeId === issue.id}
                          onClick={() => setActiveIssueId(activeId === issue.id ? null : issue.id)}
                          onFix={() => fixIssue(issue.id)}
                          onApplyFix={issue.fixedCode ? applyFix : undefined}
                        />
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {fixedCount > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: '#00FF85' }}>Fixed</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', padding: '1px 7px', borderRadius: 100, fontFamily: 'var(--font-mono)' }}>{fixedCount}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {issues.filter(i => i.fixed).map((issue, i) => (
                    <IssueCard key={issue.id} issue={issue} index={i} isActive={false} onClick={() => {}} onFix={() => {}} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {status === 'done' && result && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button
                onClick={() => {
                  sessionStorage.removeItem('reviewFiles');
                  sessionStorage.removeItem('reviewCode');
                  sessionStorage.removeItem('reviewLanguage');
                  sessionStorage.removeItem('reviewFilename');
                  router.push('/');
                }}
                className="new-review-btn"
              >
                ⚡ review new code
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .noise-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: 0.03; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); background-size: 128px; }

        .topbar { height: 50px; flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(13,13,13,0.98); display: flex; align-items: center; padding: 0 16px; gap: 10px; z-index: 10; position: relative; overflow: hidden; }
        .back-btn { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.3); background: none; border: none; cursor: pointer; font-family: var(--font-display); padding: 4px 8px; border-radius: 6px; transition: color 0.15s; letter-spacing: 0.06em; flex-shrink: 0; }
        .back-btn:hover { color: #00FF85; }
        .topbar-divider { width: 1px; height: 18px; background: rgba(255,255,255,0.07); flex-shrink: 0; }
        .topbar-file { display: flex; align-items: center; gap: 6px; }
        .file-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .file-name { font-size: 12px; color: rgba(255,255,255,0.45); font-family: var(--font-mono); }

        /* Multi-file tab strip in topbar */
        .file-tabs-bar { display: flex; gap: 2px; overflow-x: auto; flex: 1; min-width: 0; scrollbar-width: none; }
        .file-tabs-bar::-webkit-scrollbar { display: none; }
        .ftab { display: flex; align-items: center; gap: 5px; background: transparent; border: none; border-bottom: 2px solid transparent; padding: 0 12px; height: 50px; cursor: pointer; transition: all 0.15s; white-space: nowrap; flex-shrink: 0; }
        .ftab-active { border-bottom-color: #00FF85; background: rgba(0,255,133,0.04); }
        .ftab-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .ftab-lang { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.25); font-family: var(--font-mono); letter-spacing: 0.06em; }
        .ftab-active .ftab-lang { color: #00FF85; }
        .ftab-name { font-size: 11px; color: rgba(255,255,255,0.35); font-family: var(--font-mono); max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
        .ftab-active .ftab-name { color: rgba(255,255,255,0.8); }
        .ftab-spinner { width: 8px; height: 8px; border: 1.5px solid rgba(245,158,11,0.3); border-top-color: #F59E0B; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }

        .topbar-actions { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
        .action-btn { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 4px 10px; cursor: pointer; transition: all 0.15s; font-family: var(--font-mono); white-space: nowrap; }
        .action-btn:hover { color: #FFFFFF; background: rgba(255,255,255,0.08); }
        .topbar-badges { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        .sev-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 100px; font-family: var(--font-mono); letter-spacing: 0.03em; white-space: nowrap; }

        .loading-overlay { position: absolute; inset: 0; z-index: 5; background: rgba(13,13,13,0.9); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; }
        .loading-ring { width: 40px; height: 40px; border-radius: 50%; border: 2.5px solid rgba(0,255,133,0.15); border-top-color: #00FF85; animation: spin 0.8s linear infinite; box-shadow: 0 0 20px rgba(0,255,133,0.2); }

        .sidebar { width: 320px; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.06); background: #0A0A0A; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .section-label { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.2); letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 6px; font-family: var(--font-display); }
        .skeleton { height: 58px; border-radius: 10px; background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border: 1px solid rgba(255,255,255,0.04); }
        .new-review-btn { width: 100%; height: 40px; background: rgba(0,255,133,0.08); border: 1px solid rgba(0,255,133,0.2); border-radius: 10px; font-size: 13px; font-weight: 700; color: #00FF85; cursor: pointer; transition: all 0.15s; font-family: var(--font-display); letter-spacing: 0.06em; }
        .new-review-btn:hover { background: rgba(0,255,133,0.15); box-shadow: 0 0 20px rgba(0,255,133,0.15); }

        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>
    </main>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div style={{ height: '100vh', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2.5px solid rgba(0,255,133,0.15)', borderTopColor: '#00FF85', borderRadius: '50%', animation: 'spin 0.8s linear infinite', boxShadow: '0 0 20px rgba(0,255,133,0.2)' }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    }>
      <ReviewPageInner />
    </Suspense>
  );
}
