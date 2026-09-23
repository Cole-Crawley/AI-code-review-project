'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CheckResult, Language, TryItem } from '@/types';

// Scratch work: a multiple-choice set of ways to try the code on the paper.
// JavaScript and TypeScript run in the browser; Python runs on Pyodide. C++, C#
// and Java need a compiler, so their choices copy ready-made snippets instead.

export interface Check { id: string; line: number; code: string }

interface Props {
  code: string;
  language: Language;
  checks: Check[];
  examples: TryItem[];
  edgeCases: TryItem[];
  fixedFullCode?: string;
  isOpen: boolean;
  onToggle: () => void;
  onResults: (results: Record<string, CheckResult>) => void;
  // Incremented by the page to re-test after a fix is applied
  runSignal: number;
}

type Mode = 'tests' | 'code' | 'examples' | 'edges';
type CopyMode = 'copyTests' | 'copyExamples' | 'copyEdges' | 'copyFixed';
type Choice = { key: Mode | CopyMode; label: string; tip: string; disabled?: boolean };

type Line =
  | { id: number; kind: 'log' | 'warn' | 'error' | 'pass' | 'fail' | 'note'; text: string }
  | { id: number; kind: 'try'; label: string; code: string; value: string; crashed: boolean }
  | { id: number; kind: 'copy'; text: string; body: string };

// Omit that keeps each member of a union separate
type NewLine = Line extends infer L ? (L extends Line ? Omit<L, 'id'> : never) : never;

const RUNNABLE: Language[] = ['javascript', 'typescript', 'python'];
const LANGUAGE_NAME: Record<Language, string> = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', cpp: 'C++', csharp: 'C#', java: 'Java' };
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.js';
const TIME_LIMIT_MS = 8000;
const LETTERS = 'ABCDEFG';

let seq = 0;

export const isRunnable = (language: Language) => RUNNABLE.includes(language);

// ── Sandbox documents ──────────────────────────────────────────────────────────

function stripModuleSyntax(src: string): string {
  return src
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/\bexport\s+(default\s+)?/g, '');
}

async function toJs(src: string, language: Language): Promise<string> {
  const plain = stripModuleSyntax(src);
  if (language !== 'typescript') return plain;
  const { transform } = await import('sucrase');
  return transform(plain, { transforms: ['typescript'], disableESTransforms: true }).code;
}

// Items run at the end of the file's own function body through a direct eval, so
// they can see everything the file declared, and a malformed item only fails itself.
function jsDocument(js: string, mode: Mode, items: { id: string; code: string }[]): string {
  const tail = mode === 'tests'
    ? items.map(c => `\ntry { __p('check', [${JSON.stringify(c.id)}, (await eval(${JSON.stringify(c.code)})) ? 'pass' : 'fail', '']); } catch (__e) { __p('check', [${JSON.stringify(c.id)}, 'fail', __why(__e)]); }`).join('')
    : mode === 'code'
      ? ''
      : items.map(c => `\ntry { __p('value', [${JSON.stringify(c.id)}, __fmt(await eval(${JSON.stringify(c.code)}))]); } catch (__e) { __p('threw', [${JSON.stringify(c.id)}, __why(__e)]); }`).join('');
  const body = JSON.stringify(js + '\n' + tail);
  return `<!DOCTYPE html><html><body><script>
    const __p = (t, a) => parent.postMessage({ source: 'cm-sandbox', type: t, args: a }, '*');
    const __fmt = v => { if (v === undefined) return 'undefined'; if (typeof v === 'string') return JSON.stringify(v); if (typeof v === 'function') return 'a function'; try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
    const __join = a => a.map(x => typeof x === 'string' ? x : __fmt(x)).join(' ');
    const __why = e => e instanceof SyntaxError ? "the test itself couldn't be read" : String(e && e.message || e);
    console.log = console.info = (...a) => __p('log', [__join(a)]);
    console.warn = (...a) => __p('warn', [__join(a)]);
    console.error = (...a) => __p('error', [__join(a)]);
    const t0 = performance.now();
    try {
      const run = new (Object.getPrototypeOf(async function () {}).constructor)(${body});
      Promise.resolve(run())
        .catch(e => __p('error', [e && e.message || String(e)]))
        .finally(() => __p('done', [String(Math.round(performance.now() - t0))]));
    } catch (e) {
      __p('error', [e && e.message || String(e)]);
      __p('done', ['0']);
    }
  <\/script></body></html>`;
}

