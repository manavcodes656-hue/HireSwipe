import React, { useState, useEffect, useRef } from 'react';

const companyCards = [
  {
    id: 'c1',
    company: 'Google',
    typeLabel: 'Verified Employer',
    matchScore: '96%',
    roleTitle: 'Senior Full Stack Engineer',
    location: 'Bengaluru (Hybrid)',
    employmentType: 'Full-time',
    tags: ['TypeScript', 'Angular', 'Node.js', 'Cloud'],
    salary: '₹28–42 LPA',
    logoType: 'google',
  },
  {
    id: 'c2',
    company: 'Microsoft',
    typeLabel: 'Verified Employer',
    matchScore: '98%',
    roleTitle: 'Senior Cloud Solutions Architect',
    location: 'Hyderabad (Hybrid)',
    employmentType: 'Full-time',
    tags: ['Azure', 'Distributed Systems', 'C#', 'DevOps'],
    salary: '₹32–48 LPA',
    logoType: 'microsoft',
  },
  {
    id: 'c3',
    company: 'Amazon',
    typeLabel: 'Verified Employer',
    matchScore: '94%',
    roleTitle: 'Lead Frontend Systems Engineer',
    location: 'Bengaluru (On-site)',
    employmentType: 'Full-time',
    tags: ['React', 'TypeScript', 'Next.js', 'Web Perf'],
    salary: '₹30–45 LPA',
    logoType: 'amazon',
  },
  {
    id: 'c4',
    company: 'Meta',
    typeLabel: 'Verified Employer',
    matchScore: '97%',
    roleTitle: 'Staff Infrastructure Engineer',
    location: 'Remote / Bengaluru',
    employmentType: 'Full-time',
    tags: ['GraphQL', 'Rust', 'Distributed DB', 'Scale'],
    salary: '₹36–54 LPA',
    logoType: 'meta',
  },
  {
    id: 'c5',
    company: 'Apple',
    typeLabel: 'Verified Employer',
    matchScore: '95%',
    roleTitle: 'iOS Core Platform Engineer',
    location: 'Hyderabad (Hybrid)',
    employmentType: 'Full-time',
    tags: ['Swift', 'SwiftUI', 'CoreData', 'Metal'],
    salary: '₹34–50 LPA',
    logoType: 'apple',
  },
];

const candidateCards = [
  {
    id: 'u1',
    name: 'Alex Morgan',
    initials: 'AM',
    experience: '5+ Years Experience',
    matchScore: '98%',
    roleTitle: 'Senior Frontend Developer',
    location: 'Bengaluru (Hybrid)',
    availability: 'Immediate (15 Days)',
    tags: ['React', 'TypeScript', 'Next.js', 'TailwindCSS'],
    salary: '₹28–36 LPA',
    avatarColor: 'teal',
  },
  {
    id: 'u2',
    name: 'Priya Sharma',
    initials: 'PS',
    experience: '7+ Years Experience',
    matchScore: '97%',
    roleTitle: 'Backend Systems Architect',
    location: 'Hyderabad (Remote)',
    availability: 'Available in 30 Days',
    tags: ['Go', 'Kubernetes', 'gRPC', 'PostgreSQL'],
    salary: '₹38–48 LPA',
    avatarColor: 'indigo',
  },
  {
    id: 'u3',
    name: 'David Chen',
    initials: 'DC',
    experience: '4+ Years Experience',
    matchScore: '95%',
    roleTitle: 'Full Stack Engineer',
    location: 'Bengaluru (On-site)',
    availability: 'Immediate',
    tags: ['Angular', 'Node.js', 'PostgreSQL', 'AWS'],
    salary: '₹24–32 LPA',
    avatarColor: 'emerald',
  },
  {
    id: 'u4',
    name: 'Sarah Jenkins',
    initials: 'SJ',
    experience: '6+ Years Experience',
    matchScore: '96%',
    roleTitle: 'Lead UI/UX Product Designer',
    location: 'Remote',
    availability: 'Available in 15 Days',
    tags: ['Design Systems', 'Figma', 'UX Research', 'Prototyping'],
    salary: '₹26–35 LPA',
    avatarColor: 'amber',
  },
  {
    id: 'u5',
    name: 'Rohan Mehta',
    initials: 'RM',
    experience: '4+ Years Experience',
    matchScore: '94%',
    roleTitle: 'Data & Machine Learning Engineer',
    location: 'Gurugram (Hybrid)',
    availability: 'Available in 30 Days',
    tags: ['Python', 'PyTorch', 'FastAPI', 'MLOps'],
    salary: '₹30–42 LPA',
    avatarColor: 'sky',
  },
];

