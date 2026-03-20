'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Issue } from '@/types';

interface IssueCardProps {
  issue: Issue;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onFix: () => void;
  onApplyFix?: (issue: Issue, fixedCode: string) => void;
}

const SEVERITY_CONFIG = {
  error:      { color: '#FF0099', bg: 'rgba(255,0,153,0.07)',   border: 'rgba(255,0,153,0.2)',   label: 'Error',      icon: '✕' },
  warning:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.2)',  label: 'Warning',    icon: '!' },
  suggestion: { color: '#1E90FF', bg: 'rgba(30,144,255,0.07)',  border: 'rgba(30,144,255,0.2)',  label: 'Suggestion', icon: '→' },
};

export default function IssueCard({ issue, index, isActive, onClick, onFix, onApplyFix }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const cfg = SEVERITY_CONFIG[issue.severity];

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    }
  }, [isActive]);

  const handleClick = () => {
    setExpanded(e => !e);
    onClick();
  };

  if (issue.fixed) {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.4 }}
        style={{
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid rgba(0,255,133,0.15)',
          background: 'rgba(0,255,133,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '11px', color: '#00FF85', fontWeight: 700 }}>✓</span>
        <span style={{
          fontSize: '12px',
          color: 'rgba(255,255,255,0.25)',
          textDecoration: 'line-through',
          fontFamily: 'var(--font-mono)',
        }}>
          {issue.title}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      onClick={handleClick}
      style={{
        borderRadius: '12px',
        border: `1px solid ${isActive ? cfg.color + '55' : cfg.border}`,
        background: isActive ? cfg.bg : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow: isActive ? `0 0 20px ${cfg.color}18` : 'none',
      }}
    >
      {/* Header */}
      <div style={{ padding: '11px 12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '6px',
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: '1px',
          boxShadow: isActive ? `0 0 10px ${cfg.color}30` : 'none',
        }}>
          <span style={{ fontSize: '9px', color: cfg.color, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {cfg.icon}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
            <p style={{
              fontSize: '12px', fontWeight: 600,
              color: 'rgba(255,255,255,0.88)',
              margin: 0, lineHeight: 1.35,
            }}>
              {issue.title}
            </p>
            <span style={{
              fontSize: '9px', fontWeight: 700,
              color: cfg.color,
              background: cfg.bg,
              padding: '2px 7px',
              borderRadius: '100px',
              flexShrink: 0,
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-mono)',
              border: `1px solid ${cfg.border}`,
            }}>
              L{issue.line}{issue.endLine && issue.endLine !== issue.line ? `–${issue.endLine}` : ''}
            </span>
          </div>
          <p style={{
            fontSize: '10px',
            color: cfg.color,
            opacity: 0.6,
            margin: 0,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
          }}>
            {cfg.label}
          </p>
        </div>

        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginTop: '4px' }}
        >
          ↓
        </motion.span>
      </div>

      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, margin: 0 }}>
                {issue.description}
              </p>

              <div style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '10px 12px',
              }}>
                <p style={{
                  fontSize: '9px', fontWeight: 800,
                  color: 'rgba(255,255,255,0.22)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  margin: '0 0 6px',
                  fontFamily: 'var(--font-mono)',
                }}>
                  How to fix
                </p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.65, margin: 0 }}>
                  {issue.fix}
                </p>
              </div>

              {issue.fixedCode && (
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(0,255,133,0.12)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <p style={{
                      fontSize: '9px', fontWeight: 800,
                      color: 'rgba(255,255,255,0.22)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      Suggested fix
                    </p>
                    {onApplyFix && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyFix(issue, issue.fixedCode!);
                          onFix();
                        }}
                        style={{
                          fontSize: '10px', fontWeight: 800,
                          color: '#0D0D0D',
                          background: '#00FF85',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.03em',
                          transition: 'all 0.15s',
                          boxShadow: '0 0 12px rgba(0,255,133,0.3)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.boxShadow = '0 0 20px rgba(0,255,133,0.5)';
                          e.currentTarget.style.transform = 'scale(1.03)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.boxShadow = '0 0 12px rgba(0,255,133,0.3)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        ⚡ apply
                      </button>
                    )}
                  </div>
                  <pre style={{
                    fontSize: '11px',
                    color: '#1E90FF',
                    fontFamily: 'var(--font-mono)',
                    margin: 0,
                    padding: '10px 12px',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {issue.fixedCode}
                  </pre>
                </div>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); onFix(); }}
                style={{
                  alignSelf: 'flex-start',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '7px',
                  padding: '5px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.28)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.03em',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(0,255,133,0.3)';
                  e.currentTarget.style.color = '#00FF85';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.28)';
                }}
              >
                ✓ mark as fixed
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
