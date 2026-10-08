import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

  private subs = new Subscription();

  constructor(private dataService: CompanyDataService) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.conversations$.subscribe((cList) => {
        this.conversations = cList;
        if (cList.length > 0 && !this.activeConversation) {
          this.activeConversation = cList[0];
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
        c.candidate_name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (c.job_title && c.job_title.toLowerCase().includes(this.searchQuery.toLowerCase()))
      );
    });
  }

  selectConversation(conv: Conversation): void {
    this.activeConversation = conv;
  }

  get activeMessages(): Message[] {
    if (!this.activeConversation) return [];
    return this.messagesMap[this.activeConversation.id] || [];
  }

  sendMessage(): void {
    if (!this.messageText.trim() || !this.activeConversation) return;

    this.dataService.sendMessage(this.activeConversation.id, this.messageText.trim());
    this.messageText = '';
  }

  sendAttachmentSimulation(): void {
    if (!this.activeConversation) return;

    this.dataService.sendMessage(
      this.activeConversation.id,
      'Attached interview pre-read documentation for review.',
      [{ name: 'TechPulse_Interview_Prep.pdf', url: '#', type: 'pdf' }]
    );
  }
}
