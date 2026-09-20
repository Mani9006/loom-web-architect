export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_usage_daily: {
        Row: {
          count: number
          day: string
          kind: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          kind: string
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          kind?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          actions: Json
          agent: string
          completed_at: string | null
          error_message: string | null
          id: string
          iterations: number
          model: string
          started_at: string
          status: string
          summary: string | null
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          actions?: Json
          agent: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          iterations?: number
          model?: string
          started_at?: string
          status?: string
          summary?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          actions?: Json
          agent?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          iterations?: number
          model?: string
          started_at?: string
          status?: string
          summary?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: []
      }
      application_emails: {
        Row: {
          body_preview: string | null
          from_email: string | null
          id: string
          job_application_id: string | null
          parsed_status: string | null
          received_at: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          body_preview?: string | null
          from_email?: string | null
          id?: string
          job_application_id?: string | null
          parsed_status?: string | null
          received_at?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          body_preview?: string | null
          from_email?: string | null
          id?: string
          job_application_id?: string | null
          parsed_status?: string | null
          received_at?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_emails_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_history: {
        Row: {
          application_id: string
          changed_at: string
          id: string
          notes: string | null
          status_after: string
          status_before: string | null
        }
        Insert: {
          application_id: string
          changed_at?: string
          id?: string
          notes?: string | null
          status_after: string
          status_before?: string | null
        }
        Update: {
          application_id?: string
          changed_at?: string
          id?: string
          notes?: string | null
          status_after?: string
          status_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          application_url: string | null
          applied_at: string
          ats_score: number | null
          company: string
          cover_letter_id: string | null
          id: string
          job_board: string
          job_id: string
          job_title: string
          resume_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_url?: string | null
          applied_at?: string
          ats_score?: number | null
          company: string
          cover_letter_id?: string | null
          id?: string
          job_board: string
          job_id: string
          job_title: string
          resume_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_url?: string | null
          applied_at?: string
          ats_score?: number | null
          company?: string
          cover_letter_id?: string | null
          id?: string
          job_board?: string
          job_id?: string
          job_title?: string
          resume_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_cover_letter_id_fkey"
            columns: ["cover_letter_id"]
            isOneToOne: false
            referencedRelation: "user_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "user_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_campaigns: {
        Row: {
          applied_count: number
          completed_at: string | null
          created_at: string
          failed_count: number
          filters: Json
          id: string
          job_count: number
          name: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_count?: number
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          filters?: Json
          id?: string
          job_count?: number
          name: string
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_count?: number
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          filters?: Json
          id?: string
          job_count?: number
          name?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applypass_tasks: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          heartbeat_at: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          result: Json | null
          run_log: Json
          started_at: string | null
          status: string
          task_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          result?: Json | null
          run_log?: Json
          started_at?: string | null
          status?: string
          task_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          result?: Json | null
          run_log?: Json
          started_at?: string | null
          status?: string
          task_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log_entries: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          resource: string | null
          resource_id: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "enterprise_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cached_jobs: {
        Row: {
          apply_url: string | null
          company: string
          created_at: string | null
          date_posted: string | null
          description: string | null
          experience_level: string | null
          expires_at: string | null
          id: string
          industry: string | null
          job_fingerprint: string
          job_type: string | null
          location: string
          remote: boolean | null
          role_category: string | null
          salary: string | null
          source: string | null
          title: string
        }
        Insert: {
          apply_url?: string | null
          company: string
          created_at?: string | null
          date_posted?: string | null
          description?: string | null
          experience_level?: string | null
          expires_at?: string | null
          id?: string
          industry?: string | null
          job_fingerprint: string
          job_type?: string | null
          location?: string
          remote?: boolean | null
          role_category?: string | null
          salary?: string | null
          source?: string | null
          title: string
        }
        Update: {
          apply_url?: string | null
          company?: string
          created_at?: string | null
          date_posted?: string | null
          description?: string | null
          experience_level?: string | null
          expires_at?: string | null
          id?: string
          industry?: string | null
          job_fingerprint?: string
          job_type?: string | null
          location?: string
          remote?: boolean | null
          role_category?: string | null
          salary?: string | null
          source?: string | null
          title?: string
        }
        Relationships: []
      }
      conversation_folders: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          chat_mode: string
          created_at: string
          folder_id: string | null
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_mode?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_mode?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "conversation_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      cover_letter_versions: {
        Row: {
          content: string
          cover_letter_id: string
          created_at: string
          id: string
          title: string
          user_id: string
          version_number: number
        }
        Insert: {
          content: string
          cover_letter_id: string
          created_at?: string
          id?: string
          title: string
          user_id: string
          version_number: number
        }
        Update: {
          content?: string
          cover_letter_id?: string
          created_at?: string
          id?: string
          title?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cover_letter_versions_cover_letter_id_fkey"
            columns: ["cover_letter_id"]
            isOneToOne: false
            referencedRelation: "cover_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      cover_letters: {
        Row: {
          company_name: string | null
          content: string
          created_at: string
          id: string
          job_description: string | null
          job_title: string | null
          resume_text: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          content: string
          created_at?: string
          id?: string
          job_description?: string | null
          job_title?: string | null
          resume_text?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          content?: string
          created_at?: string
          id?: string
          job_description?: string | null
          job_title?: string | null
          resume_text?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      draft_applications: {
        Row: {
          answers: Json
          applypass_task_id: string | null
          created_at: string
          error_message: string | null
          evaluation_id: string
          id: string
          status: string
          submitted_at: string | null
          tailored_cv_md: string | null
          tailored_cv_pdf_url: string | null
          tailored_resume_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          applypass_task_id?: string | null
          created_at?: string
          error_message?: string | null
          evaluation_id: string
          id?: string
          status?: string
          submitted_at?: string | null
          tailored_cv_md?: string | null
          tailored_cv_pdf_url?: string | null
          tailored_resume_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          applypass_task_id?: string | null
          created_at?: string
          error_message?: string | null
          evaluation_id?: string
          id?: string
          status?: string
          submitted_at?: string | null
          tailored_cv_md?: string | null
          tailored_cv_pdf_url?: string | null
          tailored_resume_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_applications_applypass_task_id_fkey"
            columns: ["applypass_task_id"]
            isOneToOne: false
            referencedRelation: "applypass_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_applications_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "job_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_applications_tailored_resume_id_fkey"
            columns: ["tailored_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_aliases: {
        Row: {
          alias_email: string
          created_at: string | null
          forwarding_email: string
          id: string
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          alias_email: string
          created_at?: string | null
          forwarding_email: string
          id?: string
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          alias_email?: string
          created_at?: string | null
          forwarding_email?: string
          id?: string
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      enterprise_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          tenant_id: string
          tenant_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          tenant_id: string
          tenant_role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          tenant_id?: string
          tenant_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "enterprise_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_tenants: {
        Row: {
          created_at: string
          id: string
          max_seats: number
          name: string
          plan: string
          slug: string
          sso_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_seats?: number
          name: string
          plan?: string
          slug: string
          sso_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_seats?: number
          name?: string
          plan?: string
          slug?: string
          sso_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      experiment_assignments: {
        Row: {
          assigned_at: string
          experiment_id: string
          id: string
          user_id: string
          variant: string
        }
        Insert: {
          assigned_at?: string
          experiment_id: string
          id?: string
          user_id: string
          variant: string
        }
        Update: {
          assigned_at?: string
          experiment_id?: string
          id?: string
          user_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_events: {
        Row: {
          event_name: string
          experiment_id: string
          id: string
          occurred_at: string
          properties: Json
          user_id: string | null
          variant: string
        }
        Insert: {
          event_name: string
          experiment_id: string
          id?: string
          occurred_at?: string
          properties?: Json
          user_id?: string | null
          variant: string
        }
        Update: {
          event_name?: string
          experiment_id?: string
          id?: string
          occurred_at?: string
          properties?: Json
          user_id?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_events_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          description: string | null
          ended_at: string | null
          id: string
          name: string
          started_at: string | null
          status: string
          traffic_pct: number
          updated_at: string
          variants: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id: string
          name: string
          started_at?: string | null
          status?: string
          traffic_pct?: number
          updated_at?: string
          variants?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          name?: string
          started_at?: string | null
          status?: string
          traffic_pct?: number
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      feedback_submissions: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          page_url: string | null
          status: string
          subject: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          status?: string
          subject: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          status?: string
          subject?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          applied_at: string | null
          apply_url: string | null
          company: string
          confirmation_email_id: string | null
          created_at: string | null
          id: string
          job_id: string | null
          notes: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          apply_url?: string | null
          company: string
          confirmation_email_id?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          apply_url?: string | null
          company?: string
          confirmation_email_id?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_evaluations: {
        Row: {
          archetype: string | null
          dimension_scores: Json
          eligible: boolean
          error_message: string | null
          evaluated_at: string
          fit_confidence: number | null
          fit_score: number | null
          gaps: string[] | null
          hard_filters: string[]
          id: string
          keyword_matches: string[] | null
          model: string
          report_md: string | null
          resume_id: string | null
          scanned_job_id: string
          score: number
          score_version: string
          star_stories: Json | null
          summary: string | null
          tier: string | null
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          archetype?: string | null
          dimension_scores?: Json
          eligible?: boolean
          error_message?: string | null
          evaluated_at?: string
          fit_confidence?: number | null
          fit_score?: number | null
          gaps?: string[] | null
          hard_filters?: string[]
          id?: string
          keyword_matches?: string[] | null
          model?: string
          report_md?: string | null
          resume_id?: string | null
          scanned_job_id: string
          score: number
          score_version?: string
          star_stories?: Json | null
          summary?: string | null
          tier?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          archetype?: string | null
          dimension_scores?: Json
          eligible?: boolean
          error_message?: string | null
          evaluated_at?: string
          fit_confidence?: number | null
          fit_score?: number | null
          gaps?: string[] | null
          hard_filters?: string[]
          id?: string
          keyword_matches?: string[] | null
          model?: string
          report_md?: string | null
          resume_id?: string | null
          scanned_job_id?: string
          score?: number
          score_version?: string
          star_stories?: Json | null
          summary?: string | null
          tier?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_evaluations_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_evaluations_scanned_job_id_fkey"
            columns: ["scanned_job_id"]
            isOneToOne: false
            referencedRelation: "scanned_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_matches: {
        Row: {
          created_at: string | null
          dismissed: boolean | null
          id: string
          job_id: string
          liked: boolean | null
          match_reasons: Json | null
          match_score: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          job_id: string
          liked?: boolean | null
          match_reasons?: Json | null
          match_score?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          job_id?: string
          liked?: boolean | null
          match_reasons?: Json | null
          match_score?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          apply_url: string | null
          company: string
          created_at: string | null
          date_posted: string | null
          description: string | null
          employer_logo: string | null
          experience_level: string | null
          external_id: string | null
          id: string
          industry: string | null
          job_type: string | null
          location: string | null
          remote: boolean | null
          role_category: string | null
          salary_max: number | null
          salary_min: number | null
          source: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          apply_url?: string | null
          company: string
          created_at?: string | null
          date_posted?: string | null
          description?: string | null
          employer_logo?: string | null
          experience_level?: string | null
          external_id?: string | null
          id?: string
          industry?: string | null
          job_type?: string | null
          location?: string | null
          remote?: boolean | null
          role_category?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          apply_url?: string | null
          company?: string
          created_at?: string | null
          date_posted?: string | null
          description?: string | null
          employer_logo?: string | null
          experience_level?: string | null
          external_id?: string | null
          id?: string
          industry?: string | null
          job_type?: string | null
          location?: string | null
          remote?: boolean | null
          role_category?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      mc_ai_jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json | null
          kind: string
          model: string
          priority: number
          prompt: string
          result: string | null
          result_json: Json | null
          session_id: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind: string
          model?: string
          priority?: number
          prompt: string
          result?: string | null
          result_json?: Json | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind?: string
          model?: string
          priority?: number
          prompt?: string
          result?: string | null
          result_json?: Json | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_ai_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_ai_usage: {
        Row: {
          cents_estimated: number
          count: number
          created_at: string
          day: string
          id: string
          kind: string
          model: string
          session_id: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          cents_estimated?: number
          count?: number
          created_at?: string
          day?: string
          id?: string
          kind: string
          model: string
          session_id: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Update: {
          cents_estimated?: number
          count?: number
          created_at?: string
          day?: string
          id?: string
          kind?: string
          model?: string
          session_id?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_ai_usage_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_company_research: {
        Row: {
          company_name: string
          company_slug: string
          created_at: string
          expires_at: string
          id: string
          model: string
          research_md: string
          session_id: string
          source_urls: Json | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          company_name: string
          company_slug: string
          created_at?: string
          expires_at?: string
          id?: string
          model?: string
          research_md: string
          session_id: string
          source_urls?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Update: {
          company_name?: string
          company_slug?: string
          created_at?: string
          expires_at?: string
          id?: string
          model?: string
          research_md?: string
          session_id?: string
          source_urls?: Json | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_company_research_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_evaluations: {
        Row: {
          archetype: string | null
          created_at: string
          gaps: Json | null
          id: string
          keyword_matches: Json | null
          model: string
          report_md: string | null
          scanned_job_id: string
          score: number | null
          session_id: string
          star_stories: Json | null
          summary: string | null
          tier: string | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          archetype?: string | null
          created_at?: string
          gaps?: Json | null
          id?: string
          keyword_matches?: Json | null
          model?: string
          report_md?: string | null
          scanned_job_id: string
          score?: number | null
          session_id: string
          star_stories?: Json | null
          summary?: string | null
          tier?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Update: {
          archetype?: string | null
          created_at?: string
          gaps?: Json | null
          id?: string
          keyword_matches?: Json | null
          model?: string
          report_md?: string | null
          scanned_job_id?: string
          score?: number | null
          session_id?: string
          star_stories?: Json | null
          summary?: string | null
          tier?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_evaluations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_gmail_connections: {
        Row: {
          access_token: string
          created_at: string
          enabled: boolean
          gmail_email: string
          history_id: string | null
          id: string
          last_polled_at: string | null
          refresh_token: string
          scopes: string[]
          session_id: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          enabled?: boolean
          gmail_email: string
          history_id?: string | null
          id?: string
          last_polled_at?: string | null
          refresh_token: string
          scopes: string[]
          session_id: string
          token_expires_at: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          enabled?: boolean
          gmail_email?: string
          history_id?: string | null
          id?: string
          last_polled_at?: string | null
          refresh_token?: string
          scopes?: string[]
          session_id?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_gmail_connections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_inbound_emails: {
        Row: {
          body_full: string | null
          body_preview: string | null
          classification: string | null
          classification_confidence: number | null
          classification_summary: string | null
          from_email: string
          id: string
          message_id: string | null
          next_action: string | null
          parsed_at: string | null
          raw: Json | null
          received_at: string
          session_id: string | null
          subject: string | null
          to_email: string | null
          tracked_job_id: string | null
          user_id: string
        }
        Insert: {
          body_full?: string | null
          body_preview?: string | null
          classification?: string | null
          classification_confidence?: number | null
          classification_summary?: string | null
          from_email: string
          id?: string
          message_id?: string | null
          next_action?: string | null
          parsed_at?: string | null
          raw?: Json | null
          received_at?: string
          session_id?: string | null
          subject?: string | null
          to_email?: string | null
          tracked_job_id?: string | null
          user_id?: string
        }
        Update: {
          body_full?: string | null
          body_preview?: string | null
          classification?: string | null
          classification_confidence?: number | null
          classification_summary?: string | null
          from_email?: string
          id?: string
          message_id?: string | null
          next_action?: string | null
          parsed_at?: string | null
          raw?: Json | null
          received_at?: string
          session_id?: string | null
          subject?: string | null
          to_email?: string | null
          tracked_job_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_inbound_emails_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_inbound_emails_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "mc_tracked_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_sessions: {
        Row: {
          created_at: string
          id: string
          master_resume_id: string | null
          name: string
          notes: string | null
          status: string
          target_profile: Json
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          master_resume_id?: string | null
          name: string
          notes?: string | null
          status?: string
          target_profile?: Json
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          master_resume_id?: string | null
          name?: string
          notes?: string | null
          status?: string
          target_profile?: Json
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_sessions_master_resume_id_fkey"
            columns: ["master_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_status_history: {
        Row: {
          created_at: string
          email_id: string | null
          id: string
          source: string
          status_from: string | null
          status_to: string
          tracked_job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_id?: string | null
          id?: string
          source?: string
          status_from?: string | null
          status_to: string
          tracked_job_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          email_id?: string | null
          id?: string
          source?: string
          status_from?: string | null
          status_to?: string
          tracked_job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_status_history_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "mc_tracked_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_tailored_resumes: {
        Row: {
          ats_score: number | null
          created_at: string
          cv_md: string
          docx_url: string | null
          id: string
          name: string
          pdf_url: string | null
          rendered_html: string | null
          session_id: string
          source_evaluation_id: string | null
          source_job_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ats_score?: number | null
          created_at?: string
          cv_md: string
          docx_url?: string | null
          id?: string
          name: string
          pdf_url?: string | null
          rendered_html?: string | null
          session_id: string
          source_evaluation_id?: string | null
          source_job_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          ats_score?: number | null
          created_at?: string
          cv_md?: string
          docx_url?: string | null
          id?: string
          name?: string
          pdf_url?: string | null
          rendered_html?: string | null
          session_id?: string
          source_evaluation_id?: string | null
          source_job_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_tailored_resumes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_tailored_resumes_source_evaluation_id_fkey"
            columns: ["source_evaluation_id"]
            isOneToOne: false
            referencedRelation: "mc_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_tracked_jobs: {
        Row: {
          applied_at: string | null
          apply_url: string | null
          clicked_at: string | null
          company: string
          created_at: string
          deleted_at: string | null
          id: string
          jd_md: string | null
          job_title: string
          location: string | null
          notes: string | null
          scanned_job_id: string | null
          session_id: string
          status: string
          tailored_resume_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          apply_url?: string | null
          clicked_at?: string | null
          company: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          jd_md?: string | null
          job_title: string
          location?: string | null
          notes?: string | null
          scanned_job_id?: string | null
          session_id: string
          status?: string
          tailored_resume_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          applied_at?: string | null
          apply_url?: string | null
          clicked_at?: string | null
          company?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          jd_md?: string | null
          job_title?: string
          location?: string | null
          notes?: string | null
          scanned_job_id?: string | null
          session_id?: string
          status?: string
          tailored_resume_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_tracked_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_tracked_jobs_tailored_resume_id_fkey"
            columns: ["tailored_resume_id"]
            isOneToOne: false
            referencedRelation: "mc_tailored_resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_worker_heartbeats: {
        Row: {
          hostname: string | null
          last_seen: string
          user_id: string
          version: string | null
        }
        Insert: {
          hostname?: string | null
          last_seen?: string
          user_id?: string
          version?: string | null
        }
        Update: {
          hostname?: string | null
          last_seen?: string
          user_id?: string
          version?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          occurred_at: string
          path: string | null
          properties: Json
          referrer: string | null
          session_id: string
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          occurred_at?: string
          path?: string | null
          properties?: Json
          referrer?: string | null
          session_id: string
          source?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          occurred_at?: string
          path?: string | null
          properties?: Json
          referrer?: string | null
          session_id?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          blacklisted_companies: string[] | null
          created_at: string
          desired_locations: string[] | null
          desired_roles: string[] | null
          education_level: string | null
          email: string | null
          full_name: string | null
          id: string
          job_preferences: Json | null
          languages_spoken: Json | null
          linkedin_url: string | null
          location: string | null
          onboarding_completed: boolean
          phone: string | null
          preferred_work_type: string[] | null
          profile_completeness: number | null
          profile_setup_completed: boolean | null
          resume_json: Json | null
          salary_expectations: Json | null
          seniority_level: string | null
          skills: Json | null
          target_role: string | null
          updated_at: string
          user_id: string
          work_authorization: string | null
          years_of_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          blacklisted_companies?: string[] | null
          created_at?: string
          desired_locations?: string[] | null
          desired_roles?: string[] | null
          education_level?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          job_preferences?: Json | null
          languages_spoken?: Json | null
          linkedin_url?: string | null
          location?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          preferred_work_type?: string[] | null
          profile_completeness?: number | null
          profile_setup_completed?: boolean | null
          resume_json?: Json | null
          salary_expectations?: Json | null
          seniority_level?: string | null
          skills?: Json | null
          target_role?: string | null
          updated_at?: string
          user_id: string
          work_authorization?: string | null
          years_of_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          blacklisted_companies?: string[] | null
          created_at?: string
          desired_locations?: string[] | null
          desired_roles?: string[] | null
          education_level?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          job_preferences?: Json | null
          languages_spoken?: Json | null
          linkedin_url?: string | null
          location?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          preferred_work_type?: string[] | null
          profile_completeness?: number | null
          profile_setup_completed?: boolean | null
          resume_json?: Json | null
          salary_expectations?: Json | null
          seniority_level?: string | null
          skills?: Json | null
          target_role?: string | null
          updated_at?: string
          user_id?: string
          work_authorization?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      resumes: {
        Row: {
          awards: Json | null
          certifications: Json
          created_at: string
          custom_sections: Json | null
          education: Json
          experience: Json
          id: string
          languages: Json
          personal_info: Json
          projects: Json
          section_order: Json | null
          skills: Json
          summary: string
          template: string
          title: string
          updated_at: string
          user_id: string
          volunteer: Json | null
        }
        Insert: {
          awards?: Json | null
          certifications?: Json
          created_at?: string
          custom_sections?: Json | null
          education?: Json
          experience?: Json
          id?: string
          languages?: Json
          personal_info?: Json
          projects?: Json
          section_order?: Json | null
          skills?: Json
          summary?: string
          template?: string
          title?: string
          updated_at?: string
          user_id: string
          volunteer?: Json | null
        }
        Update: {
          awards?: Json | null
          certifications?: Json
          created_at?: string
          custom_sections?: Json | null
          education?: Json
          experience?: Json
          id?: string
          languages?: Json
          personal_info?: Json
          projects?: Json
          section_order?: Json | null
          skills?: Json
          summary?: string
          template?: string
          title?: string
          updated_at?: string
          user_id?: string
          volunteer?: Json | null
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          apply_url: string | null
          company: string
          date_posted: string | null
          description: string | null
          id: string
          job_title: string
          job_type: string | null
          location: string | null
          remote: boolean | null
          salary: string | null
          saved_at: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          apply_url?: string | null
          company: string
          date_posted?: string | null
          description?: string | null
          id?: string
          job_title: string
          job_type?: string | null
          location?: string | null
          remote?: boolean | null
          salary?: string | null
          saved_at?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          apply_url?: string | null
          company?: string
          date_posted?: string | null
          description?: string | null
          id?: string
          job_title?: string
          job_type?: string | null
          location?: string | null
          remote?: boolean | null
          salary?: string | null
          saved_at?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scan_companies: {
        Row: {
          api_identifier: string
          api_type: string
          careers_url: string | null
          category: string | null
          created_at: string
          enabled: boolean
          id: string
          last_scan_count: number | null
          last_scan_error: string | null
          last_scanned_at: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          api_identifier: string
          api_type: string
          careers_url?: string | null
          category?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_scan_count?: number | null
          last_scan_error?: string | null
          last_scanned_at?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          api_identifier?: string
          api_type?: string
          careers_url?: string | null
          category?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_scan_count?: number | null
          last_scan_error?: string | null
          last_scanned_at?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      scanned_jobs: {
        Row: {
          apply_url: string
          company_id: string
          compensation_text: string | null
          department: string | null
          description_md: string | null
          employment_type: string | null
          external_id: string
          first_seen_at: string
          id: string
          is_live: boolean
          last_seen_at: string
          location: string | null
          posted_at: string | null
          raw: Json | null
          remote_policy: string | null
          title: string
        }
        Insert: {
          apply_url: string
          company_id: string
          compensation_text?: string | null
          department?: string | null
          description_md?: string | null
          employment_type?: string | null
          external_id: string
          first_seen_at?: string
          id?: string
          is_live?: boolean
          last_seen_at?: string
          location?: string | null
          posted_at?: string | null
          raw?: Json | null
          remote_policy?: string | null
          title: string
        }
        Update: {
          apply_url?: string
          company_id?: string
          compensation_text?: string | null
          department?: string | null
          description_md?: string | null
          employment_type?: string | null
          external_id?: string
          first_seen_at?: string
          id?: string
          is_live?: boolean
          last_seen_at?: string
          location?: string | null
          posted_at?: string | null
          raw?: Json | null
          remote_policy?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scanned_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "scan_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      search_cache: {
        Row: {
          created_at: string | null
          date_posted: string | null
          expires_at: string | null
          id: string
          job_ids: string[]
          job_type: string | null
          location: string | null
          query: string
          result_count: number | null
          salary_range: string | null
          search_key: string
        }
        Insert: {
          created_at?: string | null
          date_posted?: string | null
          expires_at?: string | null
          id?: string
          job_ids?: string[]
          job_type?: string | null
          location?: string | null
          query: string
          result_count?: number | null
          salary_range?: string | null
          search_key: string
        }
        Update: {
          created_at?: string | null
          date_posted?: string | null
          expires_at?: string | null
          id?: string
          job_ids?: string[]
          job_type?: string | null
          location?: string | null
          query?: string
          result_count?: number | null
          salary_range?: string | null
          search_key?: string
        }
        Relationships: []
      }
      sso_configurations: {
        Row: {
          attribute_map: Json
          client_id: string | null
          created_at: string
          enabled: boolean
          id: string
          idp_metadata_url: string | null
          issuer_url: string | null
          protocol: string
          sp_acs_url: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attribute_map?: Json
          client_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          idp_metadata_url?: string | null
          issuer_url?: string | null
          protocol?: string
          sp_acs_url?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attribute_map?: Json
          client_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          idp_metadata_url?: string | null
          issuer_url?: string | null
          protocol?: string
          sp_acs_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sso_configurations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "enterprise_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_type: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tracked_jobs: {
        Row: {
          company: string
          created_at: string
          id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          company?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_access_controls: {
        Row: {
          account_status: string
          ai_features_enabled: boolean
          auto_apply_enabled: boolean
          blocked_reason: string | null
          blocked_until: string | null
          created_at: string
          last_admin_action_at: string | null
          last_admin_action_by: string | null
          metadata: Json
          purchase_state: string
          subscription_plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: string
          ai_features_enabled?: boolean
          auto_apply_enabled?: boolean
          blocked_reason?: string | null
          blocked_until?: string | null
          created_at?: string
          last_admin_action_at?: string | null
          last_admin_action_by?: string | null
          metadata?: Json
          purchase_state?: string
          subscription_plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: string
          ai_features_enabled?: boolean
          auto_apply_enabled?: boolean
          blocked_reason?: string | null
          blocked_until?: string | null
          created_at?: string
          last_admin_action_at?: string | null
          last_admin_action_by?: string | null
          metadata?: Json
          purchase_state?: string
          subscription_plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_documents: {
        Row: {
          category: string
          created_at: string
          extracted_text: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string
          id?: string
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_job_prefs: {
        Row: {
          agent_actions_today: number
          agent_enabled: boolean
          agent_max_actions_per_day: number
          auto_apply_enabled: boolean
          auto_apply_min_fit_score: number
          auto_apply_min_score: number
          auto_apply_portals: string[]
          comp_target_usd_max: number | null
          comp_target_usd_min: number | null
          created_at: string
          daily_apply_cap: number
          employment_types: string[]
          excluded_companies: string[]
          last_agent_run_at: string | null
          locations: string[]
          max_stretch_years: number
          max_years_experience: number | null
          min_years_experience: number | null
          negative_keywords: string[]
          require_salary_disclosure: boolean
          requires_sponsorship: boolean
          remote_only: boolean
          review_mode: string
          seniority_levels: string[]
          target_countries: string[]
          target_roles: string[]
          updated_at: string
          user_id: string
          work_authorization: string | null
          work_modes: string[]
        }
        Insert: {
          agent_actions_today?: number
          agent_enabled?: boolean
          agent_max_actions_per_day?: number
          auto_apply_enabled?: boolean
          auto_apply_min_fit_score?: number
          auto_apply_min_score?: number
          auto_apply_portals?: string[]
          comp_target_usd_max?: number | null
          comp_target_usd_min?: number | null
          created_at?: string
          daily_apply_cap?: number
          employment_types?: string[]
          excluded_companies?: string[]
          last_agent_run_at?: string | null
          locations?: string[]
          max_stretch_years?: number
          max_years_experience?: number | null
          min_years_experience?: number | null
          negative_keywords?: string[]
          require_salary_disclosure?: boolean
          requires_sponsorship?: boolean
          remote_only?: boolean
          review_mode?: string
          seniority_levels?: string[]
          target_countries?: string[]
          target_roles?: string[]
          updated_at?: string
          user_id: string
          work_authorization?: string | null
          work_modes?: string[]
        }
        Update: {
          agent_actions_today?: number
          agent_enabled?: boolean
          agent_max_actions_per_day?: number
          auto_apply_enabled?: boolean
          auto_apply_min_fit_score?: number
          auto_apply_min_score?: number
          auto_apply_portals?: string[]
          comp_target_usd_max?: number | null
          comp_target_usd_min?: number | null
          created_at?: string
          daily_apply_cap?: number
          employment_types?: string[]
          excluded_companies?: string[]
          last_agent_run_at?: string | null
          locations?: string[]
          max_stretch_years?: number
          max_years_experience?: number | null
          min_years_experience?: number | null
          negative_keywords?: string[]
          require_salary_disclosure?: boolean
          requires_sponsorship?: boolean
          remote_only?: boolean
          review_mode?: string
          seniority_levels?: string[]
          target_countries?: string[]
          target_roles?: string[]
          updated_at?: string
          user_id?: string
          work_authorization?: string | null
          work_modes?: string[]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ats_scores: {
        Row: {
          created_at: string
          dim_education: number
          dim_experience: number
          dim_format: number
          dim_impact: number
          dim_keywords: number
          dim_skills: number
          id: string
          issues: Json
          matched_keywords: string[]
          missing_keywords: string[]
          model: string
          overall: number
          resume_id: string | null
          scanned_job_id: string | null
          suggestions: Json
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          created_at?: string
          dim_education?: number
          dim_experience?: number
          dim_format?: number
          dim_impact?: number
          dim_keywords?: number
          dim_skills?: number
          id?: string
          issues?: Json
          matched_keywords?: string[]
          missing_keywords?: string[]
          model: string
          overall: number
          resume_id?: string | null
          scanned_job_id?: string | null
          suggestions?: Json
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          created_at?: string
          dim_education?: number
          dim_experience?: number
          dim_format?: number
          dim_impact?: number
          dim_keywords?: number
          dim_skills?: number
          id?: string
          issues?: Json
          matched_keywords?: string[]
          missing_keywords?: string[]
          model?: string
          overall?: number
          resume_id?: string | null
          scanned_job_id?: string | null
          suggestions?: Json
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ats_scores_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_scores_scanned_job_id_fkey"
            columns: ["scanned_job_id"]
            isOneToOne: false
            referencedRelation: "scanned_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_stories: {
        Row: {
          action: string
          archetypes: string[]
          created_at: string
          id: string
          reflection: string | null
          result: string
          situation: string
          source_evaluation_id: string | null
          task: string
          theme: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          archetypes?: string[]
          created_at?: string
          id?: string
          reflection?: string | null
          result: string
          situation: string
          source_evaluation_id?: string | null
          task: string
          theme?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          archetypes?: string[]
          created_at?: string
          id?: string
          reflection?: string | null
          result?: string
          situation?: string
          source_evaluation_id?: string | null
          task?: string
          theme?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_stories_source_evaluation_id_fkey"
            columns: ["source_evaluation_id"]
            isOneToOne: false
            referencedRelation: "job_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      jd_keyword_cache: {
        Row: {
          created_at: string
          jd_hash: string
          keywords: Json
          model: string
        }
        Insert: {
          created_at?: string
          jd_hash: string
          keywords: Json
          model?: string
        }
        Update: {
          created_at?: string
          jd_hash?: string
          keywords?: Json
          model?: string
        }
        Relationships: []
      }
      linkedin_optimizations: {
        Row: {
          created_at: string
          id: string
          kind: string
          model: string
          output_text: string
          rationale: string | null
          source_text: string | null
          target_role: string | null
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          model: string
          output_text: string
          rationale?: string | null
          source_text?: string | null
          target_role?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          model?: string
          output_text?: string
          rationale?: string | null
          source_text?: string | null
          target_role?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: []
      }
      resume_career_profiles: {
        Row: {
          calculated_experience_years: number
          confirmed_experience_years: number | null
          graph: Json
          id: string
          model: string
          resume_id: string
          review_version: string
          reviewed_at: string
          source_fingerprint: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          calculated_experience_years?: number
          confirmed_experience_years?: number | null
          graph: Json
          id?: string
          model: string
          resume_id: string
          review_version?: string
          reviewed_at?: string
          source_fingerprint: string
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          calculated_experience_years?: number
          confirmed_experience_years?: number | null
          graph?: Json
          id?: string
          model?: string
          resume_id?: string
          review_version?: string
          reviewed_at?: string
          source_fingerprint?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_career_profiles_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_tailoring_runs: {
        Row: {
          ats_after: number | null
          ats_before: number | null
          changes: Json
          created_at: string
          draft_application_id: string
          id: string
          master_resume_id: string | null
          model: string | null
          tailored_resume_id: string | null
          user_id: string
        }
        Insert: {
          ats_after?: number | null
          ats_before?: number | null
          changes?: Json
          created_at?: string
          draft_application_id: string
          id?: string
          master_resume_id?: string | null
          model?: string | null
          tailored_resume_id?: string | null
          user_id: string
        }
        Update: {
          ats_after?: number | null
          ats_before?: number | null
          changes?: Json
          created_at?: string
          draft_application_id?: string
          id?: string
          master_resume_id?: string | null
          model?: string | null
          tailored_resume_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_tailoring_runs_draft_application_id_fkey"
            columns: ["draft_application_id"]
            isOneToOne: true
            referencedRelation: "draft_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_tailoring_runs_master_resume_id_fkey"
            columns: ["master_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_tailoring_runs_tailored_resume_id_fkey"
            columns: ["tailored_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_seen_jobs: {
        Row: {
          id: string
          job_fingerprint: string
          seen_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          job_fingerprint: string
          seen_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          job_fingerprint?: string
          seen_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_applypass_task_log: {
        Args: { p_entry: Json; p_task_id: string }
        Returns: undefined
      }
      claim_applypass_task: {
        Args: { p_worker_id: string }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          heartbeat_at: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          result: Json | null
          run_log: Json
          started_at: string | null
          status: string
          task_type: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "applypass_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_ai_usage: {
        Args: {
          p_kind: string
          p_tokens_in: number
          p_tokens_out: number
          p_user_id: string
        }
        Returns: undefined
      }
      read_secret: { Args: { secret_name: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      vault_read_secret: { Args: { secret_name: string }; Returns: string }
      write_audit_log: {
        Args: {
          p_action: string
          p_actor_id: string
          p_ip_address?: string
          p_metadata?: Json
          p_resource?: string
          p_resource_id?: string
          p_tenant_id?: string
          p_user_agent?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "enterprise_admin"
        | "enterprise_member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "moderator",
        "user",
        "enterprise_admin",
        "enterprise_member",
      ],
    },
  },
} as const
