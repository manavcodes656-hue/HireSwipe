import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { OnboardingComponent } from './onboarding.component';
import { CompanyDataService } from '../services/company-data.service';

describe('Company OnboardingComponent — Integration Flow Tests', () => {
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
      updateCompanyProfile: vi.fn().mockResolvedValue({ error: null }),
      updateRecruiterProfile: vi.fn().mockResolvedValue({ error: null }),
      reloadCompany: vi.fn().mockResolvedValue(undefined),
      setOnboardingCompleted: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
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

  it('should create new company, update profile, and navigate when company does not exist', async () => {
    mockDataService.currentCompany = null;

    await component.finishOnboarding();

    expect(mockDataService.createCompany).toHaveBeenCalledTimes(1);
    expect(mockDataService.createCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Technologies',
        company_size: '11-50',
        website: 'https://acme.test',
      })
    );
    expect(mockDataService.updateCompanyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding_completed: true,
        completion_percentage: 100,
      })
    );
    expect(mockDataService.updateRecruiterProfile).toHaveBeenCalled();
    expect(mockDataService.setOnboardingCompleted).toHaveBeenCalledWith(true);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
    expect(component.errorMessage).toBeNull();
  });

  it('should skip creation and only update profile when company already exists', async () => {
    mockDataService.currentCompany = { id: 'existing-comp-uuid', name: 'Acme Old' };

    await component.finishOnboarding();

    expect(mockDataService.createCompany).not.toHaveBeenCalled();
    expect(mockDataService.updateCompanyProfile).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
  });

  it('should handle creation failure gracefully and display error message', async () => {
    mockDataService.currentCompany = null;
    mockDataService.createCompany.mockResolvedValue({
      companyId: null,
      error: 'Invalid industry specified',
      code: 'VALIDATION_ERROR',
    });

    await component.finishOnboarding();

    expect(component.errorMessage).toBe('Invalid industry specified');
    expect(mockDataService.updateCompanyProfile).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should handle 409 COMPANY_EXISTS by reloading existing company and continuing update', async () => {
    mockDataService.currentCompany = null;
    mockDataService.createCompany.mockResolvedValue({
      companyId: null,
      error: 'This account already belongs to a company',
      code: 'COMPANY_EXISTS',
    });
    mockDataService.reloadCompany.mockImplementation(async () => {
      mockDataService.currentCompany = { id: 'reloaded-comp-123', name: 'Acme Technologies' };
    });

    await component.finishOnboarding();

    expect(mockDataService.reloadCompany).toHaveBeenCalledTimes(1);
    expect(mockDataService.updateCompanyProfile).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
  });

  it('should display error and not navigate if company update fails', async () => {
    mockDataService.currentCompany = { id: 'comp-1' };
    mockDataService.updateCompanyProfile.mockResolvedValue({
      error: 'Failed to save changes to the database',
    });

    await component.finishOnboarding();

    expect(component.errorMessage).toBe('Failed to save changes to the database');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });
});
