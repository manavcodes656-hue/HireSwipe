import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { MessagesComponent } from './messages.component';
import { JobSeekerService } from '../services/job-seeker.service';

const CONV = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', match_id: 'match-1', company_name: 'Acme', job_title: 'Engineer', created_at: '', updated_at: '' };

describe('Job seeker MessagesComponent', () => {
  let service: any;

  const setup = async () => {
    service = {
      conversations: signal([CONV]),
      messages: signal({}),
      loadConversations: vi.fn().mockResolvedValue(undefined),
      openConversation: vi.fn().mockResolvedValue(undefined),
      closeConversation: vi.fn(),
      markConversationRead: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MessagesComponent],
      providers: [provideRouter([]), { provide: JobSeekerService, useValue: service }],
    });
    const fixture = TestBed.createComponent(MessagesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, component: fixture.componentInstance };
  };

  beforeEach(() => vi.restoreAllMocks());

  it('loads real conversations first, then opens the first one', async () => {
    const { component } = await setup();

    expect(service.loadConversations).toHaveBeenCalledTimes(1);
    expect(component.selectedConversationId()).toBe(CONV.id);
    expect(service.openConversation).toHaveBeenCalledWith(CONV.id);
  });

  it('clears the input only after the message was stored', async () => {
    const { component } = await setup();
    component.messageText.set('Hello');

    await component.sendMessage();

    expect(service.sendMessage).toHaveBeenCalledWith(CONV.id, 'Hello', undefined);
    expect(component.messageText()).toBe('');
    expect(component.sendError()).toBeNull();
  });

  it('keeps the text and shows the error when sending fails, and allows a retry', async () => {
    const { fixture, component } = await setup();
    service.sendMessage.mockResolvedValueOnce({ ok: false, error: 'Could not send your message. Check your connection and try again.' });
    component.messageText.set('Hello');

    await component.sendMessage();
    await fixture.whenStable();

    expect(component.messageText()).toBe('Hello');
    expect(fixture.nativeElement.textContent).toContain('Could not send your message');
    expect(component.sendPending()).toBe(false);

    await component.sendMessage();
    expect(service.sendMessage).toHaveBeenCalledTimes(2);
    expect(component.messageText()).toBe('');
  });

  it('ignores a second send while one is pending', async () => {
    const { component } = await setup();
    let resolve!: (v: { ok: boolean }) => void;
    service.sendMessage.mockReturnValue(new Promise((r) => (resolve = r)));
    component.messageText.set('Hello');

    const first = component.sendMessage();
    void component.sendMessage();
    expect(service.sendMessage).toHaveBeenCalledTimes(1);

    resolve({ ok: true });
    await first;
  });

  it('stops watching the conversation when the page is left', async () => {
    const { fixture } = await setup();
    fixture.destroy();
    expect(service.closeConversation).toHaveBeenCalled();
  });
});
