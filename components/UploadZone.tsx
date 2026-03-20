'use client';

import { useRef, useState } from 'react';

interface UploadZoneProps {
  onFileLoad: (code: string, filename: string) => void;
}

const ACCEPTED = ['.js', '.jsx', '.ts', '.tsx'];

export default function UploadZone({ onFileLoad }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setError('only .js .jsx .ts .tsx files supported');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      onFileLoad(text, file.name);
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
        onClick={() => inputRef.current?.click()}
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
          accept=".js,.jsx,.ts,.tsx"
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
        }}>
          {error}
        </p>
      )}
    </div>
  );
}