export function VisualPanel({ role = 'jobseeker' }) {
  const [activeCompanyIndex, setActiveCompanyIndex] = useState(0);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const timerRef = useRef(null);

  const activeIndex = role === 'jobseeker' ? activeCompanyIndex : activeCandidateIndex;
  const currentStackIndices = [0, 1, 2, 3, 4];

  const startAutoCycle = () => {
    stopAutoCycle();
    timerRef.current = setInterval(() => {
      if (role === 'jobseeker') {
        setActiveCompanyIndex((prev) => (prev + 1) % companyCards.length);
      } else {
        setActiveCandidateIndex((prev) => (prev + 1) % candidateCards.length);
      }
    }, 3800);
  };

  const stopAutoCycle = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    startAutoCycle();
    return () => stopAutoCycle();
  }, [role]);

  const getVisibleCompanyCards = () => {
    const total = companyCards.length;
    return [0, 1, 2].map((offset) => ({
      card: companyCards[(activeCompanyIndex + offset) % total],
      pos: offset,
    }));
  };

  const getVisibleCandidateCards = () => {
    const total = candidateCards.length;
    return [0, 1, 2].map((offset) => ({
      card: candidateCards[(activeCandidateIndex + offset) % total],
      pos: offset,
    }));
  };

  const renderCompanyLogo = (logoType) => {
    switch (logoType) {
      case 'google':
        return (
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path fill="#EA4335" d="M12 5.04c1.67 0 3.19.57 4.37 1.71l3.27-3.27C17.65 1.58 14.99 1 12 1 7.35 1 3.39 3.67 1.39 7.56l3.89 3.02c1.02-3.14 3.96-5.54 6.72-5.54z"/>
            <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.27H12v4.51h6.44c-.28 1.48-1.07 2.73-2.31 3.57l3.58 2.78c2.09-1.93 3.3-4.77 3.3-7.79z"/>
            <path fill="#FBBC05" d="M5.28 14.42c-.25-.76-.4-1.57-.4-2.42s.15-1.66.4-2.42L1.39 6.54C.5 8.18 0 10.02 0 12s.5 3.82 1.39 5.46l3.89-3.04z"/>
            <path fill="#34A853" d="M12 23c3.24 0 5.97-1.08 7.96-2.91l-3.58-2.78c-.99.66-2.26 1.06-3.71 1.06-3.02 0-5.59-2.03-6.5-4.78L1.28 16.6C3.28 20.33 7.24 23 12 23z"/>
          </svg>
        );
      case 'microsoft':
        return (
          <svg viewBox="0 0 23 23" width="18" height="18">
            <rect x="0" y="0" width="10.5" height="10.5" fill="#f25022"/>
            <rect x="11.5" y="0" width="10.5" height="10.5" fill="#7fba00"/>
            <rect x="0" y="11.5" width="10.5" height="10.5" fill="#00a4ef"/>
            <rect x="11.5" y="11.5" width="10.5" height="10.5" fill="#ffb900"/>
          </svg>
        );
      case 'amazon':
        return (
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="#0f172a" d="M13.95 14.1c-.27.38-.61.57-1.04.57-.96 0-1.42-.7-1.42-1.62 0-1.39.9-2.22 2.46-2.32v3.37zm2.67 3.64c-.2.17-.47.19-.74.08-.83-.66-1.16-1.26-1.36-1.74-.8 1.22-1.87 1.9-3.24 1.9-2.01 0-3.47-1.35-3.47-3.48 0-1.77 1.06-3.13 2.63-3.7 1.36-.49 3.22-.59 4.18-.66v-.42c0-.91-.51-1.56-1.77-1.56-1.06 0-2.04.42-2.75.99-.21.17-.42.15-.61-.07l-.9-1.13c-.19-.22-.13-.47.1-.67 1.21-.97 2.75-1.48 4.6-1.48 2.61 0 4.04 1.36 4.04 3.77v4.76c0 1.17.48 1.66.92 2.33.2.29.17.6-.12.81l-1.41 1.17z"/>
            <path fill="#FF9900" d="M21.72 18.91c-2.37 1.76-5.7 2.69-8.68 2.69-4.16 0-7.97-1.57-10.87-4.18-.23-.21-.21-.49.07-.66.29-.18.6-.08.83.12 2.68 2.3 6.13 3.69 9.97 3.69 2.68 0 5.56-.79 7.67-2.27.4-.28.87.16.59.61z"/>
            <path fill="#FF9900" d="M22.54 17.61c-.32-.42-1.8-.21-2.52-.12-.22.03-.33-.18-.17-.37.8-1 2.08-1.28 2.48-1.01.4.27.13 1.83-.75 2.6-.23.2-.42.09-.32-.12.3-.32.96-.98 1.28-.98z"/>
          </svg>
        );
      case 'meta':
        return (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#0081FB">
            <path d="M16.96 4.04c-1.86 0-3.37 1.05-4.96 3.1-1.59-2.05-3.1-3.1-4.96-3.1-3.6 0-6.54 3.12-6.54 7.64 0 4.67 3.09 7.82 6.78 7.82 2.1 0 3.66-1.04 4.72-2.51 1.06 1.47 2.62 2.51 4.72 2.51 3.69 0 6.78-3.15 6.78-7.82 0-4.52-2.94-7.64-6.54-7.64zm-8.8 12.87c-2.3 0-4.22-2.12-4.22-5.23 0-3.01 1.83-5.07 4.14-5.07 1.63 0 2.94 1.15 4.16 3.2-1.46 2.45-2.82 7.1-4.08 7.1zm8.8 0c-1.26 0-2.62-4.65-4.08-7.1 1.22-2.05 2.53-3.2 4.16-3.2 2.31 0 4.14 2.06 4.14 5.07 0 3.11-1.92 5.23-4.22 5.23z"/>
          </svg>
        );
      case 'apple':
        return (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#0f172a">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.78c.61-.74 1.04-1.79.92-2.78-.9.05-2 .61-2.64 1.35-.56.64-1.04 1.7-1 2.69 1.01.07 2.08-.52 2.72-1.26z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="auth-visual-panel" aria-hidden="true">
      <div className="visual-content">
        <div className="visual-badge">
          <span className="badge-dot"></span>
          <span>Intelligent Matching Engine</span>
        </div>

        <h2 className="visual-heading">
          {role === 'jobseeker'
            ? 'Connect with opportunities that fit your ambition.'
            : 'Discover verified talent evaluated for your stack.'}
        </h2>
        <p className="visual-subtext">
          {role === 'jobseeker'
            ? 'One swipe matches your skill profile directly with engineering leads and hiring managers.'
            : 'Filter by verified tech stacks, salary expectations, and location with high-signal candidate cards.'}
        </p>

        <div
          className="preview-card-wrapper"
          onMouseEnter={stopAutoCycle}
          onMouseLeave={startAutoCycle}
        >
          {role === 'jobseeker' ? (
            getVisibleCompanyCards().map(({ card, pos }) => (
              <div
                key={card.id}
                className={`preview-card preview-card-stack pos-${pos}`}
                aria-hidden={pos !== 0}
              >
                <div className="preview-card-top">
                  <div className="company-brand-row">
                    <div className="brand-avatar">
                      {renderCompanyLogo(card.logoType)}
                    </div>
                    <div>
                      <div className="brand-name-wrap">
                        <strong>{card.company}</strong>
                        <span className="verified-icon">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.2l-3.5-3.5 1.4-1.4 2.1 2.1 5.6-5.6 1.4 1.4-7 7z"/>
                          </svg>
                        </span>
                      </div>
                      <span className="brand-type">{card.typeLabel}</span>
                    </div>
                  </div>
                  <div className="match-score-badge">
                    <span>{card.matchScore} Match</span>
                  </div>
                </div>

                <h3 className="preview-role-title">{card.roleTitle}</h3>

                <div className="preview-meta-row">
                  <span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    {card.location}
                  </span>
                  <span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                    </svg>
                    {card.employmentType}
                  </span>
                </div>

                <div className="preview-tags">
                  {card.tags.map((t, idx) => (
                    <span key={idx} className="tag">
                      {t}
                    </span>
                  ))}
                </div>

                <div className="preview-comp">
                  <span className="comp-label">Salary Band</span>
                  <span className="comp-val">{card.salary}</span>
                </div>

                <div className="preview-swipe-action">
                  <div className="mock-action-btn mock-pass">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    <span>Pass</span>
                  </div>
                  <div className="mock-action-btn mock-apply">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Apply Match</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            getVisibleCandidateCards().map(({ card, pos }) => (
              <div
                key={card.id}
                className={`preview-card preview-card-stack pos-${pos}`}
                aria-hidden={pos !== 0}
              >
                <div className="preview-card-top">
                  <div className="company-brand-row">
                    <div className={`candidate-avatar avatar-${card.avatarColor}`}>
                      <span>{card.initials}</span>
                    </div>
                    <div>
                      <div className="brand-name-wrap">
                        <strong>{card.name}</strong>
                        <span className="verified-icon">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.2l-3.5-3.5 1.4-1.4 2.1 2.1 5.6-5.6 1.4 1.4-7 7z"/>
                          </svg>
                        </span>
                      </div>
                      <span className="brand-type">{card.experience}</span>
                    </div>
                  </div>
                  <div className="match-score-badge">
                    <span>{card.matchScore} Match</span>
                  </div>
                </div>

                <h3 className="preview-role-title">{card.roleTitle}</h3>

                <div className="preview-meta-row">
                  <span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    {card.location}
                  </span>
                  <span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    {card.availability}
                  </span>
                </div>

                <div className="preview-tags">
                  {card.tags.map((t, idx) => (
                    <span key={idx} className="tag">
                      {t}
                    </span>
                  ))}
                </div>

                <div className="preview-comp">
                  <span className="comp-label">Expected CTC</span>
                  <span className="comp-val">{card.salary}</span>
                </div>

                <div className="preview-swipe-action">
                  <div className="mock-action-btn mock-pass">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    <span>Pass</span>
                  </div>
                  <div className="mock-action-btn mock-apply">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Shortlist Match</span>
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="stack-dots" aria-hidden="true">
            {currentStackIndices.map((idx) => (
              <span
                key={idx}
                className={`stack-dot ${idx === activeIndex ? 'active' : ''}`}
              ></span>
            ))}
          </div>
        </div>

        <div className="visual-features">
          <div className="feat-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Zero spam direct connections</span>
          </div>
          <div className="feat-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Transparent compensation details</span>
          </div>
          <div className="feat-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Mutual match confirmation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
