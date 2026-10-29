import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { OnboardingComponent } from './onboarding.component';
import { CompanyDataService } from '../services/company-data.service';

describe('Company OnboardingComponent — Integration Flow & Progression Tests', () => {
  let component: OnboardingComponent;
  let mockDataService: any;
  let mockRouter: any;

  beforeEach(() => {
    TestBed.resetTestingModule();

    mockDataService = {
      currentCompany: null,
      currentRecruiterProfile: {
        id: 'rec-1',
        email: 'recruiter@acme.test',
        full_name: 'Jane Doe',
      },
      company$: of(null),
      calculateCompanyCompletion: vi.fn().mockReturnValue(80),
      createCompany: vi.fn().mockResolvedValue({ companyId: 'new-comp-123', error: null }),
      ensureCompanyForOnboarding: vi.fn().mockResolvedValue({ error: null }),
      updateCompanyProfile: vi.fn().mockResolvedValue({ error: null }),
      updateRecruiterProfile: vi.fn().mockResolvedValue({ error: null }),
      uploadCompanyLogo: vi.fn().mockResolvedValue({ error: null }),
      reloadCompany: vi.fn().mockResolvedValue(undefined),
      setOnboardingCompleted: vi.fn().mockResolvedValue({ error: null }),
      isOnboardingCompleted: vi.fn().mockReturnValue(false),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [
        { provide: CompanyDataService, useValue: mockDataService },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
    component.ngOnInit();

    // Fill in valid form data
    component.step1Form.patchValue({
      name: 'Acme Technologies',
      industry: 'Software & Cloud Solutions',
      size: '11-50',
      founded_year: 2022,
      website: 'https://acme.test',
      email: 'info@acme.test',
      phone: '+1 555-0100',
      location: 'San Francisco, CA',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
    });

    component.step2Form.patchValue({
      description: 'Building next-generation distributed systems for modern web.',
      culture: 'Transparent and fast-paced.',
      mission: 'Empower developers globally.',
      valuesInput: 'Integrity, Speed, Innovation',
    });

    component.step4Form.patchValue({
      full_name: 'Jane Doe',
      role: 'owner',
      email: 'recruiter@acme.test',
      phone: '+1 555-0199',
    });
  });

  afterEach(() => {
    component.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('Scenario 1: on a fresh onboarding session, clicking steps 2-6 does not allow skipping step 1', () => {
    component.currentStep = 1;
    // Clear completion state to simulate fresh session
    (component as any)._completedSteps.set(new Set<number>());

    // Try clicking future dots 2, 3, 4, 5, 6
    component.goToStep(2);
    expect(component.currentStep).toBe(1);

    component.goToStep(3);
    expect(component.currentStep).toBe(1);

    component.goToStep(4);
    expect(component.currentStep).toBe(1);

    component.goToStep(5);
    expect(component.currentStep).toBe(1);

    component.goToStep(6);
    expect(component.currentStep).toBe(1);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('Scenario 2: clicking Next on step 1 with missing or whitespace-only fields displays errors and stays on step 1', async () => {
    component.currentStep = 1;
    component.step1Form.patchValue({ name: '   ' }); // whitespace only

    await component.nextStep();

    expect(component.currentStep).toBe(1);
    expect(component.errorMessage).toBeTruthy();
    expect(mockDataService.ensureCompanyForOnboarding).not.toHaveBeenCalled();
    expect(mockDataService.updateCompanyProfile).not.toHaveBeenCalled();
  });

  it('Scenario 3: completing step 1 validly persists data and advances to step 2', async () => {
    component.currentStep = 1;

    await component.nextStep();

    expect(mockDataService.ensureCompanyForOnboarding).toHaveBeenCalled();
    expect(mockDataService.updateCompanyProfile).toHaveBeenCalled();
    expect(component.isStepCompleted(1)).toBe(true);
    expect(component.currentStep).toBe(2);
  });

  it('Scenario 4: sequential progression works through steps 2, 3, 4, 5, and 6', async () => {
    // Complete Step 1
    component.currentStep = 1;
    await component.nextStep();
    expect(component.currentStep).toBe(2);

    // Complete Step 2
    await component.nextStep();
    expect(component.isStepCompleted(2)).toBe(true);
    expect(component.currentStep).toBe(3);

    // Complete Step 3
    await component.nextStep();
    expect(component.isStepCompleted(3)).toBe(true);
    expect(component.currentStep).toBe(4);

    // Complete Step 4
    await component.nextStep();
    expect(component.isStepCompleted(4)).toBe(true);
    expect(component.currentStep).toBe(5);

    // Complete Step 5 (Review)
    await component.nextStep();
    expect(component.isStepCompleted(5)).toBe(true);
    expect(component.currentStep).toBe(6);
  });

  it('Scenario 5: clicking step 6 directly never opens the dashboard', () => {
    component.currentStep = 1;
    (component as any)._completedSteps.set(new Set<number>());

    component.goToStep(6);
    expect(component.currentStep).toBe(1);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('Scenario 6: returning to an earlier step and changing required data triggers revalidation locking forward navigation', async () => {
    // Complete steps 1 and 2
    component.currentStep = 1;
    await component.nextStep();
    await component.nextStep();
    expect(component.currentStep).toBe(3);

    // Navigate back to Step 1
    component.goToStep(1);
    expect(component.currentStep).toBe(1);

    // Invalidate Step 1 by clearing company name
    component.step1Form.patchValue({ name: '' });

    // Now forward navigation to Step 2 or 3 must be blocked
    component.goToStep(2);
    expect(component.currentStep).toBe(1);

    component.goToStep(3);
    expect(component.currentStep).toBe(1);
  });

  it('Scenario 7: failed saves or API errors do not mark a step complete and keep user on the step', async () => {
    component.currentStep = 1;
    mockDataService.updateCompanyProfile.mockResolvedValueOnce({
      error: 'Database connection failed',
    });

    await component.nextStep();

    expect(component.currentStep).toBe(1);
    expect(component.isStepCompleted(1)).toBe(false);
    expect(component.errorMessage).toContain('Database connection failed');
  });

  it('Scenario 8: completing all six steps successfully persists the data and opens Company Dashboard', async () => {
    // Progress through to step 6
    component.currentStep = 1;
    await component.nextStep(); // step 2
    await component.nextStep(); // step 3
    await component.nextStep(); // step 4
    await component.nextStep(); // step 5
    await component.nextStep(); // step 6
    expect(component.currentStep).toBe(6);

    // Click Go to Dashboard on Step 6
    await component.finishAndGoToDashboard();

    expect(mockDataService.setOnboardingCompleted).toHaveBeenCalledWith(true);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
  });

  it('Scenario 9: finishOnboarding handles creation failure gracefully and displays error message', async () => {
    mockDataService.currentCompany = null;
    mockDataService.ensureCompanyForOnboarding.mockResolvedValueOnce({
      error: 'Invalid industry specified',
    });

    await component.finishOnboarding();

    expect(component.errorMessage).toBe('Invalid industry specified');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('Scenario 10: finishOnboarding displays error and does not navigate if setOnboardingCompleted fails', async () => {
    mockDataService.setOnboardingCompleted.mockResolvedValueOnce({
      error: 'Failed to update onboarding flag',
    });

    await component.finishOnboarding();

    expect(component.errorMessage).toBe('Failed to update onboarding flag');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });
});
