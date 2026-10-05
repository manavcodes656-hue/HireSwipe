import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

export type AuthRole = 'jobseeker' | 'company';
export type AuthMode = 'login' | 'signup';

export interface CompanyCard {
  id: string;
  company: string;
  typeLabel: string;
  matchScore: string;
  roleTitle: string;
  location: string;
  employmentType: string;
  tags: string[];
  salary: string;
  logoType: 'google' | 'microsoft' | 'amazon' | 'meta' | 'apple';
}

export interface CandidateCard {
  id: string;
  name: string;
  initials: string;
  experience: string;
  matchScore: string;
  roleTitle: string;
  location: string;
  availability: string;
  tags: string[];
  salary: string;
  avatarColor: string;
}

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  if (password && confirmPassword && password !== confirmPassword) {
    control.get('confirmPassword')?.setErrors({ passwordMismatch: true });
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css',
})
export class AuthComponent implements OnInit, OnDestroy {
  role: AuthRole = 'jobseeker';
  mode: AuthMode = 'login';

  loginForm!: FormGroup;
  signupForm!: FormGroup;

  submitted = false;
  successMessage = '';

  // Stacked Card Rotation State
  activeCompanyIndex = 0;
  activeCandidateIndex = 0;
  readonly stackIndices = [0, 1, 2, 3, 4];
  private autoCycleTimer: any = null;

  get activeCardIndex(): number {
    return this.role === 'jobseeker' ? this.activeCompanyIndex : this.activeCandidateIndex;
  }

  companyCards: CompanyCard[] = [
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

  candidateCards: CandidateCard[] = [
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

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForms();
    this.startAutoCycle();

    this.route.queryParams.subscribe((params) => {
      if (params['role'] === 'company' || params['role'] === 'employer') {
        this.role = 'company';
      } else if (params['role'] === 'jobseeker' || params['role'] === 'candidate') {
        this.role = 'jobseeker';
      }

      if (params['mode'] === 'signup' || params['mode'] === 'register') {
        this.mode = 'signup';
      } else if (params['mode'] === 'login' || params['mode'] === 'signin') {
        this.mode = 'login';
      }
    });
  }

  ngOnDestroy(): void {
    this.stopAutoCycle();
  }

  startAutoCycle(): void {
    this.stopAutoCycle();
    this.autoCycleTimer = setInterval(() => {
      if (this.role === 'jobseeker') {
        this.nextCompanyCard();
      } else {
        this.nextCandidateCard();
      }
    }, 3800);
  }

  stopAutoCycle(): void {
    if (this.autoCycleTimer) {
      clearInterval(this.autoCycleTimer);
      this.autoCycleTimer = null;
    }
  }

  nextCompanyCard(): void {
    this.activeCompanyIndex = (this.activeCompanyIndex + 1) % this.companyCards.length;
  }

  nextCandidateCard(): void {
    this.activeCandidateIndex = (this.activeCandidateIndex + 1) % this.candidateCards.length;
  }

  getVisibleCompanyCards(): { card: CompanyCard; pos: number }[] {
    const total = this.companyCards.length;
    return [0, 1, 2].map((offset) => ({
      card: this.companyCards[(this.activeCompanyIndex + offset) % total],
      pos: offset,
    }));
  }

  getVisibleCandidateCards(): { card: CandidateCard; pos: number }[] {
    const total = this.candidateCards.length;
    return [0, 1, 2].map((offset) => ({
      card: this.candidateCards[(this.activeCandidateIndex + offset) % total],
      pos: offset,
    }));
  }

  private initForms(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      rememberMe: [false],
    });

    this.signupForm = this.fb.group(
      {
        fullName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
        termsAccepted: [true, [Validators.requiredTrue]],
      },
      { validators: passwordMatchValidator }
    );
  }

  setRole(newRole: AuthRole): void {
    if (this.role === newRole) return;
    this.role = newRole;
    this.submitted = false;
    this.successMessage = '';
    this.resetForms();
  }

  setMode(newMode: AuthMode): void {
    if (this.mode === newMode) return;
    this.mode = newMode;
    this.submitted = false;
    this.successMessage = '';
    this.resetForms();
  }

  private resetForms(): void {
    this.loginForm.reset({ rememberMe: false });
    this.signupForm.reset({ termsAccepted: true });
  }

  get currentForm(): FormGroup {
    return this.mode === 'login' ? this.loginForm : this.signupForm;
  }

  onSubmit(): void {
    this.submitted = true;
    this.successMessage = '';

    if (this.currentForm.invalid) {
      this.currentForm.markAllAsTouched();
      return;
    }

    // Navigate based on role + mode
    if (this.role === 'company') {
      if (this.mode === 'signup') {
        this.router.navigate(['/company/onboarding']);
      } else {
        this.router.navigate(['/company/dashboard']);
      }
    } else {
      // jobseeker flow (placeholder)
      this.router.navigate(['/']);
    }
  }

  onGoogleAuth(): void {
    if (this.role === 'company') {
      this.router.navigate(['/company/dashboard']);
    } else {
      this.router.navigate(['/']);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.currentForm.get(fieldName);
    return !!(field && field.invalid && (field.touched || this.submitted));
  }

  getFieldError(fieldName: string): string {
    const field = this.currentForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) {
      if (fieldName === 'fullName') {
        return this.role === 'jobseeker' ? 'Full name is required.' : 'Company name is required.';
      }
      if (fieldName === 'email') {
        return this.role === 'jobseeker' ? 'Email address is required.' : 'Work email is required.';
      }
      if (fieldName === 'password') return 'Password is required.';
      if (fieldName === 'confirmPassword') return 'Please confirm your password.';
      return 'This field is required.';
    }

    if (field.errors['email']) {
      return 'Please enter a valid email address.';
    }

    if (field.errors['minlength']) {
      const min = field.errors['minlength'].requiredLength;
      return `Minimum length is ${min} characters.`;
    }

    if (field.errors['passwordMismatch']) {
      return 'Passwords do not match.';
    }

    return 'Invalid input.';
  }
}
