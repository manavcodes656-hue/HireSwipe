import React from 'react';

export function RoleSelector({ role, onRoleChange }) {
  return (
    <div className="role-selector" role="radiogroup" aria-label="User role">
      <button
        type="button"
        className={`role-card ${role === 'jobseeker' ? 'active' : ''}`}
        onClick={() => onRoleChange('jobseeker')}
        role="radio"
        aria-checked={role === 'jobseeker'}
        id="role-jobseeker"
      >
        <div className="role-icon-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
        </div>
        <div className="role-text">
          <span className="role-label">JOB SEEKER</span>
          <span className="role-hint">Find your next opportunity</span>
        </div>
        <div className="role-indicator" aria-hidden="true">
          <span className="indicator-dot"></span>
        </div>
      </button>

      <button
        type="button"
        className={`role-card ${role === 'company' ? 'active' : ''}`}
        onClick={() => onRoleChange('company')}
        role="radio"
        aria-checked={role === 'company'}
        id="role-company"
      >
        <div className="role-icon-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18"></path>
            <path d="M19 21v-4"></path>
            <path d="M19 13a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v8"></path>
            <path d="M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"></path>
          </svg>
        </div>
        <div className="role-text">
          <span className="role-label">COMPANY</span>
          <span className="role-hint">Find the right talent</span>
        </div>
        <div className="role-indicator" aria-hidden="true">
          <span className="indicator-dot"></span>
        </div>
      </button>
    </div>
  );
}
