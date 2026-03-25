'use client';

import { useId, useRef, useState } from 'react';
import type { Language } from '@/types';

interface UploadZoneProps {
  onFileLoad: (code: string, filename: string, language: Language) => void;
}

const ACCEPTED = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.cpp',
  '.cc',
  '.cxx',
  '.cs',
  '.java',
];

function languageFromExtension(ext: string): Language | null {
  switch (ext) {
    case '.py':
      return 'python';
    case '.cpp':
    case '.cc':
    case '.cxx':
      return 'cpp';
    case '.cs':
      return 'csharp';
    case '.java':
      return 'java';
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'javascript';
    default:
      return null;
  }
}

export default function UploadZone({ onFileLoad }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  const openPicker = () => inputRef.current?.click();

  const readFile = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const detectedLanguage = ext ? languageFromExtension(ext) : null;

    if (!ext || !ACCEPTED.includes(ext) || !detectedLanguage) {
      setError('only JS/TS, Python, C++, C#, and Java files supported');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      onFileLoad(text, file.name, detectedLanguage);
    };
    reader.onerror = () => {
      setError('failed to read file');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
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
        aria-label="Upload a code file (JS/TS/Python/C++/C#/Java)"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
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
        <span style={{
          fontSize: '14px',
          opacity: dragging ? 1 : 0.4,
          transition: 'opacity 0.15s',
          color: dragging ? '#00FF85' : '#FFFFFF',
        }}>
          ↑
        </span>
        <div>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0, fontFamily: 'var(--font-mono)' }}>
            drop a file or{' '}
            <span style={{ color: '#1E90FF', textDecoration: 'underline' }}>browse</span>
          </p>
          <p style={{
            fontSize: '10px',
            color: 'rgba(255,255,255,0.2)',
            margin: '3px 0 0',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-mono)',
          }}>
            .js .jsx .ts .tsx
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".js,.jsx,.ts,.tsx,.py,.cpp,.cc,.cxx,.cs,.java"
          onChange={handleChange}
          style={{ display: 'none' }}
        />
      </div>
      {error && (
        <p style={{
          fontSize: '11px',
          color: '#FF0099',
          marginTop: '6px',
          padding: '0 4px',
          fontFamily: 'var(--font-mono)',
        }} id={errorId} aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
