'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import UploadZone, { type LoadedFile } from '@/components/UploadZone';
import type { Language } from '@/types';

const SAMPLE_BY_LANGUAGE: Record<Language, { code: string; filename: string }> = {
  javascript: {
    code: `// A few bugs are hiding in here. Hand it in to find them.

const users = [
  { id: 1, name: "  Alice ", role: "admin", score: 95 },
  { id: 2, name: "Bob",      role: "user",  score: 72 },
  { id: 3, name: " Carol",   role: "user",  score: 88 },
];

// Bug 1: off-by-one, iterates one past the end
function processUsers(users) {
  var results = [];
  for (var i = 0; i <= users.length; i++) {
    results.push({ id: users[i].id, name: users[i].name.trim() });
  }
  return results;
}

// Bug 2: == instead of ===, mutates the original object
function promoteToAdmin(user) {
  if (user.role == "user") {
    user.role = "admin";
    return true;
  }
  return false;
}

// Bug 3: sort mutates the original array
function getTopUser(users) {
  const sorted = users.sort((a, b) => b.score - a.score);
  return sorted[0];
}`,
    filename: 'example.js',
  },
  typescript: {
    code: `// A few TypeScript bugs are hiding in here. Hand it in to find them.

interface User {
  id: number;
  name: string;
  role: "admin" | "user";
  score: number;
}

const users: User[] = [
  { id: 1, name: "  Alice ", role: "admin", score: 95 },
  { id: 2, name: "Bob",      role: "user",  score: 72 },
  { id: 3, name: " Carol",   role: "user",  score: 88 },
];

// Bug 1: return type lie, says string but can crash via non-null assertion
function getRole(id: number): string {
  const user = users.find(u => u.id === id);
  return user!.role; // non-null assertion hides the risk
}

// Bug 2: any kills type safety
function mergeUser(base: User, patch: any): User {
  return { ...base, ...patch }; // patch could overwrite with wrong types
}

// Bug 3: mutates input instead of returning new array
function normalizeNames(users: User[]): User[] {
  for (let i = 0; i < users.length; i++) {
    users[i].name = users[i].name.trim(); // mutates original
  }
  return users;
}`,
    filename: 'example.ts',
  },
  python: {
    code: `# A few Python bugs are hiding in here. Hand it in to find them.

users = [
  { "id": 1, "name": "  Alice ", "role": "admin", "score": 95 },
  { "id": 2, "name": "Bob",      "role": "user",  "score": 72 },
  { "id": 3, "name": " Carol",   "role": "user",  "score": 88 },
]

def process_users(users):
  results = []
  # Bug: off-by-one, iterates one past the end
  for i in range(0, len(users) + 1):
    results.append({ "id": users[i]["id"], "name": users[i]["name"].strip() })
  return results

def promote_to_admin(user):
  # Bug: mutates caller-provided dict
  if user["role"] == "user":
    user["role"] = "admin"
    return True
  return False
`,
    filename: 'example.py',
  },
  cpp: {
    code: `// A few C++ issues are hiding in here. Hand it in to find them.
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct User {
  int id;
  std::string name;
  std::string role;
  int score;
};

int getTopUser(std::vector<User>& users) {
  // Bug: accidental out-of-bounds access
  users.push_back(users[users.size()]);

  std::sort(users.begin(), users.end(),
            [](const User& a, const User& b) { return b.score < a.score; });

  return users[0].id;
}
`,
    filename: 'example.cpp',
  },
  csharp: {
    code: `// A few C# issues are hiding in here. Hand it in to find them.
using System;
using System.Collections.Generic;

class User {
  public int Id;
  public string Role;
  public int Score;
}

class Program {
  static string GetRole(List<User> users, int id) {
    var user = users.Find(u => u.Id == id);
    // Bug: possible NullReferenceException when user isn't found
    return user.Role;
  }
}
`,
    filename: 'example.cs',
  },
  java: {
    code: `// A few Java issues are hiding in here. Hand it in to find them.
import java.util.*;

class User {
  public int id;
  public String role;
  public int score;
}

public class Review {
  static String getRole(List<User> users, int id) {
    User u = users.stream().filter(x -> x.id == id).findFirst().orElse(null);
    // Bug: possible NullPointerException
    return u.role;
  }

  static User getTopUser(List<User> users) {
    users.sort((a, b) -> b.score - a.score);
    return users.get(0);
  }
}
`,
    filename: 'example.java',
  },
};

