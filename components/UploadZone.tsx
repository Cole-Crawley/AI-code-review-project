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
      setError('only JS/TS, Python, C++, C#, and Java files supported');
      return;
    }
    if (rejected.length > 0) {
      setError(`skipped unsupported: ${rejected.join(', ')}`);
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
      setError('failed to read file(s)');
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
          ? 'Upload code files (JS/TS/Python/C++/C#/Java) — multiple allowed'
          : 'Upload a code file (JS/TS/Python/C++/C#/Java)'}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
        }}
        style={{
          border: `1.5px dashed ${dragging ? 'rgba(0,255,133,0.5)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '12px',
          padding: '16px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'rgba(0,255,133,0.04)' : 'transparent',
          transition: 'all 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          boxShadow: dragging ? '0 0 20px rgba(0,255,133,0.08)' : 'none',
        }}
      >
        <span style={{ fontSize: '14px', opacity: dragging ? 1 : 0.4, transition: 'opacity 0.15s', color: dragging ? '#00FF85' : '#FFFFFF' }}>↑</span>
        <div>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0, fontFamily: 'var(--font-mono)' }}>
            {multiple ? 'drop files or ' : 'drop a file or '}
            <span style={{ color: '#1E90FF', textDecoration: 'underline' }}>browse</span>
            {multiple && <span style={{ color: 'rgba(255,255,255,0.25)' }}> · multiple OK</span>}
          </p>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', margin: '3px 0 0', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
            .js .jsx .ts .tsx .py .cpp .cs .java
          </p>
        </div>
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
        <p style={{ fontSize: '11px', color: '#FF0099', marginTop: '6px', padding: '0 4px', fontFamily: 'var(--font-mono)' }}
           id={errorId} aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
