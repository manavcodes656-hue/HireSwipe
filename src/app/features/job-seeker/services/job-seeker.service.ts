import { Injectable, signal, computed } from '@angular/core';
import {
  Profile,
  JobSeekerProfile,
  Resume,
  Education,
  Experience,
  JobSeekerSkill,
  JobSeekerPreference,
  JobSwipe,
  Match,
  Application,
  ApplicationStatus,
  SavedJob,
  Conversation,
  Message,
  Interview,
  Notification,
  Job,
  Skill,
} from '../models/job-seeker.models';

@Injectable({
  providedIn: 'root',
})
export class JobSeekerService {
  private getInitialProfile(): Profile {
    try {
      const stored = localStorage.getItem('hireswipe_job_seeker_profile');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error reading profile from localStorage', e);
    }
    return {
      id: 'p-101',
      user_id: 'u-101',
      email: 'krish.developer@hireswipe.io',
      full_name: 'Krish Sharma',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      phone: '+91 98765 43210',
      role: 'job_seeker',
      created_at: '2026-01-15T08:00:00Z',
      updated_at: '2026-10-05T08:00:00Z',
    };
  }

  // 1. Profile State
  readonly profile = signal<Profile>(this.getInitialProfile());

  readonly jobSeekerProfile = signal<JobSeekerProfile>({
    id: 'jsp-101',
    profile_id: 'p-101',
    headline: 'Senior Full Stack Engineer | Angular, TypeScript, Node.js',
    bio: 'Passionate software engineer with 5+ years of building high-concurrency web apps, scalable microservices, and user-first web applications. Seeking impact-driven tech startup or enterprise roles.',
    current_job_title: 'Senior Frontend Developer',
    current_company: 'TechFlow Systems',
    years_of_experience: 5,
    availability: '15 Days',
    location: 'Bengaluru, Karnataka, India',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    linkedin_url: 'https://linkedin.com/in/krish-sharma-dev',
    github_url: 'https://github.com/krish-sharma-dev',
    portfolio_url: 'https://krishsharma.dev',
    onboarding_completed: true,
    profile_completion_pct: 92,
  });

  // 2. Resumes State
  readonly resumes = signal<Resume[]>([
    {
      id: 'res-1',
      job_seeker_profile_id: 'jsp-101',
      file_name: 'Krish_Sharma_Senior_FullStack_Resume_2026.pdf',
      file_size: '2.4 MB',
      file_type: 'application/pdf',
      file_url: '#',
      is_primary: true,
      uploaded_at: '2026-09-28T10:30:00Z',
    },
    {
      id: 'res-2',
      job_seeker_profile_id: 'jsp-101',
      file_name: 'Krish_Sharma_Frontend_Architect_CV.pdf',
      file_size: '1.8 MB',
      file_type: 'application/pdf',
      file_url: '#',
      is_primary: false,
      uploaded_at: '2026-08-15T14:20:00Z',
    },
  ]);

  // 3. Education State
  readonly educationList = signal<Education[]>([
    {
      id: 'edu-1',
      job_seeker_profile_id: 'jsp-101',
      institution: 'Indian Institute of Technology (IIT), Madras',
      degree: 'Bachelor of Technology (B.Tech)',
      field_of_study: 'Computer Science and Engineering',
      start_date: '2017-08-01',
      end_date: '2021-05-30',
      grade: '8.9 CGPA',
      description: 'Specialized in Algorithms, Distributed Systems, and Web Engineering. Led the ACM Student Chapter.',
    },
  ]);

  // 4. Experience State
  readonly experienceList = signal<Experience[]>([
    {
      id: 'exp-1',
      job_seeker_profile_id: 'jsp-101',
      company: 'TechFlow Systems',
      job_title: 'Senior Frontend Engineer',
      employment_type: 'Full-time',
      location: 'Bengaluru, India (Hybrid)',
      start_date: '2023-03-01',
      end_date: 'Present',
      currently_working: true,
      description: 'Architected high-performance enterprise dashboards serving 500k daily active users. Reduced initial load time by 42% through lazy loading and modern state architecture.',
    },
    {
      id: 'exp-2',
      job_seeker_profile_id: 'jsp-101',
      company: 'Innovate Labs',
      job_title: 'Full Stack Software Engineer',
      employment_type: 'Full-time',
      location: 'Hyderabad, India',
      start_date: '2021-06-01',
      end_date: '2023-02-28',
      currently_working: false,
      description: 'Developed RESTful microservices in Node.js & PostgreSQL, paired with Angular frontend integrations. Implemented automated CI/CD pipelines.',
    },
  ]);

