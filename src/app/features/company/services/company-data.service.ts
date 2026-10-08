import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Company,
  Profile,
  CompanyMember,
  Job,
  Match,
  Application,
  Conversation,
  Message,
  Interview,
  Notification,
  ApplicationStatus,
  InterviewStatus,
  CompanyRole,
  JobStatus,
} from '../models/company.models';

@Injectable({
  providedIn: 'root',
})
export class CompanyDataService {
  // 1. Initial Mock Company
  private companySubject = new BehaviorSubject<Company>({
    id: 'comp-101',
    name: 'TechPulse Innovations',
    industry: 'Software & Cloud Solutions',
    size: '51-200',
    founded_year: 2019,
    website: 'https://techpulse.io',
    email: 'recruiting@techpulse.io',
    phone: '+91 98765 43210',
    location: 'Bengaluru',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    description:
      'TechPulse Innovations is a fast-growing cloud platform company building next-generation developer tooling, high-scale APIs, and AI-assisted workflow engines.',
    culture:
      'We value autonomy, craftsmanship, open communication, continuous learning, and human-centric software engineering.',
    mission: 'Empowering engineering teams worldwide to build and deploy resilient software faster.',
    values: ['Engineering Excellence', 'Customer Obsession', 'Radical Transparency', 'Continuous Innovation'],
    logo_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=250&q=80',
    banner_url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80',
    completion_percentage: 95,
    created_at: '2026-01-15T08:00:00Z',
    updated_at: '2026-10-01T10:30:00Z',
  });

  // 2. Initial Mock Recruiter Profile
  private recruiterProfileSubject = new BehaviorSubject<Profile>({
    id: 'prof-owner-1',
    email: 'kshitij@techpulse.io',
    full_name: 'Kshitij Sharma',
    phone: '+91 98765 43210',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
    headline: 'Lead Technical Recruiter & VP of Talent',
    bio: 'Building world-class engineering and product teams at TechPulse.',
    location: 'Bengaluru, India',
    created_at: '2026-01-15T08:00:00Z',
    updated_at: '2026-10-01T10:30:00Z',
  });

  // 3. Team Members
  private teamMembersSubject = new BehaviorSubject<CompanyMember[]>([
    {
      id: 'mem-1',
      company_id: 'comp-101',
      profile_id: 'prof-owner-1',
      profile: {
        id: 'prof-owner-1',
        email: 'kshitij@techpulse.io',
        full_name: 'Kshitij Sharma',
        headline: 'Lead Technical Recruiter',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
        created_at: '2026-01-15T08:00:00Z',
        updated_at: '2026-10-01T10:30:00Z',
      },
      role: 'owner',
      status: 'active',
      invited_at: '2026-01-15T08:00:00Z',
      joined_at: '2026-01-15T08:00:00Z',
    },
    {
      id: 'mem-2',
      company_id: 'comp-101',
      profile_id: 'prof-admin-2',
      profile: {
        id: 'prof-admin-2',
        email: 'ananya.roy@techpulse.io',
        full_name: 'Ananya Roy',
        headline: 'Director of HR & Operations',
        avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80',
        created_at: '2026-02-01T08:00:00Z',
        updated_at: '2026-10-01T10:30:00Z',
      },
      role: 'admin',
      status: 'active',
      invited_at: '2026-02-01T08:00:00Z',
      joined_at: '2026-02-02T10:00:00Z',
    },
    {
      id: 'mem-3',
      company_id: 'comp-101',
      profile_id: 'prof-hm-3',
      profile: {
        id: 'prof-hm-3',
        email: 'vikram.patel@techpulse.io',
        full_name: 'Vikram Patel',
        headline: 'VP of Engineering',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80',
        created_at: '2026-03-10T08:00:00Z',
        updated_at: '2026-10-01T10:30:00Z',
      },
      role: 'hiring_manager',
      status: 'active',
      invited_at: '2026-03-10T08:00:00Z',
      joined_at: '2026-03-11T09:15:00Z',
    },
    {
      id: 'mem-4',
      company_id: 'comp-101',
      profile_id: 'prof-rec-4',
      profile: {
        id: 'prof-rec-4',
        email: 'sneha.gupta@techpulse.io',
        full_name: 'Sneha Gupta',
        headline: 'Senior Technical Recruiter',
        avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=250&q=80',
        created_at: '2026-05-20T08:00:00Z',
        updated_at: '2026-10-01T10:30:00Z',
      },
      role: 'recruiter',
      status: 'active',
      invited_at: '2026-05-20T08:00:00Z',
      joined_at: '2026-05-21T11:00:00Z',
    },
  ]);

