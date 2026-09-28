import React from 'react';
import { VisualPanel } from './VisualPanel';

export function AuthLayout({ children, role }) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <div className="auth-header-inner">
          <a href="http://localhost:4200" className="auth-brand" aria-label="HireSwipe Home">
            <img src="/logo.png" alt="HireSwipe" className="auth-brand-logo" />
          </a>
          <a href="http://localhost:4200" className="auth-back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to HireSwipe</span>
          </a>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-container">
          <div className="auth-form-card">
            {children}
          </div>
          <VisualPanel role={role} />
        </div>
      </main>
    </div>
  );
}
