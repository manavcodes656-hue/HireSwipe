import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Conversation, Message } from '../models/job-seeker.models';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.css',
})
export class MessagesComponent implements OnInit {
  jobSeekerService = inject(JobSeekerService);
  route = inject(ActivatedRoute);

  selectedConversationId = signal<string | null>(null);
  messageText = signal<string>('');
  searchQuery = signal<string>('');
  attachedFile = signal<{ name: string; size: string; type: string } | null>(null);

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const matchId = params['matchId'];
      if (matchId) {
        const conv = this.jobSeekerService.conversations().find((c) => c.match_id === matchId);
        if (conv) {
          this.selectConversation(conv.id);
        }
      } else if (this.jobSeekerService.conversations().length > 0) {
        this.selectConversation(this.jobSeekerService.conversations()[0].id);
      }
    });
  }

  filteredConversations = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.jobSeekerService.conversations();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        c.job_title.toLowerCase().includes(q)
    );
  });

  activeConversation = computed(() => {
    const id = this.selectedConversationId();
    if (!id) return null;
    return this.jobSeekerService.conversations().find((c) => c.id === id) || null;
  });

  activeMessages = computed(() => {
    const id = this.selectedConversationId();
    if (!id) return [];
    return this.jobSeekerService.messages()[id] || [];
  });

  selectConversation(convId: string) {
    this.selectedConversationId.set(convId);
    this.jobSeekerService.markConversationRead(convId);
  }

  onFileAttachment(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.attachedFile.set({
        name: file.name,
        size: (file.size / 1024).toFixed(0) + ' KB',
        type: file.type || 'application/pdf',
      });
    }
  }

  removeAttachment() {
    this.attachedFile.set(null);
  }

  sendMessage() {
    const id = this.selectedConversationId();
    const text = this.messageText().trim();
    const att = this.attachedFile();

    if (!id || (!text && !att)) return;

    const attachments = att
      ? [
          {
            name: att.name,
            url: '#',
            type: att.type,
            size: att.size,
          },
        ]
      : undefined;

    this.jobSeekerService.sendMessage(id, text, attachments);
    this.messageText.set('');
    this.attachedFile.set(null);
  }
}
