'use client';

import { useEffect, useRef } from 'react';
import type { Issue, Language } from '@/types';

interface CodeEditorProps {
  code: string;
  language: Language | string;
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
  error:      { squiggle: 'rgba(200,16,46,0.9)',  glyph: '#C8102E' },
  warning:    { squiggle: 'rgba(181,101,29,0.9)', glyph: '#B5651D' },
  suggestion: { squiggle: 'rgba(47,91,183,0.8)',  glyph: '#2F5BB7' },
};

function toMonacoLanguageId(language: string): string {
  switch (language) {
    case 'typescript':
      return 'typescript';
    case 'javascript':
      return 'javascript';
    case 'python':
      return 'python';
    case 'cpp':
      return 'cpp';
    case 'csharp':
      return 'csharp';
    case 'java':
      return 'java';
    default:
      return 'plaintext';
  }
}

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

      // Ink on paper: syntax colour kept quiet so the red-pen marks stand out
      monaco.editor.defineTheme('codemarker-paper', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'comment',   foreground: '948F84', fontStyle: 'italic' },
          { token: 'keyword',   foreground: '1D1C1A', fontStyle: 'bold' },
          { token: 'string',    foreground: '4F6B3A' },
          { token: 'number',    foreground: '7A4E2D' },
          { token: 'type',      foreground: '3D4F7A' },
          { token: 'function',  foreground: '1D1C1A' },
          { token: 'variable',  foreground: '1D1C1A' },
          { token: 'operator',  foreground: '57534B' },
        ],
        colors: {
          'editor.background':                 '#FBF9F4',
          'editor.foreground':                 '#1D1C1A',
          'editor.lineHighlightBackground':    '#F3EFE6',
          'editor.lineHighlightBorder':        '#00000000',
          'editor.selectionBackground':        '#C8102E22',
          'editor.inactiveSelectionBackground':'#C8102E14',
          'editorLineNumber.foreground':       '#C9C2B4',
          'editorLineNumber.activeForeground': '#57534B',
          'editorGutter.background':           '#FBF9F4',
          'editorCursor.foreground':           '#C8102E',
          'editorIndentGuide.background1':     '#EDE8DD',
          'editorWidget.background':           '#FBF9F4',
          'editorWidget.border':               '#DCD5C6',
          'editorHoverWidget.background':      '#FBF9F4',
          'editorHoverWidget.border':          '#DCD5C6',
          'scrollbar.shadow':                  '#00000000',
          'scrollbarSlider.background':        '#DCD5C680',
          'scrollbarSlider.hoverBackground':   '#948F8480',
          'editor.findMatchBackground':        '#C8102E30',
          'editor.findMatchHighlightBackground': '#2F5BB720',
        },
      });

      editorRef.current = monaco.editor.create(containerRef.current!, {
        value: code,
        language: toMonacoLanguageId(language),
        theme: 'codemarker-paper',
        fontSize: 15,
        fontFamily: 'var(--font-mono), "Courier Prime", "Courier New", monospace',
        fontLigatures: false,
        lineHeight: 26,
        padding: { top: 26, bottom: 26 },
        lineNumbersMinChars: 4,
        glyphMargin: false,
        renderWhitespace: 'none',
        occurrencesHighlight: 'off',
        selectionHighlight: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
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

            const fixedLines = fixedCode.split('\n');
            const nonEmpty = fixedLines.filter(l => l.trim().length > 0);
            const minIndent = nonEmpty.length === 0
              ? 0
              : Math.min(...nonEmpty.map(l => (l.match(/^[\t ]*/)?.[0].length ?? 0)));

            // Preserve relative indentation inside the snippet.
            const indentedFix = fixedLines
              .map((l) => {
                if (l.trim().length === 0) return l;
                return indent + l.slice(minIndent);
              })
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
            hoverMessage: { value: `**${issue.title}**\n\n${issue.description}` },
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
        /* Marked lines: a faint wash, like a highlighter pen */
        .issue-line-error      { background: rgba(200,16,46,0.06)  !important; }
        .issue-line-warning    { background: rgba(181,101,29,0.07) !important; }
        .issue-line-suggestion { background: rgba(47,91,183,0.06)  !important; }

        /* The line you're reading about gets a bracket in the margin */
        .issue-line-active-error      { background: rgba(200,16,46,0.11) !important; box-shadow: inset 3px 0 0 #C8102E; }
        .issue-line-active-warning    { background: rgba(181,101,29,0.12) !important; box-shadow: inset 3px 0 0 #B5651D; }
        .issue-line-active-suggestion { background: rgba(47,91,183,0.10) !important; box-shadow: inset 3px 0 0 #2F5BB7; }

        /* Pen underlines */
        .issue-inline-error      { text-decoration: underline wavy rgba(200,16,46,0.75); text-underline-offset: 5px; }
        .issue-inline-warning    { text-decoration: underline wavy rgba(181,101,29,0.7); text-underline-offset: 5px; }
        .issue-inline-suggestion { text-decoration: underline dashed rgba(47,91,183,0.6); text-underline-offset: 5px; }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
    </>
  );
}
