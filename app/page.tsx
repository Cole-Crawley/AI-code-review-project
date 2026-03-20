'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import UploadZone from '@/components/UploadZone';

const SAMPLE_JS = `// ⚠ Several bugs lurking here — hit ▶ run to see them

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
}

try {
  const processed = processUsers(users);
  console.log("Processed:", JSON.stringify(processed));
} catch (e) {
  console.error("processUsers crashed:", e.message);
}

const bob = users[1];
promoteToAdmin(bob);
console.log("Bob role after promote:", bob.role);
console.log("Original array mutated:", users[1].role);

const top = getTopUser(users);
console.log("Top user:", JSON.stringify(top));
console.log("Array order after sort:", JSON.stringify(users.map(u => u.name.trim())));
`;

const SAMPLE_TS = `// ⚠ TypeScript bugs lurking here — hit ▶ run to see them

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

// Bug 1: return type lie — says string but can return undefined
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
}

try {
  const role = getRole(99); // id 99 doesn't exist — crashes
  console.log("Role:", role);
} catch (e) {
  console.error("getRole crashed:", e.message);
}

const patched = mergeUser(users[0], { score: "not-a-number", role: "superadmin" });
console.log("Patched user:", JSON.stringify(patched));
console.log("score is now:", typeof patched.score, patched.score);

const before = users[0].name;
normalizeNames(users);
console.log("Before normalize:", JSON.stringify(before));
console.log("Original mutated:", JSON.stringify(users[0].name));
`;