  // 5. Skills State
  readonly catalogSkills = signal<Skill[]>([
    { id: 'sk-1', name: 'Angular', category: 'Frontend' },
    { id: 'sk-2', name: 'TypeScript', category: 'Programming Languages' },
    { id: 'sk-3', name: 'RxJS', category: 'Frontend' },
    { id: 'sk-4', name: 'Node.js', category: 'Backend' },
    { id: 'sk-5', name: 'PostgreSQL', category: 'Database' },
    { id: 'sk-6', name: 'System Design', category: 'Architecture' },
    { id: 'sk-7', name: 'REST APIs', category: 'Backend' },
    { id: 'sk-8', name: 'TailwindCSS', category: 'Frontend' },
    { id: 'sk-9', name: 'Docker', category: 'DevOps' },
    { id: 'sk-10', name: 'GraphQL', category: 'Backend' },
    { id: 'sk-11', name: 'React', category: 'Frontend' },
    { id: 'sk-12', name: 'Python', category: 'Programming Languages' },
    { id: 'sk-13', name: 'Vue.js', category: 'Frontend' },
    { id: 'sk-14', name: 'Next.js', category: 'Frontend' },
    { id: 'sk-15', name: 'JavaScript', category: 'Programming Languages' },
    { id: 'sk-16', name: 'HTML5 & CSS3', category: 'Frontend' },
    { id: 'sk-17', name: 'Express.js', category: 'Backend' },
    { id: 'sk-18', name: 'Java', category: 'Programming Languages' },
    { id: 'sk-19', name: 'Spring Boot', category: 'Backend' },
    { id: 'sk-20', name: 'Django', category: 'Backend' },
    { id: 'sk-21', name: 'C++', category: 'Programming Languages' },
    { id: 'sk-22', name: 'C#', category: 'Programming Languages' },
    { id: 'sk-23', name: '.NET Core', category: 'Backend' },
    { id: 'sk-24', name: 'MongoDB', category: 'Database' },
    { id: 'sk-25', name: 'MySQL', category: 'Database' },
    { id: 'sk-26', name: 'Firebase', category: 'Cloud' },
    { id: 'sk-27', name: 'AWS', category: 'Cloud' },
    { id: 'sk-28', name: 'Azure', category: 'Cloud' },
    { id: 'sk-29', name: 'Kubernetes', category: 'DevOps' },
    { id: 'sk-30', name: 'Git & GitHub', category: 'Tools' },
    { id: 'sk-31', name: 'Figma', category: 'UI/UX' },
    { id: 'sk-32', name: 'Jest', category: 'Testing' },
    { id: 'sk-33', name: 'Cypress', category: 'Testing' },
    { id: 'sk-34', name: 'Selenium', category: 'Testing' },
    { id: 'sk-35', name: 'Flutter', category: 'Mobile' },
    { id: 'sk-36', name: 'React Native', category: 'Mobile' },
    { id: 'sk-37', name: 'Swift', category: 'Mobile' },
    { id: 'sk-38', name: 'Kotlin', category: 'Mobile' },
    { id: 'sk-39', name: 'Redis', category: 'Database' },
    { id: 'sk-40', name: 'CI/CD Pipelines', category: 'DevOps' },
  ]);

