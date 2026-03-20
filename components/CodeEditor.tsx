'use client';

import { useEffect, useRef } from 'react';
import { Issue } from '@/types';

interface CodeEditorProps {
  code: string;
  language: string;
  issues: Issue[];
  activeIssueId: string | null;
  onChange: (value: string) => void;
  onEditorReady?: (editor: MonacoEditor) => void;
}

export interface MonacoEditor {
  undo: () => void;
  redo: () => void;
  applyFix: (issue: Issue, fixedCode: string) => void;
  getValue: () => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMonaco = any;

const SEVERITY_COLORS = {
  error:      { squiggle: 'rgba(255,0,153,0.9)',   glyph: '#FF0099' },
  warning:    { squiggle: 'rgba(245,158,11,0.9)',  glyph: '#F59E0B' },
  suggestion: { squiggle: 'rgba(30,144,255,0.8)',  glyph: '#1E90FF' },
};

export default function CodeEditor({
  code,
  language,
  issues,
  activeIssueId,
  onChange,
  onEditorReady,
}: CodeEditorProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const editorRef      = useRef<AnyMonaco>(null);
  const monacoRef      = useRef<AnyMonaco>(null);
  const decorationsRef = useRef<string[]>([]);
  const readyRef       = useRef(false);
  const mountingRef    = useRef(false);

  // ── Init Monaco ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || editorRef.current || mountingRef.current) return;
    mountingRef.current = true;

    import('monaco-editor').then((monaco) => {
      if (!containerRef.current || editorRef.current) return;

      monacoRef.current = monaco;

      monaco.editor.defineTheme('coderev-neon', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment',   foreground: '3D4B5C', fontStyle: 'italic' },
          { token: 'keyword',   foreground: '1E90FF' },   // electric blue
          { token: 'string',    foreground: '00FF85' },   // neon green
          { token: 'number',    foreground: 'F59E0B' },
          { token: 'type',      foreground: '00D4FF' },
          { token: 'function',  foreground: 'FF0099' },   // hot pink for function names
          { token: 'variable',  foreground: 'E2E8F0' },
          { token: 'operator',  foreground: '6B7280' },
        ],
        colors: {
          'editor.background':                 '#0D0D0D',
          'editor.foreground':                 '#E2E8F0',
          'editor.lineHighlightBackground':    '#131313',
          'editor.selectionBackground':        '#00FF8520',
          'editorLineNumber.foreground':       '#2A2A2A',
          'editorLineNumber.activeForeground': '#555555',
          'editorGutter.background':           '#0D0D0D',
          'editorCursor.foreground':           '#00FF85',
          'editorIndentGuide.background1':     '#1A1A1A',
          'editorWidget.background':           '#111111',
          'editorWidget.border':               '#222222',
          'scrollbar.shadow':                  '#00000000',
          'scrollbarSlider.background':        '#00FF8515',
          'scrollbarSlider.hoverBackground':   '#00FF8530',
          'editor.findMatchBackground':        '#FF009940',
          'editor.findMatchHighlightBackground': '#1E90FF25',
        },
      });

      editorRef.current = monaco.editor.create(containerRef.current!, {
        value: code,
        language: language === 'typescript' ? 'typescript' : 'javascript',
        theme: 'coderev-neon',
        fontSize: 13,
        fontFamily: 'var(--font-mono), "Kode Mono", "JetBrains Mono", monospace',
        fontLigatures: true,
        lineHeight: 22,
        padding: { top: 20, bottom: 20 },
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: {
          verticalScrollbarSize: 4,
          horizontalScrollbarSize: 4,
          alwaysConsumeMouseWheel: false,
        },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
      });

      editorRef.current.onDidChangeModelContent(() => {
        onChange(editorRef.current.getValue());
      });

      readyRef.current = true;

      if (onEditorReady) {
        onEditorReady({
          undo:     () => editorRef.current?.trigger('keyboard', 'undo', null),
          redo:     () => editorRef.current?.trigger('keyboard', 'redo', null),
          getValue: () => editorRef.current?.getValue() || '',
          applyFix: (issue: Issue, fixedCode: string) => {
            if (!editorRef.current || !monacoRef.current) return;
            const model = editorRef.current.getModel();
            if (!model) return;

            const totalLines = model.getLineCount();

            // Clamp line numbers to what actually exists in the model
            const startLine = Math.max(1, Math.min(issue.line, totalLines));
            const endLine   = Math.max(startLine, Math.min(issue.endLine || issue.line, totalLines));

            const lineContent  = model.getLineContent(startLine);
            const indentMatch  = lineContent.match(/^(\s*)/);
            const indent       = indentMatch ? indentMatch[1] : '';

            const indentedFix = fixedCode
              .split('\n')
              .map((l, i) => i === 0 ? indent + l.trimStart() : indent + l.trimStart())
              .join('\n');

            editorRef.current.executeEdits('apply-fix', [{
              range: new monacoRef.current.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine)),
              text: indentedFix,
              forceMoveMarkers: true,
            }]);
            editorRef.current.pushUndoStop();
            editorRef.current.focus();
          },
        });
      }
    });

    return () => {
      editorRef.current?.dispose();
      editorRef.current   = null;
      mountingRef.current = false;
      readyRef.current    = false;
    };
  }, []);

  // ── Sync external code changes ─────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  // ── Decorations ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const monaco = monacoRef.current;

    const newDecorations = issues
      .filter(i => !i.fixed)
      .map(issue => {
        const colors   = SEVERITY_COLORS[issue.severity];
        const isActive = issue.id === activeIssueId;
        return {
          range: new monaco.Range(issue.line, 1, issue.endLine || issue.line, 999),
          options: {
            isWholeLine: true,
            className: isActive
              ? `issue-line-active issue-line-active-${issue.severity}`
              : `issue-line-${issue.severity}`,
            inlineClassName: `issue-inline-${issue.severity}`,
            overviewRuler: { color: colors.squiggle, position: monaco.editor.OverviewRulerLane.Right },
            zIndex: isActive ? 10 : 1,
            hoverMessage: { value: `**${issue.severity.toUpperCase()}**: ${issue.title}\n\n${issue.description}` },
          },
        };
      });

    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
  }, [issues, activeIssueId]);

  // ── Jump to active line ────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeIssueId) return;
    const issue = issues.find(i => i.id === activeIssueId);
    if (!issue) return;

    editorRef.current.revealLineInCenter(issue.line, 1);
    editorRef.current.setSelection(
      new monacoRef.current.Range(issue.line, 1, issue.endLine || issue.line, 999)
    );
    editorRef.current.focus();
  }, [activeIssueId, issues]);

  return (
    <>
      <style>{`
        /* Issue line backgrounds */
        .issue-line-error      { background: rgba(255,0,153,0.06)  !important; }
        .issue-line-warning    { background: rgba(245,158,11,0.05) !important; }
        .issue-line-suggestion { background: rgba(30,144,255,0.05) !important; }

        /* Active line — neon left border glow */
        .issue-line-active-error      {
          background: rgba(255,0,153,0.12) !important;
          box-shadow: inset 3px 0 0 #FF0099, inset 0 0 20px rgba(255,0,153,0.08);
        }
        .issue-line-active-warning    {
          background: rgba(245,158,11,0.12) !important;
          box-shadow: inset 3px 0 0 #F59E0B, inset 0 0 20px rgba(245,158,11,0.08);
        }
        .issue-line-active-suggestion {
          background: rgba(30,144,255,0.1) !important;
          box-shadow: inset 3px 0 0 #1E90FF, inset 0 0 20px rgba(30,144,255,0.07);
        }

        /* Inline squiggles */
        .issue-inline-error      { border-bottom: 2px wavy rgba(255,0,153,0.8); }
        .issue-inline-warning    { border-bottom: 2px wavy rgba(245,158,11,0.7); }
        .issue-inline-suggestion { border-bottom: 1px dashed rgba(30,144,255,0.6); }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
    </>
  );
}