  // 4. Jobs
  private jobsSubject = new BehaviorSubject<Job[]>([
    {
      id: 'job-101',
      company_id: 'comp-101',
      title: 'Senior Full Stack Engineer (Angular & Node)',
      description:
        'We are seeking a seasoned Senior Full Stack Engineer to lead front-end architecture and scale high-throughput Node.js microservices. You will drive key infrastructure initiatives, collaborate with UX researchers, and build developer dashboards handling millions of requests daily.',
      employment_type: 'full_time',
      experience_level: 'senior',
      experience_min: 5,
      experience_max: 9,
      salary_min: 2800000,
      salary_max: 4200000,
      salary_currency: 'INR',
      location: 'Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      remote_type: 'hybrid',
      openings: 3,
      application_deadline: '2026-11-15',
      status: 'active',
      views_count: 842,
      applications_count: 34,
      matches_count: 12,
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-10-02T14:00:00Z',
      skills: [
        { id: 's1', job_id: 'job-101', skill_name: 'Angular', is_required: true },
        { id: 's2', job_id: 'job-101', skill_name: 'TypeScript', is_required: true },
        { id: 's3', job_id: 'job-101', skill_name: 'Node.js', is_required: true },
        { id: 's4', job_id: 'job-101', skill_name: 'PostgreSQL', is_required: false },
        { id: 's5', job_id: 'job-101', skill_name: 'RxJS', is_required: false },
      ],
      requirements: [
        { id: 'r1', job_id: 'job-101', requirement_text: '5+ years experience building complex web applications with Angular/TypeScript.', order_index: 1 },
        { id: 'r2', job_id: 'job-101', requirement_text: 'Proven track record of designing RESTful and GraphQL APIs in Node.js.', order_index: 2 },
        { id: 'r3', job_id: 'job-101', requirement_text: 'Solid understanding of state management, performance optimization, and modular CSS.', order_index: 3 },
      ],
      benefits: [
        { id: 'b1', job_id: 'job-101', benefit_text: 'Competitive salary + generous equity grants', category: 'Financial' },
        { id: 'b2', job_id: 'job-101', benefit_text: 'Comprehensive health coverage for employee & family', category: 'Health' },
        { id: 'b3', job_id: 'job-101', benefit_text: 'Flexible work hours & hybrid home office setup stipend', category: 'Lifestyle' },
      ],
    },
    {
      id: 'job-102',
      company_id: 'comp-101',
      title: 'Lead Cloud Infrastructure Architect',
      description:
        'Architect and operate Kubernetes clusters, terraform automation, and distributed multi-region telemetry systems for enterprise customers.',
      employment_type: 'full_time',
      experience_level: 'lead',
      experience_min: 7,
      experience_max: 12,
      salary_min: 3800000,
      salary_max: 5500000,
      salary_currency: 'INR',
      location: 'Hyderabad',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      remote_type: 'remote',
      openings: 2,
      application_deadline: '2026-11-30',
      status: 'active',
      views_count: 615,
      applications_count: 19,
      matches_count: 8,
      created_at: '2026-09-10T09:00:00Z',
      updated_at: '2026-10-01T11:00:00Z',
      skills: [
        { id: 's6', job_id: 'job-102', skill_name: 'Kubernetes', is_required: true },
        { id: 's7', job_id: 'job-102', skill_name: 'AWS', is_required: true },
        { id: 's8', job_id: 'job-102', skill_name: 'Terraform', is_required: true },
        { id: 's9', job_id: 'job-102', skill_name: 'Go', is_required: false },
      ],
      requirements: [
        { id: 'r4', job_id: 'job-102', requirement_text: '7+ years in Cloud Infrastructure and DevOps engineering.', order_index: 1 },
        { id: 'r5', job_id: 'job-102', requirement_text: 'Hands-on experience with zero-downtime multi-region deployments.', order_index: 2 },
      ],
      benefits: [
        { id: 'b4', job_id: 'job-102', benefit_text: 'Annual learning and conference budget ($2,000 USD)', category: 'Growth' },
        { id: 'b5', job_id: 'job-102', benefit_text: 'Top tier Mac Studio / M3 Max workstation provided', category: 'Hardware' },
      ],
    },
    {
      id: 'job-103',
      company_id: 'comp-101',
      title: 'Senior UI/UX Product Designer',
      description:
        'Shape the end-to-end visual identity and candidate-employer interaction paradigms across our mobile and desktop web applications.',
      employment_type: 'full_time',
      experience_level: 'senior',
      experience_min: 4,
      experience_max: 8,
      salary_min: 2400000,
      salary_max: 3500000,
      salary_currency: 'INR',
      location: 'Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      remote_type: 'hybrid',
      openings: 1,
      application_deadline: '2026-12-01',
      status: 'active',
      views_count: 512,
      applications_count: 22,
      matches_count: 9,
      created_at: '2026-09-18T12:00:00Z',
      updated_at: '2026-10-03T16:00:00Z',
      skills: [
        { id: 's10', job_id: 'job-103', skill_name: 'Figma', is_required: true },
        { id: 's11', job_id: 'job-103', skill_name: 'Design Systems', is_required: true },
        { id: 's12', job_id: 'job-103', skill_name: 'User Research', is_required: false },
      ],
      requirements: [
        { id: 'r6', job_id: 'job-103', requirement_text: 'Strong portfolio demonstrating end-to-end SaaS product design experience.', order_index: 1 },
      ],
      benefits: [
        { id: 'b6', job_id: 'job-103', benefit_text: 'Flexible wellness allowance + gym memberships', category: 'Health' },
      ],
    },
    {
      id: 'job-104',
      company_id: 'comp-101',
      title: 'Staff AI Systems & MLOps Engineer',
      description:
        'Build automated candidate matching models, real-time embeddings indexing, and low-latency inference pipelines.',
      employment_type: 'full_time',
      experience_level: 'lead',
      experience_min: 6,
      experience_max: 10,
      salary_min: 3500000,
      salary_max: 5000000,
      salary_currency: 'INR',
      location: 'Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      remote_type: 'remote',
      openings: 2,
      application_deadline: '2026-12-15',
      status: 'draft',
      views_count: 0,
      applications_count: 0,
      matches_count: 0,
      created_at: '2026-10-01T08:00:00Z',
      updated_at: '2026-10-01T08:00:00Z',
      skills: [
        { id: 's13', job_id: 'job-104', skill_name: 'PyTorch', is_required: true },
        { id: 's14', job_id: 'job-104', skill_name: 'Python', is_required: true },
        { id: 's15', job_id: 'job-104', skill_name: 'Vector DB', is_required: true },
      ],
      requirements: [
        { id: 'r7', job_id: 'job-104', requirement_text: 'Experience serving LLM/embedding models in high-concurrency production.', order_index: 1 },
      ],
      benefits: [
        { id: 'b7', job_id: 'job-104', benefit_text: 'Unlimited PTO & annual company retreats', category: 'Culture' },
      ],
    },
    {
      id: 'job-105',
      company_id: 'comp-101',
      title: 'Junior QA & Test Automation Specialist',
      description:
        'Develop E2E automation test suites using Playwright and Cypress for web and mobile clients.',
      employment_type: 'full_time',
      experience_level: 'entry',
      experience_min: 1,
      experience_max: 3,
      salary_min: 1200000,
      salary_max: 1800000,
      salary_currency: 'INR',
      location: 'Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      remote_type: 'on_site',
      openings: 1,
      application_deadline: '2026-09-30',
      status: 'closed',
      views_count: 940,
      applications_count: 65,
      matches_count: 14,
      created_at: '2026-08-01T08:00:00Z',
      updated_at: '2026-10-01T08:00:00Z',
      skills: [
        { id: 's16', job_id: 'job-105', skill_name: 'Playwright', is_required: true },
        { id: 's17', job_id: 'job-105', skill_name: 'JavaScript', is_required: true },
      ],
    },
  ]);

