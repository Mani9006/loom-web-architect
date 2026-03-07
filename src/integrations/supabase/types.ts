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
      cached_jobs: {
        Row: {
          apply_url: string | null
          company: string
          created_at: string | null
          date_posted: string | null
          description: string | null
          expires_at: string | null
          id: string
          job_fingerprint: string
          job_type: string | null
          location: string
          remote: boolean | null
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
          expires_at?: string | null
          id?: string
          job_fingerprint: string
          job_type?: string | null
          location?: string
          remote?: boolean | null
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
          expires_at?: string | null
          id?: string
          job_fingerprint?: string
          job_type?: string | null
          location?: string
          remote?: boolean | null
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
          external_id: string | null
          id: string
          job_type: string | null
          location: string | null
          remote: boolean | null
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
          external_id?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          remote?: boolean | null
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
          external_id?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          remote?: boolean | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string | null
          title?: string
          updated_at?: string | null
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
          onboarding_completed: boolean
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
          onboarding_completed?: boolean
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
          onboarding_completed?: boolean
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
          certifications: Json
          created_at: string
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
        }
        Insert: {
          certifications?: Json
          created_at?: string
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
        }
        Update: {
          certifications?: Json
          created_at?: string
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
      vault_read_secret: { Args: { secret_name: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
