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
      agent_runs: {
        Row: {
          id: string
          user_id: string
          agent: string
          status: string
          started_at: string
          completed_at: string | null
          iterations: number
          actions: Json
          summary: string | null
          model: string
          tokens_in: number
          tokens_out: number
          error_message: string | null
        }
        Insert: {
          id?: string
          user_id: string
          agent: string
          status?: string
          started_at?: string
          completed_at?: string | null
          iterations?: number
          actions?: Json
          summary?: string | null
          model?: string
          tokens_in?: number
          tokens_out?: number
          error_message?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          agent?: string
          status?: string
          started_at?: string
          completed_at?: string | null
          iterations?: number
          actions?: Json
          summary?: string | null
          model?: string
          tokens_in?: number
          tokens_out?: number
          error_message?: string | null
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          user_id: string
          day: string
          kind: string
          count: number
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          user_id: string
          day: string
          kind: string
          count?: number
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          user_id?: string
          day?: string
          kind?: string
          count?: number
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: []
      }
      app_incidents: {
        Row: {
          id: string
          user_id: string
          fingerprint: string
          environment: string
          release_sha: string
          severity: string
          route: string
          message: string
          stack_trace: string | null
          context: Json
          status: string
          occurrences: number
          first_seen_at: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fingerprint: string
          environment?: string
          release_sha?: string
          severity?: string
          route?: string
          message: string
          stack_trace?: string | null
          context?: Json
          status?: string
          occurrences?: number
          first_seen_at?: string
          last_seen_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          fingerprint?: string
          environment?: string
          release_sha?: string
          severity?: string
          route?: string
          message?: string
          stack_trace?: string | null
          context?: Json
          status?: string
          occurrences?: number
          first_seen_at?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      application_emails: {
        Row: {
          id: string
          user_id: string
          job_application_id: string | null
          from_email: string | null
          subject: string | null
          body_preview: string | null
          received_at: string | null
          parsed_status: string | null
        }
        Insert: {
          id?: string
          user_id: string
          job_application_id?: string | null
          from_email?: string | null
          subject?: string | null
          body_preview?: string | null
          received_at?: string | null
          parsed_status?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          job_application_id?: string | null
          from_email?: string | null
          subject?: string | null
          body_preview?: string | null
          received_at?: string | null
          parsed_status?: string | null
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
      application_followups: {
        Row: {
          id: string
          user_id: string
          draft_application_id: string | null
          day: number
          subject: string
          body: string
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          draft_application_id?: string | null
          day: number
          subject: string
          body: string
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          draft_application_id?: string | null
          day?: number
          subject?: string
          body?: string
          sent_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_followups_draft_application_id_fkey"
            columns: ["draft_application_id"]
            isOneToOne: false
            referencedRelation: "draft_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_history: {
        Row: {
          id: string
          application_id: string
          status_before: string | null
          status_after: string
          changed_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          application_id: string
          status_before?: string | null
          status_after: string
          changed_at?: string
          notes?: string | null
        }
        Update: {
          id?: string
          application_id?: string
          status_before?: string | null
          status_after?: string
          changed_at?: string
          notes?: string | null
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
          id: string
          user_id: string
          job_id: string
          job_title: string
          company: string
          job_board: string
          application_url: string | null
          resume_id: string | null
          cover_letter_id: string | null
          ats_score: number | null
          status: string
          applied_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_id: string
          job_title: string
          company: string
          job_board: string
          application_url?: string | null
          resume_id?: string | null
          cover_letter_id?: string | null
          ats_score?: number | null
          status?: string
          applied_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          job_id?: string
          job_title?: string
          company?: string
          job_board?: string
          application_url?: string | null
          resume_id?: string | null
          cover_letter_id?: string | null
          ats_score?: number | null
          status?: string
          applied_at?: string
          updated_at?: string
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
          id: string
          user_id: string
          name: string
          filters: Json
          job_count: number
          applied_count: number
          failed_count: number
          started_at: string
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          filters?: Json
          job_count?: number
          applied_count?: number
          failed_count?: number
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          filters?: Json
          job_count?: number
          applied_count?: number
          failed_count?: number
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      applypass_tasks: {
        Row: {
          id: string
          user_id: string
          task_type: string
          status: string
          payload: Json
          result: Json | null
          error_message: string | null
          created_at: string
          updated_at: string
          attempt_count: number
          max_attempts: number
          locked_by: string | null
          locked_at: string | null
          heartbeat_at: string | null
          started_at: string | null
          completed_at: string | null
          run_log: Json
        }
        Insert: {
          id?: string
          user_id: string
          task_type?: string
          status?: string
          payload?: Json
          result?: Json | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          attempt_count?: number
          max_attempts?: number
          locked_by?: string | null
          locked_at?: string | null
          heartbeat_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          run_log?: Json
        }
        Update: {
          id?: string
          user_id?: string
          task_type?: string
          status?: string
          payload?: Json
          result?: Json | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          attempt_count?: number
          max_attempts?: number
          locked_by?: string | null
          locked_at?: string | null
          heartbeat_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          run_log?: Json
        }
        Relationships: []
      }
      ats_scores: {
        Row: {
          id: string
          user_id: string
          resume_id: string | null
          scanned_job_id: string | null
          overall: number
          dim_format: number
          dim_keywords: number
          dim_experience: number
          dim_skills: number
          dim_education: number
          dim_impact: number
          matched_keywords: string[]
          missing_keywords: string[]
          issues: Json
          suggestions: Json
          model: string
          tokens_in: number
          tokens_out: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          resume_id?: string | null
          scanned_job_id?: string | null
          overall: number
          dim_format?: number
          dim_keywords?: number
          dim_experience?: number
          dim_skills?: number
          dim_education?: number
          dim_impact?: number
          matched_keywords?: string[]
          missing_keywords?: string[]
          issues?: Json
          suggestions?: Json
          model: string
          tokens_in?: number
          tokens_out?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          resume_id?: string | null
          scanned_job_id?: string | null
          overall?: number
          dim_format?: number
          dim_keywords?: number
          dim_experience?: number
          dim_skills?: number
          dim_education?: number
          dim_impact?: number
          matched_keywords?: string[]
          missing_keywords?: string[]
          issues?: Json
          suggestions?: Json
          model?: string
          tokens_in?: number
          tokens_out?: number
          created_at?: string
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
      audit_log_entries: {
        Row: {
          id: string
          tenant_id: string | null
          actor_id: string | null
          action: string
          resource: string | null
          resource_id: string | null
          metadata: Json
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          actor_id?: string | null
          action: string
          resource?: string | null
          resource_id?: string | null
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          actor_id?: string | null
          action?: string
          resource?: string | null
          resource_id?: string | null
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
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
          id: string
          title: string
          company: string
          location: string
          description: string | null
          apply_url: string | null
          salary: string | null
          job_type: string | null
          remote: boolean | null
          source: string | null
          date_posted: string | null
          role_category: string | null
          experience_level: string | null
          industry: string | null
          job_fingerprint: string
          expires_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          title: string
          company: string
          location: string
          description?: string | null
          apply_url?: string | null
          salary?: string | null
          job_type?: string | null
          remote?: boolean | null
          source?: string | null
          date_posted?: string | null
          role_category?: string | null
          experience_level?: string | null
          industry?: string | null
          job_fingerprint: string
          expires_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          company?: string
          location?: string
          description?: string | null
          apply_url?: string | null
          salary?: string | null
          job_type?: string | null
          remote?: boolean | null
          source?: string | null
          date_posted?: string | null
          role_category?: string | null
          experience_level?: string | null
          industry?: string | null
          job_fingerprint?: string
          expires_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      company_research: {
        Row: {
          id: string
          user_id: string
          company_slug: string
          company_name: string
          role_title: string | null
          report_md: string
          model: string
          tokens_in: number
          tokens_out: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_slug: string
          company_name: string
          role_title?: string | null
          report_md: string
          model: string
          tokens_in?: number
          tokens_out?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_slug?: string
          company_name?: string
          role_title?: string | null
          report_md?: string
          model?: string
          tokens_in?: number
          tokens_out?: number
          created_at?: string
        }
        Relationships: []
      }
      conversation_folders: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          title: string | null
          created_at: string
          updated_at: string
          chat_mode: string
          folder_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          created_at?: string
          updated_at?: string
          chat_mode?: string
          folder_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          created_at?: string
          updated_at?: string
          chat_mode?: string
          folder_id?: string | null
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
          id: string
          cover_letter_id: string
          user_id: string
          title: string
          content: string
          version_number: number
          created_at: string
        }
        Insert: {
          id?: string
          cover_letter_id: string
          user_id: string
          title: string
          content: string
          version_number: number
          created_at?: string
        }
        Update: {
          id?: string
          cover_letter_id?: string
          user_id?: string
          title?: string
          content?: string
          version_number?: number
          created_at?: string
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
          id: string
          user_id: string
          title: string
          content: string
          company_name: string | null
          job_title: string | null
          job_description: string | null
          resume_text: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          content: string
          company_name?: string | null
          job_title?: string | null
          job_description?: string | null
          resume_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          content?: string
          company_name?: string | null
          job_title?: string | null
          job_description?: string | null
          resume_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      draft_applications: {
        Row: {
          id: string
          user_id: string
          evaluation_id: string
          tailored_resume_id: string | null
          tailored_cv_md: string | null
          tailored_cv_pdf_url: string | null
          answers: Json
          status: string
          applypass_task_id: string | null
          submitted_at: string | null
          error_message: string | null
          created_at: string
          updated_at: string
          critic_iterations: Json
        }
        Insert: {
          id?: string
          user_id: string
          evaluation_id: string
          tailored_resume_id?: string | null
          tailored_cv_md?: string | null
          tailored_cv_pdf_url?: string | null
          answers?: Json
          status?: string
          applypass_task_id?: string | null
          submitted_at?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          critic_iterations?: Json
        }
        Update: {
          id?: string
          user_id?: string
          evaluation_id?: string
          tailored_resume_id?: string | null
          tailored_cv_md?: string | null
          tailored_cv_pdf_url?: string | null
          answers?: Json
          status?: string
          applypass_task_id?: string | null
          submitted_at?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
          critic_iterations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "draft_applications_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "job_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_applications_applypass_task_id_fkey"
            columns: ["applypass_task_id"]
            isOneToOne: false
            referencedRelation: "applypass_tasks"
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
          id: string
          user_id: string
          alias_email: string
          forwarding_email: string
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          alias_email: string
          forwarding_email: string
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          alias_email?: string
          forwarding_email?: string
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      enterprise_memberships: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          tenant_role: string
          invited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          tenant_role?: string
          invited_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          tenant_role?: string
          invited_by?: string | null
          created_at?: string
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
          id: string
          name: string
          slug: string
          plan: string
          sso_enabled: boolean
          max_seats: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan?: string
          sso_enabled?: boolean
          max_seats?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          plan?: string
          sso_enabled?: boolean
          max_seats?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      experiment_assignments: {
        Row: {
          id: string
          experiment_id: string
          user_id: string
          variant: string
          assigned_at: string
        }
        Insert: {
          id?: string
          experiment_id: string
          user_id: string
          variant: string
          assigned_at?: string
        }
        Update: {
          id?: string
          experiment_id?: string
          user_id?: string
          variant?: string
          assigned_at?: string
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
          id: string
          experiment_id: string
          user_id: string | null
          variant: string
          event_name: string
          properties: Json
          occurred_at: string
        }
        Insert: {
          id?: string
          experiment_id: string
          user_id?: string | null
          variant: string
          event_name: string
          properties?: Json
          occurred_at?: string
        }
        Update: {
          id?: string
          experiment_id?: string
          user_id?: string | null
          variant?: string
          event_name?: string
          properties?: Json
          occurred_at?: string
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
          id: string
          name: string
          description: string | null
          status: string
          variants: Json
          traffic_pct: number
          started_at: string | null
          ended_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          status?: string
          variants?: Json
          traffic_pct?: number
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          status?: string
          variants?: Json
          traffic_pct?: number
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_submissions: {
        Row: {
          id: string
          user_id: string | null
          user_email: string | null
          category: string
          subject: string
          message: string
          page_url: string | null
          user_agent: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          category: string
          subject: string
          message: string
          page_url?: string | null
          user_agent?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          category?: string
          subject?: string
          message?: string
          page_url?: string | null
          user_agent?: string | null
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      interview_stories: {
        Row: {
          id: string
          user_id: string
          source_evaluation_id: string | null
          title: string
          theme: string | null
          situation: string
          task: string
          action: string
          result: string
          reflection: string | null
          archetypes: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source_evaluation_id?: string | null
          title: string
          theme?: string | null
          situation: string
          task: string
          action: string
          result: string
          reflection?: string | null
          archetypes?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          source_evaluation_id?: string | null
          title?: string
          theme?: string | null
          situation?: string
          task?: string
          action?: string
          result?: string
          reflection?: string | null
          archetypes?: string[]
          created_at?: string
          updated_at?: string
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
          jd_hash: string
          keywords: Json
          model: string
          created_at: string
        }
        Insert: {
          jd_hash: string
          keywords: Json
          model?: string
          created_at?: string
        }
        Update: {
          jd_hash?: string
          keywords?: Json
          model?: string
          created_at?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          id: string
          user_id: string
          job_id: string | null
          title: string
          company: string
          status: string | null
          applied_at: string | null
          apply_url: string | null
          notes: string | null
          confirmation_email_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          job_id?: string | null
          title: string
          company: string
          status?: string | null
          applied_at?: string | null
          apply_url?: string | null
          notes?: string | null
          confirmation_email_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          job_id?: string | null
          title?: string
          company?: string
          status?: string | null
          applied_at?: string | null
          apply_url?: string | null
          notes?: string | null
          confirmation_email_id?: string | null
          created_at?: string | null
          updated_at?: string | null
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
          id: string
          user_id: string
          scanned_job_id: string
          resume_id: string | null
          score: number
          archetype: string | null
          tier: string | null
          summary: string | null
          keyword_matches: string[] | null
          gaps: string[] | null
          star_stories: Json | null
          report_md: string | null
          model: string
          tokens_in: number
          tokens_out: number
          error_message: string | null
          evaluated_at: string
          fit_score: number | null
          fit_confidence: number | null
          eligible: boolean
          dimension_scores: Json
          hard_filters: string[]
          score_version: string
          dismissed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          scanned_job_id: string
          resume_id?: string | null
          score: number
          archetype?: string | null
          tier?: string | null
          summary?: string | null
          keyword_matches?: string[] | null
          gaps?: string[] | null
          star_stories?: Json | null
          report_md?: string | null
          model?: string
          tokens_in?: number
          tokens_out?: number
          error_message?: string | null
          evaluated_at?: string
          fit_score?: number | null
          fit_confidence?: number | null
          eligible?: boolean
          dimension_scores?: Json
          hard_filters?: string[]
          score_version?: string
          dismissed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          scanned_job_id?: string
          resume_id?: string | null
          score?: number
          archetype?: string | null
          tier?: string | null
          summary?: string | null
          keyword_matches?: string[] | null
          gaps?: string[] | null
          star_stories?: Json | null
          report_md?: string | null
          model?: string
          tokens_in?: number
          tokens_out?: number
          error_message?: string | null
          evaluated_at?: string
          fit_score?: number | null
          fit_confidence?: number | null
          eligible?: boolean
          dimension_scores?: Json
          hard_filters?: string[]
          score_version?: string
          dismissed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_evaluations_scanned_job_id_fkey"
            columns: ["scanned_job_id"]
            isOneToOne: false
            referencedRelation: "scanned_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_evaluations_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_matches: {
        Row: {
          id: string
          user_id: string
          job_id: string
          match_score: number
          match_reasons: Json | null
          dismissed: boolean | null
          liked: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          job_id: string
          match_score?: number
          match_reasons?: Json | null
          dismissed?: boolean | null
          liked?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          job_id?: string
          match_score?: number
          match_reasons?: Json | null
          dismissed?: boolean | null
          liked?: boolean | null
          created_at?: string | null
          updated_at?: string | null
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
          id: string
          title: string
          company: string
          location: string | null
          description: string | null
          apply_url: string | null
          source: string | null
          date_posted: string | null
          salary_min: number | null
          salary_max: number | null
          job_type: string | null
          remote: boolean | null
          employer_logo: string | null
          external_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title: string
          company: string
          location?: string | null
          description?: string | null
          apply_url?: string | null
          source?: string | null
          date_posted?: string | null
          salary_min?: number | null
          salary_max?: number | null
          job_type?: string | null
          remote?: boolean | null
          employer_logo?: string | null
          external_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          company?: string
          location?: string | null
          description?: string | null
          apply_url?: string | null
          source?: string | null
          date_posted?: string | null
          salary_min?: number | null
          salary_max?: number | null
          job_type?: string | null
          remote?: boolean | null
          employer_logo?: string | null
          external_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      linkedin_optimizations: {
        Row: {
          id: string
          user_id: string
          kind: string
          target_role: string | null
          source_text: string | null
          output_text: string
          rationale: string | null
          model: string
          tokens_in: number
          tokens_out: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          kind: string
          target_role?: string | null
          source_text?: string | null
          output_text: string
          rationale?: string | null
          model: string
          tokens_in?: number
          tokens_out?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          kind?: string
          target_role?: string | null
          source_text?: string | null
          output_text?: string
          rationale?: string | null
          model?: string
          tokens_in?: number
          tokens_out?: number
          created_at?: string
        }
        Relationships: []
      }
      mc_ai_jobs: {
        Row: {
          id: string
          user_id: string
          session_id: string | null
          kind: string
          status: string
          model: string
          prompt: string
          input: Json | null
          result: string | null
          result_json: Json | null
          error: string | null
          attempts: number
          priority: number
          created_at: string
          started_at: string | null
          finished_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          session_id?: string | null
          kind: string
          status?: string
          model?: string
          prompt: string
          input?: Json | null
          result?: string | null
          result_json?: Json | null
          error?: string | null
          attempts?: number
          priority?: number
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string | null
          kind?: string
          status?: string
          model?: string
          prompt?: string
          input?: Json | null
          result?: string | null
          result_json?: Json | null
          error?: string | null
          attempts?: number
          priority?: number
          created_at?: string
          started_at?: string | null
          finished_at?: string | null
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
          id: string
          user_id: string
          session_id: string
          day: string
          kind: string
          model: string
          count: number
          tokens_in: number
          tokens_out: number
          cents_estimated: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          day?: string
          kind: string
          model: string
          count?: number
          tokens_in?: number
          tokens_out?: number
          cents_estimated?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string
          day?: string
          kind?: string
          model?: string
          count?: number
          tokens_in?: number
          tokens_out?: number
          cents_estimated?: number
          created_at?: string
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
          id: string
          user_id: string
          session_id: string
          company_slug: string
          company_name: string
          research_md: string
          source_urls: Json | null
          model: string
          tokens_in: number | null
          tokens_out: number | null
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          company_slug: string
          company_name: string
          research_md: string
          source_urls?: Json | null
          model?: string
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
          expires_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string
          company_slug?: string
          company_name?: string
          research_md?: string
          source_urls?: Json | null
          model?: string
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
          expires_at?: string
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
          id: string
          session_id: string
          user_id: string
          scanned_job_id: string
          score: number | null
          tier: string | null
          archetype: string | null
          summary: string | null
          keyword_matches: Json | null
          gaps: Json | null
          star_stories: Json | null
          report_md: string | null
          model: string
          tokens_in: number | null
          tokens_out: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          scanned_job_id: string
          score?: number | null
          tier?: string | null
          archetype?: string | null
          summary?: string | null
          keyword_matches?: Json | null
          gaps?: Json | null
          star_stories?: Json | null
          report_md?: string | null
          model?: string
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          scanned_job_id?: string
          score?: number | null
          tier?: string | null
          archetype?: string | null
          summary?: string | null
          keyword_matches?: Json | null
          gaps?: Json | null
          star_stories?: Json | null
          report_md?: string | null
          model?: string
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
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
          id: string
          user_id: string
          session_id: string
          gmail_email: string
          token_expires_at: string
          scopes: string[]
          history_id: string | null
          last_polled_at: string | null
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          gmail_email: string
          token_expires_at: string
          scopes: string[]
          history_id?: string | null
          last_polled_at?: string | null
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string
          gmail_email?: string
          token_expires_at?: string
          scopes?: string[]
          history_id?: string | null
          last_polled_at?: string | null
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_gmail_connections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_inbound_emails: {
        Row: {
          id: string
          user_id: string
          session_id: string | null
          tracked_job_id: string | null
          message_id: string | null
          from_email: string
          to_email: string | null
          subject: string | null
          body_preview: string | null
          body_full: string | null
          classification: string | null
          classification_confidence: number | null
          classification_summary: string | null
          next_action: string | null
          parsed_at: string | null
          raw: Json | null
          received_at: string
          verification_code: string | null
          verification_code_expires_at: string | null
          is_read: boolean
          verification_code_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          session_id?: string | null
          tracked_job_id?: string | null
          message_id?: string | null
          from_email: string
          to_email?: string | null
          subject?: string | null
          body_preview?: string | null
          body_full?: string | null
          classification?: string | null
          classification_confidence?: number | null
          classification_summary?: string | null
          next_action?: string | null
          parsed_at?: string | null
          raw?: Json | null
          received_at?: string
          verification_code?: string | null
          verification_code_expires_at?: string | null
          is_read?: boolean
          verification_code_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string | null
          tracked_job_id?: string | null
          message_id?: string | null
          from_email?: string
          to_email?: string | null
          subject?: string | null
          body_preview?: string | null
          body_full?: string | null
          classification?: string | null
          classification_confidence?: number | null
          classification_summary?: string | null
          next_action?: string | null
          parsed_at?: string | null
          raw?: Json | null
          received_at?: string
          verification_code?: string | null
          verification_code_expires_at?: string | null
          is_read?: boolean
          verification_code_used_at?: string | null
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
          id: string
          user_id: string
          name: string
          status: string
          master_resume_id: string | null
          target_profile: Json
          template_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          status?: string
          master_resume_id?: string | null
          target_profile?: Json
          template_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          status?: string
          master_resume_id?: string | null
          target_profile?: Json
          template_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
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
          id: string
          tracked_job_id: string
          user_id: string
          status_from: string | null
          status_to: string
          source: string
          email_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tracked_job_id: string
          user_id: string
          status_from?: string | null
          status_to: string
          source?: string
          email_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tracked_job_id?: string
          user_id?: string
          status_from?: string | null
          status_to?: string
          source?: string
          email_id?: string | null
          created_at?: string
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
          id: string
          session_id: string
          user_id: string
          source_job_id: string | null
          source_evaluation_id: string | null
          name: string
          cv_md: string
          rendered_html: string | null
          pdf_url: string | null
          docx_url: string | null
          ats_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          source_job_id?: string | null
          source_evaluation_id?: string | null
          name: string
          cv_md: string
          rendered_html?: string | null
          pdf_url?: string | null
          docx_url?: string | null
          ats_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          source_job_id?: string | null
          source_evaluation_id?: string | null
          name?: string
          cv_md?: string
          rendered_html?: string | null
          pdf_url?: string | null
          docx_url?: string | null
          ats_score?: number | null
          created_at?: string
          updated_at?: string
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
          id: string
          session_id: string
          user_id: string
          scanned_job_id: string | null
          job_title: string
          company: string
          location: string | null
          apply_url: string | null
          jd_md: string | null
          tailored_resume_id: string | null
          status: string
          applied_at: string | null
          clicked_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          scanned_job_id?: string | null
          job_title: string
          company: string
          location?: string | null
          apply_url?: string | null
          jd_md?: string | null
          tailored_resume_id?: string | null
          status?: string
          applied_at?: string | null
          clicked_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          scanned_job_id?: string | null
          job_title?: string
          company?: string
          location?: string | null
          apply_url?: string | null
          jd_md?: string | null
          tailored_resume_id?: string | null
          status?: string
          applied_at?: string | null
          clicked_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mc_tracked_jobs_tailored_resume_id_fkey"
            columns: ["tailored_resume_id"]
            isOneToOne: false
            referencedRelation: "mc_tailored_resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_tracked_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mc_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_worker_heartbeats: {
        Row: {
          user_id: string
          hostname: string | null
          version: string | null
          last_seen: string
        }
        Insert: {
          user_id: string
          hostname?: string | null
          version?: string | null
          last_seen?: string
        }
        Update: {
          user_id?: string
          hostname?: string | null
          version?: string | null
          last_seen?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: string
          content?: string
          created_at?: string
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
          id: string
          user_id: string | null
          session_id: string
          event_name: string
          path: string | null
          referrer: string | null
          source: string
          properties: Json
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          session_id: string
          event_name: string
          path?: string | null
          referrer?: string | null
          source?: string
          properties?: Json
          occurred_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          session_id?: string
          event_name?: string
          path?: string | null
          referrer?: string | null
          source?: string
          properties?: Json
          occurred_at?: string
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
          onboarding_completed: boolean
          target_role: string | null
          job_preferences: Json | null
          resume_json: Json | null
          phone: string | null
          primary_resume_id: string | null
          location: string | null
          years_of_experience: number | null
          linkedin_url: string | null
        }
        Insert: {
          id?: string
          user_id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          onboarding_completed?: boolean
          target_role?: string | null
          job_preferences?: Json | null
          resume_json?: Json | null
          phone?: string | null
          primary_resume_id?: string | null
          location?: string | null
          years_of_experience?: number | null
          linkedin_url?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          onboarding_completed?: boolean
          target_role?: string | null
          job_preferences?: Json | null
          resume_json?: Json | null
          phone?: string | null
          primary_resume_id?: string | null
          location?: string | null
          years_of_experience?: number | null
          linkedin_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_resume_id_fkey"
            columns: ["primary_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_career_profiles: {
        Row: {
          id: string
          user_id: string
          resume_id: string
          source_fingerprint: string
          graph: Json
          calculated_experience_years: number
          confirmed_experience_years: number | null
          model: string
          tokens_in: number
          tokens_out: number
          review_version: string
          reviewed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          resume_id: string
          source_fingerprint: string
          graph: Json
          calculated_experience_years?: number
          confirmed_experience_years?: number | null
          model: string
          tokens_in?: number
          tokens_out?: number
          review_version?: string
          reviewed_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          resume_id?: string
          source_fingerprint?: string
          graph?: Json
          calculated_experience_years?: number
          confirmed_experience_years?: number | null
          model?: string
          tokens_in?: number
          tokens_out?: number
          review_version?: string
          reviewed_at?: string
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
          id: string
          user_id: string
          draft_application_id: string
          master_resume_id: string | null
          tailored_resume_id: string | null
          ats_before: number | null
          ats_after: number | null
          changes: Json
          model: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          draft_application_id: string
          master_resume_id?: string | null
          tailored_resume_id?: string | null
          ats_before?: number | null
          ats_after?: number | null
          changes?: Json
          model?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          draft_application_id?: string
          master_resume_id?: string | null
          tailored_resume_id?: string | null
          ats_before?: number | null
          ats_after?: number | null
          changes?: Json
          model?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_tailoring_runs_draft_application_id_fkey"
            columns: ["draft_application_id"]
            isOneToOne: false
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
      resumes: {
        Row: {
          id: string
          user_id: string
          title: string
          personal_info: Json
          summary: string
          experience: Json
          education: Json
          skills: Json
          projects: Json
          certifications: Json
          languages: Json
          template: string
          created_at: string
          updated_at: string
          section_order: Json | null
          volunteer: Json | null
          awards: Json | null
          custom_sections: Json | null
          source_document_id: string | null
          source_hash: string | null
          parser_version: string | null
          parse_quality: Json | null
          parsed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          personal_info?: Json
          summary?: string
          experience?: Json
          education?: Json
          skills?: Json
          projects?: Json
          certifications?: Json
          languages?: Json
          template?: string
          created_at?: string
          updated_at?: string
          section_order?: Json | null
          volunteer?: Json | null
          awards?: Json | null
          custom_sections?: Json | null
          source_document_id?: string | null
          source_hash?: string | null
          parser_version?: string | null
          parse_quality?: Json | null
          parsed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          personal_info?: Json
          summary?: string
          experience?: Json
          education?: Json
          skills?: Json
          projects?: Json
          certifications?: Json
          languages?: Json
          template?: string
          created_at?: string
          updated_at?: string
          section_order?: Json | null
          volunteer?: Json | null
          awards?: Json | null
          custom_sections?: Json | null
          source_document_id?: string | null
          source_hash?: string | null
          parser_version?: string | null
          parse_quality?: Json | null
          parsed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resumes_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "user_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          id: string
          user_id: string
          job_title: string
          company: string
          location: string | null
          description: string | null
          apply_url: string | null
          salary: string | null
          job_type: string | null
          remote: boolean | null
          date_posted: string | null
          source: string | null
          saved_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          job_title: string
          company: string
          location?: string | null
          description?: string | null
          apply_url?: string | null
          salary?: string | null
          job_type?: string | null
          remote?: boolean | null
          date_posted?: string | null
          source?: string | null
          saved_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          job_title?: string
          company?: string
          location?: string | null
          description?: string | null
          apply_url?: string | null
          salary?: string | null
          job_type?: string | null
          remote?: boolean | null
          date_posted?: string | null
          source?: string | null
          saved_at?: string | null
        }
        Relationships: []
      }
      scan_companies: {
        Row: {
          id: string
          slug: string
          name: string
          api_type: string
          api_identifier: string
          careers_url: string | null
          category: string | null
          enabled: boolean
          last_scanned_at: string | null
          last_scan_count: number | null
          last_scan_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          api_type: string
          api_identifier: string
          careers_url?: string | null
          category?: string | null
          enabled?: boolean
          last_scanned_at?: string | null
          last_scan_count?: number | null
          last_scan_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          api_type?: string
          api_identifier?: string
          careers_url?: string | null
          category?: string | null
          enabled?: boolean
          last_scanned_at?: string | null
          last_scan_count?: number | null
          last_scan_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scanned_jobs: {
        Row: {
          id: string
          company_id: string
          external_id: string
          title: string
          location: string | null
          department: string | null
          employment_type: string | null
          remote_policy: string | null
          compensation_text: string | null
          description_md: string | null
          apply_url: string
          posted_at: string | null
          first_seen_at: string
          last_seen_at: string
          is_live: boolean
          raw: Json | null
        }
        Insert: {
          id?: string
          company_id: string
          external_id: string
          title: string
          location?: string | null
          department?: string | null
          employment_type?: string | null
          remote_policy?: string | null
          compensation_text?: string | null
          description_md?: string | null
          apply_url: string
          posted_at?: string | null
          first_seen_at?: string
          last_seen_at?: string
          is_live?: boolean
          raw?: Json | null
        }
        Update: {
          id?: string
          company_id?: string
          external_id?: string
          title?: string
          location?: string | null
          department?: string | null
          employment_type?: string | null
          remote_policy?: string | null
          compensation_text?: string | null
          description_md?: string | null
          apply_url?: string
          posted_at?: string | null
          first_seen_at?: string
          last_seen_at?: string
          is_live?: boolean
          raw?: Json | null
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
      sso_configurations: {
        Row: {
          id: string
          tenant_id: string
          protocol: string
          issuer_url: string | null
          client_id: string | null
          idp_metadata_url: string | null
          sp_acs_url: string | null
          attribute_map: Json
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          protocol?: string
          issuer_url?: string | null
          client_id?: string | null
          idp_metadata_url?: string | null
          sp_acs_url?: string | null
          attribute_map?: Json
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          protocol?: string
          issuer_url?: string | null
          client_id?: string | null
          idp_metadata_url?: string | null
          sp_acs_url?: string | null
          attribute_map?: Json
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sso_configurations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "enterprise_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          id: string
          user_id: string
          plan_type: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          current_period_start: string | null
          current_period_end: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tracked_jobs: {
        Row: {
          id: string
          user_id: string
          title: string
          company: string
          status: string
          url: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          company?: string
          status?: string
          url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          company?: string
          status?: string
          url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_access_controls: {
        Row: {
          user_id: string
          account_status: string
          purchase_state: string
          subscription_plan: string
          ai_features_enabled: boolean
          blocked_reason: string | null
          blocked_until: string | null
          metadata: Json
          last_admin_action_by: string | null
          last_admin_action_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          account_status?: string
          purchase_state?: string
          subscription_plan?: string
          ai_features_enabled?: boolean
          blocked_reason?: string | null
          blocked_until?: string | null
          metadata?: Json
          last_admin_action_by?: string | null
          last_admin_action_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          account_status?: string
          purchase_state?: string
          subscription_plan?: string
          ai_features_enabled?: boolean
          blocked_reason?: string | null
          blocked_until?: string | null
          metadata?: Json
          last_admin_action_by?: string | null
          last_admin_action_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_documents: {
        Row: {
          id: string
          user_id: string
          file_name: string
          file_type: string
          category: string
          extracted_text: string | null
          file_size: number | null
          storage_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          file_type?: string
          category?: string
          extracted_text?: string | null
          file_size?: number | null
          storage_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          file_name?: string
          file_type?: string
          category?: string
          extracted_text?: string | null
          file_size?: number | null
          storage_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_job_prefs: {
        Row: {
          user_id: string
          target_roles: string[]
          negative_keywords: string[]
          locations: string[]
          remote_only: boolean
          comp_target_usd_min: number | null
          comp_target_usd_max: number | null
          auto_apply_enabled: boolean
          auto_apply_min_score: number
          daily_apply_cap: number
          auto_apply_portals: string[]
          created_at: string
          updated_at: string
          agent_enabled: boolean
          last_agent_run_at: string | null
          agent_actions_today: number
          agent_max_actions_per_day: number
          target_countries: string[]
          work_modes: string[]
          employment_types: string[]
          seniority_levels: string[]
          excluded_companies: string[]
          min_years_experience: number | null
          max_years_experience: number | null
          work_authorization: string | null
          requires_sponsorship: boolean
          require_salary_disclosure: boolean
          max_stretch_years: number
          review_mode: string
          auto_apply_min_fit_score: number
          auto_apply_min_ats_score: number
          tailoring_mode: string
        }
        Insert: {
          user_id: string
          target_roles?: string[]
          negative_keywords?: string[]
          locations?: string[]
          remote_only?: boolean
          comp_target_usd_min?: number | null
          comp_target_usd_max?: number | null
          auto_apply_enabled?: boolean
          auto_apply_min_score?: number
          daily_apply_cap?: number
          auto_apply_portals?: string[]
          created_at?: string
          updated_at?: string
          agent_enabled?: boolean
          last_agent_run_at?: string | null
          agent_actions_today?: number
          agent_max_actions_per_day?: number
          target_countries?: string[]
          work_modes?: string[]
          employment_types?: string[]
          seniority_levels?: string[]
          excluded_companies?: string[]
          min_years_experience?: number | null
          max_years_experience?: number | null
          work_authorization?: string | null
          requires_sponsorship?: boolean
          require_salary_disclosure?: boolean
          max_stretch_years?: number
          review_mode?: string
          auto_apply_min_fit_score?: number
          auto_apply_min_ats_score?: number
          tailoring_mode?: string
        }
        Update: {
          user_id?: string
          target_roles?: string[]
          negative_keywords?: string[]
          locations?: string[]
          remote_only?: boolean
          comp_target_usd_min?: number | null
          comp_target_usd_max?: number | null
          auto_apply_enabled?: boolean
          auto_apply_min_score?: number
          daily_apply_cap?: number
          auto_apply_portals?: string[]
          created_at?: string
          updated_at?: string
          agent_enabled?: boolean
          last_agent_run_at?: string | null
          agent_actions_today?: number
          agent_max_actions_per_day?: number
          target_countries?: string[]
          work_modes?: string[]
          employment_types?: string[]
          seniority_levels?: string[]
          excluded_companies?: string[]
          min_years_experience?: number | null
          max_years_experience?: number | null
          work_authorization?: string | null
          requires_sponsorship?: boolean
          require_salary_disclosure?: boolean
          max_stretch_years?: number
          review_mode?: string
          auto_apply_min_fit_score?: number
          auto_apply_min_ats_score?: number
          tailoring_mode?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Relationships: []
      }
      user_seen_jobs: {
        Row: {
          id: string
          user_id: string
          job_fingerprint: string
          seen_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          job_fingerprint: string
          seen_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          job_fingerprint?: string
          seen_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_app_incident: {
        Args: {
          p_context?: Json
          p_environment: string
          p_fingerprint: string
          p_message: string
          p_release_sha: string
          p_route: string
          p_severity: string
          p_stack_trace?: string | null
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "enterprise_admin" | "enterprise_member"
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
      app_role: ["admin", "moderator", "user", "enterprise_admin", "enterprise_member"],
    },
  },
} as const