  // 5. Candidates (Profiles)
  private candidateProfiles: Profile[] = [
    {
      id: 'prof-cand-1',
      email: 'alex.morgan@gmail.com',
      full_name: 'Alex Morgan',
      phone: '+91 98111 22334',
      avatar_url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=250&q=80',
      headline: 'Senior Full Stack Engineer | 6+ Yrs Exp | Angular & Node',
      bio: 'Passionate about building ultra-fast Web Applications, clean components, and scalable GraphQL microservices.',
      location: 'Bengaluru, Karnataka',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      skills: ['Angular', 'TypeScript', 'Node.js', 'RxJS', 'PostgreSQL', 'Docker'],
      experience_years: 6,
      education: 'B.Tech in Computer Science — BITS Pilani (2020)',
      resume_url: 'https://hireswipe.io/resumes/alex-morgan-cv.pdf',
      created_at: '2026-01-20T08:00:00Z',
      updated_at: '2026-09-25T10:00:00Z',
    },
    {
      id: 'prof-cand-2',
      email: 'priya.sharma@tech.io',
      full_name: 'Priya Sharma',
      phone: '+91 98222 33445',
      avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=250&q=80',
      headline: 'Cloud Systems Architect & Kubernetes Specialist',
      bio: 'Expert in multi-cloud infrastructure, Terraform, and high availability systems.',
      location: 'Hyderabad, Telangana',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      skills: ['Kubernetes', 'AWS', 'Terraform', 'Go', 'Prometheus', 'CI/CD'],
      experience_years: 8,
      education: 'M.Tech in Software Systems — IIT Hyderabad (2018)',
      resume_url: 'https://hireswipe.io/resumes/priya-sharma-cv.pdf',
      created_at: '2026-02-10T08:00:00Z',
      updated_at: '2026-09-28T10:00:00Z',
    },
    {
      id: 'prof-cand-3',
      email: 'david.chen@dev.net',
      full_name: 'David Chen',
      phone: '+91 98333 44556',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80',
      headline: 'Lead Product Designer & UX Strategist',
      bio: 'Crafting delight through human-centered interface design, Figma components, and micro-interactions.',
      location: 'Bengaluru, Karnataka',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      skills: ['Figma', 'Design Systems', 'User Research', 'Prototyping', 'CSS3'],
      experience_years: 5,
      education: 'B.Des in Interaction Design — NID Ahmedabad (2021)',
      resume_url: 'https://hireswipe.io/resumes/david-chen-portfolio.pdf',
      created_at: '2026-03-01T08:00:00Z',
      updated_at: '2026-09-30T10:00:00Z',
    },
    {
      id: 'prof-cand-4',
      email: 'rohan.mehta@ai.co',
      full_name: 'Rohan Mehta',
      phone: '+91 98444 55667',
      avatar_url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=250&q=80',
      headline: 'AI/ML Systems Engineer (PyTorch & Vector DBs)',
      bio: 'Building recommendation systems and large language model fine-tuning pipelines.',
      location: 'Gurugram, Haryana',
      city: 'Gurugram',
      state: 'Haryana',
      country: 'India',
      skills: ['PyTorch', 'Python', 'Vector DB', 'FastAPI', 'MLOps'],
      experience_years: 5,
      education: 'B.E. in Computer Science — RVCE Bengaluru (2021)',
      resume_url: 'https://hireswipe.io/resumes/rohan-mehta-cv.pdf',
      created_at: '2026-04-12T08:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
  ];

  // 6. Applications
  private applicationsSubject = new BehaviorSubject<Application[]>([
    {
      id: 'app-301',
      job_id: 'job-101',
      job: this.jobsSubject.value[0],
      profile_id: 'prof-cand-1',
      profile: this.candidateProfiles[0],
      applied_at: '2026-09-28T14:30:00Z',
      status: 'interview',
      resume_url: 'https://hireswipe.io/resumes/alex-morgan-cv.pdf',
      cover_letter:
        'Dear Hiring Team, I have been building Angular & Node.js web apps for over 6 years. At my current role at Swiggy, I optimized front-end bundles by 40% and built high-concurrency microservices.',
      match_score: 96,
      status_history: [
        { id: 'h1', application_id: 'app-301', status: 'pending', changed_by: 'Alex Morgan', changed_at: '2026-09-28T14:30:00Z', notes: 'Application submitted' },
        { id: 'h2', application_id: 'app-301', status: 'shortlisted', changed_by: 'Kshitij Sharma', changed_at: '2026-09-29T10:00:00Z', notes: 'Strong profile match on Angular and Node' },
        { id: 'h3', application_id: 'app-301', status: 'interview', changed_by: 'Sneha Gupta', changed_at: '2026-10-01T11:30:00Z', notes: 'Scheduled Technical Interview round 1' },
      ],
    },
    {
      id: 'app-302',
      job_id: 'job-102',
      job: this.jobsSubject.value[1],
      profile_id: 'prof-cand-2',
      profile: this.candidateProfiles[1],
      applied_at: '2026-09-29T09:15:00Z',
      status: 'shortlisted',
      resume_url: 'https://hireswipe.io/resumes/priya-sharma-cv.pdf',
      cover_letter:
        'Hi TechPulse Team, I manage 100+ node EKS clusters and Terraform environments at Razorpay. I would love to lead your infrastructure initiatives.',
      match_score: 98,
      status_history: [
        { id: 'h4', application_id: 'app-302', status: 'pending', changed_by: 'Priya Sharma', changed_at: '2026-09-29T09:15:00Z', notes: 'Application submitted via Swipe' },
        { id: 'h5', application_id: 'app-302', status: 'reviewing', changed_by: 'Ananya Roy', changed_at: '2026-09-30T09:00:00Z', notes: 'Profile passed preliminary screening' },
        { id: 'h6', application_id: 'app-302', status: 'shortlisted', changed_by: 'Vikram Patel', changed_at: '2026-10-02T16:00:00Z', notes: 'Top match for Infrastructure Lead' },
      ],
    },
    {
      id: 'app-303',
      job_id: 'job-103',
      job: this.jobsSubject.value[2],
      profile_id: 'prof-cand-3',
      profile: this.candidateProfiles[2],
      applied_at: '2026-10-01T15:45:00Z',
      status: 'pending',
      resume_url: 'https://hireswipe.io/resumes/david-chen-portfolio.pdf',
      cover_letter:
        'Greetings! My Figma component libraries are used across multi-product suites. I am impressed by TechPulse clean design aesthetic.',
      match_score: 92,
      status_history: [
        { id: 'h7', application_id: 'app-303', status: 'pending', changed_by: 'David Chen', changed_at: '2026-10-01T15:45:00Z', notes: 'Application submitted' },
      ],
    },
    {
      id: 'app-304',
      job_id: 'job-101',
      job: this.jobsSubject.value[0],
      profile_id: 'prof-cand-4',
      profile: this.candidateProfiles[3],
      applied_at: '2026-10-02T11:20:00Z',
      status: 'reviewing',
      resume_url: 'https://hireswipe.io/resumes/rohan-mehta-cv.pdf',
      cover_letter:
        'Applying for Senior Full Stack Engineer. I specialize in PyTorch AI microservices and Python full stack.',
      match_score: 87,
      status_history: [
        { id: 'h8', application_id: 'app-304', status: 'pending', changed_by: 'Rohan Mehta', changed_at: '2026-10-02T11:20:00Z' },
        { id: 'h9', application_id: 'app-304', status: 'reviewing', changed_by: 'Sneha Gupta', changed_at: '2026-10-03T09:00:00Z', notes: 'Under technical review' },
      ],
    },
  ]);

  // 7. Matches
  private matchesSubject = new BehaviorSubject<Match[]>([
    {
      id: 'mat-501',
      job_id: 'job-101',
      job: this.jobsSubject.value[0],
      profile_id: 'prof-cand-1',
      profile: this.candidateProfiles[0],
      match_score: 96,
      status: 'active',
      matched_at: '2026-09-29T10:00:00Z',
    },
    {
      id: 'mat-502',
      job_id: 'job-102',
      job: this.jobsSubject.value[1],
      profile_id: 'prof-cand-2',
      profile: this.candidateProfiles[1],
      match_score: 98,
      status: 'active',
      matched_at: '2026-10-02T16:00:00Z',
    },
  ]);

  // 8. Conversations & Messages
  private conversationsSubject = new BehaviorSubject<Conversation[]>([
    {
      id: 'conv-1',
      job_id: 'job-101',
      job_title: 'Senior Full Stack Engineer',
      candidate_id: 'prof-cand-1',
      candidate_name: 'Alex Morgan',
      candidate_avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=250&q=80',
      candidate_role: 'Senior Full Stack Engineer',
      company_id: 'comp-101',
      last_message: 'Hi Alex, looking forward to our technical interview tomorrow at 3:00 PM IST!',
      last_message_at: '2026-10-04T14:30:00Z',
      unread_count: 0,
      created_at: '2026-09-29T10:15:00Z',
    },
    {
      id: 'conv-2',
      job_id: 'job-102',
      job_title: 'Lead Cloud Infrastructure Architect',
      candidate_id: 'prof-cand-2',
      candidate_name: 'Priya Sharma',
      candidate_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=250&q=80',
      candidate_role: 'Cloud Systems Architect',
      company_id: 'comp-101',
      last_message: 'Thanks for shortlisting my profile! I have sent over my updated Kubernetes portfolio.',
      last_message_at: '2026-10-03T17:00:00Z',
      unread_count: 1,
      created_at: '2026-10-02T16:15:00Z',
    },
  ]);

  private messagesSubject = new BehaviorSubject<{ [convId: string]: Message[] }>({
    'conv-1': [
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_id: 'comp-101',
        sender_type: 'company',
        sender_name: 'Kshitij Sharma (TechPulse)',
        content: 'Hi Alex! Congratulations, your profile stood out for our Senior Full Stack Engineer opening.',
        is_read: true,
        sent_at: '2026-09-29T10:15:00Z',
      },
      {
        id: 'msg-2',
        conversation_id: 'conv-1',
        sender_id: 'prof-cand-1',
        sender_type: 'candidate',
        sender_name: 'Alex Morgan',
        content: 'Hi Kshitij, thank you so much! I am really excited about TechPulse mission and developer platform.',
        is_read: true,
        sent_at: '2026-09-29T10:30:00Z',
      },
      {
        id: 'msg-3',
        conversation_id: 'conv-1',
        sender_id: 'comp-101',
        sender_type: 'company',
        sender_name: 'Sneha Gupta (TechPulse)',
        content: 'Hi Alex, looking forward to our technical interview tomorrow at 3:00 PM IST!',
        is_read: true,
        sent_at: '2026-10-04T14:30:00Z',
      },
    ],
    'conv-2': [
      {
        id: 'msg-4',
        conversation_id: 'conv-2',
        sender_id: 'prof-cand-2',
        sender_type: 'candidate',
        sender_name: 'Priya Sharma',
        content: 'Thanks for shortlisting my profile! I have sent over my updated Kubernetes portfolio.',
        is_read: false,
        sent_at: '2026-10-03T17:00:00Z',
      },
    ],
  });