// One long-lived document for Python, so Pyodide only loads once per file.
const PY_DOCUMENT = `<!DOCTYPE html><html><body>
<script src="${PYODIDE}"><\/script>
<script>
  const __p = (t, a) => parent.postMessage({ source: 'cm-sandbox', type: t, args: a }, '*');
  const last = s => String(s).trim().split('\\n').filter(Boolean).pop() || String(s);
  let py = null;
  async function ready() {
    if (!py) {
      __p('status', ['loading']);
      py = await loadPyodide({ stdout: s => __p('log', [s]), stderr: s => __p('warn', [s]) });
      py.setStdin({ stdin: () => null });
    }
    return py;
  }
  addEventListener('message', async (e) => {
    const job = e.data || {};
    if (typeof job.code !== 'string') return;
    try {
      const py = await ready();
      __p('status', ['running']);
      const ns = py.globals.get('dict')();
      const t0 = performance.now();
      try { await py.runPythonAsync(job.code, { globals: ns }); }
      catch (err) { __p('error', [last(err.message || err)]); }
      for (const c of job.items) {
        if (job.mode === 'tests') {
          try { const ok = await py.runPythonAsync('bool(' + c.code + ')', { globals: ns }); __p('check', [c.id, ok ? 'pass' : 'fail', '']); }
          catch (err) { __p('check', [c.id, 'fail', last(err.message || err)]); }
        } else {
          try { const v = await py.runPythonAsync('repr(' + c.code + ')', { globals: ns }); __p('value', [c.id, String(v)]); }
          catch (err) { __p('threw', [c.id, last(err.message || err)]); }
        }
      }
      __p('done', [String(Math.round(performance.now() - t0))]);
    } catch (err) {
      __p('error', ["Python couldn't load. Check your connection and try again."]);
      __p('done', ['0']);
    }
  });
  __p('ready', []);
<\/script></body></html>`;

// ── Choices ────────────────────────────────────────────────────────────────────

function choicesFor(runnable: boolean, p: { checks: number; examples: number; edges: number; hasFixed: boolean }): Choice[] {
  if (runnable) {
    return [
      { key: 'tests', label: 'Test the fixes', disabled: !p.checks,
        tip: p.checks
          ? 'Runs a small test for each correction. A tick means that problem is gone, so you know a fix really worked.'
          : "None of this file's corrections can be tested by running the code, so there's nothing to test here." },
      { key: 'code', label: 'Run my code',
        tip: 'Runs your code from top to bottom and shows anything it prints. Handy for seeing what it actually does.' },
      { key: 'examples', label: 'Try some examples', disabled: !p.examples,
        tip: 'Calls your functions with everyday inputs and shows what comes back, so you can check the answers look right.' },
      { key: 'edges', label: 'Try tricky inputs', disabled: !p.edges,
        tip: 'Feeds in awkward values like empty lists or missing items. This is where most bugs hide, so it is worth a look.' },
    ];
  }
  return [
    { key: 'copyTests', label: 'Copy the tests', disabled: !p.checks,
      tip: 'Copies a small test for each correction. Run them in your project before and after fixing to see the difference.' },
    { key: 'copyExamples', label: 'Copy example calls', disabled: !p.examples,
      tip: 'Copies a few calls with everyday inputs, ready to paste into main() so you can see what your code returns.' },
    { key: 'copyEdges', label: 'Copy tricky inputs', disabled: !p.edges,
      tip: 'Copies calls with awkward values like empty lists or missing items. This is where most bugs hide.' },
    { key: 'copyFixed', label: 'Copy the fixed file', disabled: !p.hasFixed,
      tip: 'Copies your whole file with every suggested fix applied, so you can compile it and compare with yours.' },
  ];
}

