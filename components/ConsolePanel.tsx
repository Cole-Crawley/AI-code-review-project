'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ConsoleLine {
  id: number;
  type: 'log' | 'warn' | 'error' | 'info' | 'system';
  args: unknown[];
  ts: number;
}

interface ConsolePanelProps {
  code: string;
  language: string;
  isOpen: boolean;
  onToggle: () => void;
}

// Strips TypeScript type annotations so we can eval the result as plain JS.
// Not a full compiler — handles the common patterns the AI tends to emit.
function stripTypes(src: string): string {
  return src
    // Remove import statements entirely
    .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    // Remove export keyword
    .replace(/\bexport\s+(default\s+)?/g, '')
    // Remove type/interface declarations
    .replace(/^(type|interface)\s+\w[\s\S]*?^}/gm, '')
    // Remove inline type annotations:  param: Type  ->  param
    .replace(/:\s*[A-Z][A-Za-z<>\[\]|&, ]*(?=[,)=\n{])/g, '')
    // Remove generic type params <T> on functions
    .replace(/<[A-Za-z, ]+>/g, '')
    // Remove as-casts
    .replace(/\bas\s+\w+/g, '')
    .trim();
}

let lineCounter = 0;

export default function ConsolePanel({ code, language, isOpen, onToggle }: ConsolePanelProps) {
  const [lines,   setLines]   = useState<ConsoleLine[]>([]);
  const [running, setRunning] = useState(false);
  const [panelH,  setPanelH]  = useState(220);
  const iframeRef   = useRef<HTMLIFrameElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<{ startY: number; startH: number } | null>(null);

  // Listen for messages posted by the sandboxed iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.source !== 'codrev-sandbox') return;
      const { type, args } = e.data as { type: ConsoleLine['type']; args: unknown[]; source: string };
      setLines(prev => [...prev, { id: lineCounter++, type, args, ts: Date.now() }]);
      if (type === 'system' && (args[0] as string)?.startsWith('✓')) {
        setRunning(false);
      }
      if (type === 'error') setRunning(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const run = useCallback(() => {
    setLines([]);
    setRunning(true);

    const js = language === 'typescript' ? stripTypes(code) : code;

    // The iframe sandbox — no network, no same-origin, intercepts console.*
    const html = `<!DOCTYPE html><html><head></head><body><script>
      const _post = (type, args) => {
        const safe = args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
          catch { return String(a); }
        });
        window.parent.postMessage({ source: 'codrev-sandbox', type, args: safe }, '*');
      };
      ['log','warn','error','info'].forEach(m => {
        console[m] = (...a) => _post(m, a);
      });
      window.onerror = (msg, _src, line, col) => {
        _post('error', [msg + ' (line ' + line + ':' + col + ')']);
        return true;
      };
      window.onunhandledrejection = e => _post('error', ['Unhandled promise rejection: ' + e.reason]);
      try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction(${JSON.stringify(js)});
        Promise.resolve(fn()).then(() => {
          _post('system', ['✓ Finished in ' + performance.now().toFixed(1) + 'ms']);
        }).catch(err => {
          _post('error', [err?.message || String(err)]);
        });
      } catch(err) {
        _post('error', [err?.message || String(err)]);
      }
    <\/script></body></html>`;

    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = html;
  }, [code, language]);

  const clear = () => setLines([]);

  // Drag-to-resize the panel
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: panelH };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setPanelH(Math.max(120, Math.min(520, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const typeColor: Record<ConsoleLine['type'], string> = {
    log:    '#E2E8F0',
    info:   '#1E90FF',
    warn:   '#F59E0B',
    error:  '#FF0099',
    system: '#00FF85',
  };

  const typePrefix: Record<ConsoleLine['type'], string> = {
    log:    '',
    info:   'ℹ ',
    warn:   '⚠ ',
    error:  '✕ ',
    system: '→ ',
  };

  return (
    <div className="console-root">
      {/* ── Drag handle + header bar ── */}
      <div className="console-bar" onMouseDown={onMouseDown}>
        <div className="console-drag-grip" />

        <div className="console-bar-left">
          <span className={`console-dot ${running ? 'console-dot-running' : lines.some(l => l.type === 'error') ? 'console-dot-error' : 'console-dot-idle'}`} />
          <span className="console-label">console</span>
          {lines.length > 0 && (
            <span className="console-count">{lines.length}</span>
          )}
        </div>

        <div className="console-bar-right">
          {lines.length > 0 && (
            <button className="console-btn" onClick={clear} title="Clear">
              ✕ clear
            </button>
          )}
          <button
            className={`console-run-btn ${running ? 'console-run-btn-running' : ''}`}
            onClick={run}
            disabled={running}
            title="Run code"
          >
            {running ? (
              <><span className="console-spinner" /> running…</>
            ) : (
              <>▶ run</>
            )}
          </button>
          <button className="console-btn console-toggle-btn" onClick={onToggle}>
            {isOpen ? '↓ hide' : '↑ show'}
          </button>
        </div>
      </div>

      {/* ── Output panel ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            className="console-output"
            style={{ height: panelH }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: panelH, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {lines.length === 0 && !running && (
              <div className="console-empty">
                <span className="console-empty-icon">▶</span>
                <span className="console-empty-text">press run to execute your code</span>
              </div>
            )}

            {running && lines.length === 0 && (
              <div className="console-empty">
                <span className="console-spinner console-spinner-lg" />
                <span className="console-empty-text">executing…</span>
              </div>
            )}

            <div className="console-lines">
              {lines.map((line, i) => (
                <motion.div
                  key={line.id}
                  className={`console-line ${line.type === 'error' ? 'console-line-error' : line.type === 'warn' ? 'console-line-warn' : ''}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <span className="console-line-num">{i + 1}</span>
                  <span className="console-line-prefix" style={{ color: typeColor[line.type] }}>
                    {typePrefix[line.type]}
                  </span>
                  <span className="console-line-text" style={{ color: typeColor[line.type] }}>
                    {line.args.join(' ')}
                  </span>
                </motion.div>
              ))}
              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden iframe sandbox */}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        style={{ display: 'none' }}
        title="code-sandbox"
      />

      <style>{`
        .console-root {
          flex-shrink: 0;
          border-top: 1px solid rgba(255,255,255,0.07);
          background: #080808;
          display: flex;
          flex-direction: column;
          user-select: none;
        }

        /* Drag handle bar */
        .console-bar {
          height: 38px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          gap: 10px;
          cursor: ns-resize;
          position: relative;
          flex-shrink: 0;
        }

        .console-drag-grip {
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 32px;
          height: 3px;
          border-radius: 2px;
          background: rgba(255,255,255,0.1);
        }

        .console-bar-left {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: default;
        }

        .console-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .console-dot-idle    { background: rgba(255,255,255,0.15); }
        .console-dot-running { background: #00FF85; box-shadow: 0 0 8px rgba(0,255,133,0.7); animation: consolePulse 1s ease-in-out infinite; }
        .console-dot-error   { background: #FF0099; box-shadow: 0 0 8px rgba(255,0,153,0.6); }
        @keyframes consolePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .console-label {
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 700;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .console-count {
          font-family: var(--font-mono);
          font-size: 10px;
          color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.06);
          padding: 1px 6px;
          border-radius: 100px;
        }

        .console-bar-right {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: default;
        }

        .console-btn {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.25);
          background: transparent;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 6px;
          padding: 3px 9px;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.04em;
        }
        .console-btn:hover {
          color: rgba(255,255,255,0.7);
          border-color: rgba(255,255,255,0.15);
        }

        .console-run-btn {
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 700;
          color: #0D0D0D;
          background: #00FF85;
          border: none;
          border-radius: 6px;
          padding: 4px 12px;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 5px;
          box-shadow: 0 0 12px rgba(0,255,133,0.3);
        }
        .console-run-btn:hover {
          box-shadow: 0 0 20px rgba(0,255,133,0.5);
        }
        .console-run-btn-running,
        .console-run-btn:disabled {
          background: rgba(0,255,133,0.15);
          color: rgba(0,255,133,0.5);
          box-shadow: none;
          cursor: not-allowed;
        }

        .console-toggle-btn {
          color: rgba(255,255,255,0.2);
        }

        /* Output area */
        .console-output {
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .console-empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: rgba(255,255,255,0.15);
          font-family: var(--font-mono);
          font-size: 12px;
        }

        .console-empty-icon {
          font-size: 10px;
          opacity: 0.4;
        }

        .console-empty-text {
          letter-spacing: 0.03em;
        }

        .console-lines {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .console-line {
          display: flex;
          align-items: baseline;
          gap: 0;
          padding: 2px 0;
          transition: background 0.1s;
        }
        .console-line:hover { background: rgba(255,255,255,0.02); }
        .console-line-error  { background: rgba(255,0,153,0.04); }
        .console-line-warn   { background: rgba(245,158,11,0.03); }

        .console-line-num {
          font-family: var(--font-mono);
          font-size: 10px;
          color: rgba(255,255,255,0.12);
          width: 36px;
          text-align: right;
          padding-right: 12px;
          flex-shrink: 0;
          user-select: none;
          letter-spacing: 0.02em;
        }

        .console-line-prefix {
          font-family: var(--font-mono);
          font-size: 12px;
          flex-shrink: 0;
          width: 14px;
        }

        .console-line-text {
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-all;
          padding-right: 16px;
        }

        .console-spinner {
          width: 10px;
          height: 10px;
          border: 1.5px solid rgba(13,13,13,0.3);
          border-top-color: #0D0D0D;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
          flex-shrink: 0;
        }

        .console-spinner-lg {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0,255,133,0.2);
          border-top-color: #00FF85;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
