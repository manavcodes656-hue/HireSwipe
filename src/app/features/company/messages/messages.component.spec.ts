import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MessagesComponent } from './messages.component';
import { CompanyDataService } from '../services/company-data.service';
import { Conversation, Message } from '../models/company.models';

describe('Company MessagesComponent — Company Messaging Flow Tests', () => {
  let component: MessagesComponent;
  let mockDataService: any;
  let unsubscribeSpy: ReturnType<typeof vi.fn>;

  const conversation: Conversation = {
    id: 'conv-1',
    match_id: 'match-1',
    candidate_id: 'cand-1',
    candidate_name: 'Aarav Patel',
    candidate_avatar: 'https://cdn.test/a.png',
    job_title: 'Senior Frontend Engineer',
    company_id: 'comp-1',
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-05T10:30:00.000Z',
    last_message: 'See you tomorrow!',
    last_message_at: '2026-10-05T10:30:00.000Z',
    unread_count: 1,
  } as Conversation;

  beforeEach(() => {
    TestBed.resetTestingModule();

    unsubscribeSpy = vi.fn();

    mockDataService = {
      conversations$: of([conversation]),
      messages$: of({ 'conv-1': [] as Message[] }),
      currentRecruiterProfile: { id: 'rec-1', full_name: 'Jane Doe' },
      loadMessages: vi.fn().mockResolvedValue({ error: null }),
      sendMessage: vi.fn().mockResolvedValue({ error: null }),
      sendFileMessage: vi.fn().mockResolvedValue({ error: null }),
      subscribeToMessages: vi.fn().mockReturnValue(unsubscribeSpy),
    };

    TestBed.configureTestingModule({
      imports: [MessagesComponent],
      providers: [{ provide: CompanyDataService, useValue: mockDataService }],
    });

    const fixture = TestBed.createComponent(MessagesComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  afterEach(() => {
    component.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('selects the first conversation and loads its messages', async () => {
    await Promise.resolve();

    expect(component.activeConversation?.id).toBe('conv-1');
    expect(mockDataService.loadMessages).toHaveBeenCalledWith('conv-1');
    expect(component.isLoading).toBe(false);
  });

  it('subscribes to the Realtime channel of the open conversation', async () => {
    await Promise.resolve();

    expect(mockDataService.subscribeToMessages).toHaveBeenCalledWith(
      'conv-1',
      expect.any(Function)
    );
  });

  it('removes the Realtime channel when the component is destroyed', async () => {
    await Promise.resolve();
    expect(unsubscribeSpy).not.toHaveBeenCalled();

    component.ngOnDestroy();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('closes the previous Realtime channel when another conversation is opened', async () => {
    await Promise.resolve();

    component.selectConversation({ ...conversation, id: 'conv-2' } as Conversation);

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(mockDataService.subscribeToMessages).toHaveBeenCalledWith(
      'conv-2',
      expect.any(Function)
    );
  });

  it('sends the message through the data service and clears the composer', async () => {
    await Promise.resolve();
    component.messageText = '  See you tomorrow!  ';

    await component.sendMessage();

    expect(mockDataService.sendMessage).toHaveBeenCalledWith('conv-1', 'See you tomorrow!');
    expect(component.messageText).toBe('');
    expect(component.errorMessage).toBeNull();
  });

  it('keeps the text and shows the error when sending fails', async () => {
    await Promise.resolve();
    mockDataService.sendMessage.mockResolvedValue({ error: 'Conversation not found' });
    component.messageText = 'hello';

    await component.sendMessage();

    expect(component.errorMessage).toBe('Conversation not found');
    expect(component.messageText).toBe('hello');
  });

  it('does not send an empty message', async () => {
    await Promise.resolve();
    component.messageText = '   ';

    await component.sendMessage();

    expect(mockDataService.sendMessage).not.toHaveBeenCalled();
  });

  it('appends a message that arrives over Realtime', async () => {
    await Promise.resolve();

    const realtimeCallback = mockDataService.subscribeToMessages.mock.calls[0][1];
    realtimeCallback({
      id: 'm-live',
      conversation_id: 'conv-1',
      sender_id: 'cand-1',
      message: 'Looking forward to it',
      message_type: 'text',
      is_read: false,
      created_at: '2026-10-05T12:00:00.000Z',
    });

    const thread = component.messagesMap['conv-1'];
    expect(thread).toHaveLength(1);
    expect(thread[0].sender_type).toBe('job_seeker');
    expect(thread[0].sender_name).toBe('Aarav Patel');
  });

  it('ignores a Realtime message that is already known', async () => {
    await Promise.resolve();

    const realtimeCallback = mockDataService.subscribeToMessages.mock.calls[0][1];
    const payload = {
      id: 'm-live',
      conversation_id: 'conv-1',
      sender_id: 'cand-1',
      message: 'Looking forward to it',
      message_type: 'text',
      is_read: false,
      created_at: '2026-10-05T12:00:00.000Z',
    };

    realtimeCallback(payload);
    realtimeCallback(payload);

    expect(component.messagesMap['conv-1']).toHaveLength(1);
  });
});
