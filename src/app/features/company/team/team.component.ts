import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { CompanyMember, CompanyRole } from '../models/company.models';

@Component({
  selector: 'app-company-team',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './team.component.html',
  styleUrl: './team.component.css',
})
export class TeamComponent implements OnInit, OnDestroy {
  members: CompanyMember[] = [];
  isInviteModalOpen = false;
  inviteForm!: FormGroup;

  rolesInfo: { role: CompanyRole; title: string; desc: string; permissions: string[] }[] = [
    {
      role: 'owner',
      title: 'Company Owner',
      desc: 'Full administrative access and company ownership.',
      permissions: ['Manage billing & plan', 'Manage company profile', 'Invite/remove team members', 'Post & close jobs', 'View all candidates'],
    },
    {
      role: 'admin',
      title: 'Admin',
      desc: 'Can manage jobs, candidates, team members, and settings.',
      permissions: ['Manage company profile', 'Invite/remove team members', 'Post & close jobs', 'Review candidates & schedule interviews'],
    },
    {
      role: 'recruiter',
      title: 'Recruiter',
      desc: 'Can post jobs, manage applications, and conduct interviews.',
      permissions: ['Create & edit job postings', 'Review candidate applications', 'Schedule interviews & message candidates'],
    },
    {
      role: 'hiring_manager',
      title: 'Hiring Manager',
      desc: 'Can review applications and interview candidates for assigned roles.',
      permissions: ['View assigned candidate profiles', 'Conduct interviews & record feedback', 'Shortlist & pass candidates'],
    },
  ];

  private subs = new Subscription();

  constructor(
    private dataService: CompanyDataService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.subs.add(
      this.dataService.teamMembers$.subscribe((mList) => {
        this.members = mList;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private initForm(): void {
    this.inviteForm = this.fb.group({
      full_name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      role: ['recruiter', Validators.required],
    });
  }

  openInviteModal(): void {
    this.isInviteModalOpen = true;
  }

  closeInviteModal(): void {
    this.isInviteModalOpen = false;
  }

  sendInvite(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    const { email, role, full_name } = this.inviteForm.value;
    this.dataService.inviteTeamMember(email, role, full_name);
    this.inviteForm.reset({ role: 'recruiter' });
    this.closeInviteModal();
  }

  toggleStatus(member: CompanyMember): void {
    const nextStatus = member.status === 'active' ? 'deactivated' : 'active';
    this.dataService.toggleTeamMemberStatus(member.id, nextStatus);
  }
}
