import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessagesService, CompanyConversation, CompanyMessage } from './messages.service';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { environment } from '../../../environments/environment';

/** Self-referential query stub that resolves to `result` when awaited. */
function makeQuery(result: { data: any; error: any }) {
  const q: any = {};
  const chainable = [
    'select',
    'eq',
    'neq',
    'order',
    'limit',
    'insert',
    'update',
    'delete',
    'maybeSingle',
    'single',
  ];
  for (const method of chainable) {
    q[method] = vi.fn(() => q);
  }
  q.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return q;
}

describe('MessagesService — Company Backend Integration Tests', () => {
  let service: MessagesService;
  let httpMock: HttpTestingController;
  let mockAuthService: any;
  let mockSupabaseService: any;
  let mockChannel: any;

  const apiUrl = environment.apiUrl || 'http://localhost:3000/api';
  const conversationId = '11111111-1111-1111-1111-111111111111';
  const candidateId = '22222222-2222-2222-2222-222222222222';
  const jobId = '33333333-3333-3333-3333-333333333333';

  const dummyConversation = {
    id: conversationId,
    match_id: '44444444-4444-4444-4444-444444444444',
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-05T10:30:00.000Z',
    company_id: '55555555-5555-4555-8555-555555555555',
    job_seeker_id: '66666666-6666-4666-8666-666666666666',
    job: { id: jobId, title: 'Senior Frontend Engineer', location: 'Bengaluru, India' },
    candidate: {
      id: candidateId,
      full_name: 'Aarav Patel',
      avatar_url: 'https://cdn.test/a.png',
      headline: 'Angular expert',
    },
    participant_ids: ['recruiter-1', candidateId],
    last_message: {
      id: 'm-2',
      message: 'Tomorrow at 3pm works for us.',
      sender_id: 'recruiter-1',
      created_at: '2026-10-05T10:30:00.000Z',
    },
    last_message_at: '2026-10-05T10:30:00.000Z',
    unread_count: 1,
  } as unknown as CompanyConversation;

  const dummyMessage = {
    id: 'm-3',
    conversation_id: conversationId,
    sender_id: 'recruiter-1',
    message: 'See you tomorrow!',
    message_type: 'text',
    is_read: true,
    created_at: '2026-10-05T11:00:00.000Z',
    profiles: { id: 'recruiter-1', full_name: 'Recruiter', avatar_url: null, role: 'company' },
  } as unknown as CompanyMessage;

  beforeEach(() => {
    TestBed.resetTestingModule();

    mockAuthService = {
      getAccessToken: vi.fn().mockResolvedValue('mock-access-token-xyz'),
      getCurrentUserId: vi.fn().mockReturnValue('recruiter-1'),
    };

    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };

    mockSupabaseService = {
      client: {
        from: vi.fn().mockReturnValue(makeQuery({ data: [], error: null })),
        channel: vi.fn().mockReturnValue(mockChannel),
        removeChannel: vi.fn(),
        storage: {
          from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: null }),
            getPublicUrl: vi.fn().mockReturnValue({
              data: { publicUrl: 'https://cdn.test/message-attachments/1/file.pdf' },
            }),
          }),
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MessagesService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    });

    service = TestBed.inject(MessagesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  describe('GET /api/company/conversations', () => {
    it('retrieves the conversations with Bearer token', async () => {
      const promise = service.getCompanyConversations();
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', conversations: [dummyConversation] });
      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0].candidate?.full_name).toBe('Aarav Patel');
      expect(result[0].unread_count).toBe(1);
    });

    it('passes job and candidate filters as query parameters', async () => {
      const promise = service.getCompanyConversations({ jobId, candidateId });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(
        `${apiUrl}/company/conversations?jobId=${jobId}&candidateId=${candidateId}`
      );
      expect(req.request.method).toBe('GET');

      req.flush({ status: 'ok', conversations: [] });
      await promise;
    });

    it('fails closed and returns an empty list on 401 Unauthorized', async () => {
      const promise = service.getCompanyConversations();
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations`);
      req.flush(
        { error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
        { status: 401, statusText: 'Unauthorized' }
      );

      const result = await promise;
      expect(result).toEqual([]);
      expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    });

    it('fails closed and returns an empty list on 403 Forbidden', async () => {
      const promise = service.getCompanyConversations();
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'Not an active member of this company' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(result).toEqual([]);
      expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    });

    it('falls back to the direct Supabase query when the backend is unreachable', async () => {
      const promise = service.getCompanyConversations();
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations`);
      req.error(new ProgressEvent('Network error'));

      const result = await promise;
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('conversation_members');
      expect(result).toBeDefined();
    });
  });

  describe('GET /api/company/conversations/:conversationId', () => {
    it('retrieves the conversation with its messages', async () => {
      const promise = service.getCompanyConversation(conversationId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations/${conversationId}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', conversation: dummyConversation, messages: [dummyMessage] });
      const result = await promise;
      expect(result?.conversation.id).toBe(conversationId);
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0].message).toBe('See you tomorrow!');
    });

    it('returns null when the conversation is not found (404)', async () => {
      const promise = service.getCompanyConversation(conversationId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations/${conversationId}`);
      req.flush(
        { error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' } },
        { status: 404, statusText: 'Not Found' }
      );

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('POST /api/company/conversations/:conversationId/messages', () => {
    it('sends the message and returns the stored record', async () => {
      const promise = service.sendCompanyMessage(conversationId, 'See you tomorrow!');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations/${conversationId}/messages`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({ message: 'See you tomorrow!', message_type: 'text' });
      // the sender is the authenticated caller, never a client value
      expect(req.request.body).not.toHaveProperty('sender_id');

      req.flush({ status: 'ok', message: dummyMessage }, { status: 201, statusText: 'Created' });
      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.data?.id).toBe('m-3');
    });

    it('sends a file message type', async () => {
      const promise = service.sendCompanyMessage(conversationId, 'https://cdn.test/file.pdf', 'file');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations/${conversationId}/messages`);
      expect(req.request.body.message_type).toBe('file');

      req.flush({ status: 'ok', message: dummyMessage }, { status: 201, statusText: 'Created' });
      await promise;
    });

    it('returns a structured error when the backend rejects the message', async () => {
      const promise = service.sendCompanyMessage(conversationId, 'hi');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations/${conversationId}/messages`);
      req.flush(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } },
        { status: 400, statusText: 'Bad Request' }
      );

      const result = await promise;
      expect(result.data).toBeNull();
      expect(result.error).toBe('Invalid request body');
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('does not report a message as sent when the network fails', async () => {
      const promise = service.sendCompanyMessage(conversationId, 'hi');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/conversations/${conversationId}/messages`);
      req.error(new ProgressEvent('Network error'));

      const result = await promise;
      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
      // no local fallback may fabricate a sent message
      expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    });
  });

  describe('sendCompanyFileMessage', () => {
    it('uploads to the conversation folder and creates the file message', async () => {
      const promise = service.sendCompanyFileMessage(conversationId, new File(['x'], 'prep.pdf'));
      await new Promise((r) => setTimeout(r, 5));

      expect(mockSupabaseService.client.storage.from).toHaveBeenCalledWith('message-attachments');

      const req = httpMock.expectOne(`${apiUrl}/company/conversations/${conversationId}/messages`);
      expect(req.request.body.message_type).toBe('file');
      expect(req.request.body.message).toContain('message-attachments');

      req.flush({ status: 'ok', message: dummyMessage }, { status: 201, statusText: 'Created' });
      const result = await promise;
      expect(result.error).toBeNull();
    });
  });

  describe('Candidate-side operations (Direct Supabase)', () => {
    it('preserves getConversations for the candidate side', async () => {
      const result = await service.getConversations('seeker-1');
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('conversation_members');
      expect(result).toBeDefined();
    });

    it('preserves getMessages for the candidate side', async () => {
      const result = await service.getMessages(conversationId);
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('messages');
      expect(result).toBeDefined();
    });

    it('preserves sendMessage for the candidate side', async () => {
      const result = await service.sendMessage(conversationId, 'seeker-1', 'hello');
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('messages');
      expect(result.error).toBeNull();
    });

    it('preserves markConversationRead for the candidate side', async () => {
      await service.markConversationRead(conversationId);
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('messages');
    });
  });

  describe('Realtime subscription', () => {
    it('subscribes to the messages of a conversation and removes the channel on unsubscribe', () => {
      const onMessage = vi.fn();
      const unsubscribe = service.subscribeToMessages(conversationId, onMessage);

      expect(mockSupabaseService.client.channel).toHaveBeenCalledWith(`messages:${conversationId}`);
      expect(mockChannel.on).toHaveBeenCalled();
      expect(mockChannel.subscribe).toHaveBeenCalled();

      unsubscribe();
      expect(mockSupabaseService.client.removeChannel).toHaveBeenCalledWith(mockChannel);
    });
  });
});