const LANGUAGE_LABEL: Record<Language, string> = {
  typescript: 'TS',
  javascript: 'JS',
  python: 'PY',
  cpp: 'C++',
  csharp: 'C#',
  java: 'Java',
};

const ALL_LANGUAGES = Object.keys(SAMPLE_BY_LANGUAGE) as Language[];

// What you get back for each language, shown as a hover tip on its tab
const LANGUAGE_TIP: Record<Language, string> = {
  javascript: 'Marked line by line, and each correction can be tested right here',
  typescript: 'Marked line by line, and each correction can be tested right here',
  python: 'Marked line by line, and each correction can be tested right here',
  cpp: 'Marked line by line, with a short test for each correction to run in your own project',
  csharp: 'Marked line by line, with a short test for each correction to run in your own project',
  java: 'Marked line by line, with a short test for each correction to run in your own project',
};
const SAMPLE_CODES  = new Set(ALL_LANGUAGES.map(l => SAMPLE_BY_LANGUAGE[l].code));

const MAX_FILES = 8;

// ─── sessionStorage helpers ───────────────────────────────────────────────────
function saveFiles(files: LoadedFile[]) {
  sessionStorage.setItem('reviewFiles', JSON.stringify(files));
  // Keep legacy keys in sync for the single-file fast-path
  if (files.length === 1) {
    sessionStorage.setItem('reviewCode',     files[0].code);
    sessionStorage.setItem('reviewLanguage', files[0].language);
    sessionStorage.setItem('reviewFilename', files[0].filename);
  } else {
    sessionStorage.removeItem('reviewCode');
    sessionStorage.removeItem('reviewLanguage');
    sessionStorage.removeItem('reviewFilename');
  }
}

