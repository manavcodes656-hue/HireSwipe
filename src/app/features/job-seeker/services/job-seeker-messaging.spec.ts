import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { JobSeekerService, mapConversationRow, mapMessageRow } from './job-seeker.service';
import { JobSeekerProfileService } from '../../../core/services/job-seeker-profile.service';
import { ProfileService } from '../../../core/services/profile.service';
import { AuthService } from '../../../core/services/auth.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { MatchingService } from '../../../core/services/matching.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { MessagesService } from '../../../core/services/messages.service';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const memberRow = {
  conversation_id: CONV_ID,
  conversations: {
    id: CONV_ID,
    match_id: MATCH_ID,
    updated_at: '2026-10-29T10:00:00Z',
    matches: { job_id: 'j1', jobs: { title: 'Angular Engineer' }, companies: { name: 'Acme', logo_url: 'https://x/logo.png' } },
  },
};

const messageRow = (over: any = {}) => ({
  id: 'm-1',
  conversation_id: CONV_ID,
  sender_id: 'recruiter-1',
  message: 'Hello from Acme',
  message_type: 'text',
  created_at: '2026-10-29T10:05:00Z',
  profiles: { full_name: 'Rita Recruiter', avatar_url: null },
  ...over,
});

describe('JobSeekerService messaging (real conversations)', () => {
  let messagesService: any;
  let auth: any;
  let service: JobSeekerService;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesService = {
      getConversations: vi.fn().mockResolvedValue([]),
      getMessages: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue({ data: messageRow({ id: 'm-sent', sender_id: USER_ID, message: 'Hi' }), error: null }),
      subscribeToMessages: vi.fn().mockReturnValue(vi.fn()),
    };
    // No session while the service is constructed, so it does not start loading the profile.
    auth = { getCurrentUserId: vi.fn().mockReturnValue(null), loading: signal(false) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        JobSeekerService,
        { provide: AuthService, useValue: auth },
        { provide: ProfileService, useValue: {} },
        { provide: JobSeekerProfileService, useValue: {} },
        { provide: JobsService, useValue: {} },
        { provide: ApplicationsService, useValue: {} },
        { provide: MatchingService, useValue: {} },
        { provide: InterviewsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: MessagesService, useValue: messagesService },
      ],
    });
    service = TestBed.inject(JobSeekerService);
    auth.getCurrentUserId.mockReturnValue(USER_ID);
  });

  afterEach(() => {
    service.closeConversation();
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('maps real conversations (company, job, match id) and replaces the seeded demo ones', async () => {
      messagesService.getConversations.mockResolvedValue([memberRow]);

      await service.loadConversations();

      expect(messagesService.getConversations).toHaveBeenCalledWith(USER_ID);
      expect(service.conversations()).toEqual([
        expect.objectContaining({ id: CONV_ID, match_id: MATCH_ID, company_name: 'Acme', job_title: 'Angular Engineer' }),
      ]);
    });

    it('keeps the seeded demo conversations while the candidate has no real conversation', async () => {
      const seeded = service.conversations();

      await service.loadConversations();

      expect(service.conversations()).toBe(seeded);
    });

    it('does nothing without a session and ignores rows without a conversation', async () => {
      auth.getCurrentUserId.mockReturnValue(null);
      await service.loadConversations();
      expect(messagesService.getConversations).not.toHaveBeenCalled();

      expect(mapConversationRow({ conversations: null })).toBeNull();
    });

    it('loads and maps stored messages, marking the candidate\'s own', async () => {
      messagesService.getConversations.mockResolvedValue([memberRow]);
      await service.loadConversations();
      messagesService.getMessages.mockResolvedValue([messageRow(), messageRow({ id: 'm-2', sender_id: USER_ID, message: 'Thanks!' })]);

      await service.loadMessages(CONV_ID);

      const list = service.messages()[CONV_ID];
      expect(list.map((m) => [m.id, m.is_job_seeker, m.text])).toEqual([
        ['m-1', false, 'Hello from Acme'],
        ['m-2', true, 'Thanks!'],
      ]);
      expect(list[0].sender_name).toBe('Rita Recruiter');
      expect(service.conversations()[0].last_message_snippet).toBe('Thanks!');
    });

    it('does not query the database for a seeded demo conversation', async () => {
      await service.loadMessages('conv-1');
      expect(messagesService.getMessages).not.toHaveBeenCalled();
    });

    it('maps a message row without a sender profile', () => {
      expect(mapMessageRow({ id: 'x', conversation_id: 'c', sender_id: 'u', message: 'hi', created_at: null }, 'u').is_job_seeker).toBe(true);
    });
  });

  describe('sending', () => {
    it('stores the message first, then shows it, in a real conversation', async () => {
      const res = await service.sendMessage(CONV_ID, '  Hi  ');

      expect(res).toEqual({ ok: true });
      expect(messagesService.sendMessage).toHaveBeenCalledWith(CONV_ID, USER_ID, 'Hi');
      expect(service.messages()[CONV_ID].map((m) => m.id)).toEqual(['m-sent']);
      expect(service.messages()[CONV_ID][0].is_job_seeker).toBe(true);
    });

    it('shows nothing and reports an error when the database refuses the message', async () => {
      messagesService.sendMessage.mockResolvedValue({ data: null, error: 'new row violates row-level security policy' });

      const res = await service.sendMessage(CONV_ID, 'Hi');

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Could not send/);
      expect(res.error).not.toMatch(/row-level/);
      expect(service.messages()[CONV_ID]).toBeUndefined();
    });

    it('does not claim to send attachments in a real conversation', async () => {
      const res = await service.sendMessage(CONV_ID, 'See attached', [{ name: 'cv.pdf', url: '#', type: 'application/pdf' }]);

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/attachments are not available/i);
      expect(messagesService.sendMessage).not.toHaveBeenCalled();
    });

    it('needs a session and ignores empty messages', async () => {
      expect((await service.sendMessage(CONV_ID, '   ')).ok).toBe(false);
      auth.getCurrentUserId.mockReturnValue(null);
      expect((await service.sendMessage(CONV_ID, 'Hi')).error).toMatch(/sign in/i);
      expect(messagesService.sendMessage).not.toHaveBeenCalled();
    });

    it('keeps the seeded demo conversations local-only, as before', async () => {
      const res = await service.sendMessage('conv-1', 'Hello demo');

      expect(res).toEqual({ ok: true });
      expect(messagesService.sendMessage).not.toHaveBeenCalled();
      expect(service.messages()['conv-1'].at(-1)?.text).toBe('Hello demo');
    });
  });

  describe('live updates', () => {
    it('loads the conversation, subscribes, and shows a message that arrives once even if it also arrives by polling', async () => {
      let onMessage!: (row: any) => void;
      messagesService.subscribeToMessages.mockImplementation((_id: string, cb: any) => {
        onMessage = cb;
        return vi.fn();
      });

      await service.openConversation(CONV_ID);
      expect(messagesService.getMessages).toHaveBeenCalledWith(CONV_ID);
      expect(messagesService.subscribeToMessages).toHaveBeenCalledWith(CONV_ID, expect.any(Function));

      onMessage(messageRow({ id: 'm-live' }));
      onMessage(messageRow({ id: 'm-live' }));

      expect(service.messages()[CONV_ID].map((m) => m.id)).toEqual(['m-live']);
    });

    it('polls while open and stops (and unsubscribes) when closed', async () => {
      vi.useFakeTimers();
      const unsubscribe = vi.fn();
      messagesService.subscribeToMessages.mockReturnValue(unsubscribe);

      await service.openConversation(CONV_ID);
      messagesService.getMessages.mockClear();
      await vi.advanceTimersByTimeAsync(5000);
      expect(messagesService.getMessages).toHaveBeenCalledTimes(1);

      service.closeConversation();
      await vi.advanceTimersByTimeAsync(15000);

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(messagesService.getMessages).toHaveBeenCalledTimes(1);
    });

    it('switching conversations closes the previous one; seeded conversations are never watched', async () => {
      const first = vi.fn();
      messagesService.subscribeToMessages.mockReturnValueOnce(first);

      await service.openConversation(CONV_ID);
      await service.openConversation('conv-1');

      expect(first).toHaveBeenCalledTimes(1);
      expect(messagesService.subscribeToMessages).toHaveBeenCalledTimes(1);
    });
  });
});
