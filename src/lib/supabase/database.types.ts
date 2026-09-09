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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          actor_contact_id: string | null
          actor_user_id: string | null
          client_id: string
          created_at: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["approval_kind"]
          note: string | null
          org_id: string
          quote_id: string | null
          snapshot: Json
        }
        Insert: {
          actor_contact_id?: string | null
          actor_user_id?: string | null
          client_id: string
          created_at?: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id?: string
          job_id: string
          kind: Database["public"]["Enums"]["approval_kind"]
          note?: string | null
          org_id: string
          quote_id?: string | null
          snapshot: Json
        }
        Update: {
          actor_contact_id?: string | null
          actor_user_id?: string | null
          client_id?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["approval_kind"]
          note?: string | null
          org_id?: string
          quote_id?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "approvals_actor_contact_id_fkey"
            columns: ["actor_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "approvals_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "approvals_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "approvals_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_quote_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "approvals_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "approvals_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_quote_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      auth_claim_epochs: {
        Row: {
          bumped_at: string
          epoch: number
          reason: string | null
          user_id: string
        }
        Insert: {
          bumped_at?: string
          epoch?: number
          reason?: string | null
          user_id: string
        }
        Update: {
          bumped_at?: string
          epoch?: number
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      catalog_items: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["line_kind"]
          name: string
          org_id: string
          sku: string | null
          tax_rate: number
          unit: string
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["line_kind"]
          name: string
          org_id: string
          sku?: string | null
          tax_rate?: number
          unit?: string
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["line_kind"]
          name?: string
          org_id?: string
          sku?: string | null
          tax_rate?: number
          unit?: string
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          org_id: string
          phone: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["contact_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id: string
          phone?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["contact_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id?: string
          phone?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["contact_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "client_contacts_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "client_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_internal_notes: {
        Row: {
          client_id: string
          created_at: string
          notes: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          notes: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          notes?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_internal_notes_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "client_internal_notes_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "client_internal_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          billing_address: Json | null
          billing_email: string | null
          created_at: string
          created_by: string | null
          external_ref: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          billing_address?: Json | null
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          billing_address?: Json | null
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          catalog_item_id: string | null
          client_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["line_kind"]
          line_tax_cents: number | null
          line_total_cents: number | null
          org_id: string
          position: number
          quantity: number
          tax_rate: number
          unit: string
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          catalog_item_id?: string | null
          client_id: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          kind?: Database["public"]["Enums"]["line_kind"]
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id: string
          position: number
          quantity: number
          tax_rate?: number
          unit?: string
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          catalog_item_id?: string | null
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          kind?: Database["public"]["Enums"]["line_kind"]
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id?: string
          position?: number
          quantity?: number
          tax_rate?: number
          unit?: string
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_catalog_fk"
            columns: ["catalog_item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_client_fk"
            columns: ["invoice_id", "client_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_client_fk"
            columns: ["invoice_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_invoice_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_invoice_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          id: string
          issued_at: string | null
          job_id: string
          notes: string | null
          number: number
          org_id: string
          paid_at: string | null
          payment_ref: string | null
          quote_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          id?: string
          issued_at?: string | null
          job_id: string
          notes?: string | null
          number: number
          org_id: string
          paid_at?: string | null
          payment_ref?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          terms?: string | null
          total_cents?: number
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          id?: string
          issued_at?: string | null
          job_id?: string
          notes?: string | null
          number?: number
          org_id?: string
          paid_at?: string | null
          payment_ref?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          terms?: string | null
          total_cents?: number
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_quote_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_quote_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      job_evidence: {
        Row: {
          body: string | null
          byte_size: number | null
          caption: string | null
          captured_at: string | null
          captured_by: string | null
          client_id: string
          client_ref: string
          client_visible: boolean
          created_at: string
          height: number | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          mime_type: string | null
          org_id: string
          storage_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          body?: string | null
          byte_size?: number | null
          caption?: string | null
          captured_at?: string | null
          captured_by?: string | null
          client_id: string
          client_ref: string
          client_visible?: boolean
          created_at?: string
          height?: number | null
          id?: string
          job_id: string
          kind: Database["public"]["Enums"]["evidence_kind"]
          mime_type?: string | null
          org_id: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          body?: string | null
          byte_size?: number | null
          caption?: string | null
          captured_at?: string | null
          captured_by?: string | null
          client_id?: string
          client_ref?: string
          client_visible?: boolean
          created_at?: string
          height?: number | null
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["evidence_kind"]
          mime_type?: string | null
          org_id?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_evidence_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_evidence_job_org_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_evidence_job_org_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_evidence_job_org_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_evidence_job_org_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      job_internal_notes: {
        Row: {
          created_at: string
          job_id: string
          notes: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          job_id: string
          notes: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          job_id?: string
          notes?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_internal_notes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_internal_notes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_internal_notes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_internal_notes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_internal_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_status_events: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["job_status"] | null
          id: number
          job_id: string
          org_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["job_status"] | null
          id?: never
          job_id: string
          org_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["job_status"] | null
          id?: never
          job_id?: string
          org_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "job_status_events_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_status_events_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_status_events_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "job_status_events_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      job_status_transitions: {
        Row: {
          actor_kind: string
          from_status: Database["public"]["Enums"]["job_status"]
          to_status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          actor_kind: string
          from_status: Database["public"]["Enums"]["job_status"]
          to_status: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          actor_kind?: string
          from_status?: Database["public"]["Enums"]["job_status"]
          to_status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: []
      }
      jobs: {
        Row: {
          client_id: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_tech_id: string | null
          number: number
          org_id: string
          priority: Database["public"]["Enums"]["job_priority"]
          requested_by_contact_id: string | null
          requested_for: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          site_id: string | null
          source: Database["public"]["Enums"]["job_source"]
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_tech_id?: string | null
          number: number
          org_id: string
          priority?: Database["public"]["Enums"]["job_priority"]
          requested_by_contact_id?: string | null
          requested_for?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          site_id?: string | null
          source?: Database["public"]["Enums"]["job_source"]
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_tech_id?: string | null
          number?: number
          org_id?: string
          priority?: Database["public"]["Enums"]["job_priority"]
          requested_by_contact_id?: string | null
          requested_for?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          site_id?: string | null
          source?: Database["public"]["Enums"]["job_source"]
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_requested_by_contact_id_fkey"
            columns: ["requested_by_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_site_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_site_list_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          kind: string
          next_value: number
          org_id: string
          period: string
        }
        Insert: {
          kind: string
          next_value?: number
          org_id: string
          period?: string
        }
        Update: {
          kind?: string
          next_value?: number
          org_id?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          invited_at: string | null
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          brand_color: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_tax_rate: number
          id: string
          invoice_prefix: string
          invoice_terms_days: number
          logo_path: string | null
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_tax_rate?: number
          id?: string
          invoice_prefix?: string
          invoice_terms_days?: number
          logo_path?: string | null
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_tax_rate?: number
          id?: string
          invoice_prefix?: string
          invoice_terms_days?: number
          logo_path?: string | null
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_internal_notes: {
        Row: {
          created_at: string
          notes: string
          org_id: string
          quote_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          notes: string
          org_id: string
          quote_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          notes?: string
          org_id?: string
          quote_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_internal_notes_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_quote_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_internal_notes_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_internal_notes_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_quote_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_internal_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          catalog_item_id: string | null
          client_id: string
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["line_kind"]
          line_tax_cents: number | null
          line_total_cents: number | null
          org_id: string
          position: number
          quantity: number
          quote_id: string
          tax_rate: number
          unit: string
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          catalog_item_id?: string | null
          client_id: string
          created_at?: string
          description: string
          id?: string
          kind?: Database["public"]["Enums"]["line_kind"]
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id: string
          position: number
          quantity: number
          quote_id: string
          tax_rate?: number
          unit?: string
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          catalog_item_id?: string | null
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["line_kind"]
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id?: string
          position?: number
          quantity?: number
          quote_id?: string
          tax_rate?: number
          unit?: string
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_catalog_fk"
            columns: ["catalog_item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_client_fk"
            columns: ["quote_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_quote_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_client_fk"
            columns: ["quote_id", "client_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_client_fk"
            columns: ["quote_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_quote_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_quote_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_quote_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          id: string
          job_id: string
          locked_at: string | null
          notes: string | null
          number: number
          org_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          id?: string
          job_id: string
          locked_at?: string | null
          notes?: string | null
          number: number
          org_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          tax_cents?: number
          terms?: string | null
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          id?: string
          job_id?: string
          locked_at?: string | null
          notes?: string | null
          number?: number
          org_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          tax_cents?: number
          terms?: string | null
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_access_notes: {
        Row: {
          created_at: string
          notes: string
          org_id: string
          site_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          notes: string
          org_id: string
          site_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          notes?: string
          org_id?: string
          site_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_access_notes_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_site_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "site_access_notes_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "site_access_notes_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_site_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "site_access_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: Json | null
          archived_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          org_id: string
          site_contact_name: string | null
          site_contact_phone: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          archived_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          org_id: string
          site_contact_name?: string | null
          site_contact_phone?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          archived_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          org_id?: string
          site_contact_name?: string | null
          site_contact_phone?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "sites_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      portal_invoice_line_v: {
        Row: {
          client_id: string | null
          description: string | null
          id: string | null
          invoice_id: string | null
          kind: Database["public"]["Enums"]["line_kind"] | null
          line_tax_cents: number | null
          line_total_cents: number | null
          org_id: string | null
          position: number | null
          quantity: number | null
          tax_rate: number | null
          unit: string | null
          unit_price_cents: number | null
        }
        Insert: {
          client_id?: string | null
          description?: string | null
          id?: string | null
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["line_kind"] | null
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id?: string | null
          position?: number | null
          quantity?: number | null
          tax_rate?: number | null
          unit?: string | null
          unit_price_cents?: number | null
        }
        Update: {
          client_id?: string | null
          description?: string | null
          id?: string | null
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["line_kind"] | null
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id?: string | null
          position?: number | null
          quantity?: number | null
          tax_rate?: number | null
          unit?: string | null
          unit_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_client_fk"
            columns: ["invoice_id", "client_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_client_fk"
            columns: ["invoice_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_invoice_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_fk"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_invoice_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_invoice_v: {
        Row: {
          client_id: string | null
          created_at: string | null
          currency: string | null
          due_at: string | null
          id: string | null
          issued_at: string | null
          job_id: string | null
          notes: string | null
          number: number | null
          org_id: string | null
          paid_at: string | null
          payment_ref: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal_cents: number | null
          tax_cents: number | null
          terms: string | null
          total_cents: number | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_at?: string | null
          id?: string | null
          issued_at?: string | null
          job_id?: string | null
          notes?: string | null
          number?: number | null
          org_id?: string | null
          paid_at?: string | null
          payment_ref?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal_cents?: number | null
          tax_cents?: number | null
          terms?: string | null
          total_cents?: number | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_at?: string | null
          id?: string | null
          issued_at?: string | null
          job_id?: string | null
          notes?: string | null
          number?: number | null
          org_id?: string | null
          paid_at?: string | null
          payment_ref?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal_cents?: number | null
          tax_cents?: number | null
          terms?: string | null
          total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_job_evidence_v: {
        Row: {
          body: string | null
          caption: string | null
          captured_at: string | null
          client_id: string | null
          created_at: string | null
          height: number | null
          id: string | null
          job_id: string | null
          kind: Database["public"]["Enums"]["evidence_kind"] | null
          mime_type: string | null
          storage_path: string | null
          width: number | null
        }
        Insert: {
          body?: string | null
          caption?: string | null
          captured_at?: string | null
          client_id?: string | null
          created_at?: string | null
          height?: number | null
          id?: string | null
          job_id?: string | null
          kind?: Database["public"]["Enums"]["evidence_kind"] | null
          mime_type?: string | null
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          body?: string | null
          caption?: string | null
          captured_at?: string | null
          client_id?: string | null
          created_at?: string | null
          height?: number | null
          id?: string | null
          job_id?: string | null
          kind?: Database["public"]["Enums"]["evidence_kind"] | null
          mime_type?: string | null
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "job_evidence_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      portal_job_v: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          number: number | null
          org_id: string | null
          priority: Database["public"]["Enums"]["job_priority"] | null
          requested_for: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          site_id: string | null
          source: Database["public"]["Enums"]["job_source"] | null
          status: Database["public"]["Enums"]["job_status"] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          number?: number | null
          org_id?: string | null
          priority?: Database["public"]["Enums"]["job_priority"] | null
          requested_for?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          site_id?: string | null
          source?: Database["public"]["Enums"]["job_source"] | null
          status?: Database["public"]["Enums"]["job_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          number?: number | null
          org_id?: string | null
          priority?: Database["public"]["Enums"]["job_priority"] | null
          requested_for?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          site_id?: string | null
          source?: Database["public"]["Enums"]["job_source"] | null
          status?: Database["public"]["Enums"]["job_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_site_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_site_list_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      portal_quote_line_v: {
        Row: {
          client_id: string | null
          description: string | null
          id: string | null
          kind: Database["public"]["Enums"]["line_kind"] | null
          line_tax_cents: number | null
          line_total_cents: number | null
          org_id: string | null
          position: number | null
          quantity: number | null
          quote_id: string | null
          tax_rate: number | null
          unit: string | null
          unit_price_cents: number | null
        }
        Insert: {
          client_id?: string | null
          description?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["line_kind"] | null
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id?: string | null
          position?: number | null
          quantity?: number | null
          quote_id?: string | null
          tax_rate?: number | null
          unit?: string | null
          unit_price_cents?: number | null
        }
        Update: {
          client_id?: string | null
          description?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["line_kind"] | null
          line_tax_cents?: number | null
          line_total_cents?: number | null
          org_id?: string | null
          position?: number | null
          quantity?: number | null
          quote_id?: string | null
          tax_rate?: number | null
          unit?: string | null
          unit_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_client_fk"
            columns: ["quote_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_quote_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_client_fk"
            columns: ["quote_id", "client_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_client_fk"
            columns: ["quote_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_quote_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_quote_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_fk"
            columns: ["quote_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_quote_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      portal_quote_v: {
        Row: {
          client_id: string | null
          created_at: string | null
          currency: string | null
          decided_at: string | null
          id: string | null
          job_id: string | null
          notes: string | null
          number: number | null
          org_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          subtotal_cents: number | null
          tax_cents: number | null
          terms: string | null
          total_cents: number | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          decided_at?: string | null
          id?: string | null
          job_id?: string | null
          notes?: string | null
          number?: number | null
          org_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          subtotal_cents?: number | null
          tax_cents?: number | null
          terms?: string | null
          total_cents?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          decided_at?: string | null
          id?: string | null
          job_id?: string | null
          notes?: string | null
          number?: number | null
          org_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          subtotal_cents?: number | null
          tax_cents?: number | null
          terms?: string | null
          total_cents?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_site_v: {
        Row: {
          address: Json | null
          client_id: string | null
          id: string | null
          lat: number | null
          lng: number | null
          name: string | null
          org_id: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          timezone: string | null
        }
        Insert: {
          address?: Json | null
          client_id?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          org_id?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          timezone?: string | null
        }
        Update: {
          address?: Json | null
          client_id?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          org_id?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "sites_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_client_list_v: {
        Row: {
          archived_at: string | null
          billing_email: string | null
          created_at: string | null
          external_ref: string | null
          id: string | null
          job_count: number | null
          name: string | null
          org_id: string | null
          phone: string | null
          search_text: string | null
          site_count: number | null
        }
        Insert: {
          archived_at?: string | null
          billing_email?: string | null
          created_at?: string | null
          external_ref?: string | null
          id?: string | null
          job_count?: never
          name?: string | null
          org_id?: string | null
          phone?: string | null
          search_text?: never
          site_count?: never
        }
        Update: {
          archived_at?: string | null
          billing_email?: string | null
          created_at?: string | null
          external_ref?: string | null
          id?: string | null
          job_count?: never
          name?: string | null
          org_id?: string | null
          phone?: string | null
          search_text?: never
          site_count?: never
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_job_detail_v: {
        Row: {
          client_billing_email: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          internal_notes: string | null
          lead_tech_id: string | null
          number: number | null
          org_id: string | null
          priority: Database["public"]["Enums"]["job_priority"] | null
          requested_by_contact_id: string | null
          requested_by_email: string | null
          requested_by_name: string | null
          requested_for: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          site_access_notes: string | null
          site_address: Json | null
          site_contact_name: string | null
          site_contact_phone: string | null
          site_id: string | null
          site_lat: number | null
          site_lng: number | null
          site_name: string | null
          site_timezone: string | null
          source: Database["public"]["Enums"]["job_source"] | null
          status: Database["public"]["Enums"]["job_status"] | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_requested_by_contact_id_fkey"
            columns: ["requested_by_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_site_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_site_list_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      staff_job_list_v: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string | null
          id: string | null
          lead_tech_id: string | null
          number: number | null
          org_id: string | null
          priority: Database["public"]["Enums"]["job_priority"] | null
          requested_for: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          search_text: string | null
          site_id: string | null
          site_name: string | null
          site_timezone: string | null
          source: Database["public"]["Enums"]["job_source"] | null
          status: Database["public"]["Enums"]["job_status"] | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_site_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "jobs_site_fk"
            columns: ["site_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_site_list_v"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      staff_quote_v: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          decided_at: string | null
          id: string | null
          internal_note: string | null
          job_id: string | null
          locked_at: string | null
          notes: string | null
          number: number | null
          org_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          subtotal_cents: number | null
          tax_cents: number | null
          terms: string | null
          total_cents: number | null
          updated_at: string | null
          valid_until: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_client_fk"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "portal_job_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_detail_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_job_fk"
            columns: ["job_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_job_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_site_list_v: {
        Row: {
          address: Json | null
          archived_at: string | null
          client_id: string | null
          client_name: string | null
          created_at: string | null
          id: string | null
          job_count: number | null
          lat: number | null
          lng: number | null
          name: string | null
          org_id: string | null
          search_text: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          timezone: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "sites_client_fk"
            columns: ["client_id", "org_id"]
            isOneToOne: false
            referencedRelation: "staff_client_list_v"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_completion: {
        Args: { p_job_id: string; p_note?: string }
        Returns: Json
      }
      approve_quote: {
        Args: { p_note?: string; p_quote_id: string }
        Returns: Json
      }
      bootstrap_session: { Args: never; Returns: Json }
      create_invoice_from_job: {
        Args: { p_job_id: string }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          id: string
          issued_at: string | null
          job_id: string
          notes: string | null
          number: number
          org_id: string
          paid_at: string | null
          payment_ref: string | null
          quote_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number
          updated_at: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_job: {
        Args: {
          p_client_id: string
          p_description?: string
          p_internal_notes?: string
          p_priority?: Database["public"]["Enums"]["job_priority"]
          p_requested_for?: string
          p_site_id?: string
          p_title: string
        }
        Returns: {
          client_id: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_tech_id: string | null
          number: number
          org_id: string
          priority: Database["public"]["Enums"]["job_priority"]
          requested_by_contact_id: string | null
          requested_for: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          site_id: string | null
          source: Database["public"]["Enums"]["job_source"]
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          brand_color: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_tax_rate: number
          id: string
          invoice_prefix: string
          invoice_terms_days: number
          logo_path: string | null
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_site: {
        Args: {
          p_access_notes?: string
          p_address?: Json
          p_client_id: string
          p_name: string
          p_site_contact_name?: string
          p_site_contact_phone?: string
          p_timezone?: string
        }
        Returns: {
          address: Json | null
          archived_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          org_id: string
          site_contact_name: string | null
          site_contact_phone: string | null
          timezone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_completion: {
        Args: { p_job_id: string; p_note?: string }
        Returns: Json
      }
      decline_quote: {
        Args: { p_note?: string; p_quote_id: string }
        Returns: Json
      }
      my_memberships: { Args: never; Returns: Json }
      save_quote_draft: {
        Args: { p_header?: Json; p_lines: Json; p_quote_id: string }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          id: string
          job_id: string
          locked_at: string | null
          notes: string | null
          number: number
          org_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_invoice: {
        Args: { p_invoice_id: string }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          id: string
          issued_at: string | null
          job_id: string
          notes: string | null
          number: number
          org_id: string
          paid_at: string | null
          payment_ref: string | null
          quote_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number
          updated_at: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_quote: {
        Args: { p_quote_id: string }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          id: string
          job_id: string
          locked_at: string | null
          notes: string | null
          number: number
          org_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_job_internal_notes: {
        Args: { p_job_id: string; p_notes: string }
        Returns: undefined
      }
      submit_job_request: {
        Args: {
          p_client_id: string
          p_description?: string
          p_requested_for?: string
          p_site_id?: string
          p_title: string
        }
        Returns: {
          client_id: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_tech_id: string | null
          number: number
          org_id: string
          priority: Database["public"]["Enums"]["job_priority"]
          requested_by_contact_id: string | null
          requested_for: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          site_id: string | null
          source: Database["public"]["Enums"]["job_source"]
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      supersede_quote: {
        Args: { p_quote_id: string }
        Returns: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          id: string
          job_id: string
          locked_at: string | null
          notes: string | null
          number: number
          org_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          tax_cents: number
          terms: string | null
          total_cents: number
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      approval_decision: "approved" | "declined"
      approval_kind: "quote" | "completion"
      contact_role: "primary" | "standard" | "viewer"
      evidence_kind: "photo" | "document" | "note"
      invoice_status: "draft" | "sent" | "paid" | "void"
      job_priority: "low" | "normal" | "high" | "emergency"
      job_source: "client_portal" | "staff" | "phone" | "email"
      job_status:
        | "draft"
        | "requested"
        | "triaged"
        | "quoted"
        | "approved"
        | "scheduled"
        | "in_progress"
        | "work_complete"
        | "client_accepted"
        | "invoiced"
        | "closed"
        | "on_hold"
        | "cancelled"
        | "declined"
      line_kind: "material" | "labor" | "discount" | "other"
      quote_status:
        | "draft"
        | "sent"
        | "approved"
        | "declined"
        | "superseded"
        | "expired"
      staff_role: "owner" | "admin" | "dispatcher" | "tech"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      approval_decision: ["approved", "declined"],
      approval_kind: ["quote", "completion"],
      contact_role: ["primary", "standard", "viewer"],
      evidence_kind: ["photo", "document", "note"],
      invoice_status: ["draft", "sent", "paid", "void"],
      job_priority: ["low", "normal", "high", "emergency"],
      job_source: ["client_portal", "staff", "phone", "email"],
      job_status: [
        "draft",
        "requested",
        "triaged",
        "quoted",
        "approved",
        "scheduled",
        "in_progress",
        "work_complete",
        "client_accepted",
        "invoiced",
        "closed",
        "on_hold",
        "cancelled",
        "declined",
      ],
      line_kind: ["material", "labor", "discount", "other"],
      quote_status: [
        "draft",
        "sent",
        "approved",
        "declined",
        "superseded",
        "expired",
      ],
      staff_role: ["owner", "admin", "dispatcher", "tech"],
    },
  },
} as const
