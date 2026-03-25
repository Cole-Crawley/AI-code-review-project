'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import UploadZone, { type LoadedFile } from '@/components/UploadZone';
import type { Language } from '@/types';

const SAMPLE_BY_LANGUAGE: Record<Language, { code: string; filename: string }> = {
  javascript: {
    code: `// ⚠ Several bugs lurking here — hit review to see them

const users = [
  { id: 1, name: "  Alice ", role: "admin", score: 95 },
  { id: 2, name: "Bob",      role: "user",  score: 72 },
  { id: 3, name: " Carol",   role: "user",  score: 88 },
];

// Bug 1: off-by-one — iterates one past the end
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
    code: `// ⚠ TypeScript bugs lurking here — hit review to see them

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

// Bug 1: return type lie — says string but can crash via non-null assertion
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
    code: `# ⚠ Python bugs lurking here — hit review to see them

users = [
  { "id": 1, "name": "  Alice ", "role": "admin", "score": 95 },
  { "id": 2, "name": "Bob",      "role": "user",  "score": 72 },
  { "id": 3, "name": " Carol",   "role": "user",  "score": 88 },
]

def process_users(users):
  results = []
  # Bug: off-by-one — iterates one past the end
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
    code: `// ⚠ C++ issues lurking here — hit review to see them
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
    code: `// ⚠ C# issues lurking here — hit review to see them
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
    code: `// ⚠ Java issues lurking here — hit review to see them
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

  return (
    <main className="home-main">
      <div className="hex-bg" />
      <div className="vignette" />
      <div className="noise-overlay" />
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="home-container">

        <motion.header
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="home-header"
        >
          <div className="logo-lockup">
            <div className="logo-mark">
              <span className="logo-symbol">{'</>'}</span>
            </div>
            <span className="logo-text">CodeRev</span>
            <span className="logo-badge">AI</span>
          </div>

          <motion.h1
            className="home-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            Your code,<br />
            <span className="title-accent">brutally reviewed.</span>
          </motion.h1>

          <motion.p
            className="home-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
          >
            Drop your code in major languages. Get instant line-by-line feedback on bugs,
            security holes, and bad habits — no judgement (well, a little).
          </motion.p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="input-section"
        >
          {/* ── File tab strip (only when multiple files) ── */}
          {isMulti && (
            <div className="file-tabs">
              {files.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`file-tab ${activeIdx === i ? 'file-tab-active' : ''}`}
                >
                  <span className="file-tab-lang">{LANGUAGE_LABEL[f.language]}</span>
                  <span className="file-tab-name">{f.filename || `file ${i + 1}`}</span>
                  <span
                    className="file-tab-close"
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${f.filename || `file ${i + 1}`}`}
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeFile(i); } }}
                  >×</span>
                </button>
              ))}
              {files.length < MAX_FILES && (
                <span className="file-tab-count">{files.length}/{MAX_FILES} files</span>
              )}
            </div>
          )}

          {/* ── Toolbar ── */}
          <div className="toolbar">
            <div className="lang-pills">
              {ALL_LANGUAGES.map(lang => (
                <button
                  key={lang}
                  onClick={() => {
                    setFileProp(activeIdx, 'language', lang);
                    languageRef.current = lang;
                    if (SAMPLE_CODES.has(code)) handleSampleCode();
                  }}
                  className={`lang-pill ${language === lang ? 'lang-pill-active' : ''}`}
                >
                  {LANGUAGE_LABEL[lang]}
                </button>
              ))}
            </div>
            {filename && !isMulti && <span className="filename-pill">{filename}</span>}
            <button onClick={handleSampleCode} className="sample-btn">↗ try sample code</button>
          </div>

          {/* ── Editor ── */}
          <div className={`editor-card ${code.trim() ? 'editor-card-active' : ''}`}>
            <textarea
              value={code}
              onChange={e => setFileProp(activeIdx, 'code', e.target.value)}
              placeholder={`// paste your ${language === 'cpp' ? 'C++' : language === 'csharp' ? 'C#' : language === 'typescript' ? 'TypeScript' : language === 'javascript' ? 'JavaScript' : language[0].toUpperCase() + language.slice(1)} here...`}
              spellCheck={false}
              className="code-textarea"
            />
            <div className="editor-footer">
              <span className="editor-stats">{lineCount} lines · {charCount} chars</span>
              {code && (
                <button
                  onClick={() => {
                    setFileProp(activeIdx, 'code', '');
                    setFileProp(activeIdx, 'filename', '');
                  }}
                  className="clear-btn"
                >
                  clear ×
                </button>
              )}
            </div>
          </div>

          {/* ── Upload zone ── */}
          <div style={{ marginTop: '10px' }}>
            <UploadZone
              multiple
              onFilesLoad={addFiles}
              onFileLoad={(c, fn, l) => addFiles([{ code: c, filename: fn, language: l }])}
            />
          </div>

          {/* ── CTA ── */}
          <div className="cta-row">
            <motion.button
              onClick={handleReview}
              disabled={!filledCount || loading}
              whileHover={filledCount ? { scale: 1.03 } : {}}
              whileTap={filledCount ? { scale: 0.97 } : {}}
              className={`review-btn ${filledCount ? 'review-btn-active' : 'review-btn-disabled'}`}
            >
              {loading ? (
                <span className="btn-inner"><span className="spinner" />analysing…</span>
              ) : (
                <span className="btn-inner">
                  <span className="btn-icon">⚡</span>
                  {isMulti ? `review ${filledCount} file${filledCount !== 1 ? 's' : ''}` : 'review my code'}
                </span>
              )}
            </motion.button>

            {isMulti && filledCount > 0 && (
              <button
                onClick={() => {
                  setFiles([{ code: '', filename: '', language: 'typescript' }]);
                  setActiveIdx(0);
                  clearFiles();
                }}
                style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >
                clear all
              </button>
            )}

            <p className="powered-by">powered by Groq · llama-3.1-8b</p>
          </div>
        </motion.div>

        <motion.div
          className="tag-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {['bug detection', 'security scan', 'best practices', 'instant feedback', 'multi-file'].map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </motion.div>
      </div>

      <style>{`
        .home-main {
          min-height: 100vh;
          background: #0D0D0D;
          color: #FFFFFF;
          font-family: var(--font-sans);
          position: relative;
          overflow: hidden;
        }
        .hex-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image:
            radial-gradient(circle, rgba(0,255,133,0.2) 1px, transparent 1px),
            radial-gradient(circle, rgba(0,255,133,0.2) 1px, transparent 1px);
          background-size: 36px 62px;
          background-position: 0 0, 18px 31px;
          mask-image: radial-gradient(ellipse 75% 75% at 50% 38%, black 20%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 75% 75% at 50% 38%, black 20%, transparent 100%);
          opacity: 0.5;
        }
        .vignette { position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(ellipse 110% 100% at 50% 50%, transparent 35%, #0D0D0D 85%); }
        .noise-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: 0.03; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); background-size: 128px 128px; }
        .blob { position: fixed; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; animation: blobFloat 9s ease-in-out infinite; }
        .blob-1 { width: 560px; height: 560px; background: radial-gradient(circle, rgba(0,255,133,0.13) 0%, transparent 70%); top: -180px; left: -180px; }
        .blob-2 { width: 420px; height: 420px; background: radial-gradient(circle, rgba(30,144,255,0.1) 0%, transparent 70%); top: 35%; right: -120px; animation-delay: 3s; }
        .blob-3 { width: 320px; height: 320px; background: radial-gradient(circle, rgba(255,0,153,0.09) 0%, transparent 70%); bottom: -80px; left: 38%; animation-delay: 5.5s; }
        @keyframes blobFloat {
          0%, 100% { transform: translate(0,0) scale(1); }
          33%       { transform: translate(18px,-18px) scale(1.04); }
          66%       { transform: translate(-12px,14px) scale(0.97); }
        }

        .home-container { position: relative; z-index: 2; max-width: 780px; margin: 0 auto; padding: 64px 28px 80px; }
        .home-header { margin-bottom: 44px; }
        .logo-lockup { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
        .logo-mark { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #00FF85, #1E90FF); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(0,255,133,0.35); }
        .logo-symbol { font-size: 11px; font-weight: 700; color: #0D0D0D; font-family: var(--font-mono); }
        .logo-text { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.45); letter-spacing: 0.22em; text-transform: uppercase; }
        .logo-badge { font-family: var(--font-display); font-size: 9px; font-weight: 700; color: #0D0D0D; background: #00FF85; padding: 2px 7px; border-radius: 100px; letter-spacing: 0.12em; text-transform: uppercase; box-shadow: 0 0 12px rgba(0,255,133,0.5); }
        .home-title { font-family: var(--font-display); font-size: clamp(42px, 6.5vw, 68px); font-weight: 800; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 20px; color: #FFFFFF; }
        .title-accent { background: linear-gradient(90deg, #00FF85 0%, #1E90FF 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .home-subtitle { font-family: var(--font-sans); font-size: 17px; font-weight: 400; color: rgba(255,255,255,0.42); line-height: 1.7; max-width: 460px; margin: 0; letter-spacing: 0.01em; }

        /* ── File tabs ── */
        .file-tabs { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
        .file-tab {
          display: flex; align-items: center; gap: 5px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; padding: 4px 8px 4px 10px;
          cursor: pointer; transition: all 0.15s; max-width: 180px;
        }
        .file-tab-active { background: rgba(0,255,133,0.07); border-color: rgba(0,255,133,0.25); }
        .file-tab-lang { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.3); font-family: var(--font-mono); letter-spacing: 0.06em; flex-shrink: 0; }
        .file-tab-active .file-tab-lang { color: #00FF85; }
        .file-tab-name { font-size: 11px; color: rgba(255,255,255,0.4); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-tab-active .file-tab-name { color: rgba(255,255,255,0.75); }
        .file-tab-close { font-size: 13px; color: rgba(255,255,255,0.2); line-height: 1; padding: 0 2px; border-radius: 3px; transition: color 0.1s; flex-shrink: 0; }
        .file-tab-close:hover { color: #FF0099; }
        .file-tab-count { font-size: 10px; color: rgba(255,255,255,0.2); font-family: var(--font-mono); margin-left: 4px; }

        .input-section { display: flex; flex-direction: column; }
        .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .lang-pills { display: flex; gap: 4px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 4px; }
        .lang-pill { font-size: 11px; font-weight: 700; padding: 5px 14px; border-radius: 7px; border: none; cursor: pointer; transition: all 0.15s; font-family: var(--font-mono); letter-spacing: 0.07em; background: transparent; color: rgba(255,255,255,0.3); }
        .lang-pill-active { background: #00FF85; color: #0D0D0D; box-shadow: 0 0 16px rgba(0,255,133,0.4); }
        .filename-pill { font-size: 11px; font-weight: 500; color: #1E90FF; background: rgba(30,144,255,0.1); border: 1px solid rgba(30,144,255,0.25); padding: 4px 12px; border-radius: 100px; font-family: var(--font-mono); }
        .sample-btn { margin-left: auto; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.28); background: none; border: none; cursor: pointer; transition: color 0.15s; font-family: var(--font-sans); letter-spacing: 0.02em; padding: 4px 0; }
        .sample-btn:hover { color: #00FF85; }

        .editor-card { border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; background: rgba(255,255,255,0.02); overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; }
        .editor-card-active { border-color: rgba(0,255,133,0.2); box-shadow: 0 0 40px rgba(0,255,133,0.05), 0 20px 60px rgba(0,0,0,0.4); }
        .editor-card:focus-within { border-color: rgba(0,255,133,0.3); box-shadow: 0 0 0 1px rgba(0,255,133,0.1), 0 20px 60px rgba(0,0,0,0.5); }
        .code-textarea { width: 100%; min-height: 320px; background: transparent; border: none; outline: none; resize: vertical; padding: 24px; font-size: 13px; line-height: 22px; color: rgba(255,255,255,0.85); font-family: var(--font-mono); box-sizing: border-box; caret-color: #00FF85; }
        .code-textarea::placeholder { color: rgba(255,255,255,0.13); font-style: italic; }
        .editor-footer { border-top: 1px solid rgba(255,255,255,0.05); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; }
        .editor-stats { font-size: 11px; color: rgba(255,255,255,0.16); font-family: var(--font-mono); letter-spacing: 0.04em; }
        .clear-btn { font-size: 11px; color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; transition: color 0.15s; font-family: var(--font-sans); font-weight: 500; }
        .clear-btn:hover { color: #FF0099; }

        .cta-row { margin-top: 18px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .review-btn { height: 52px; padding: 0 36px; border-radius: 14px; border: none; font-size: 15px; font-weight: 700; font-family: var(--font-display); letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s; }
        .review-btn-active { background: #00FF85; color: #0D0D0D; box-shadow: 0 0 30px rgba(0,255,133,0.4), 0 8px 24px rgba(0,0,0,0.3); }
        .review-btn-active:hover { box-shadow: 0 0 50px rgba(0,255,133,0.6), 0 8px 32px rgba(0,0,0,0.4); }
        .review-btn-disabled { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.18); cursor: not-allowed; }
        .btn-inner { display: flex; align-items: center; gap: 8px; }
        .btn-icon { font-size: 16px; }
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(13,13,13,0.3); border-top-color: #0D0D0D; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
        .powered-by { font-size: 11px; color: rgba(255,255,255,0.18); font-family: var(--font-mono); margin: 0; letter-spacing: 0.04em; }

        .tag-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 44px; }
        .tag { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.07); padding: 5px 13px; border-radius: 100px; letter-spacing: 0.08em; text-transform: uppercase; font-family: var(--font-sans); transition: all 0.15s; }
        .tag:hover { border-color: rgba(0,255,133,0.3); color: #00FF85; }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