  // 9. Interviews
  private interviewsSubject = new BehaviorSubject<Interview[]>([
    {
      id: 'int-1',
      application_id: 'app-301',
      job_id: 'job-101',
      job_title: 'Senior Full Stack Engineer',
      candidate_id: 'prof-cand-1',
      candidate_name: 'Alex Morgan',
      candidate_avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=250&q=80',
      recruiter_name: 'Sneha Gupta & Vikram Patel',
      date: '2026-10-06',
      time: '15:00',
      duration_minutes: 60,
      meeting_link: 'https://meet.google.com/xyz-tech-pulse',
      location: 'Google Meet (Virtual)',
      notes: 'System Architecture, Angular RxJS deep dive, & Live Coding Session.',
      status: 'scheduled',
      created_at: '2026-10-01T11:30:00Z',
    },
    {
      id: 'int-2',
      application_id: 'app-302',
      job_id: 'job-102',
      job_title: 'Lead Cloud Infrastructure Architect',
      candidate_id: 'prof-cand-2',
      candidate_name: 'Priya Sharma',
      candidate_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=250&q=80',
      recruiter_name: 'Kshitij Sharma',
      date: '2026-10-08',
      time: '11:00',
      duration_minutes: 45,
      meeting_link: 'https://meet.google.com/infra-tech-pulse',
      location: 'Google Meet (Virtual)',
      notes: 'Initial Screening & Architectural fit conversation with VP of Eng.',
      status: 'scheduled',
      created_at: '2026-10-02T16:30:00Z',
    },
    {
      id: 'int-3',
      application_id: 'app-305',
      job_id: 'job-105',
      job_title: 'Junior QA Specialist',
      candidate_id: 'prof-cand-3',
      candidate_name: 'David Chen',
      candidate_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80',
      recruiter_name: 'Ananya Roy',
      date: '2026-09-20',
      time: '14:00',
      duration_minutes: 45,
      meeting_link: 'https://meet.google.com/qa-past-meet',
      location: 'Google Meet (Virtual)',
      notes: 'Completed successfully.',
      status: 'completed',
      created_at: '2026-09-18T10:00:00Z',
    },
  ]);

