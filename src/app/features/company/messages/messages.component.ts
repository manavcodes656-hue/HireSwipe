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
  sendError = '';
  isSending = false;

  private subs = new Subscription();

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
    this.sendError = '';
    void this.dataService.loadMessages(conv.id);
  }

  get activeMessages(): Message[] {
    if (!this.activeConversation) return [];
    return this.messagesMap[this.activeConversation.id] || [];
  }

  async sendMessage(): Promise<void> {
    if (!this.messageText.trim() || !this.activeConversation || this.isSending) return;

    this.isSending = true;
    this.sendError = '';
    const { error } = await this.dataService.sendMessage(this.activeConversation.id, this.messageText.trim());
    this.isSending = false;
    if (error) {
      // Keep the text so the user can retry.
      this.sendError = error;
      return;
    }
    this.messageText = '';
  }

  sendAttachmentSimulation(): void {
    if (!this.activeConversation) return;
    // File messages need the message-attachments bucket flow; not wired up yet.
    this.sendError = 'Attachments are not supported yet.';
  }
}
