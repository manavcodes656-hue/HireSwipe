export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: 'job_seeker' | 'company' | 'admin'
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'job_seeker' | 'company' | 'admin'
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'job_seeker' | 'company' | 'admin'
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      job_seeker_profiles: {
        Row: {
          id: string
          profile_id: string
          headline: string | null
          bio: string | null
          phone: string | null
          date_of_birth: string | null
          location: string | null
          city: string | null
          state: string | null
          country: string | null
          experience_years: number | null
          current_job_title: string | null
          current_company: string | null
          expected_salary_min: number | null
          expected_salary_max: number | null
          salary_currency: string
          availability: string | null
          resume_url: string | null
          linkedin_url: string | null
          portfolio_url: string | null
          github_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['job_seeker_profiles']['Row']>
        Update: Partial<Database['public']['Tables']['job_seeker_profiles']['Row']>
      }
      resumes: {
        Row: {
          id: string
          job_seeker_id: string
          file_name: string
          file_path: string
          file_size: number
          mime_type: string
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['resumes']['Row']>
        Update: Partial<Database['public']['Tables']['resumes']['Row']>
      }
      education: {
        Row: {
          id: string
          job_seeker_id: string
          institution: string
          degree: string
          field_of_study: string | null
          start_date: string
          end_date: string | null
          grade: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['education']['Row']>
        Update: Partial<Database['public']['Tables']['education']['Row']>
      }
      experience: {
        Row: {
          id: string
          job_seeker_id: string
          company_name: string
          job_title: string
          employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null
          location: string | null
          start_date: string
          end_date: string | null
          is_current: boolean
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['experience']['Row']>
        Update: Partial<Database['public']['Tables']['experience']['Row']>
      }
      skills: {
        Row: {
          id: string
          name: string
          category: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['skills']['Row']>
        Update: Partial<Database['public']['Tables']['skills']['Row']>
      }
      job_seeker_skills: {
        Row: {
          job_seeker_id: string
          skill_id: string
          proficiency_level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | null
          years_experience: number | null
        }
        Insert: Partial<Database['public']['Tables']['job_seeker_skills']['Row']>
        Update: Partial<Database['public']['Tables']['job_seeker_skills']['Row']>
      }
      job_seeker_preferences: {
        Row: {
          id: string
          job_seeker_id: string
          preferred_job_title: string | null
          preferred_location: string | null
          remote_preference: 'on_site' | 'remote' | 'hybrid' | null
          employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null
          minimum_salary: number | null
          maximum_salary: number | null
          experience_level: string | null
          preferred_industries: string[] | null
          willing_to_relocate: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['job_seeker_preferences']['Row']>
        Update: Partial<Database['public']['Tables']['job_seeker_preferences']['Row']>
      }
      companies: {
        Row: {
          id: string
          name: string
          description: string | null
          industry: string | null
          website: string | null
          company_size: string | null
          founded_year: number | null
          logo_url: string | null
          email: string | null
          phone: string | null
          location: string | null
          city: string | null
          state: string | null
          country: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['companies']['Row']>
        Update: Partial<Database['public']['Tables']['companies']['Row']>
      }
      company_members: {
        Row: {
          id: string
          company_id: string
          profile_id: string
          role: 'owner' | 'admin' | 'recruiter' | 'hiring_manager'
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['company_members']['Row']>
        Update: Partial<Database['public']['Tables']['company_members']['Row']>
      }
      jobs: {
        Row: {
          id: string
          company_id: string
          created_by: string | null
          title: string
          description: string
          employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance'
          experience_level: string | null
          experience_min: number | null
          experience_max: number | null
          salary_min: number | null
          salary_max: number | null
          salary_currency: string
          location: string | null
          city: string | null
          state: string | null
          country: string | null
          remote_type: 'on_site' | 'remote' | 'hybrid'
          status: 'draft' | 'published' | 'paused' | 'closed'
          openings: number
          application_deadline: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['jobs']['Row']>
        Update: Partial<Database['public']['Tables']['jobs']['Row']>
      }
      job_skills: {
        Row: {
          job_id: string
          skill_id: string
          is_required: boolean
          minimum_proficiency: string | null
        }
        Insert: Partial<Database['public']['Tables']['job_skills']['Row']>
        Update: Partial<Database['public']['Tables']['job_skills']['Row']>
      }
      job_requirements: {
        Row: {
          id: string
          job_id: string
          requirement: string
          is_required: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['job_requirements']['Row']>
        Update: Partial<Database['public']['Tables']['job_requirements']['Row']>
      }
      job_benefits: {
        Row: {
          id: string
          job_id: string
          benefit: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['job_benefits']['Row']>
        Update: Partial<Database['public']['Tables']['job_benefits']['Row']>
      }
      job_swipes: {
        Row: {
          id: string
          job_id: string
          job_seeker_id: string
          direction: 'like' | 'pass'
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['job_swipes']['Row']>
        Update: Partial<Database['public']['Tables']['job_swipes']['Row']>
      }
      matches: {
        Row: {
          id: string
          job_id: string
          job_seeker_id: string
          company_id: string
          status: 'active' | 'closed'
          matched_at: string
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['matches']['Row']>
        Update: Partial<Database['public']['Tables']['matches']['Row']>
      }
      applications: {
        Row: {
          id: string
          job_id: string
          job_seeker_id: string
          company_id: string
          resume_id: string | null
          cover_letter: string | null
          status: 'pending' | 'reviewing' | 'shortlisted' | 'interview' | 'rejected' | 'accepted' | 'withdrawn'
          applied_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['applications']['Row']>
        Update: Partial<Database['public']['Tables']['applications']['Row']>
      }
      application_status_history: {
        Row: {
          id: string
          application_id: string
          old_status: 'pending' | 'reviewing' | 'shortlisted' | 'interview' | 'rejected' | 'accepted' | 'withdrawn' | null
          new_status: 'pending' | 'reviewing' | 'shortlisted' | 'interview' | 'rejected' | 'accepted' | 'withdrawn'
          changed_by: string | null
          note: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['application_status_history']['Row']>
        Update: Partial<Database['public']['Tables']['application_status_history']['Row']>
      }
      saved_jobs: {
        Row: {
          id: string
          job_seeker_id: string
          job_id: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['saved_jobs']['Row']>
        Update: Partial<Database['public']['Tables']['saved_jobs']['Row']>
      }
      conversations: {
        Row: {
          id: string
          match_id: string
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['conversations']['Row']>
        Update: Partial<Database['public']['Tables']['conversations']['Row']>
      }
      conversation_members: {
        Row: {
          id: string
          conversation_id: string
          profile_id: string
          joined_at: string
        }
        Insert: Partial<Database['public']['Tables']['conversation_members']['Row']>
        Update: Partial<Database['public']['Tables']['conversation_members']['Row']>
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          message: string
          message_type: 'text' | 'file' | 'system'
          is_read: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['messages']['Row']>
        Update: Partial<Database['public']['Tables']['messages']['Row']>
      }
      interviews: {
        Row: {
          id: string
          application_id: string
          scheduled_by: string | null
          title: string
          description: string | null
          scheduled_at: string
          duration_minutes: number | null
          meeting_url: string | null
          location: string | null
          status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['interviews']['Row']>
        Update: Partial<Database['public']['Tables']['interviews']['Row']>
      }
      notifications: {
        Row: {
          id: string
          profile_id: string
          type: 'match' | 'application' | 'application_status' | 'message' | 'interview' | 'job' | 'system'
          title: string
          message: string
          reference_type: string | null
          reference_id: string | null
          is_read: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['notifications']['Row']>
        Update: Partial<Database['public']['Tables']['notifications']['Row']>
      }
      blocked_users: {
        Row: {
          id: string
          blocker_id: string
          blocked_id: string
          reason: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['blocked_users']['Row']>
        Update: Partial<Database['public']['Tables']['blocked_users']['Row']>
      }
      reports: {
        Row: {
          id: string
          reported_by: string
          reported_user: string | null
          reported_company: string | null
          reported_job: string | null
          reason: string
          description: string | null
          status: 'pending' | 'reviewing' | 'resolved' | 'dismissed'
          created_at: string
          resolved_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['reports']['Row']>
        Update: Partial<Database['public']['Tables']['reports']['Row']>
      }
      activity_logs: {
        Row: {
          id: string
          profile_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['activity_logs']['Row']>
        Update: Partial<Database['public']['Tables']['activity_logs']['Row']>
      }
    }
  }
}