  // 10. Notifications
  private notificationsSubject = new BehaviorSubject<Notification[]>([
    {
      id: 'notif-1',
      type: 'application',
      title: 'New Application Received',
      message: 'Rohan Mehta applied for Senior Full Stack Engineer (96% Match Score)',
      link: '/company/applications',
      is_read: false,
      created_at: '2026-10-02T11:20:00Z',
    },
    {
      id: 'notif-2',
      type: 'match',
      title: 'New Candidate Match!',
      message: 'Priya Sharma matched with Lead Cloud Infrastructure Architect',
      link: '/company/matches',
      is_read: false,
      created_at: '2026-10-02T16:00:00Z',
    },
    {
      id: 'notif-3',
      type: 'message',
      title: 'New Message from Candidate',
      message: 'Priya Sharma: "Thanks for shortlisting my profile! I have sent..."',
      link: '/company/messages',
      is_read: false,
      created_at: '2026-10-03T17:00:00Z',
    },
    {
      id: 'notif-4',
      type: 'interview',
      title: 'Upcoming Interview Reminder',
      message: 'Technical round with Alex Morgan is scheduled tomorrow at 3:00 PM',
      link: '/company/interviews',
      is_read: true,
      created_at: '2026-10-04T09:00:00Z',
    },
    {
      id: 'notif-5',
      type: 'job_activity',
      title: 'Job Post Milestone',
      message: 'Senior Full Stack Engineer hit 800+ total candidate views!',
      link: '/company/jobs/job-101',
      is_read: true,
      created_at: '2026-10-04T12:00:00Z',
    },
  ]);