function clearFiles() {
  sessionStorage.removeItem('reviewFiles');
  sessionStorage.removeItem('reviewCode');
  sessionStorage.removeItem('reviewLanguage');
  sessionStorage.removeItem('reviewFilename');
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomePage() {
  // Multi-file list; index 0 is the "active" single-file when in single mode
  const [files,       setFiles]    = useState<LoadedFile[]>([{ code: '', filename: '', language: 'typescript' }]);
  const [activeIdx,   setActiveIdx] = useState(0);
  const [loading,     setLoading]  = useState(false);
  const router = useRouter();

  const activeFile = files[activeIdx] ?? files[0];
  const isMulti    = files.length > 1;

  // Derived
  const languageRef = useRef<Language>('typescript');
  const setFileProp = <K extends keyof LoadedFile>(idx: number, key: K, val: LoadedFile[K]) => {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f));
  };

  const code     = activeFile.code;
  const language = activeFile.language;
  const filename = activeFile.filename;

  // Keep languageRef in sync for sample-code logic
  useEffect(() => { languageRef.current = language; }, [language]);

  // Restore from session on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('reviewFiles');
      if (stored) {
        const parsed: LoadedFile[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFiles(parsed);
          setActiveIdx(0);
          return;
        }
      }
      // Legacy single-file fallback
      const storedCode = sessionStorage.getItem('reviewCode') || '';
      const storedLang = sessionStorage.getItem('reviewLanguage') || 'typescript';
      const storedFile = sessionStorage.getItem('reviewFilename') || '';
      if (storedCode) {
        const lang = ALL_LANGUAGES.includes(storedLang as Language) ? (storedLang as Language) : 'typescript';
        setFiles([{ code: storedCode, filename: storedFile, language: lang }]);
      }
    } catch { /* ignore */ }
  }, []);

  // ── File management ───────────────────────────────────────────────────────
  const addFiles = (incoming: LoadedFile[]) => {
    setFiles(prev => {
      const merged = [...prev];
      for (const f of incoming) {
        // Replace empty placeholder if it's the only file and has no code
        if (merged.length === 1 && !merged[0].code && !merged[0].filename) {
          merged[0] = f;
        } else if (merged.length < MAX_FILES) {
          merged.push(f);
        }
      }
      return merged;
    });
    setActiveIdx(prev => {
      // Jump to first newly added file
      const newIdx = files.length === 1 && !files[0].code ? 0 : Math.min(files.length, MAX_FILES - 1);
      return newIdx;
    });
  };

  const removeFile = (idx: number) => {
    setFiles(prev => {
      if (prev.length === 1) return [{ code: '', filename: '', language: 'typescript' }];
      return prev.filter((_, i) => i !== idx);
    });
    setActiveIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
  };

  const handleSampleCode = () => {
    const sample = SAMPLE_BY_LANGUAGE[languageRef.current];
    setFileProp(activeIdx, 'code',     sample.code);
    setFileProp(activeIdx, 'filename', sample.filename);
  };

  const handleReview = async () => {
    const toReview = files.filter(f => f.code.trim());
    if (!toReview.length) return;
    setLoading(true);
    saveFiles(toReview);
    router.push('/review');
  };

  const lineCount = code.split('\n').length;
  const charCount = code.length;

  // Total files with code
  const filledCount = files.filter(f => f.code.trim()).length;

  const languageName = language === 'cpp' ? 'C++' : language === 'csharp' ? 'C#' : language === 'typescript' ? 'TypeScript' : language === 'javascript' ? 'JavaScript' : language[0].toUpperCase() + language.slice(1);

  return (
    <main className="desk">
      <div className="wrap">

        <motion.header
          className="masthead"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="wordmark">
            CodeMarker
            <svg className="wordmark-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13.5l5.5 5L21 5" /></svg>
          </p>
          <h1 className="title">Hand in your code.</h1>
          <p className="subtitle">Get it back marked, line by line.</p>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Your code"
        >
          {isMulti && (
            <div className="files" role="tablist" aria-label="Files">
              {files.map((f, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={activeIdx === i}
                  onClick={() => setActiveIdx(i)}
                  className={`file ${activeIdx === i ? 'is-active' : ''}`}
                >
                  <span className="file-name">{f.filename || `File ${i + 1}`}</span>
                  <span
                    className="file-close"
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${f.filename || `file ${i + 1}`}`}
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeFile(i); } }}
                  >×</span>
                </button>
              ))}
            </div>
          )}

          <div className="toolbar">
            <div className="langs" role="radiogroup" aria-label="Language">
              {ALL_LANGUAGES.map(lang => (
                <button
                  key={lang}
                  role="radio"
                  aria-checked={language === lang}
                  onClick={() => {
                    setFileProp(activeIdx, 'language', lang);
                    languageRef.current = lang;
                    if (SAMPLE_CODES.has(code)) handleSampleCode();
                  }}
                  className={`lang ${language === lang ? 'is-active' : ''}`}
                  data-tip={LANGUAGE_TIP[lang]}
                >
                  {LANGUAGE_LABEL[lang]}
                </button>
              ))}
            </div>
            <button onClick={handleSampleCode} className="text-btn" data-tip="Load a short file with a few bugs planted in it" data-tip-align="end">Try an example</button>
          </div>

          <div className="sheet-wrap">
            <div className="sheet">
              {filename && !isMulti && <p className="sheet-name">{filename}</p>}
              <textarea
                value={code}
                onChange={e => setFileProp(activeIdx, 'code', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleReview(); } }}
                placeholder={`Paste your ${languageName} here`}
                spellCheck={false}
                aria-label={`${languageName} code`}
                className="answer"
              />
            </div>
            {!code && (
              <p className="pen tip tip-sheet" aria-hidden="true">
                <svg viewBox="0 0 60 30" className="tip-arrow"><path d="M58 6 C 40 2, 20 8, 6 22 M6 22 l2 -9 M6 22 l9 -1" /></svg>
                paste it here,<br />or drop a file
              </p>
            )}
          </div>

          <div className="sheet-meta">
            <span>{code ? `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}` : ''}</span>
            {code && (
              <button
                onClick={() => {
                  setFileProp(activeIdx, 'code', '');
                  setFileProp(activeIdx, 'filename', '');
                }}
                className="text-btn"
              >
                Clear
              </button>
            )}
          </div>

          <UploadZone
            multiple
            onFilesLoad={addFiles}
            onFileLoad={(c, fn, l) => addFiles([{ code: c, filename: fn, language: l }])}
          />

          <div className="actions">
            <button
              onClick={handleReview}
              disabled={!filledCount || loading}
              className="primary"
            >
              {loading ? 'Marking' : isMulti ? `Hand in ${filledCount} file${filledCount !== 1 ? 's' : ''}` : 'Hand it in'}
            </button>
            {filledCount > 0 && !loading && <span className="hint">or press Ctrl + Enter</span>}
            {isMulti && filledCount > 0 && (
              <button
                onClick={() => {
                  setFiles([{ code: '', filename: '', language: 'typescript' }]);
                  setActiveIdx(0);
                  clearFiles();
                }}
                className="text-btn push-right"
              >
                Clear all
              </button>
            )}
          </div>
        </motion.section>
      </div>

      <style>{`
        .desk { min-height: 100vh; background: var(--desk); color: var(--ink); }
        .wrap { max-width: 760px; margin: 0 auto; padding: 72px 24px 96px; }

        .masthead { margin-bottom: 40px; }
        .wordmark { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 56px; font-family: var(--font-serif); font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
        .wordmark-tick { width: 20px; height: 20px; fill: none; stroke: var(--red); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; transform: translateY(-3px) rotate(-6deg); }
        .title { font-family: var(--font-serif); font-weight: 400; font-size: clamp(38px, 5vw, 52px); line-height: 1.05; letter-spacing: -0.02em; margin: 0; }
        .subtitle { font-family: var(--font-serif); font-style: italic; font-size: 19px; color: var(--ink-2); margin: 10px 0 0; }

        .files { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .file { display: inline-flex; align-items: center; gap: 8px; max-width: 200px; padding: 5px 8px 5px 12px; background: transparent; border: 1px solid var(--line); border-radius: 999px; font: 500 13px var(--font-sans); color: var(--ink-2); cursor: pointer; transition: all .15s; }
        .file.is-active { background: var(--paper); border-color: var(--ink-3); color: var(--ink); }
        .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-close { color: var(--ink-3); padding: 0 4px; border-radius: 4px; }
        .file-close:hover { color: var(--red); }

        .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .langs { display: flex; gap: 2px; flex-wrap: wrap; }
        .lang { position: relative; background: none; border: 0; padding: 6px 10px; font: 500 14px var(--font-sans); color: var(--ink-3); cursor: pointer; transition: color .15s; }
        .lang:hover { color: var(--ink); }
        .lang.is-active { color: var(--ink); }
        /* A hand-drawn red underline under the chosen language */
        .lang.is-active::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: 1px; height: 6px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 6' preserveAspectRatio='none'%3E%3Cpath d='M1 4 C 10 1, 22 5, 39 2' fill='none' stroke='%23C8102E' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center / 100% 100%; }
        .text-btn { background: none; border: 0; padding: 6px 0; font: 500 14px var(--font-sans); color: var(--ink-2); cursor: pointer; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 4px; transition: color .15s, text-decoration-color .15s; }
        .text-btn:hover { color: var(--ink); text-decoration-color: var(--red); }
        .push-right { margin-left: auto; }

        .sheet-wrap { position: relative; }
        .sheet { position: relative; background: var(--paper); border-radius: 4px; box-shadow: var(--shadow-sheet); overflow: hidden; }
        .sheet-name { position: absolute; top: 10px; right: 16px; margin: 0; font: 500 12px var(--font-sans); color: var(--ink-3); z-index: 1; }
        /* Ruled exam paper: a red margin line and faint rules that scroll with the text */
        .answer {
          display: block; width: 100%; min-height: 360px; resize: vertical; border: 0; outline: none;
          padding: 26px 24px 26px 76px; font: 15px/26px var(--font-mono); color: var(--ink); caret-color: var(--red);
          background:
            linear-gradient(to right, transparent 55px, var(--margin) 55px, var(--margin) 56px, transparent 56px),
            repeating-linear-gradient(to bottom, transparent 0 25px, var(--rule) 25px 26px);
          background-attachment: local;
          background-position: 0 0, 0 26px;
        }
        .answer::placeholder { color: var(--ink-3); font-style: italic; }

        .tip { position: absolute; margin: 0; pointer-events: none; }
        .tip-sheet { left: calc(100% + 18px); top: 34px; width: 150px; transform: rotate(-3deg); }
        .tip-arrow { display: block; width: 56px; height: 28px; margin: 0 0 4px -12px; fill: none; stroke: var(--red); stroke-width: 1.6; stroke-linecap: round; }
        @media (max-width: 1100px) { .tip-sheet { display: none; } }

        .sheet-meta { display: flex; justify-content: space-between; align-items: center; min-height: 34px; font: 13px var(--font-sans); color: var(--ink-3); padding: 4px 2px 0; }

        .actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 28px; }
        .primary { height: 46px; padding: 0 26px; border: 0; border-radius: var(--radius); background: var(--ink); color: var(--paper); font: 600 15px var(--font-sans); cursor: pointer; transition: transform .15s var(--ease), background .15s; }
        .primary:hover:not(:disabled) { background: var(--red); transform: translateY(-1px); }
        .primary:disabled { background: var(--line); color: var(--ink-3); cursor: not-allowed; }
        .hint { font: 13px var(--font-sans); color: var(--ink-3); }
      `}</style>
    </main>
  );
}
