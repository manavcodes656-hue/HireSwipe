import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Conversation, Message } from '../models/company.models';

@Component({
  selector: 'app-company-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.css',
})
export class MessagesComponent implements OnInit, OnDestroy {
  conversations: Conversation[] = [];
  activeConversation: Conversation | null = null;
  messagesMap: { [convId: string]: Message[] } = {};
  messageText = '';
  searchQuery = '';
  isLoading = false;
  isSending = false;
  errorMessage: string | null = null;

  private subs = new Subscription();
  /** Removes the Realtime channel of the open conversation. */
  private unsubscribeMessages: (() => void) | null = null;

  constructor(
    private dataService: CompanyDataService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Opened from Matches: /company/messages?conversation=<id>
    const requestedId = this.route.snapshot.queryParamMap.get('conversation');

    this.subs.add(
      this.dataService.conversations$.subscribe((cList) => {
        this.conversations = cList;
        if (cList.length > 0 && !this.activeConversation) {
          const requested = requestedId ? cList.find((c) => c.id === requestedId) : undefined;
          this.selectConversation(requested ?? cList[0]);
        }
      })
    );

    this.subs.add(
      this.dataService.messages$.subscribe((mMap) => {
        this.messagesMap = mMap;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.closeMessageSubscription();
  }

  get filteredConversations(): Conversation[] {
    return this.conversations.filter((c) => {
      return (
        !this.searchQuery ||
        (c.candidate_name || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (c.job_title && c.job_title.toLowerCase().includes(this.searchQuery.toLowerCase()))
      );
    });
  }

  selectConversation(conv: Conversation): void {
    this.activeConversation = conv;
    this.errorMessage = null;
    this.isLoading = true;

    void this.dataService.loadMessages(conv.id).then((result) => {
      this.isLoading = false;
      if (result.error) {
        this.errorMessage = result.error;
      }
    });

    this.openMessageSubscription(conv.id);
  }

  get activeMessages(): Message[] {
    if (!this.activeConversation) return [];
    return this.messagesMap[this.activeConversation.id] || [];
  }

  async sendMessage(): Promise<void> {
    if (!this.messageText.trim() || !this.activeConversation || this.isSending) return;

    const text = this.messageText.trim();
    this.errorMessage = null;
    this.isSending = true;

    const result = await this.dataService.sendMessage(this.activeConversation.id, text);

    this.isSending = false;
    if (result.error) {
      this.errorMessage = result.error;
      this.messageText = text;
      return;
    }
    this.messageText = '';
  }

  /**
   * Send the file the recruiter picked. The file goes to the conversation's
   * storage folder and the message itself is created by the backend.
   */
  async sendAttachment(file: File): Promise<void> {
    if (!file || !this.activeConversation) return;

    this.errorMessage = null;
    this.isSending = true;

    const result = await this.dataService.sendFileMessage(this.activeConversation.id, file);

    this.isSending = false;
    if (result.error) {
      this.errorMessage = result.error;
    }
  }

  /** Wire the hidden file input to the attachment flow. */
  onAttachmentPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    // Reset the input so the same file can be picked again.
    input.value = '';
    if (file) {
      void this.sendAttachment(file);
    }
  }

  // ── Realtime ──────────────────────────────────────────────────────────────

  /**
   * Listen for new messages in the open conversation. Realtime uses the
   * caller's Supabase session, so the database RLS policies decide which rows
   * are delivered.
   */
  private openMessageSubscription(conversationId: string): void {
    this.closeMessageSubscription();
    this.unsubscribeMessages = this.dataService.subscribeToMessages(
      conversationId,
      (message: any) => this.appendRealtimeMessage(conversationId, message),
    );
  }

  private closeMessageSubscription(): void {
    if (this.unsubscribeMessages) {
      this.unsubscribeMessages();
      this.unsubscribeMessages = null;
    }
  }

  private appendRealtimeMessage(conversationId: string, message: any): void {
    const thread = this.messagesMap[conversationId] ?? [];
    if (thread.some((existing) => existing.id === message.id)) return;

    const conversation = this.conversations.find((c) => c.id === conversationId);
    const outgoing = message.sender_id !== conversation?.candidate_id;

    const mapped: Message = {
      id: message.id,
      conversation_id: message.conversation_id ?? conversationId,
      sender_id: message.sender_id,
      sender_type: outgoing ? 'company' : 'job_seeker',
      sender_name: outgoing
        ? this.dataService.currentRecruiterProfile?.full_name ?? 'You'
        : conversation?.candidate_name ?? 'Candidate',
      content: message.message ?? '',
      message: message.message ?? '',
      message_type: message.message_type ?? 'text',
      attachments: [],
      is_read: message.is_read ?? false,
      sent_at: message.created_at,
      created_at: message.created_at,
    } as Message;

    this.messagesMap = {
      ...this.messagesMap,
      [conversationId]: [...thread, mapped],
    };
  }
}