  // Observables
  company$ = this.companySubject.asObservable();
  recruiterProfile$ = this.recruiterProfileSubject.asObservable();
  teamMembers$ = this.teamMembersSubject.asObservable();
  jobs$ = this.jobsSubject.asObservable();
  applications$ = this.applicationsSubject.asObservable();
  matches$ = this.matchesSubject.asObservable();
  conversations$ = this.conversationsSubject.asObservable();
  messages$ = this.messagesSubject.asObservable();
  interviews$ = this.interviewsSubject.asObservable();
  notifications$ = this.notificationsSubject.asObservable();

  // Getters
  get currentCompany(): Company {
    return this.companySubject.value;
  }

  get currentRecruiterProfile(): Profile {
    return this.recruiterProfileSubject.value;
  }

  get allCandidates(): Profile[] {
    return this.candidateProfiles;
  }

  isOnboardingCompleted(): boolean {
    const fromStorage = localStorage.getItem('hireswipe_company_onboarding_completed');
    if (fromStorage !== null) {
      return fromStorage === 'true';
    }
    return this.companySubject.value.onboarding_completed ?? true;
  }

  setOnboardingCompleted(completed: boolean): void {
    localStorage.setItem('hireswipe_company_onboarding_completed', String(completed));
    const updated = {
      ...this.companySubject.value,
      onboarding_completed: completed,
    };
    this.companySubject.next(updated);
  }

