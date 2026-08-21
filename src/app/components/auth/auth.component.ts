import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

export type AuthRole = 'jobseeker' | 'company';
export type AuthMode = 'login' | 'signup';

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
export class AuthComponent implements OnInit {
  role: AuthRole = 'jobseeker';
  mode: AuthMode = 'login';

  loginForm!: FormGroup;
  signupForm!: FormGroup;

  submitted = false;
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForms();

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

    const formVal = this.currentForm.value;
    const roleName = this.role === 'jobseeker' ? 'Job Seeker' : 'Company';
    const actionName = this.mode === 'login' ? 'Signed in' : 'Account created';

    this.successMessage = `${actionName} successfully as ${roleName} (${formVal.email}). Form validation passed.`;
  }

  onGoogleAuth(): void {
    const roleName = this.role === 'jobseeker' ? 'Job Seeker' : 'Company';
    this.successMessage = `Google authentication initiated for ${roleName}. Ready for OAuth integration.`;
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