// A red pen circle, drawn around the chosen letter like a multiple-choice answer
function PenCircle() {
  return (
    <svg className="opt-circle" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M22 5 C 33 5, 37 14, 35 22 C 33 31, 24 36, 16 34 C 7 32, 3 23, 6 14 C 9 7, 17 4, 27 8" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ScratchWork({ code, language, checks, examples, edgeCases, fixedFullCode, isOpen, onToggle, onResults, runSignal }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [loadingPython, setLoadingPython] = useState(false);
  const [picked, setPicked] = useState<{ key: Choice['key']; n: number } | null>(null);
  // Sized to the screen: a comfortable default, or most of the column when enlarged
  const viewH = () => (typeof window === 'undefined' ? 900 : window.innerHeight);
  const comfortable = () => Math.round(Math.min(560, Math.max(300, viewH() * 0.4)));
  const large = () => Math.round(viewH() * 0.68);
  const [panelH, setPanelH] = useState(320);
  const [big, setBig] = useState(false);
  useEffect(() => { setPanelH(comfortable()); }, []);
  const toggleBig = () => { setPanelH(big ? comfortable() : large()); setBig(b => !b); };
  const [frameKey, setFrameKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const resultsRef = useRef<Record<string, CheckResult>>({});
  const jobRef = useRef<{ mode: Mode; items: { id: string; code: string; line?: number; label?: string }[] }>({ mode: 'code', items: [] });
  const pyReady = useRef(false);
  const pendingPy = useRef<object | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runnable = isRunnable(language);
  const name = LANGUAGE_NAME[language];
  const choices = choicesFor(runnable, { checks: checks.length, examples: examples.length, edges: edgeCases.length, hasFixed: !!fixedFullCode?.trim() });

  const add = (l: NewLine) => setLines(prev => [...prev, { ...l, id: seq++ } as Line]);

  const finish = useCallback((ms?: string) => {
    if (timer.current) clearTimeout(timer.current);
    const { mode, items } = jobRef.current;
    if (mode === 'tests') {
      const results = { ...resultsRef.current };
      for (const c of items) {
        if (!results[c.id]) results[c.id] = { status: 'fail', note: 'the code stopped before this test could run' };
      }
      const fixed = items.filter(c => results[c.id].status === 'pass').length;
      add({ kind: 'note', text: fixed === items.length ? `All ${items.length} fixed.` : `${fixed} of ${items.length} fixed so far.` });
      onResults(results);
    } else if (mode === 'code' && ms) {
      add({ kind: 'note', text: `Finished in ${ms}ms.` });
    }
    setRunning(false);
    setLoadingPython(false);
  }, [onResults]);

  // Messages from the sandbox
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d?.source !== 'cm-sandbox' || e.source !== iframeRef.current?.contentWindow) return;
      const [a0 = '', a1 = '', a2 = ''] = (d.args ?? []) as string[];
      const item = jobRef.current.items.find(x => x.id === a0);
      switch (d.type) {
        case 'ready':
          pyReady.current = true;
          if (pendingPy.current) { iframeRef.current?.contentWindow?.postMessage(pendingPy.current, '*'); pendingPy.current = null; }
          break;
        case 'status': setLoadingPython(a0 === 'loading'); break;
        case 'log': add({ kind: 'log', text: a0 }); break;
        case 'warn': add({ kind: 'warn', text: a0 }); break;
        case 'error': add({ kind: 'error', text: `Your code stopped with an error: ${a0}` }); break;
        case 'check':
          resultsRef.current[a0] = { status: a1 === 'pass' ? 'pass' : 'fail', note: a2 || undefined };
          if (item) add({ kind: a1 === 'pass' ? 'pass' : 'fail', text: `Line ${item.line}: ${a1 === 'pass' ? 'fixed' : `still happening${a2 ? ` (${a2})` : ''}`}` });
          break;
        case 'value':
          if (item) add({ kind: 'try', label: item.label ?? '', code: item.code, value: a1, crashed: false });
          break;
        case 'threw':
          if (item) add({ kind: 'try', label: item.label ?? '', code: item.code, value: a1, crashed: true });
          break;
        case 'done': finish(a0); break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finish]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [lines]);

  // ── Running ────────────────────────────────────────────────────────────────
  const start = useCallback(async (mode: Mode) => {
    if (!runnable || running) return;
    // Snippets are expressions; a stray trailing semicolon shouldn't stop them running
    const tidy = (c: string) => c.trim().replace(/;+\s*$/, '');
    const items = mode === 'tests' ? checks.map(c => ({ id: c.id, code: tidy(c.code), line: c.line }))
      : mode === 'examples' ? examples.map((t, i) => ({ id: `ex${i}`, code: tidy(t.code), label: t.label }))
      : mode === 'edges' ? edgeCases.map((t, i) => ({ id: `ed${i}`, code: tidy(t.code), label: t.label }))
      : [];
    setLines([]);
    setRunning(true);
    resultsRef.current = {};
    jobRef.current = { mode, items };

    const limit = language === 'python' && !pyReady.current ? TIME_LIMIT_MS + 20000 : TIME_LIMIT_MS;
    timer.current = setTimeout(() => {
      add({ kind: 'error', text: `Stopped after ${limit / 1000} seconds. There may be a loop that never ends.` });
      pyReady.current = false;
      setFrameKey(k => k + 1);
      finish();
    }, limit);

    if (language === 'python') {
      const job = { code, mode, items: items.map(({ id, code }) => ({ id, code })) };
      if (pyReady.current) iframeRef.current?.contentWindow?.postMessage(job, '*');
      else pendingPy.current = job;
      return;
    }

    if (/<\s*[A-Za-z][A-Za-z0-9.]*[\s/>]/.test(code) && /return\s*\(?\s*</.test(code)) {
      add({ kind: 'warn', text: "This file uses JSX (the HTML-like parts of React), which can't run here. The plain functions will work if you try them on their own." });
      finish();
      return;
    }
    try {
      const js = await toJs(code, language);
      if (iframeRef.current) iframeRef.current.srcdoc = jsDocument(js, mode, items);
    } catch (e) {
      add({ kind: 'error', text: `Your code couldn't be read: ${(e as Error).message}` });
      finish();
    }
  }, [runnable, running, checks, examples, edgeCases, language, code, finish]);

  // ── Copying (compiled languages) ───────────────────────────────────────────
  const copy = async (mode: CopyMode) => {
    const comment = language === 'python' ? '#' : '//';
    const body = mode === 'copyTests'
      ? checks.map(c => `${comment} Line ${c.line}\n${c.code}`).join('\n\n')
      : mode === 'copyExamples'
        ? examples.map(t => `${comment} ${t.label}\n${t.code}`).join('\n\n')
        : mode === 'copyEdges'
          ? edgeCases.map(t => `${comment} ${t.label}\n${t.code}`).join('\n\n')
          : fixedFullCode ?? '';
    const what = { copyTests: `${checks.length} ${checks.length === 1 ? 'test' : 'tests'}`, copyExamples: 'the example calls', copyEdges: 'the tricky inputs', copyFixed: 'the fixed file' }[mode];
    const next = mode === 'copyFixed'
      ? 'Paste it into a new file, compile it, and compare it with yours.'
      : 'Paste it into main() in your project and run it.';
    let ok = true;
    try { await navigator.clipboard.writeText(body); } catch { ok = false; }
    setLines([{ id: seq++, kind: 'copy', text: ok ? `Copied ${what}. ${next}` : `Copying didn't work this time, so select the text below and copy it yourself.`, body }]);
  };

  const pick = (c: Choice) => {
    if (c.disabled || running) return;
    setPicked(prev => ({ key: c.key, n: (prev?.n ?? 0) + 1 }));
    if (c.key.startsWith('copy')) copy(c.key as CopyMode);
    else start(c.key as Mode);
  };

  // The page asks for a re-test after a fix is applied
  const lastSignal = useRef(runSignal);
  useEffect(() => {
    if (runSignal === lastSignal.current) return;
    lastSignal.current = runSignal;
    if (!checks.length) return;
    setPicked(prev => ({ key: 'tests', n: (prev?.n ?? 0) + 1 }));
    start('tests');
  }, [runSignal, start, checks.length]);

  // Python: load the long-lived document once per mount (or after a reset)
  useEffect(() => {
    if (language !== 'python') return;
    pyReady.current = false;
    if (iframeRef.current) iframeRef.current.srcdoc = PY_DOCUMENT;
  }, [language, frameKey]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: panelH };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPanelH(Math.max(180, Math.min(viewH() * 0.8, dragRef.current.startH + dragRef.current.startY - ev.clientY)));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const crashes = lines.filter(l => l.kind === 'try' && l.crashed).length;
  const tries = lines.filter(l => l.kind === 'try').length;

  return (
    <section className="scratch" aria-label="Scratch work">
      <div className="scratch-bar" onMouseDown={onMouseDown}>
        <span className="scratch-title" data-tip="A place to try your code without leaving the page. Drag this bar to resize it.">Scratch work</span>
        <div className="scratch-actions" onMouseDown={(e) => e.stopPropagation()}>
          {lines.length > 0 && !running && (
            <button className="link-btn" onClick={() => { setLines([]); setPicked(null); }} data-tip="Clear what's shown below">Clear</button>
          )}
          {isOpen && (
            <button className="link-btn" onClick={toggleBig} data-tip={big ? 'Shrink this panel back to its usual size' : 'Give this panel more room so results are easier to read'}>{big ? 'Smaller' : 'Bigger'}</button>
          )}
          <button className="link-btn" onClick={onToggle} data-tip={isOpen ? 'Fold this panel away' : 'Open this panel'} data-tip-align="end">{isOpen ? 'Hide' : 'Show'}</button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            className="scratch-body"
            style={{ height: panelH }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: panelH, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="options" role="group" aria-label="What would you like to do?">
              {choices.map((c, i) => {
                const isPicked = picked?.key === c.key;
                return (
                  <button
                    key={c.key}
                    className={`opt ${isPicked ? 'is-picked' : ''}`}
                    onClick={() => pick(c)}
                    disabled={c.disabled || running}
                    aria-pressed={isPicked}
                    data-tip={c.tip}
                    data-tip-align={i === choices.length - 1 ? 'end' : undefined}
                  >
                    <span className="opt-letter">
                      {LETTERS[i]}
                      {isPicked && <PenCircle key={picked.n} />}
                    </span>
                    <span className="opt-label">{c.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="scratch-lines">
              {lines.length === 0 && (
                <p className="sl sl-empty">
                  {running
                    ? (loadingPython ? 'Getting Python ready. This only takes a moment the first time.' : 'Working on it')
                    : runnable
                      ? 'Pick a letter to try your code. Hover over one to see what it does.'
                      : `${name} has to be compiled before it can run, which a browser can't do. Pick a letter to copy something you can run in your own project.`}
                </p>
              )}
              {lines.map(l => {
                if (l.kind === 'try') {
                  return (
                    <div key={l.id} className={`try ${l.crashed ? 'is-crash' : ''}`}>
                      <p className="try-label">{l.crashed ? '× ' : ''}{l.label}</p>
                      <p className="try-io"><span className="try-code">{l.code}</span> <span className="try-arrow">gives</span> <span className="try-value">{l.crashed ? `an error: ${l.value}` : l.value}</span></p>
                    </div>
                  );
                }
                if (l.kind === 'copy') {
                  return (
                    <div key={l.id}>
                      <p className="sl sl-note">{l.text}</p>
                      <pre className="copy-preview">{l.body}</pre>
                    </div>
                  );
                }
                return (
                  <p key={l.id} className={`sl sl-${l.kind}`}>
                    {l.kind === 'pass' ? '✓ ' : l.kind === 'fail' ? '× ' : l.kind === 'warn' ? '! ' : ''}{l.text}
                  </p>
                );
              })}
              {!running && tries > 0 && jobRef.current.mode === 'edges' && (
                <p className="sl sl-note">{crashes ? `${crashes} of ${tries} made your code crash.` : `None of the ${tries} made your code crash.`}</p>
              )}
              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {runnable && <iframe key={frameKey} ref={iframeRef} sandbox="allow-scripts" style={{ display: 'none' }} title="Sandbox for running your code" />}
    </section>
  );
}
