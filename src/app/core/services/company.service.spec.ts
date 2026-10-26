import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CompanyService, CompanyRow } from './company.service';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { environment } from '../../../environments/environment';

describe('CompanyService — Backend Integration Tests', () => {
  let service: CompanyService;
  let httpMock: HttpTestingController;
  let mockAuthService: any;
  let mockSupabaseService: any;

  const apiUrl = environment.apiUrl || 'http://localhost:3000/api';
  const dummyCompany: CompanyRow = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Acme Technologies',
    industry: 'Software',
    company_size: '11-50',
    founded_year: 2022,
    website: 'https://acme.test',
    email: 'contact@acme.test',
    phone: '+1 555-0100',
    location: 'San Francisco, CA',
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    description: 'Leading innovations in software engineering.',
    logo_url: 'https://acme.test/logo.png',
    completion_percentage: 100,
    onboarding_completed: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.resetTestingModule();

    mockAuthService = {
      getAccessToken: vi.fn().mockResolvedValue('mock-access-token-xyz'),
      getCurrentUserId: vi.fn().mockReturnValue('user-uuid-123'),
    };

    mockSupabaseService = {
      client: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
              single: vi.fn().mockResolvedValue({ data: dummyCompany, error: null }),
            }),
          }),
        }),
        storage: {
          from: vi.fn(),
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CompanyService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    });

    service = TestBed.inject(CompanyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  describe('GET /api/company/profile', () => {
    it('should retrieve the user company profile and send the Bearer token', async () => {
      const promise = service.getCompanyProfile();
      await new Promise((r) => setTimeout(r, 5)); // flush microtask for getAuthHeaders

      const req = httpMock.expectOne(`${apiUrl}/company/profile`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({
        status: 'ok',
        userRole: 'company',
        membership: {
          id: 'mem-1',
          role: 'owner',
          company_id: dummyCompany.id,
          company: dummyCompany,
        },
        message: 'Company profile accessed',
      });

      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.membership?.company?.name).toBe('Acme Technologies');
      expect(result.membership?.role).toBe('owner');
    });

    it('should handle null membership when user has not yet created a company', async () => {
      const promise = service.getCompanyProfile();
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/profile`);
      req.flush({
        status: 'ok',
        userRole: 'company',
        membership: null,
        message: 'Authenticated company user has no active company membership',
      });

      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.membership).toBeNull();
    });

    it('should handle 401 Unauthorized from backend', async () => {
      const promise = service.getCompanyProfile();
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/profile`);
      req.flush(
        { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } },
        { status: 401, statusText: 'Unauthorized' }
      );

      const result = await promise;
      expect(result.error).toBe('Missing or invalid token');
      expect(result.code).toBe('UNAUTHORIZED');
      expect(result.membership).toBeNull();
    });
  });

  describe('POST /api/company/profile', () => {
    it('should send sanitized creation payload and return created company ID', async () => {
      const promise = service.createCompany('user-uuid-123', {
        name: 'Acme Technologies',
        size: '11-50', // tests mapping size -> company_size
        website: 'https://acme.test',
        description: 'Building modern systems',
        extra_unsupported_field: 'ignored',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/profile`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({
        name: 'Acme Technologies',
        company_size: '11-50',
        website: 'https://acme.test',
        description: 'Building modern systems',
      });

      req.flush(
        {
          status: 'ok',
          membership: {
            id: 'mem-1',
            role: 'owner',
            company_id: dummyCompany.id,
            company: dummyCompany,
          },
        },
        { status: 201, statusText: 'Created' }
      );

      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.companyId).toBe(dummyCompany.id);
    });

    it('should handle 409 COMPANY_EXISTS duplicate company conflict', async () => {
      const promise = service.createCompany('user-uuid-123', {
        name: 'Acme Technologies',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/profile`);
      req.flush(
        { error: { code: 'COMPANY_EXISTS', message: 'This account already belongs to a company' } },
        { status: 409, statusText: 'Conflict' }
      );

      const result = await promise;
      expect(result.companyId).toBeNull();
      expect(result.code).toBe('COMPANY_EXISTS');
      expect(result.error).toBe('This account already belongs to a company');
    });

    it('should handle 400 VALIDATION_ERROR', async () => {
      const promise = service.createCompany('user-uuid-123', {});
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/profile`);
      req.flush(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            fields: { name: 'is required' },
          },
        },
        { status: 400, statusText: 'Bad Request' }
      );

      const result = await promise;
      expect(result.companyId).toBeNull();
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toBe('Invalid request body');
    });
  });

  describe('PATCH /api/company/:companyId/profile', () => {
    it('should send sanitized update payload and return updated company', async () => {
      const promise = service.updateCompany(dummyCompany.id, {
        description: 'Updated description',
        onboarding_completed: true,
        completion_percentage: 100,
        unsupportedField: 'filtered out',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/${dummyCompany.id}/profile`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({
        description: 'Updated description',
        onboarding_completed: true,
        completion_percentage: 100,
      });

      req.flush({
        status: 'ok',
        company: { ...dummyCompany, description: 'Updated description' },
      });

      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.company?.description).toBe('Updated description');
    });

    it('should reject empty payloads before sending network request', async () => {
      const result = await service.updateCompany(dummyCompany.id, {
        unsupported1: 'abc',
        unsupported2: 123,
      });

      httpMock.expectNone(`${apiUrl}/company/${dummyCompany.id}/profile`);
      expect(result.error).toBe('No valid profile fields provided for update');
      expect(result.code).toBe('EMPTY_PAYLOAD');
    });

    it('should handle 403 FORBIDDEN when user lacks owner or admin company permissions', async () => {
      const promise = service.updateCompany(dummyCompany.id, {
        name: 'Unauthorized Change',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/${dummyCompany.id}/profile`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'Insufficient company role. Required: owner, admin' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(result.code).toBe('FORBIDDEN');
      expect(result.error).toBe('Insufficient company role. Required: owner, admin');
    });
  });
});
