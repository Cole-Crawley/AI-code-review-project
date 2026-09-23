'use client';

import { motion } from 'framer-motion';

interface HealthScoreProps {
  score: number;
  issueCount: number;
  fixedCount: number;
}

// The mark at the top of the paper: a letter grade circled in red pen, with the
// score underneath. A score of 100 only happens with nothing left to fix.
function gradeFor(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  if (score >= 50) return 'E';
  return 'F';
}

function remarkFor(score: number, open: number): string {
  if (open === 0) return 'Nothing left to fix.';
  if (score >= 90) return 'Nearly there.';
  if (score >= 70) return 'Good, with a few slips.';
  if (score >= 50) return 'Needs another pass.';
  return 'See me after class.';
}

export default function HealthScore({ score, issueCount, fixedCount }: HealthScoreProps) {
  const open = issueCount - fixedCount;
  const grade = gradeFor(score);

  return (
    <div className="grade">
      <div className="grade-mark" aria-label={`Grade ${grade}, ${score} out of 100`}>
        {/* A loose, hand-drawn circle that draws itself once */}
        <svg viewBox="0 0 120 110" className="grade-ring" aria-hidden="true">
          <motion.path
            d="M62 8 C 96 6, 114 30, 110 58 C 106 88, 78 104, 52 100 C 24 96, 6 74, 10 48 C 14 22, 38 8, 70 12"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], delay: 0.15 }}
          />
        </svg>
        <motion.span
          className="grade-letter"
          initial={{ opacity: 0, scale: 1.2, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          transition={{ delay: 0.6, duration: 0.3 }}
        >
          {grade}
        </motion.span>
      </div>
      <div className="grade-text">
        <p className="grade-score">{score}<span>/100</span></p>
        <p className="pen grade-remark">{remarkFor(score, open)}</p>
        {issueCount > 0 && (
          <p className="grade-count">
            {open > 0 ? `${open} to fix` : 'All fixed'}{fixedCount > 0 && open > 0 ? `, ${fixedCount} done` : ''}
          </p>
        )}
      </div>
      <style jsx global>{`
        .grade { display: flex; align-items: center; gap: 18px; padding: 22px 20px 20px; }
        .grade-mark { position: relative; width: 84px; height: 78px; flex-shrink: 0; display: grid; place-items: center; }
        .grade-ring { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
        .grade-ring path { fill: none; stroke: var(--red); stroke-width: 3; stroke-linecap: round; }
        .grade-letter { display: inline-block; font: 400 56px/1 var(--font-pen); color: var(--red); }
        .grade-score { margin: 0; font: 500 26px/1 var(--font-serif); color: var(--ink); }
        .grade-score span { font-size: 15px; color: var(--ink-3); margin-left: 2px; }
        .grade-remark { margin: 6px 0 0; font-size: 21px; }
        .grade-count { margin: 6px 0 0; font: 13px var(--font-sans); color: var(--ink-3); }
      `}</style>
    </div>
  );
}
