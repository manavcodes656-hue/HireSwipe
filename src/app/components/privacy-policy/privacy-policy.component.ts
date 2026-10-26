import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FooterComponent } from '../footer/footer.component';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, RouterLink, FooterComponent],
  template: `
    <div class="legal-page">
      <!-- Minimal Header -->
      <header class="legal-header">
        <div class="legal-header-inner">
          <a routerLink="/" class="legal-logo" aria-label="HireSwipe Home">
            <img src="logo.png" alt="HireSwipe" class="legal-logo-img" />
          </a>
          <a routerLink="/" class="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Home
          </a>
        </div>
      </header>

      <!-- Main Content -->
      <main class="legal-container">
        <div class="legal-notice-banner">
          <span class="notice-badge">Notice</span>
          <span><strong>[Draft — Subject to Legal Review]</strong>: This document represents sample draft terms for the HireSwipe platform and must be reviewed and customized by qualified legal counsel prior to commercial production.</span>
        </div>

        <article class="legal-content">
          <header class="legal-doc-header">
            <span class="legal-tag">Legal &amp; Compliance</span>
            <h1 class="legal-title">Privacy Policy</h1>
            <p class="legal-effective">Last updated: October 2026</p>
          </header>

          <section class="legal-section">
            <h2>1. Introduction</h2>
            <p>
              HireSwipe ("we," "our," or "us") values your privacy. This Privacy Policy explains how information about you is collected, used, and disclosed when you access or use our job-matching platform, website, and related applications (collectively, the "Platform").
            </p>
            <p>
              By accessing or using HireSwipe, you acknowledge that you have read, understood, and agree to the practices described in this Privacy Policy.
            </p>
          </section>

          <section class="legal-section">
            <h2>2. Information We Collect</h2>
            <p>
              We collect information to provide intelligent, streamlined matching between job seekers and hiring companies. This includes:
            </p>
            <ul>
              <li><strong>Candidate Account &amp; Profile Data:</strong> Name, contact email, phone number, location, resume details, employment history, skills, portfolio links, and compensation expectations.</li>
              <li><strong>Company Account Data:</strong> Company name, hiring manager credentials, business email, location, job descriptions, and hiring preferences.</li>
              <li><strong>Platform Interaction Data:</strong> Swipe activity (roles or candidates liked/passed), application status, match history, and in-platform messaging communications.</li>
              <li><strong>Device &amp; Technical Usage Data:</strong> IP address, browser type, operating system, device identifiers, and standard server logs.</li>
            </ul>
          </section>

          <section class="legal-section">
            <h2>3. How We Use Your Information</h2>
            <p>We use the collected information for the following business and operational purposes:</p>
            <ul>
              <li>Powering our matching algorithms to recommend relevant candidates to employers and opportunities to job seekers.</li>
              <li>Facilitating direct introductions, interviews, and mutual-match notifications between parties.</li>
              <li>Verifying employer credentials and protecting community integrity.</li>
              <li>Maintaining, diagnosing, and continuously enhancing platform performance and user experience.</li>
              <li>Communicating critical service updates, security alerts, and administrative notices.</li>
            </ul>
          </section>

          <section class="legal-section">
            <h2>4. Information Sharing &amp; Disclosure</h2>
            <p>
              We do not sell personal data. Your profile information is shared only under specific circumstances:
            </p>
            <ul>
              <li><strong>Mutual Job Matching:</strong> When a job seeker and employer mutually express interest, profile and contact details required to coordinate interviews are shared.</li>
              <li><strong>Service Providers:</strong> Trusted third-party vendors assisting in cloud infrastructure, hosting, communications, and analytics under strict confidentiality obligations.</li>
              <li><strong>Legal Compliance:</strong> When required by applicable law, regulation, subpoena, or lawful governmental inquiry.</li>
            </ul>
          </section>

          <section class="legal-section">
            <h2>5. Data Security &amp; Retention</h2>
            <p>
              We implement industry-standard administrative, physical, and technical safeguards designed to protect personal data from unauthorized access, disclosure, or destruction. However, no internet transmission is entirely impenetrable. We retain account data as long as your account remains active or as needed to comply with statutory legal requirements.
            </p>
          </section>

          <section class="legal-section">
            <h2>6. Your Privacy Rights</h2>
            <p>
              Depending on your jurisdiction, you may have rights regarding your personal information, including the right to request access to, correction of, or deletion of your personal data, or to opt out of certain processing activities. You may exercise these preferences by contacting our privacy team.
            </p>
          </section>

          <section class="legal-section">
            <h2>7. Contact Information</h2>
            <p>
              For privacy-related questions, inquiries, or data requests, please contact:
            </p>
            <div class="contact-card">
              <strong>HireSwipe Privacy Office</strong><br />
              Email: <a href="mailto:privacy@hireswipe.com">privacy&#64;hireswipe.com</a><br />
              Vadodara, Gujarat, India
            </div>
          </section>
        </article>
      </main>

      <app-footer />
    </div>
  `,
  styles: [`
    .legal-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg, #fafaf9);
      color: var(--text, #0f172a);
    }

    .legal-header {
      background: var(--surface, #ffffff);
      border-bottom: 1px solid var(--border, #e2e8f0);
      position: sticky;
      top: 0;
      z-index: 40;
    }

    .legal-header-inner {
      max-width: 1120px;
      margin: 0 auto;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .legal-logo {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
    }

    .legal-logo-img {
      height: 34px;
      width: auto;
      display: block;
      object-fit: contain;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--secondary, #64748b);
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border, #e2e8f0);
      background: var(--surface, #ffffff);
      transition: all 0.18s ease;
    }

    .back-link:hover {
      color: var(--accent, #0f766e);
      border-color: var(--accent, #0f766e);
      background: var(--accent-tint, #f0fdfa);
    }

    .legal-container {
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 24px 80px;
      flex: 1;
      width: 100%;
    }

    .legal-notice-banner {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 14px 18px;
      border-radius: 8px;
      margin-bottom: 32px;
      font-size: 13.5px;
      color: #92400e;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      line-height: 1.55;
    }

    .notice-badge {
      background: #f59e0b;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 4px;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    .legal-content {
      background: var(--surface, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 16px;
      padding: 44px 48px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }

    .legal-doc-header {
      margin-bottom: 36px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border, #e2e8f0);
    }

    .legal-tag {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--accent, #0f766e);
      margin-bottom: 8px;
    }

    .legal-title {
      font-size: 34px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text, #0f172a);
      margin-bottom: 8px;
    }

    .legal-effective {
      font-size: 13.5px;
      color: var(--secondary, #64748b);
      margin: 0;
    }

    .legal-section {
      margin-bottom: 32px;
    }

    .legal-section h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text, #0f172a);
      margin-bottom: 12px;
      letter-spacing: -0.01em;
    }

    .legal-section p {
      font-size: 14.5px;
      line-height: 1.7;
      color: var(--text-secondary, #475569);
      margin-bottom: 14px;
    }

    .legal-section ul {
      margin: 0 0 16px 20px;
      padding: 0;
    }

    .legal-section li {
      font-size: 14px;
      line-height: 1.7;
      color: var(--text-secondary, #475569);
      margin-bottom: 8px;
    }

    .contact-card {
      background: var(--bg, #fafaf9);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 10px;
      padding: 16px 20px;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary, #475569);
      margin-top: 12px;
    }

    .contact-card a {
      color: var(--accent, #0f766e);
      text-decoration: none;
      font-weight: 500;
    }

    .contact-card a:hover {
      text-decoration: underline;
    }

    @media (max-width: 640px) {
      .legal-content {
        padding: 28px 20px;
      }
      .legal-title {
        font-size: 26px;
      }
    }
  `]
})
export class PrivacyPolicyComponent implements OnInit {
  constructor(private title: Title) {}

  ngOnInit(): void {
    this.title.setTitle('HireSwipe — Privacy Policy');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
