'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ApplyFixesButtonProps {
  originalCode: string;
  fixedCode: string | undefined;
  onApply: (newCode: string) => void;
  language: string;
  disabled?: boolean;
  issueCount?: number; // Optional: number of issues being fixed
}

export default function ApplyFixesButton({
  originalCode,
  fixedCode,
  onApply,
  language,
  disabled = false,
  issueCount,
}: ApplyFixesButtonProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = () => {
    if (!fixedCode) return;
    
    setIsApplying(true);
    
    // Simulate a brief delay for visual feedback
    setTimeout(() => {
      onApply(fixedCode);
      setIsApplying(false);
      setShowPreview(false);
    }, 500);
  };

  if (!fixedCode || fixedCode === originalCode) {
    return null;
  }

  const getFixCountDisplay = (): string => {
    if (issueCount && issueCount > 0) {
      return issueCount.toString();
    }
    return 'All';
  };

  return (
    <>
      <motion.button
        onClick={() => setShowPreview(true)}
        disabled={disabled}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="apply-fixes-btn"
      >
        <span className="btn-icon">🔧</span>
        Apply All Fixes
        <span className="btn-badge">{getFixCountDisplay()}</span>
      </motion.button>

      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Apply All Fixes</h3>
                <button
                  className="modal-close"
                  onClick={() => setShowPreview(false)}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                <p>This will replace your current code with the AI-suggested fixed version.</p>
                
                <div className="code-diff">
                  <div className="diff-section">
                    <h4>Current Code</h4>
                    <pre className="diff-pre original">
                      <code>{truncateCode(originalCode, 200)}</code>
                    </pre>
                  </div>
                  <div className="diff-arrow">→</div>
                  <div className="diff-section">
                    <h4>Fixed Code</h4>
                    <pre className="diff-pre fixed">
                      <code>{truncateCode(fixedCode, 200)}</code>
                    </pre>
                  </div>
                </div>

                <div className="modal-warning">
                  <span className="warning-icon">⚠️</span>
                  This action cannot be undone. Your original code will be replaced.
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="modal-btn cancel"
                  onClick={() => setShowPreview(false)}
                >
                  Cancel
                </button>
                <button
                  className="modal-btn apply"
                  onClick={handleApply}
                  disabled={isApplying}
                >
                  {isApplying ? (
                    <>
                      <span className="spinner-small" />
                      Applying...
                    </>
                  ) : (
                    'Apply Fixes'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .apply-fixes-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #00FF85, #1E90FF);
          border: none;
          border-radius: 8px;
          color: #0D0D0D;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: var(--font-sans);
        }

        .apply-fixes-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,255,133,0.3);
        }

        .apply-fixes-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .btn-icon {
          font-size: 16px;
        }

        .btn-badge {
          background: rgba(13,13,13,0.2);
          padding: 2px 6px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: #1A1A1A;
          border-radius: 16px;
          max-width: 800px;
          width: 90%;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          border: 1px solid rgba(0,255,133,0.2);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .modal-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #00FF85;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: rgba(255,255,255,0.5);
          transition: color 0.2s;
        }

        .modal-close:hover {
          color: #FF0099;
        }

        .modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }

        .code-diff {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 16px;
          margin: 20px 0;
        }

        .diff-section h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .diff-pre {
          background: #0D0D0D;
          padding: 12px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.5;
          overflow-x: auto;
          font-family: var(--font-mono);
          margin: 0;
        }

        .diff-pre.original {
          border-left: 3px solid #FF0099;
        }

        .diff-pre.fixed {
          border-left: 3px solid #00FF85;
        }

        .diff-arrow {
          display: flex;
          align-items: center;
          font-size: 24px;
          color: rgba(255,255,255,0.3);
        }

        .modal-warning {
          background: rgba(255,0,153,0.1);
          border: 1px solid rgba(255,0,153,0.3);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: rgba(255,255,255,0.8);
        }

        .warning-icon {
          font-size: 18px;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 20px 24px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }

        .modal-btn {
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .modal-btn.cancel {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.8);
        }

        .modal-btn.cancel:hover {
          background: rgba(255,255,255,0.2);
        }

        .modal-btn.apply {
          background: linear-gradient(135deg, #00FF85, #1E90FF);
          color: #0D0D0D;
          font-weight: 600;
        }

        .modal-btn.apply:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,255,133,0.3);
        }

        .modal-btn.apply:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner-small {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(13,13,13,0.3);
          border-top-color: #0D0D0D;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 6px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

function truncateCode(code: string, maxLength: number): string {
  if (code.length <= maxLength) return code;
  const lines = code.split('\n');
  const truncated = lines.slice(0, 10).join('\n');
  return truncated + '\n... (truncated)';
}