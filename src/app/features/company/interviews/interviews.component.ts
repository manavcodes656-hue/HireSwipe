import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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

  /**
   * The API stores `scheduled`; the view model aliases it to `upcoming`, so the
   * tab matches both spellings.
   */
  activeTab: InterviewStatus | 'all' = 'upcoming';
  isScheduleModalOpen = false;
  isSaving = false;
  errorMessage: string | null = null;
  scheduleForm!: FormGroup;

  selectedInterviewForAction: Interview | null = null;
  scheduleError = '';
  actionError = '';
  isScheduling = false;

  private subs = new Subscription();

  constructor(
    private dataService: CompanyDataService,
    private fb: FormBuilder,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initForm();

    // Opened from the Applications drawer: /company/interviews?schedule=<applicationId>
    const preselected = this.route.snapshot.queryParamMap.get('schedule');
    if (preselected) {
      this.scheduleForm.patchValue({ application_id: preselected });
      this.openScheduleModal();
    }

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
    // Default to tomorrow (local date) rather than a fixed, possibly past, date.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

    this.scheduleForm = this.fb.group({
      application_id: ['', Validators.required],
      date: [defaultDate, Validators.required],
      time: ['14:00', Validators.required],
      duration_minutes: [45, Validators.required],
      meeting_link: ['', Validators.required],
      location: ['Google Meet (Virtual)', Validators.required],
      notes: ['Technical live coding & system architecture discussion.'],
    });
  }

  get filteredInterviews(): Interview[] {
    if (this.activeTab === 'all') return this.interviews;
    if (this.activeTab === 'upcoming') {
      return this.interviews.filter((i) => i.status === 'upcoming' || i.status === 'scheduled');
    }
    return this.interviews.filter((i) => i.status === this.activeTab);
  }

  /** An interview that has not finished yet can still be acted on. */
  isActionable(interview: Interview): boolean {
    return interview.status === 'upcoming' || interview.status === 'scheduled';
  }

  setTab(tab: InterviewStatus | 'all'): void {
    this.activeTab = tab;
  }

  openScheduleModal(): void {
 feature/backend-foundation
    this.scheduleError = '';

    this.errorMessage = null;
 main
    this.isScheduleModalOpen = true;
  }

  closeScheduleModal(): void {
    this.isScheduleModalOpen = false;
  }

  async submitSchedule(): Promise<void> {
    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    const val = this.scheduleForm.value;
    const app = this.applications.find((a) => a.id === val.application_id);

    if (!app) {
 feature/backend-foundation
      this.scheduleError = 'Select an application to schedule an interview for.';
      return;
    }
    {
      this.isScheduling = true;
      this.scheduleError = '';
      const { error } = await this.dataService.scheduleInterview({
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
      this.isScheduling = false;

      if (error) {
        this.scheduleError = error;
        return;
      }
      this.closeScheduleModal();

      this.errorMessage = 'Select an application to schedule the interview for.';
      return;
    }

    this.errorMessage = null;
    this.isSaving = true;

    const result = await this.dataService.scheduleInterview({
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

    this.isSaving = false;

    if (result.error) {
      this.errorMessage = result.error;
      return;
 main
    }

    this.closeScheduleModal();
  }

  async markCompleted(interview: Interview): Promise<void> {
 feature/backend-foundation
    this.actionError = (await this.dataService.updateInterviewStatus(interview.id, 'completed')).error ?? '';
  }

  async markCancelled(interview: Interview): Promise<void> {
    this.actionError = (await this.dataService.updateInterviewStatus(interview.id, 'cancelled')).error ?? '';
  }

  async reschedule(interview: Interview): Promise<void> {
    const { error } = await this.dataService.updateInterviewStatus(interview.id, 'rescheduled');
    this.actionError = error ?? '';
    if (error) return;
    this.scheduleForm.patchValue({ application_id: interview.application_id });

    await this.applyStatus(interview, 'completed');
  }

  async markCancelled(interview: Interview): Promise<void> {
    await this.applyStatus(interview, 'cancelled');
  }

  async reschedule(interview: Interview): Promise<void> {
    this.errorMessage = null;
    const result = await this.dataService.updateInterviewStatus(interview.id, 'rescheduled');
    if (result.error) {
      this.errorMessage = result.error;
      return;
    }
 main
    this.openScheduleModal();
  }

  private async applyStatus(interview: Interview, status: InterviewStatus): Promise<void> {
    this.errorMessage = null;
    const result = await this.dataService.updateInterviewStatus(interview.id, status);
    if (result.error) {
      this.errorMessage = result.error;
    }
  }
}
