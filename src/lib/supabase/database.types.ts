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
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
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
          role: Database['public']['Enums']['contact_role']
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
          role?: Database['public']['Enums']['contact_role']
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
          role?: Database['public']['Enums']['contact_role']
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'client_contacts_client_fk'
            columns: ['client_id', 'org_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id', 'org_id']
          },
          {
            foreignKeyName: 'client_contacts_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
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
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clients_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      job_status_events: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          from_status: Database['public']['Enums']['job_status'] | null
          id: number
          job_id: string
          org_id: string
          reason: string | null
          to_status: Database['public']['Enums']['job_status']
        }
        Insert: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database['public']['Enums']['job_status'] | null
          id?: never
          job_id: string
          org_id: string
          reason?: string | null
          to_status: Database['public']['Enums']['job_status']
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database['public']['Enums']['job_status'] | null
          id?: never
          job_id?: string
          org_id?: string
          reason?: string | null
          to_status?: Database['public']['Enums']['job_status']
        }
        Relationships: [
          {
            foreignKeyName: 'job_status_events_job_fk'
            columns: ['job_id', 'org_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id', 'org_id']
          },
        ]
      }
      job_status_transitions: {
        Row: {
          actor_kind: string
          from_status: Database['public']['Enums']['job_status']
          to_status: Database['public']['Enums']['job_status']
        }
        Insert: {
          actor_kind: string
          from_status: Database['public']['Enums']['job_status']
          to_status: Database['public']['Enums']['job_status']
        }
        Update: {
          actor_kind?: string
          from_status?: Database['public']['Enums']['job_status']
          to_status?: Database['public']['Enums']['job_status']
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
          internal_notes: string | null
          lead_tech_id: string | null
          number: number
          org_id: string
          priority: Database['public']['Enums']['job_priority']
          requested_by_contact_id: string | null
          requested_for: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          site_id: string | null
          source: Database['public']['Enums']['job_source']
          status: Database['public']['Enums']['job_status']
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
          internal_notes?: string | null
          lead_tech_id?: string | null
          number: number
          org_id: string
          priority?: Database['public']['Enums']['job_priority']
          requested_by_contact_id?: string | null
          requested_for?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          site_id?: string | null
          source?: Database['public']['Enums']['job_source']
          status?: Database['public']['Enums']['job_status']
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
          internal_notes?: string | null
          lead_tech_id?: string | null
          number?: number
          org_id?: string
          priority?: Database['public']['Enums']['job_priority']
          requested_by_contact_id?: string | null
          requested_for?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          site_id?: string | null
          source?: Database['public']['Enums']['job_source']
          status?: Database['public']['Enums']['job_status']
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'jobs_client_fk'
            columns: ['client_id', 'org_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id', 'org_id']
          },
          {
            foreignKeyName: 'jobs_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'jobs_requested_by_contact_id_fkey'
            columns: ['requested_by_contact_id']
            isOneToOne: false
            referencedRelation: 'client_contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'jobs_site_fk'
            columns: ['site_id', 'org_id']
            isOneToOne: false
            referencedRelation: 'sites'
            referencedColumns: ['id', 'org_id']
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
            foreignKeyName: 'number_sequences_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
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
          role: Database['public']['Enums']['staff_role']
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id: string
          role?: Database['public']['Enums']['staff_role']
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id?: string
          role?: Database['public']['Enums']['staff_role']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_members_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
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
      sites: {
        Row: {
          access_notes: string | null
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
          access_notes?: string | null
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
          access_notes?: string | null
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
            foreignKeyName: 'sites_client_fk'
            columns: ['client_id', 'org_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id', 'org_id']
          },
          {
            foreignKeyName: 'sites_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_session: { Args: never; Returns: Json }
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
          from: '*'
          to: 'organizations'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_memberships: { Args: never; Returns: Json }
    }
    Enums: {
      contact_role: 'primary' | 'standard' | 'viewer'
      job_priority: 'low' | 'normal' | 'high' | 'emergency'
      job_source: 'client_portal' | 'staff' | 'phone' | 'email'
      job_status:
        | 'draft'
        | 'requested'
        | 'triaged'
        | 'quoted'
        | 'approved'
        | 'scheduled'
        | 'in_progress'
        | 'work_complete'
        | 'client_accepted'
        | 'invoiced'
        | 'closed'
        | 'on_hold'
        | 'cancelled'
        | 'declined'
      staff_role: 'owner' | 'admin' | 'dispatcher' | 'tech'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contact_role: ['primary', 'standard', 'viewer'],
      job_priority: ['low', 'normal', 'high', 'emergency'],
      job_source: ['client_portal', 'staff', 'phone', 'email'],
      job_status: [
        'draft',
        'requested',
        'triaged',
        'quoted',
        'approved',
        'scheduled',
        'in_progress',
        'work_complete',
        'client_accepted',
        'invoiced',
        'closed',
        'on_hold',
        'cancelled',
        'declined',
      ],
      staff_role: ['owner', 'admin', 'dispatcher', 'tech'],
    },
  },
} as const