  // --- Dynamic Completion Calculator (Requirement 5) ---
  calculateCompanyCompletion(company: Partial<Company>): number {
    const fields = [
      company.name,
      company.industry,
      company.size,
      company.founded_year,
      company.website,
      company.email,
      company.phone,
      company.location,
      company.city,
      company.state,
      company.country,
      company.description,
      company.culture,
      company.mission,
      company.logo_url,
    ];
    const filled = fields.filter((val) => val && String(val).trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }

  // --- Actions ---
  updateCompanyProfile(data: Partial<Company>): void {
    const updated = {
      ...this.companySubject.value,
      ...data,
      updated_at: new Date().toISOString(),
    };
    updated.completion_percentage = this.calculateCompanyCompletion(updated);
    this.companySubject.next(updated);
  }

  updateRecruiterProfile(data: Partial<Profile>): void {
    const updated = {
      ...this.recruiterProfileSubject.value,
      ...data,
      updated_at: new Date().toISOString(),
    };
    this.recruiterProfileSubject.next(updated);
  }

  createJob(jobData: Partial<Job>): Job {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      company_id: this.currentCompany.id,
      title: jobData.title || 'Untitled Role',
      description: jobData.description || '',
      employment_type: jobData.employment_type || 'full_time',
      experience_level: jobData.experience_level || 'mid',
      experience_min: jobData.experience_min || 2,
      experience_max: jobData.experience_max || 5,
      salary_min: jobData.salary_min || 1500000,
      salary_max: jobData.salary_max || 2500000,
      salary_currency: jobData.salary_currency || 'INR',
      location: jobData.location || 'Bengaluru',
      city: jobData.city || 'Bengaluru',
      state: jobData.state || 'Karnataka',
      country: jobData.country || 'India',
      remote_type: jobData.remote_type || 'hybrid',
      openings: jobData.openings || 1,
      application_deadline: jobData.application_deadline || '2026-12-31',
      status: jobData.status || 'active',
      skills: jobData.skills || [],
      requirements: jobData.requirements || [],
      benefits: jobData.benefits || [],
      views_count: 0,
      applications_count: 0,
      matches_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const currentJobs = this.jobsSubject.value;
    this.jobsSubject.next([newJob, ...currentJobs]);

    // Push notification
    this.pushNotification({
      type: 'job_activity',
      title: 'Job Published',
      message: `Your job "${newJob.title}" has been ${newJob.status === 'active' ? 'published' : 'saved as draft'}.`,
      link: `/company/jobs/${newJob.id}`,
    });

    return newJob;
  }

  updateJob(jobId: string, data: Partial<Job>): void {
    const jobs = this.jobsSubject.value.map((j) => {
      if (j.id === jobId) {
        return { ...j, ...data, updated_at: new Date().toISOString() };
      }
      return j;
    });
    this.jobsSubject.next(jobs);
  }

  updateJobStatus(jobId: string, status: JobStatus): void {
    this.updateJob(jobId, { status });
  }

  updateApplicationStatus(appId: string, newStatus: ApplicationStatus, notes?: string): void {
    const apps = this.applicationsSubject.value.map((app) => {
      if (app.id === appId) {
        const historyItem = {
          id: `h-${Date.now()}`,
          application_id: appId,
          status: newStatus,
          changed_by: this.recruiterProfileSubject.value.full_name,
          changed_at: new Date().toISOString(),
          notes: notes || `Status updated to ${newStatus}`,
        };
        return {
          ...app,
          status: newStatus,
          status_history: [...app.status_history, historyItem],
        };
      }
      return app;
    });
    this.applicationsSubject.next(apps);

    // If moved to shortlist/match, ensure a match record exists
    if (newStatus === 'shortlisted' || newStatus === 'accepted') {
      const targetApp = apps.find((a) => a.id === appId);
      if (targetApp && targetApp.profile) {
        this.ensureMatch(targetApp.job_id, targetApp.profile.id, targetApp.match_score);
      }
    }
  }

  ensureMatch(jobId: string, candidateId: string, score: number): void {
    const existing = this.matchesSubject.value.find((m) => m.job_id === jobId && m.profile_id === candidateId);
    if (!existing) {
      const job = this.jobsSubject.value.find((j) => j.id === jobId);
      const cand = this.candidateProfiles.find((c) => c.id === candidateId);
      const newMatch: Match = {
        id: `mat-${Date.now()}`,
        job_id: jobId,
        job: job,
        profile_id: candidateId,
        profile: cand,
        match_score: score,
        status: 'active',
        matched_at: new Date().toISOString(),
      };
      this.matchesSubject.next([newMatch, ...this.matchesSubject.value]);
    }
  }

  scheduleInterview(data: {
    application_id: string;
    job_id: string;
    candidate_id: string;
    candidate_name: string;
    date: string;
    time: string;
    duration_minutes: number;
    meeting_link: string;
    location: string;
    notes?: string;
  }): Interview {
    const job = this.jobsSubject.value.find((j) => j.id === data.job_id);
    const cand = this.candidateProfiles.find((c) => c.id === data.candidate_id);

    const newInterview: Interview = {
      id: `int-${Date.now()}`,
      application_id: data.application_id,
      job_id: data.job_id,
      job_title: job ? job.title : 'Role Interview',
      candidate_id: data.candidate_id,
      candidate_name: data.candidate_name,
      candidate_avatar: cand?.avatar_url,
      recruiter_name: this.recruiterProfileSubject.value.full_name,
      date: data.date,
      time: data.time,
      duration_minutes: data.duration_minutes,
      meeting_link: data.meeting_link || 'https://meet.google.com/hireswipe-interview',
      location: data.location || 'Google Meet',
      notes: data.notes,
      status: 'scheduled',
      created_at: new Date().toISOString(),
    };

    this.interviewsSubject.next([newInterview, ...this.interviewsSubject.value]);

    // Update application status to interview
    this.updateApplicationStatus(data.application_id, 'interview', `Interview scheduled for ${data.date} at ${data.time}`);

    // Push notification
    this.pushNotification({
      type: 'interview',
      title: 'Interview Scheduled',
      message: `Interview with ${data.candidate_name} set for ${data.date} at ${data.time}.`,
      link: '/company/interviews',
    });

    return newInterview;
  }

  updateInterviewStatus(interviewId: string, status: InterviewStatus): void {
    const list = this.interviewsSubject.value.map((i) => (i.id === interviewId ? { ...i, status } : i));
    this.interviewsSubject.next(list);
  }

  sendMessage(conversationId: string, text: string, attachments: any[] = []): void {
    const current = this.messagesSubject.value;
    const thread = current[conversationId] || [];

    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: this.currentCompany.id,
      sender_type: 'company',
      sender_name: `${this.recruiterProfileSubject.value.full_name} (${this.currentCompany.name})`,
      content: text,
      attachments: attachments,
      is_read: true,
      sent_at: new Date().toISOString(),
    };

    this.messagesSubject.next({
      ...current,
      [conversationId]: [...thread, newMsg],
    });

    // Update conversation last message
    const convs = this.conversationsSubject.value.map((c) => {
      if (c.id === conversationId) {
        return {
          ...c,
          last_message: text,
          last_message_at: new Date().toISOString(),
        };
      }
      return c;
    });
    this.conversationsSubject.next(convs);
  }

