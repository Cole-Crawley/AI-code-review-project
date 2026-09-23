'use client';

import { useId, useRef, useState } from 'react';
import type { Language } from '@/types';

export interface LoadedFile {
  code: string;
  filename: string;
  language: Language;
}

interface UploadZoneProps {
  // Single-file mode (legacy, used on home page textarea flow)
  onFileLoad?: (code: string, filename: string, language: Language) => void;
  // Multi-file mode
  onFilesLoad?: (files: LoadedFile[]) => void;
  multiple?: boolean;
}

const ACCEPTED = ['.js', '.jsx', '.ts', '.tsx', '.py', '.cpp', '.cc', '.cxx', '.cs', '.java'];

function languageFromExtension(ext: string): Language | null {
  switch (ext) {
    case '.py':  return 'python';
    case '.cpp':
    case '.cc':
    case '.cxx': return 'cpp';
    case '.cs':  return 'csharp';
    case '.java': return 'java';
    case '.ts':
    case '.tsx': return 'typescript';
    case '.js':
    case '.jsx': return 'javascript';
    default:     return null;
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.readAsText(file);
  });
}

export default function UploadZone({ onFileLoad, onFilesLoad, multiple = false }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId  = useId();

  const openPicker = () => inputRef.current?.click();

  const processFiles = async (rawFiles: File[]) => {
    setError('');

    // Filter to accepted extensions
    const valid: { file: File; ext: string; lang: Language }[] = [];
    const rejected: string[] = [];

    for (const file of rawFiles) {
      const ext  = '.' + file.name.split('.').pop()?.toLowerCase();
      const lang = languageFromExtension(ext);
      if (!ext || !ACCEPTED.includes(ext) || !lang) {
        rejected.push(file.name);
      } else {
        valid.push({ file, ext, lang });
      }
    }

    if (valid.length === 0) {
      setError("That file type isn't supported. Use JS, TS, Python, C++, C# or Java.");
      return;
    }
    if (rejected.length > 0) {
      setError(`Skipped ${rejected.join(', ')}: file type not supported.`);
    }

    try {
      const loaded: LoadedFile[] = await Promise.all(
        valid.map(async ({ file, lang }) => ({
          code:     await readFileAsText(file),
          filename: file.name,
          language: lang,
        }))
      );

      if (multiple && onFilesLoad) {
        onFilesLoad(loaded);
      } else if (onFileLoad && loaded[0]) {
        const f = loaded[0];
        onFileLoad(f.code, f.filename, f.language);
      }
    } catch {
      setError("Couldn't read that file. Try saving it as plain text.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) processFiles(files);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={openPicker}
        role="button"
        tabIndex={0}
        aria-label={multiple
          ? 'Upload code files: JS, TS, Python, C++, C# or Java. Several are allowed.'
          : 'Upload a code file (JS/TS/Python/C++/C#/Java)'}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
        }}
        className={`drop ${dragging ? 'is-dragging' : ''}`}
      >
        <p className="drop-text">
          {dragging ? 'Drop to add' : <>Drop {multiple ? 'files' : 'a file'} here or <span className="drop-link">choose {multiple ? 'files' : 'one'}</span></>}
        </p>
        <p className="drop-sub">JS, TS, Python, C++, C# or Java{multiple ? ', up to 8 files' : ''}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".js,.jsx,.ts,.tsx,.py,.cpp,.cc,.cxx,.cs,.java"
          multiple={multiple}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
      </div>
      {error && (
        <p className="drop-error" id={errorId} aria-live="polite">
          {error}
        </p>
      )}
      <style>{`
        .drop { margin-top: 10px; padding: 14px 18px; border: 1px dashed var(--line); border-radius: 4px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
        .drop:hover { border-color: var(--ink-3); }
        .drop.is-dragging { border-color: var(--red); background: var(--red-soft); }
        .drop-text { margin: 0; font: 14px var(--font-sans); color: var(--ink-2); }
        .drop-link { text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 4px; }
        .drop:hover .drop-link { text-decoration-color: var(--red); }
        .drop-sub { margin: 4px 0 0; font: 12px var(--font-sans); color: var(--ink-3); }
        .drop-error { margin: 8px 2px 0; font: 13px var(--font-sans); color: var(--red); }
      `}</style>
    </div>
  );
}
