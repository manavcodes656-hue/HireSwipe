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
        (c.skills && c.skills.some((s) => s.toLowerCase().includes(this.selectedSkillFilter.toLowerCase())));

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

  shortlist(cand: Profile, event?: Event): void {
    if (event) event.stopPropagation();
    if (this.jobs.length > 0) {
      this.dataService.ensureMatch(this.jobs[0].id, cand.id, 96);
      this.showToast(`Shortlisted ${cand.full_name}! Added to Swipe Matches.`);
    }
  }

  reject(cand: Profile, event?: Event): void {
    if (event) event.stopPropagation();
    this.showToast(`Candidate ${cand.full_name} rejected.`);
  }

  contact(cand: Profile, event?: Event): void {
    if (event) event.stopPropagation();
    const conv = this.dataService.startConversationWithCandidate(cand.id, this.jobs[0]?.id);
    this.router.navigate(['/company/messages']);
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }
}