export default function HomePage() {
  const [code, setCode]         = useState('');
  const [filename, setFilename] = useState('');
  const [language, setLanguage] = useState<'typescript' | 'javascript'>('typescript');
  const languageRef = useRef<'typescript' | 'javascript'>('typescript');
  const setLang = (l: 'typescript' | 'javascript') => { languageRef.current = l; setLanguage(l); };
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleReview = async () => {
    if (!code.trim()) return;
    setLoading(true);
    sessionStorage.setItem('reviewCode', code);
    sessionStorage.setItem('reviewLanguage', language);
    sessionStorage.setItem('reviewFilename', filename);
    router.push('/review');
  };

  const handleSampleCode = () => {
    const target = languageRef.current;
    if (target === 'typescript') {
      setCode(SAMPLE_TS);
      setFilename('example.ts');
    } else {
      setCode(SAMPLE_JS);
      setFilename('example.js');
    }
  };

  const lineCount = code.split('\n').length;
  const charCount = code.length;

  return (
    <main className="home-main">
      {/* Hexagonal dot pattern — two offset rows = honeycomb */}
      <div className="hex-bg" />
      {/* Radial vignette fades pattern at edges */}
      <div className="vignette" />
      {/* Grain */}
      <div className="noise-overlay" />
      {/* Neon blobs */}
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
            Drop your JS or TS. Get instant line-by-line feedback on bugs,
            security holes, and bad habits — no judgement (well, a little).
          </motion.p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="input-section"
        >
          <div className="toolbar">
            <div className="lang-pills">
              {(['typescript', 'javascript'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => {
                    setLang(lang);
                    if (code === SAMPLE_JS || code === SAMPLE_TS) {
                      handleSampleCode();
                    }
                  }}
                  className={`lang-pill ${language === lang ? 'lang-pill-active' : ''}`}
                >
                  {lang === 'typescript' ? 'TS' : 'JS'}
                </button>
              ))}
            </div>
            {filename && <span className="filename-pill">{filename}</span>}
            <button onClick={handleSampleCode} className="sample-btn">↗ try sample code</button>
          </div>

          <div className={`editor-card ${code.trim() ? 'editor-card-active' : ''}`}>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder={`// paste your ${language === 'typescript' ? 'TypeScript' : 'JavaScript'} here...`}
              spellCheck={false}
              className="code-textarea"
            />
            <div className="editor-footer">
              <span className="editor-stats">{lineCount} lines · {charCount} chars</span>
              {code && <button onClick={() => setCode('')} className="clear-btn">clear ×</button>}
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <UploadZone onFileLoad={(content, fname) => { setCode(content); setFilename(fname); }} />
          </div>

          <div className="cta-row">
            <motion.button
              onClick={handleReview}
              disabled={!code.trim() || loading}
              whileHover={code.trim() ? { scale: 1.03 } : {}}
              whileTap={code.trim() ? { scale: 0.97 } : {}}
              className={`review-btn ${code.trim() ? 'review-btn-active' : 'review-btn-disabled'}`}
            >
              {loading ? (
                <span className="btn-inner"><span className="spinner" />analysing…</span>
              ) : (
                <span className="btn-inner"><span className="btn-icon">⚡</span>review my code</span>
              )}
            </motion.button>
            <p className="powered-by">powered by Groq · llama-3.1-8b</p>
          </div>
        </motion.div>

        <motion.div
          className="tag-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {['bug detection', 'security scan', 'best practices', 'instant feedback'].map(tag => (
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

        /* ── Honeycomb hex dot pattern ── */
        .hex-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image:
            radial-gradient(circle, rgba(0,255,133,0.2) 1px, transparent 1px),
            radial-gradient(circle, rgba(0,255,133,0.2) 1px, transparent 1px);
          background-size: 36px 62px;
          background-position: 0 0, 18px 31px;
          mask-image: radial-gradient(ellipse 75% 75% at 50% 38%, black 20%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 75% 75% at 50% 38%, black 20%, transparent 100%);
          opacity: 0.5;
        }

        .vignette {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(ellipse 110% 100% at 50% 50%, transparent 35%, #0D0D0D 85%);
        }

        .noise-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 128px 128px;
        }

        .blob { position: fixed; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; animation: blobFloat 9s ease-in-out infinite; }
        .blob-1 { width: 560px; height: 560px; background: radial-gradient(circle, rgba(0,255,133,0.13) 0%, transparent 70%); top: -180px; left: -180px; }
        .blob-2 { width: 420px; height: 420px; background: radial-gradient(circle, rgba(30,144,255,0.1) 0%, transparent 70%); top: 35%; right: -120px; animation-delay: 3s; }
        .blob-3 { width: 320px; height: 320px; background: radial-gradient(circle, rgba(255,0,153,0.09) 0%, transparent 70%); bottom: -80px; left: 38%; animation-delay: 5.5s; }
        @keyframes blobFloat {
          0%, 100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(18px,-18px) scale(1.04); }
          66% { transform: translate(-12px,14px) scale(0.97); }
        }

        .home-container { position: relative; z-index: 2; max-width: 780px; margin: 0 auto; padding: 64px 28px 80px; }
        .home-header { margin-bottom: 44px; }

        .logo-lockup { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
        .logo-mark {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #00FF85, #1E90FF);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 20px rgba(0,255,133,0.35);
        }
        .logo-symbol { font-size: 11px; font-weight: 700; color: #0D0D0D; font-family: var(--font-mono); }
        .logo-text { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.45); letter-spacing: 0.22em; text-transform: uppercase; }
        .logo-badge { font-family: var(--font-display); font-size: 9px; font-weight: 700; color: #0D0D0D; background: #00FF85; padding: 2px 7px; border-radius: 100px; letter-spacing: 0.12em; text-transform: uppercase; box-shadow: 0 0 12px rgba(0,255,133,0.5); }

        /* Syne — the hero headline font */
        .home-title {
          font-family: var(--font-display);
          font-size: clamp(42px, 6.5vw, 68px);
          font-weight: 800;
          line-height: 1.02;
          letter-spacing: -0.02em;
          margin: 0 0 20px;
          color: #FFFFFF;
        }
        .title-accent {
          background: linear-gradient(90deg, #00FF85 0%, #1E90FF 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Outfit — body copy */
        .home-subtitle {
          font-family: var(--font-sans);
          font-size: 17px;
          font-weight: 400;
          color: rgba(255,255,255,0.42);
          line-height: 1.7;
          max-width: 460px;
          margin: 0;
          letter-spacing: 0.01em;
        }

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

        /* Syne on the CTA button — geometric and punchy */
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