  startConversationWithCandidate(candidateId: string, jobId?: string): Conversation {
    const cand = this.candidateProfiles.find((c) => c.id === candidateId);
    const existing = this.conversationsSubject.value.find((c) => c.candidate_id === candidateId);

    if (existing) return existing;

    const job = jobId ? this.jobsSubject.value.find((j) => j.id === jobId) : undefined;
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      job_id: jobId,
      job_title: job ? job.title : 'Direct Outreach',
      candidate_id: candidateId,
      candidate_name: cand ? cand.full_name : 'Candidate',
      candidate_avatar: cand?.avatar_url,
      candidate_role: cand?.headline,
      company_id: this.currentCompany.id,
      last_message: 'Conversation started',
      last_message_at: new Date().toISOString(),
      unread_count: 0,
      created_at: new Date().toISOString(),
    };

    this.conversationsSubject.next([newConv, ...this.conversationsSubject.value]);
    return newConv;
  }

  inviteTeamMember(email: string, role: CompanyRole, fullName: string): CompanyMember {
    const newMember: CompanyMember = {
      id: `mem-${Date.now()}`,
      company_id: this.currentCompany.id,
      profile_id: `prof-invited-${Date.now()}`,
      profile: {
        id: `prof-invited-${Date.now()}`,
        email: email,
        full_name: fullName,
        headline: `${role.replace('_', ' ').toUpperCase()} Team Member`,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0f766e&color=fff`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      role: role,
      status: 'invited',
      invited_at: new Date().toISOString(),
    };

    this.teamMembersSubject.next([...this.teamMembersSubject.value, newMember]);
    return newMember;
  }

  toggleTeamMemberStatus(memberId: string, newStatus: 'active' | 'deactivated'): void {
    const list = this.teamMembersSubject.value.map((m) => (m.id === memberId ? { ...m, status: newStatus } : m));
    this.teamMembersSubject.next(list);
  }

  markNotificationRead(id: string): void {
    const list = this.notificationsSubject.value.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    this.notificationsSubject.next(list);
  }

  markAllNotificationsRead(): void {
    const list = this.notificationsSubject.value.map((n) => ({ ...n, is_read: true }));
    this.notificationsSubject.next(list);
  }

  pushNotification(data: { type: any; title: string; message: string; link?: string }): void {
    const notif: Notification = {
      id: `notif-${Date.now()}`,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    this.notificationsSubject.next([notif, ...this.notificationsSubject.value]);
  }
}