  readonly userSkills = signal<JobSeekerSkill[]>([
    { id: 'jsk-1', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-1', skill_name: 'Angular', proficiency_level: 'expert', years_of_experience: 5 },
    { id: 'jsk-2', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-2', skill_name: 'TypeScript', proficiency_level: 'expert', years_of_experience: 5 },
    { id: 'jsk-3', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-3', skill_name: 'RxJS', proficiency_level: 'advanced', years_of_experience: 4 },
    { id: 'jsk-4', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-4', skill_name: 'Node.js', proficiency_level: 'advanced', years_of_experience: 4 },
    { id: 'jsk-5', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-5', skill_name: 'PostgreSQL', proficiency_level: 'intermediate', years_of_experience: 3 },
    { id: 'jsk-6', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-6', skill_name: 'System Design', proficiency_level: 'advanced', years_of_experience: 3 },
  ]);

  // 6. Preferences State
  readonly preferences = signal<JobSeekerPreference>({
    id: 'jspref-101',
    job_seeker_profile_id: 'jsp-101',
    preferred_job_title: 'Senior Full Stack / Lead Frontend Engineer',
    preferred_location: 'Bengaluru, India',
    remote_preference: 'hybrid',
    employment_type: 'full_time',
    min_salary: 2800000,
    max_salary: 4500000,
    experience_level: 'senior',
    preferred_industries: ['FinTech', 'SaaS', 'E-commerce', 'AI/ML'],
    willing_to_relocate: true,
  });

  // 7. Discovery / Swipe Deck State
  readonly jobs = signal<Job[]>([
    {
      id: 'job-1',
      title: 'Senior Full Stack Engineer (Angular & Node)',
      company_id: 'comp-101',
      company_name: 'Google India',
      company_logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg',
      company_type: 'Tier 1 Tech Product Company',
      location: 'Bengaluru (Hybrid)',
      employment_type: 'Full-time',
      salary_min: 3200000,
      salary_max: 4800000,
      salary_currency: 'INR',
      salary_display: '₹32–48 LPA',
      experience_level: 'Senior (4-7 yrs)',
      remote_option: 'Hybrid',
      description: 'Google Cloud Platform team is looking for a Senior Full Stack Engineer to lead front-end platform modularity and API integrations.',
      requirements: [
        '5+ years of software development experience using TypeScript/JavaScript',
        'Deep mastery of Angular or modern reactive frontend frameworks',
        'Proven track record with high-scale distributed systems and Node.js microservices',
        'Strong computer science fundamentals in data structures & algorithms',
      ],
      skills: ['Angular', 'TypeScript', 'Node.js', 'System Design', 'GCP'],
      match_score: '96%',
      posted_at: '2 days ago',
    },
    {
      id: 'job-2',
      title: 'Lead Frontend Systems Architect',
      company_id: 'comp-102',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      company_type: 'Global Enterprise Cloud Leader',
      location: 'Hyderabad (Hybrid)',
      employment_type: 'Full-time',
      salary_min: 3500000,
      salary_max: 5200000,
      salary_currency: 'INR',
      salary_display: '₹35–52 LPA',
      experience_level: 'Lead / Staff',
      remote_option: 'Hybrid',
      description: 'Join Azure Web Tools org to drive core client architecture, rendering performance, and micro-frontend orchestrations across cloud portals.',
      requirements: [
        '6+ years of UI platform engineering experience',
        'Expertise in Web Performance tuning, Bundle Optimization, and TypeScript',
        'Experience mentoring engineering pods and conducting design reviews',
      ],
      skills: ['TypeScript', 'Angular', 'RxJS', 'Web Performance', 'Azure'],
      match_score: '98%',
      posted_at: '1 day ago',
    },
    {
      id: 'job-3',
      title: 'Staff UI Platform Engineer',
      company_id: 'comp-103',
      company_name: 'Stripe India',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
      company_type: 'Global Payments Infrastructure',
      location: 'Remote / Bengaluru',
      employment_type: 'Full-time',
      salary_min: 3800000,
      salary_max: 5800000,
      salary_currency: 'INR',
      salary_display: '₹38–58 LPA',
      experience_level: 'Senior / Staff',
      remote_option: 'Remote',
      description: 'Building frictionless checkout interfaces used by millions of merchants worldwide. High standard for design accuracy and reliability.',
      requirements: [
        '5+ years building fintech UI components and state machines',
        'Obsession over pixel perfection, accessibility (a11y), and zero-downtime releases',
      ],
      skills: ['TypeScript', 'Angular', 'System Design', 'REST APIs', 'PostgreSQL'],
      match_score: '95%',
      posted_at: '3 days ago',
    },
    {
      id: 'job-4',
      title: 'Senior Frontend Developer - Merchant Experience',
      company_id: 'comp-104',
      company_name: 'Shopify',
      company_logo: 'https://cdn.iconscout.com/icon/free/png-256/free-shopify-logo-icon-download-in-svg-png-gif-file-formats--technology-social-media-company-brand-vol-6-pack-logos-icons-2673898.png',
      company_type: 'E-commerce Platform',
      location: 'Remote',
      employment_type: 'Full-time',
      salary_min: 3000000,
      salary_max: 4400000,
      salary_currency: 'INR',
      salary_display: '₹30–44 LPA',
      experience_level: 'Senior (4+ yrs)',
      remote_option: 'Remote',
      description: 'Help global entrepreneurs manage millions of products seamlessly through scalable merchant dashboards.',
      requirements: [
        '4+ years frontend development experience with modern Javascript/Typescript frameworks',
        'Strong skills in component libraries, accessibility, and state management',
      ],
      skills: ['Angular', 'TypeScript', 'TailwindCSS', 'GraphQL'],
      match_score: '92%',
      posted_at: '4 days ago',
    },
    {
      id: 'job-5',
      title: 'Full Stack Engineer - Core Infra',
      company_id: 'comp-105',
      company_name: 'Atlassian',
      company_logo: 'https://cdn.iconscout.com/icon/free/png-256/free-atlassian-logo-icon-download-in-svg-png-gif-file-formats--technology-social-media-company-brand-vol-1-pack-logos-icons-2673770.png',
      company_type: 'Developer & Collaboration Tools',
      location: 'Bengaluru (On-site)',
      employment_type: 'Full-time',
      salary_min: 2900000,
      salary_max: 4200000,
      salary_currency: 'INR',
      salary_display: '₹29–42 LPA',
      experience_level: 'Mid - Senior',
      remote_option: 'On-site',
      description: 'Enhance Jira & Confluence real-time collaboration engines with WebSocket stream processing and front-end state synchronization.',
      requirements: [
        '3+ years full stack development experience with Node.js and modern SPA frameworks',
        'Deep understanding of REST/GraphQL APIs and relational databases',
      ],
      skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Angular', 'Docker'],
      match_score: '90%',
      posted_at: '5 days ago',
    },
  ]);

  readonly swipedJobIds = signal<Set<string>>(new Set(['job-0']));

  // 8. Matches State
  readonly matches = signal<Match[]>([
    {
      id: 'match-1',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-101',
      company_id: 'comp-101',
      match_date: '2026-10-04T14:30:00Z',
      status: 'active',
      company_name: 'Google India',
      company_logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg',
      job_title: 'Senior Full Stack Engineer',
      job_location: 'Bengaluru (Hybrid)',
      match_score: '96%',
    },
    {
      id: 'match-2',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-102',
      company_id: 'comp-102',
      match_date: '2026-10-02T11:15:00Z',
      status: 'active',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      job_location: 'Hyderabad (Hybrid)',
      match_score: '98%',
    },
    {
      id: 'match-3',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-103',
      company_id: 'comp-103',
      match_date: '2026-09-25T09:00:00Z',
      status: 'active',
      company_name: 'Stripe India',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
      job_title: 'Staff UI Platform Engineer',
      job_location: 'Remote / Bengaluru',
      match_score: '95%',
    },
  ]);

  // 9. Applications State
  readonly applications = signal<Application[]>([
    {
      id: 'app-1',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-102',
      company_id: 'comp-102',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      job_location: 'Hyderabad (Hybrid)',
      salary_range: '₹35–52 LPA',
      status: 'interview',
      applied_at: '2026-10-02T12:00:00Z',
      updated_at: '2026-10-04T16:00:00Z',
      status_history: [
        { id: 'ash-1', application_id: 'app-1', status: 'pending', comment: 'Application submitted via HireSwipe', changed_at: '2026-10-02T12:00:00Z' },
        { id: 'ash-2', application_id: 'app-1', status: 'reviewing', comment: 'Profile under review by Senior Talent Acquisition Lead', changed_at: '2026-10-03T10:00:00Z' },
        { id: 'ash-3', application_id: 'app-1', status: 'shortlisted', comment: 'Candidate shortlisted for technical round', changed_at: '2026-10-03T17:30:00Z' },
        { id: 'ash-4', application_id: 'app-1', status: 'interview', comment: 'System Design Interview scheduled for Oct 8, 2026', changed_at: '2026-10-04T16:00:00Z' },
      ],
    },
    {
      id: 'app-2',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-101',
      company_id: 'comp-101',
      company_name: 'Google India',
      company_logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg',
      job_title: 'Senior Full Stack Engineer',
      job_location: 'Bengaluru (Hybrid)',
      salary_range: '₹32–48 LPA',
      status: 'shortlisted',
      applied_at: '2026-10-04T15:00:00Z',
      updated_at: '2026-10-05T09:30:00Z',
      status_history: [
        { id: 'ash-5', application_id: 'app-2', status: 'pending', comment: 'Mutual Swipe Match converted to Application', changed_at: '2026-10-04T15:00:00Z' },
        { id: 'ash-6', application_id: 'app-2', status: 'shortlisted', comment: 'Engineering Manager reviewed profile and marked Shortlisted', changed_at: '2026-10-05T09:30:00Z' },
      ],
    },
    {
      id: 'app-3',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-103',
      company_id: 'comp-103',
      company_name: 'Stripe India',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
      job_title: 'Staff UI Platform Engineer',
      job_location: 'Remote / Bengaluru',
      salary_range: '₹38–58 LPA',
      status: 'reviewing',
      applied_at: '2026-09-26T11:20:00Z',
      updated_at: '2026-09-28T14:10:00Z',
      status_history: [
        { id: 'ash-7', application_id: 'app-3', status: 'pending', comment: 'Application submitted', changed_at: '2026-09-26T11:20:00Z' },
        { id: 'ash-8', application_id: 'app-3', status: 'reviewing', comment: 'Recruiter assigned for screening', changed_at: '2026-09-28T14:10:00Z' },
      ],
    },
  ]);

  // 10. Saved Jobs State
  readonly savedJobs = signal<SavedJob[]>([
    {
      id: 'sj-1',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-3',
      saved_at: '2026-10-04T18:20:00Z',
      job_title: 'Staff UI Platform Engineer',
      company_name: 'Stripe India',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
      location: 'Remote / Bengaluru',
      salary_range: '₹38–58 LPA',
      employment_type: 'Full-time',
    },
    {
      id: 'sj-2',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-4',
      saved_at: '2026-10-03T10:15:00Z',
      job_title: 'Senior Frontend Developer - Merchant Experience',
      company_name: 'Shopify',
      company_logo: 'https://cdn.iconscout.com/icon/free/png-256/free-shopify-logo-icon-download-in-svg-png-gif-file-formats--technology-social-media-company-brand-vol-6-pack-logos-icons-2673898.png',
      location: 'Remote',
      salary_range: '₹30–44 LPA',
      employment_type: 'Full-time',
    },
  ]);

  // 11. Conversations & Messages State
  readonly conversations = signal<Conversation[]>([
    {
      id: 'conv-1',
      match_id: 'match-1',
      company_name: 'Google India',
      company_logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg',
      job_title: 'Senior Full Stack Engineer',
      created_at: '2026-10-04T14:35:00Z',
      updated_at: '2026-10-05T10:30:00Z',
      last_message_snippet: 'We loved your experience with Angular architecture! Are you free for a introductory call tomorrow?',
      last_message_at: '10:30 AM',
      unread_count: 1,
    },
    {
      id: 'conv-2',
      match_id: 'match-2',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      created_at: '2026-10-02T11:20:00Z',
      updated_at: '2026-10-04T16:05:00Z',
      last_message_snippet: 'The interview invitation has been sent for Oct 8 at 3:00 PM IST.',
      last_message_at: 'Yesterday',
      unread_count: 0,
    },
  ]);

  readonly messages = signal<Record<string, Message[]>>({
    'conv-1': [
      {
        id: 'm-101',
        conversation_id: 'conv-1',
        sender_id: 'comp-101',
        sender_name: 'Ananya Roy (Google Talent Lead)',
        is_job_seeker: false,
        text: 'Hi Krish! Great to connect. We saw your swipe match and were super impressed by your senior frontend experience.',
        read_state: true,
        created_at: 'Yesterday, 2:40 PM',
      },
      {
        id: 'm-102',
        conversation_id: 'conv-1',
        sender_id: 'u-101',
        sender_name: 'Krish Sharma',
        is_job_seeker: true,
        text: 'Hi Ananya! Thanks for reaching out. I have been following Google Cloud platform developments closely and would love to contribute.',
        read_state: true,
        created_at: 'Yesterday, 3:15 PM',
      },
      {
        id: 'm-103',
        conversation_id: 'conv-1',
        sender_id: 'comp-101',
        sender_name: 'Ananya Roy (Google Talent Lead)',
        is_job_seeker: false,
        text: 'We loved your experience with Angular architecture! Are you free for a introductory call tomorrow?',
        read_state: false,
        created_at: '10:30 AM',
      },
    ],
    'conv-2': [
      {
        id: 'm-201',
        conversation_id: 'conv-2',
        sender_id: 'comp-102',
        sender_name: 'Suresh Kumar (Microsoft Recruiter)',
        is_job_seeker: false,
        text: 'Hello Krish, your profile for Lead Frontend Systems Architect stands out.',
        read_state: true,
        created_at: 'Oct 2, 11:30 AM',
      },
      {
        id: 'm-202',
        conversation_id: 'conv-2',
        sender_id: 'u-101',
        sender_name: 'Krish Sharma',
        is_job_seeker: true,
        text: 'Thank you Suresh! I look forward to exploring this opportunity.',
        read_state: true,
        created_at: 'Oct 2, 12:05 PM',
      },
      {
        id: 'm-203',
        conversation_id: 'conv-2',
        sender_id: 'comp-102',
        sender_name: 'Suresh Kumar (Microsoft Recruiter)',
        is_job_seeker: false,
        text: 'The interview invitation has been sent for Oct 8 at 3:00 PM IST.',
        read_state: true,
        created_at: 'Oct 4, 4:05 PM',
      },
    ],
  });

  // 12. Interviews State
  readonly interviews = signal<Interview[]>([
    {
      id: 'int-1',
      application_id: 'app-1',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      date: '2026-10-08',
      time: '15:00 - 16:00 IST',
      duration_minutes: 60,
      meeting_link: 'https://teams.microsoft.com/l/meetup-join/hireswipe-msft-interview',
      location: 'Microsoft Teams Video Call',
      status: 'upcoming',
      notes: 'Focus areas: Web Performance Optimization, Micro-frontends, Component design patterns.',
    },
    {
      id: 'int-2',
      application_id: 'app-1',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      date: '2026-10-03',
      time: '11:00 - 11:45 IST',
      duration_minutes: 45,
      meeting_link: 'https://teams.microsoft.com/l/meetup-join/hireswipe-msft-screen',
      location: 'Microsoft Teams Video Call',
      status: 'completed',
      notes: 'Initial recruiter screening. Passed with positive feedback.',
    },
  ]);

  // 13. Notifications State
  readonly notifications = signal<Notification[]>([
    {
      id: 'notif-1',
      user_id: 'u-101',
      title: 'New Message from Google',
      message: 'Ananya Roy sent you a message regarding Senior Full Stack Engineer.',
      type: 'new_message',
      read: false,
      created_at: '10:30 AM',
      link_route: '/job-seeker/messages',
    },
    {
      id: 'notif-2',
      user_id: 'u-101',
      title: 'Interview Scheduled',
      message: 'Microsoft scheduled a Technical System Design Interview for Oct 8, 3:00 PM.',
      type: 'interview',
      read: false,
      created_at: 'Yesterday',
      link_route: '/job-seeker/interviews',
    },
    {
      id: 'notif-3',
      user_id: 'u-101',
      title: 'Application Status Updated',
      message: 'Your application for Google India has been Shortlisted!',
      type: 'application_update',
      read: true,
      created_at: 'Oct 4',
      link_route: '/job-seeker/applications',
    },
    {
      id: 'notif-4',
      user_id: 'u-101',
      title: 'It\'s a Match!',
      message: 'You matched with Google India for Senior Full Stack Engineer (96% Match).',
      type: 'new_match',
      read: true,
      created_at: 'Oct 4',
      link_route: '/job-seeker/matches',
    },
    {
      id: 'notif-5',
      user_id: 'u-101',
      title: 'Job Recommendation',
      message: 'Stripe India posted a new role matching your skills: Staff UI Platform Engineer.',
      type: 'job_recommendation',
      read: true,
      created_at: 'Oct 3',
      link_route: '/job-seeker/swipe',
    },
  ]);

  // Computed signals
  readonly unreadNotificationCount = computed(() => {
    return this.notifications().filter((n) => !n.read).length;
  });

  readonly unreadMessageCount = computed(() => {
    return this.conversations().reduce((acc, c) => acc + (c.unread_count || 0), 0);
  });

  readonly availableDeckJobs = computed(() => {
    const swiped = this.swipedJobIds();
    return this.jobs().filter((j) => !swiped.has(j.id));
  });

  // Action Methods
  updatePersonalProfile(data: Partial<Profile> & Partial<JobSeekerProfile>) {
    this.profile.update((p) => {
      const updated = {
        ...p,
        full_name: data.full_name ?? p.full_name,
        phone: data.phone ?? p.phone,
        avatar_url: data.avatar_url !== undefined ? data.avatar_url : p.avatar_url,
        updated_at: new Date().toISOString(),
      };
      try {
        localStorage.setItem('hireswipe_job_seeker_profile', JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving profile to localStorage', e);
      }
      return updated;
    });

    this.jobSeekerProfile.update((jsp) => ({
      ...jsp,
      location: data.location ?? jsp.location,
      city: data.city ?? jsp.city,
      state: data.state ?? jsp.state,
      country: data.country ?? jsp.country,
    }));
    this.recalculateProfileCompletion();
  }

  updateProfessionalProfile(data: Partial<JobSeekerProfile>) {
    this.jobSeekerProfile.update((jsp) => ({
      ...jsp,
      ...data,
    }));
    this.recalculateProfileCompletion();
  }

  addEducation(edu: Omit<Education, 'id' | 'job_seeker_profile_id'>) {
    const newEdu: Education = {
      ...edu,
      id: 'edu-' + Date.now(),
      job_seeker_profile_id: this.jobSeekerProfile().id,
    };
    this.educationList.update((list) => [newEdu, ...list]);
    this.recalculateProfileCompletion();
  }

  updateEducation(id: string, eduData: Partial<Education>) {
    this.educationList.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...eduData } : item))
    );
  }

  deleteEducation(id: string) {
    this.educationList.update((list) => list.filter((item) => item.id !== id));
    this.recalculateProfileCompletion();
  }

  addExperience(exp: Omit<Experience, 'id' | 'job_seeker_profile_id'>) {
    const newExp: Experience = {
      ...exp,
      id: 'exp-' + Date.now(),
      job_seeker_profile_id: this.jobSeekerProfile().id,
    };
    this.experienceList.update((list) => [newExp, ...list]);
    this.recalculateProfileCompletion();
  }

  updateExperience(id: string, expData: Partial<Experience>) {
    this.experienceList.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...expData } : item))
    );
  }

  deleteExperience(id: string) {
    this.experienceList.update((list) => list.filter((item) => item.id !== id));
    this.recalculateProfileCompletion();
  }

  addUserSkill(skillName: string, proficiency: JobSeekerSkill['proficiency_level'], yoe: number) {
    const existing = this.userSkills().find((s) => s.skill_name.toLowerCase() === skillName.toLowerCase());
    if (existing) return;

    const newSkill: JobSeekerSkill = {
      id: 'jsk-' + Date.now(),
      job_seeker_profile_id: this.jobSeekerProfile().id,
      skill_id: 'sk-' + Date.now(),
      skill_name: skillName,
      proficiency_level: proficiency,
      years_of_experience: yoe,
    };
    this.userSkills.update((skills) => [...skills, newSkill]);
    this.recalculateProfileCompletion();
  }

  removeUserSkill(id: string) {
    this.userSkills.update((skills) => skills.filter((s) => s.id !== id));
    this.recalculateProfileCompletion();
  }

  updateUserSkill(id: string, proficiency: JobSeekerSkill['proficiency_level'], yoe: number) {
    this.userSkills.update((skills) =>
      skills.map((s) => (s.id === id ? { ...s, proficiency_level: proficiency, years_of_experience: yoe } : s))
    );
  }

  uploadResume(fileName: string, fileSize: string) {
    const isFirst = this.resumes().length === 0;
    const newResume: Resume = {
      id: 'res-' + Date.now(),
      job_seeker_profile_id: this.jobSeekerProfile().id,
      file_name: fileName,
      file_size: fileSize,
      file_type: 'application/pdf',
      file_url: '#',
      is_primary: isFirst,
      uploaded_at: new Date().toISOString(),
    };
    this.resumes.update((resList) => [newResume, ...resList]);
    this.recalculateProfileCompletion();
  }

  setPrimaryResume(id: string) {
    this.resumes.update((resList) =>
      resList.map((r) => ({ ...r, is_primary: r.id === id }))
    );
  }

  deleteResume(id: string) {
    this.resumes.update((resList) => {
      const filtered = resList.filter((r) => r.id !== id);
      if (filtered.length > 0 && !filtered.some((r) => r.is_primary)) {
        filtered[0].is_primary = true;
      }
      return filtered;
    });
    this.recalculateProfileCompletion();
  }

  updatePreferences(prefData: Partial<JobSeekerPreference>) {
    this.preferences.update((p) => ({ ...p, ...prefData }));
    this.recalculateProfileCompletion();
  }

  completeOnboarding() {
    this.jobSeekerProfile.update((jsp) => ({
      ...jsp,
      onboarding_completed: true,
      profile_completion_pct: 100,
    }));
  }

  swipeJob(job: Job, direction: 'like' | 'pass'): { isMatch: boolean; matchObj?: Match } {
    this.swipedJobIds.update((set) => new Set(set).add(job.id));

    if (direction === 'like') {
      const newMatch: Match = {
        id: 'match-' + Date.now(),
        job_seeker_profile_id: this.jobSeekerProfile().id,
        job_id: job.id,
        company_id: job.company_id,
        match_date: new Date().toISOString(),
        status: 'active',
        company_name: job.company_name,
        company_logo: job.company_logo,
        job_title: job.title,
        job_location: job.location,
        match_score: job.match_score,
      };

      this.matches.update((mList) => [newMatch, ...mList]);

      // Create application
      const newApp: Application = {
        id: 'app-' + Date.now(),
        job_seeker_profile_id: this.jobSeekerProfile().id,
        job_id: job.id,
        company_id: job.company_id,
        company_name: job.company_name,
        company_logo: job.company_logo,
        job_title: job.title,
        job_location: job.location,
        salary_range: job.salary_display,
        status: 'pending',
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status_history: [
          {
            id: 'ash-' + Date.now(),
            application_id: 'app-' + Date.now(),
            status: 'pending',
            comment: 'Applied via HireSwipe instant match',
            changed_at: new Date().toISOString(),
          },
        ],
      };
      this.applications.update((aList) => [newApp, ...aList]);

      // Add Notification
      const newNotif: Notification = {
        id: 'notif-' + Date.now(),
        user_id: this.profile().user_id,
        title: "It's a Match!",
        message: `You matched with ${job.company_name} for ${job.title} (${job.match_score} Match).`,
        type: 'new_match',
        read: false,
        created_at: 'Just now',
        link_route: '/job-seeker/matches',
      };
      this.notifications.update((nList) => [newNotif, ...nList]);

      return { isMatch: true, matchObj: newMatch };
    }

    return { isMatch: false };
  }

  saveJob(job: Job) {
    if (this.savedJobs().some((sj) => sj.job_id === job.id)) return;
    const newSaved: SavedJob = {
      id: 'sj-' + Date.now(),
      job_seeker_profile_id: this.jobSeekerProfile().id,
      job_id: job.id,
      saved_at: new Date().toISOString(),
      job_title: job.title,
      company_name: job.company_name,
      company_logo: job.company_logo,
      location: job.location,
      salary_range: job.salary_display,
      employment_type: job.employment_type,
    };
    this.savedJobs.update((sList) => [newSaved, ...sList]);
  }

  removeSavedJob(savedJobId: string) {
    this.savedJobs.update((sList) => sList.filter((s) => s.id !== savedJobId));
  }

  sendMessage(conversationId: string, text: string, attachments?: Message['attachments']) {
    if (!text.trim() && (!attachments || attachments.length === 0)) return;

    const newMsg: Message = {
      id: 'msg-' + Date.now(),
      conversation_id: conversationId,
      sender_id: this.profile().user_id,
      sender_name: this.profile().full_name,
      is_job_seeker: true,
      text: text,
      attachments: attachments,
      read_state: true,
      created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.messages.update((dict) => {
      const current = dict[conversationId] || [];
      return {
        ...dict,
        [conversationId]: [...current, newMsg],
      };
    });

    this.conversations.update((cList) =>
      cList.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              last_message_snippet: text || (attachments ? 'Sent an attachment' : ''),
              last_message_at: 'Just now',
              updated_at: new Date().toISOString(),
            }
          : c
      )
    );
  }

  markConversationRead(conversationId: string) {
    this.conversations.update((cList) =>
      cList.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
    );
  }

  withdrawApplication(applicationId: string) {
    this.applications.update((apps) =>
      apps.map((a) => {
        if (a.id === applicationId) {
          const now = new Date().toISOString();
          const history = a.status_history || [];
          return {
            ...a,
            status: 'withdrawn',
            updated_at: now,
            status_history: [
              ...history,
              {
                id: 'ash-' + Date.now(),
                application_id: a.id,
                status: 'withdrawn',
                comment: 'Application withdrawn by candidate',
                changed_at: now,
              },
            ],
          };
        }
        return a;
      })
    );
  }

  updateInterviewNotes(interviewId: string, notes: string) {
    this.interviews.update((ints) =>
      ints.map((i) => (i.id === interviewId ? { ...i, notes } : i))
    );
  }

  markNotificationRead(notificationId: string) {
    this.notifications.update((nList) =>
      nList.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }

  markAllNotificationsRead() {
    this.notifications.update((nList) => nList.map((n) => ({ ...n, read: true })));
  }

  recalculateProfileCompletion() {
    let score = 0;
    const jsp = this.jobSeekerProfile();
    const prof = this.profile();

    if (prof.full_name && prof.phone) score += 15;
    if (jsp.headline && jsp.bio) score += 20;
    if (this.educationList().length > 0) score += 15;
    if (this.experienceList().length > 0) score += 20;
    if (this.userSkills().length >= 3) score += 15;
    if (this.resumes().length > 0) score += 15;

    this.jobSeekerProfile.update((item) => ({
      ...item,
      profile_completion_pct: Math.min(100, score),
    }));
  }
}
