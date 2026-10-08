import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JobSeekerService } from '../services/job-seeker.service';
import { Interview, InterviewStatus } from '../models/job-seeker.models';

@Component({
  selector: 'app-interviews',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './interviews.component.html',
  styleUrl: './interviews.component.css',
})
export class InterviewsComponent {
  jobSeekerService = inject(JobSeekerService);

  activeTab = signal<InterviewStatus>('upcoming');
  editingNotesId = signal<string | null>(null);
  notesInput = signal<string>('');

  filteredInterviews = computed(() => {
    const tab = this.activeTab();
    return this.jobSeekerService.interviews().filter((i) => i.status === tab);
  });

  openNotesModal(int: Interview) {
    this.editingNotesId.set(int.id);
    this.notesInput.set(int.notes || '');
  }

  saveNotes() {
    const id = this.editingNotesId();
    if (id) {
      this.jobSeekerService.updateInterviewNotes(id, this.notesInput());
      this.editingNotesId.set(null);
    }
  }

  closeModal() {
    this.editingNotesId.set(null);
  }
}
