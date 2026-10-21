import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Interview, InterviewStatus, Application, Job } from '../models/company.models';

@Component({
  selector: 'app-company-interviews',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './interviews.component.html',
  styleUrl: './interviews.component.css',
})
export class InterviewsComponent implements OnInit, OnDestroy {
  interviews: Interview[] = [];
  applications: Application[] = [];
  jobs: Job[] = [];

  activeTab: InterviewStatus | 'all' = 'scheduled';
  isScheduleModalOpen = false;
  scheduleForm!: FormGroup;

  selectedInterviewForAction: Interview | null = null;

  private subs = new Subscription();

  constructor(
    private dataService: CompanyDataService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.subs.add(
      this.dataService.interviews$.subscribe((iList) => {
        this.interviews = iList;
      })
    );

    this.subs.add(
      this.dataService.applications$.subscribe((aList) => {
        this.applications = aList;
      })
    );

    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        this.jobs = jList;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private initForm(): void {
    this.scheduleForm = this.fb.group({
      application_id: ['', Validators.required],
      date: ['2026-10-10', Validators.required],
      time: ['14:00', Validators.required],
      duration_minutes: [45, Validators.required],
      meeting_link: ['https://meet.google.com/hireswipe-live-round', Validators.required],
      location: ['Google Meet (Virtual)', Validators.required],
      notes: ['Technical live coding & system architecture discussion.'],
    });
  }

  get filteredInterviews(): Interview[] {
    if (this.activeTab === 'all') return this.interviews;
    return this.interviews.filter((i) => i.status === this.activeTab);
  }

  setTab(tab: InterviewStatus | 'all'): void {
    this.activeTab = tab;
  }

  openScheduleModal(): void {
    this.isScheduleModalOpen = true;
  }

  closeScheduleModal(): void {
    this.isScheduleModalOpen = false;
  }

  submitSchedule(): void {
    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    const val = this.scheduleForm.value;
    const app = this.applications.find((a) => a.id === val.application_id);

    if (app) {
      this.dataService.scheduleInterview({
        application_id: app.id,
        job_id: app.job_id,
        candidate_id: app.profile_id,
        candidate_name: app.profile?.full_name || 'Candidate',
        date: val.date,
        time: val.time,
        duration_minutes: val.duration_minutes,
        meeting_link: val.meeting_link,
        location: val.location,
        notes: val.notes,
      });

      this.closeScheduleModal();
    }
  }

  markCompleted(interview: Interview): void {
    this.dataService.updateInterviewStatus(interview.id, 'completed');
  }

  markCancelled(interview: Interview): void {
    this.dataService.updateInterviewStatus(interview.id, 'cancelled');
  }

  reschedule(interview: Interview): void {
    this.dataService.updateInterviewStatus(interview.id, 'rescheduled');
    this.openScheduleModal();
  }
}
