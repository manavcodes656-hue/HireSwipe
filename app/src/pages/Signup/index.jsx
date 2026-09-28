import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../../components/AuthLayout';
import { RoleSelector } from '../../components/RoleSelector';
import { AuthInput } from '../../components/AuthInput';

export function Signup() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialRole = searchParams.get('role') === 'company' ? 'company' : 'jobseeker';
  const [role, setRole] = useState(initialRole);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setSearchParams({ role: newRole });
    setErrors({});
    setSuccessMessage('');
  };

  const validate = () => {
    const errs = {};
    if (!fullName.trim()) {
      errs.fullName = role === 'jobseeker' ? 'Full name is required.' : 'Company name is required.';
    } else if (fullName.trim().length < 2) {
      errs.fullName = 'Minimum length is 2 characters.';
    }

    if (!email.trim()) {
      errs.email = role === 'jobseeker' ? 'Email address is required.' : 'Work email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errs.password = 'Password is required.';
    } else if (password.length < 8) {
      errs.password = 'Minimum length is 8 characters.';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setSuccessMessage('');

    if (!validate()) {
      return;
    }

    const roleLabel = role === 'jobseeker' ? 'Job Seeker' : 'Company';
    console.log('Signup form payload:', { fullName, email, role });
    setSuccessMessage(`Account created successfully as ${roleLabel} (${email}). Form validation passed.`);
  };

  const handleGoogleAuth = () => {
    const roleLabel = role === 'jobseeker' ? 'Job Seeker' : 'Company';
    setSuccessMessage(`Google authentication initiated for ${roleLabel}. Ready for OAuth integration.`);
  };

  return (
    <AuthLayout role={role}>
      <div className="auth-intro">
        <h1 className="auth-intro-title">Welcome to HireSwipe</h1>
        <p className="auth-intro-desc">Choose how you want to use HireSwipe.</p>
        <RoleSelector role={role} onRoleChange={handleRoleChange} />
      </div>

      <div className="form-header">
        <h2 className="form-title" id="form-heading">
          {role === 'jobseeker' ? 'Create your account' : 'Create company account'}
        </h2>
        <p className="form-subtitle">
          {role === 'jobseeker'
            ? 'Create your profile and start discovering opportunities matched to you.'
            : 'Create your company account and start finding the right talent.'}
        </p>
      </div>

      {successMessage && (
        <div className="success-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <AuthInput
          id="signup-name"
          label={role === 'jobseeker' ? 'Full Name' : 'Company Name'}
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={role === 'jobseeker' ? 'Alex Morgan' : 'Acme Technologies Inc.'}
          autoComplete={role === 'jobseeker' ? 'name' : 'organization'}
          error={submitted ? errors.fullName : null}
          icon={
            role === 'jobseeker' ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
            )
          }
        />

        <AuthInput
          id="signup-email"
          label={role === 'jobseeker' ? 'Email' : 'Work Email'}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={role === 'jobseeker' ? 'alex.morgan@example.com' : 'talent@acme.com'}
          autoComplete="email"
          error={submitted ? errors.email : null}
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          }
        />

        <AuthInput
          id="signup-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          error={submitted ? errors.password : null}
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          }
        />

        <AuthInput
          id="signup-confirm-password"
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          autoComplete="new-password"
          error={submitted ? errors.confirmPassword : null}
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          }
        />

        <button type="submit" className="submit-btn" id="signup-submit-btn">
          <span>{role === 'jobseeker' ? 'Create Account' : 'Create Company Account'}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>

        <div className="auth-divider" role="separator" aria-label="or sign up with">
          <span className="divider-line"></span>
          <span className="divider-text">OR</span>
          <span className="divider-line"></span>
        </div>

        <button type="button" className="google-btn" onClick={handleGoogleAuth} id="google-signup-btn">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#EA4335" d="M12 5.04c1.67 0 3.19.57 4.37 1.71l3.27-3.27C17.65 1.58 14.99 1 12 1 7.35 1 3.39 3.67 1.39 7.56l3.89 3.02c1.02-3.14 3.96-5.54 6.72-5.54z"/>
            <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.27H12v4.51h6.44c-.28 1.48-1.07 2.73-2.31 3.57l3.58 2.78c2.09-1.93 3.3-4.77 3.3-7.79z"/>
            <path fill="#FBBC05" d="M5.28 14.42c-.25-.76-.4-1.57-.4-2.42s.15-1.66.4-2.42L1.39 6.54C.5 8.18 0 10.02 0 12s.5 3.82 1.39 5.46l3.89-3.04z"/>
            <path fill="#34A853" d="M12 23c3.24 0 5.97-1.08 7.96-2.91l-3.58-2.78c-.99.66-2.26 1.06-3.71 1.06-3.02 0-5.59-2.03-6.5-4.78L1.28 16.6C3.28 20.33 7.24 23 12 23z"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="auth-switch">
          <span>Already have an account?</span>
          <Link
            to={`/login?role=${role}`}
            className="switch-link"
            id="switch-to-login"
          >
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
