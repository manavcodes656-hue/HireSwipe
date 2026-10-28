import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FooterComponent } from '../footer/footer.component';

@Component({
  selector: 'app-terms-of-service',
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
            <h1 class="legal-title">Terms of Service</h1>
            <p class="legal-effective">Last updated: October 2026</p>
          </header>

          <section class="legal-section">
            <h2>1. Agreement to Terms</h2>
            <p>
              These Terms of Service ("Terms") govern your access to and use of HireSwipe's website, mobile experiences, matching platform, and related services (collectively, the "Service").
            </p>
            <p>
              By creating an account or otherwise accessing the Service, you agree to be bound by these Terms. If you do not agree, do not access or use the Service.
            </p>
          </section>

          <section class="legal-section">
            <h2>2. Eligibility &amp; Account Registration</h2>
            <p>
              You must be at least 18 years old or the age of legal majority in your jurisdiction to use HireSwipe. You agree to:
            </p>
            <ul>
              <li>Provide accurate, current, and complete registration and profile information.</li>
              <li>Maintain the security and confidentiality of your login credentials.</li>
              <li>Promptly notify HireSwipe if you discover or suspect unauthorized use of your account.</li>
              <li>Accept responsibility for all activities that occur under your authenticated account.</li>
            </ul>
          </section>

          <section class="legal-section">
            <h2>3. Acceptable Use Policy</h2>
            <p>Users of HireSwipe agree not to engage in any prohibited conduct, including:</p>
            <ul>
              <li>Posting fictitious job openings, misleading salary figures, or fraudulent resumes.</li>
              <li>Scraping, crawling, or extracting candidate or company data via automated tools without written permission.</li>
              <li>Harassing, discriminating against, or spamming candidates or employers.</li>
              <li>Attempting to bypass security mechanisms or interfere with normal platform operation.</li>
              <li>Misrepresenting affiliation with any company, institution, or individual.</li>
            </ul>
          </section>

          <section class="legal-section">
            <h2>4. Employer Obligations &amp; Representation</h2>
            <p>
              Employers using HireSwipe warrant that all posted positions represent active, bona fide employment or contract opportunities compliant with equal opportunity employment and local labor laws. HireSwipe reserves the right to unpublish roles or suspend companies failing verification criteria.
            </p>
          </section>

          <section class="legal-section">
            <h2>5. Intellectual Property</h2>
            <p>
              The Service, including its software, design, logos, brand elements, algorithms, and documentation, is owned by HireSwipe and protected under intellectual property laws. You retain ownership of your user-uploaded resume and profile assets, granting HireSwipe a limited license to host and display them for job-matching purposes.
            </p>
          </section>

          <section class="legal-section">
            <h2>6. Disclaimer of Warranties &amp; Limitation of Liability</h2>
            <p>
              The Service is provided on an "as is" and "as available" basis without warranties of any kind. While HireSwipe strives for verified profiles and high-compatibility matches, we do not guarantee employment, candidate qualification, interview outcomes, or job offer validity. To the fullest extent permitted by law, HireSwipe shall not be liable for indirect, incidental, or consequential damages.
            </p>
          </section>

          <section class="legal-section">
            <h2>7. Contact Information</h2>
            <p>
              For legal inquiries, copyright notices, or questions regarding these Terms, please reach out to:
            </p>
            <div class="contact-card">
              <strong>HireSwipe Legal Operations</strong><br />
              Email: <a href="mailto:legal@hireswipe.com">legal&#64;hireswipe.com</a><br />
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
export class TermsOfServiceComponent implements OnInit {
  constructor(private title: Title) {}

  ngOnInit(): void {
    this.title.setTitle('HireSwipe — Terms of Service');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
