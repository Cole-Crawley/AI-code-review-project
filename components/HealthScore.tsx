'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface HealthScoreProps {
  score: number;
  issueCount: number;
  fixedCount: number;
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#00FF85';
  if (score >= 60) return '#F59E0B';
  if (score >= 40) return '#F97316';
  return '#FF0099';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

export default function HealthScore({ score, issueCount, fixedCount }: HealthScoreProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const size        = 110;
  const stroke      = 7;
  const radius      = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color       = getScoreColor(score);
  const dashOffset  = circumference - (displayScore / 100) * circumference;

  useEffect(() => {
    const t = setTimeout(() => setDisplayScore(score), 100);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      padding: '24px 0 18px',
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
            style={{ filter: `drop-shadow(0 0 8px ${color}90)` }}
          />
        </svg>

        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{
              fontSize: '26px',
              fontWeight: 800,
              color,
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.03em',
              textShadow: `0 0 20px ${color}70`,
            }}
          >
            {score}
          </motion.span>
          <span style={{
            fontSize: '9px',
            color: 'rgba(255,255,255,0.3)',
            marginTop: '2px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
          }}>
            score
          </span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ textAlign: 'center' }}
      >
        <p style={{
          fontSize: '12px',
          fontWeight: 800,
          color,
          margin: 0,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
          textShadow: `0 0 12px ${color}60`,
        }}>
          {getScoreLabel(score)}
        </p>
      </motion.div>

      {issueCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{
            display: 'flex',
            gap: '10px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.3)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>{issueCount} issue{issueCount !== 1 ? 's' : ''}</span>
          {fixedCount > 0 && (
            <>
              <span>·</span>
              <span style={{ color: '#00FF85', textShadow: '0 0 10px rgba(0,255,133,0.5)' }}>
                {fixedCount} fixed
              </span>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
