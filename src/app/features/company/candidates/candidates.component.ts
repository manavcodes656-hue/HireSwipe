import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CompanyDataService } from '../services/company-data.service';
import { Profile, Job } from '../models/company.models';

@Component({
  selector: 'app-company-candidates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './candidates.component.html',
  styleUrl: './candidates.component.css',
})
export class CandidatesComponent implements OnInit {
  candidates: Profile[] = [];
  jobs: Job[] = [];
  searchQuery = '';
  selectedSkillFilter = '';
  selectedRoleFilter = '';

  selectedCandidate: Profile | null = null;
  isProfileModalOpen = false;
  isResumeModalOpen = false;

  toastMessage = '';

  constructor(
    private dataService: CompanyDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.candidates = this.dataService.allCandidates;
    this.dataService.jobs$.subscribe((j) => (this.jobs = j));
  }

  get filteredCandidates(): Profile[] {
    return this.candidates.filter((c) => {
      const matchSearch =
        !this.searchQuery ||
        c.full_name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (c.headline && c.headline.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
        (c.location && c.location.toLowerCase().includes(this.searchQuery.toLowerCase()));

      const matchSkill =
        !this.selectedSkillFilter ||
        (c.skills && c.skills.some((s: string) => s.toLowerCase().includes(this.selectedSkillFilter.toLowerCase())));

      return matchSearch && matchSkill;
    });
  }

  openCandidateProfile(cand: Profile): void {
    this.selectedCandidate = cand;
    this.isProfileModalOpen = true;
  }

  openResumeModal(cand: Profile, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedCandidate = cand;
    this.isResumeModalOpen = true;
  }

  closeModals(): void {
    this.isProfileModalOpen = false;
    this.isResumeModalOpen = false;
  }

  get isSampleData(): boolean {
    return this.dataService.candidatesAreSamples;
  }
  readonly sampleNote = 'Sample profiles for preview only. Candidate discovery is not supported by the current database schema, so actions here are not saved. Real candidates appear in Applications and Matches.';

  // The candidates listed here are samples (see CompanyDataService.candidateProfiles);
  // nothing is written to the database, and the UI says so instead of claiming success.
  shortlist(cand: Profile, event?: Event): void {
    if (event) event.stopPropagation();
    this.showToast(`Not saved: ${cand.full_name} is a sample profile. Shortlist real applicants from Applications.`);
  }

  reject(cand: Profile, event?: Event): void {
    if (event) event.stopPropagation();
    this.showToast(`Not saved: ${cand.full_name} is a sample profile.`);
  }

  async contact(cand: Profile, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
feature/backend-foundation
    this.showToast('Messaging is available once a candidate matches one of your jobs (see Matches).');

    // A conversation only exists once the candidate matched a published job.
    // The lookup never creates one, it only finds the real conversation.
    await this.dataService.startConversationWithCandidate(cand.id, this.jobs[0]?.id);
    this.router.navigate(['/company/messages']);
 main
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }
}
