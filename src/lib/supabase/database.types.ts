export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      app_settings: {
        Row: {
          id: boolean
          updated_at: string
          updated_by: string | null
          usg_notification_email: string
        }
        Insert: {
          id?: boolean
          updated_at?: string
          updated_by?: string | null
          usg_notification_email: string
        }
        Update: {
          id?: boolean
          updated_at?: string
          updated_by?: string | null
          usg_notification_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["account_role"] | null
          after_value: Json | null
          before_value: Json | null
          entity_id: string
          entity_table: string
          id: number
          occurred_at: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["account_role"] | null
          after_value?: Json | null
          before_value?: Json | null
          entity_id: string
          entity_table: string
          id?: never
          occurred_at?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["account_role"] | null
          after_value?: Json | null
          before_value?: Json | null
          entity_id?: string
          entity_table?: string
          id?: never
          occurred_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_windows: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          label: string | null
          published_by: string | null
          room_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          label?: string | null
          published_by?: string | null
          room_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          label?: string | null
          published_by?: string | null
          room_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_windows_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_windows_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_intervals: {
        Row: {
          blocked_by: string | null
          created_at: string
          ends_at: string
          id: string
          reason: string
          room_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          ends_at: string
          id?: string
          reason: string
          room_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          reason?: string
          room_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_intervals_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_intervals_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          body: string
          created_at: string
          id: string
          last_error: string | null
          metadata: Json
          related_reservation_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_outbox_status"]
          subject: string
          template: string
          to_email: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          related_reservation_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_outbox_status"]
          subject: string
          template: string
          to_email: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          related_reservation_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_outbox_status"]
          subject?: string
          template?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_related_reservation_id_fkey"
            columns: ["related_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_related_reservation_id_fkey"
            columns: ["related_reservation_id"]
            isOneToOne: false
            referencedRelation: "room_occupancy"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          payload: Json
          requester_id: string
          response: Json | null
          scope: string
        }
        Insert: {
          created_at?: string
          key: string
          payload?: Json
          requester_id: string
          response?: Json | null
          scope: string
        }
        Update: {
          created_at?: string
          key?: string
          payload?: Json
          requester_id?: string
          response?: Json | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          email: string
          email_verified_at: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["account_role"]
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          email: string
          email_verified_at?: string | null
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["account_role"]
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          email?: string
          email_verified_at?: string | null
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["account_role"]
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          admin_override: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          id: string
          override_reason: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          submitted_at: string
          updated_at: string
          version: number
        }
        Insert: {
          admin_override?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          ends_at: string
          id?: string
          override_reason?: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id?: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          submitted_at?: string
          updated_at?: string
          version?: number
        }
        Update: {
          admin_override?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          ends_at?: string
          id?: string
          override_reason?: string | null
          participant_count?: number
          purpose?: string
          requester_email?: string
          requester_id?: string | null
          requester_name?: string
          room_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          submitted_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          timezone: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      room_occupancy: {
        Row: {
          ends_at: string | null
          id: string | null
          room_id: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["reservation_status"] | null
        }
        Insert: {
          ends_at?: string | null
          id?: string | null
          room_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"] | null
        }
        Update: {
          ends_at?: string | null
          id?: string | null
          room_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _merge_adjacent_availability_windows: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      approve_request: {
        Args: {
          p_expected_version: number
          p_override?: boolean
          p_override_reason?: string
          p_reservation_id: string
        }
        Returns: {
          admin_override: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          id: string
          override_reason: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          submitted_at: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bootstrap_first_admin: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          email: string
          email_verified_at: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["account_role"]
          status_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_reservation: {
        Args: {
          p_expected_version: number
          p_reason?: string
          p_reservation_id: string
        }
        Returns: {
          admin_override: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          id: string
          override_reason: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          submitted_at: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_blocked_interval: {
        Args: {
          p_ends_at: string
          p_reason: string
          p_room_id: string
          p_starts_at: string
        }
        Returns: {
          blocked_by: string | null
          created_at: string
          ends_at: string
          id: string
          reason: string
          room_id: string
          starts_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "blocked_intervals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_manual_reservation: {
        Args: {
          p_ends_at: string
          p_override?: boolean
          p_override_reason?: string
          p_participant_count: number
          p_purpose: string
          p_requester_email: string
          p_requester_name: string
          p_room_id: string
          p_starts_at: string
        }
        Returns: {
          admin_override: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          id: string
          override_reason: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          submitted_at: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_admin: { Args: never; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
      modify_reservation: {
        Args: {
          p_ends_at?: string
          p_expected_version: number
          p_override?: boolean
          p_override_reason?: string
          p_participant_count?: number
          p_purpose?: string
          p_reservation_id: string
          p_starts_at?: string
        }
        Returns: {
          admin_override: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          id: string
          override_reason: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          submitted_at: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_availability_month: {
        Args: {
          p_end_time: string
          p_excluded_dates?: string[]
          p_label?: string
          p_month: string
          p_room_id: string
          p_start_time: string
          p_weekdays: number[]
        }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          label: string | null
          published_by: string | null
          room_id: string
          starts_at: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "availability_windows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      publish_availability_window: {
        Args: {
          p_ends_at: string
          p_label?: string
          p_room_id: string
          p_starts_at: string
        }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          label: string | null
          published_by: string | null
          room_id: string
          starts_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "availability_windows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_request: {
        Args: {
          p_expected_version: number
          p_reason?: string
          p_reservation_id: string
        }
        Returns: {
          admin_override: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          id: string
          override_reason: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          submitted_at: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_availability_window: {
        Args: { p_window_id: string }
        Returns: undefined
      }
      remove_blocked_interval: {
        Args: { p_block_id: string }
        Returns: undefined
      }
      reservation_conflict_warnings: {
        Args: { p_reservation_id: string }
        Returns: string[]
      }
      reservation_fits_availability: {
        Args: { p_ends_at: string; p_room_id: string; p_starts_at: string }
        Returns: boolean
      }
      reservation_overlaps_approved: {
        Args: {
          p_ends_at: string
          p_exclude_id?: string
          p_room_id: string
          p_starts_at: string
        }
        Returns: boolean
      }
      set_account_status: {
        Args: {
          p_profile_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["account_status"]
        }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          email: string
          email_verified_at: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["account_role"]
          status_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_role: {
        Args: {
          p_profile_id: string
          p_role: Database["public"]["Enums"]["account_role"]
        }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          email: string
          email_verified_at: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["account_role"]
          status_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_usg_notification_email: {
        Args: { p_email: string }
        Returns: {
          id: boolean
          updated_at: string
          updated_by: string | null
          usg_notification_email: string
        }
        SetofOptions: {
          from: "*"
          to: "app_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_request: {
        Args: {
          p_ends_at: string
          p_idempotency_key?: string
          p_participant_count: number
          p_purpose: string
          p_room_id: string
          p_starts_at: string
        }
        Returns: {
          admin_override: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          ends_at: string
          id: string
          override_reason: string | null
          participant_count: number
          purpose: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          submitted_at: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_availability_window: {
        Args: {
          p_ends_at: string
          p_label?: string
          p_starts_at: string
          p_window_id: string
        }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          label: string | null
          published_by: string | null
          room_id: string
          starts_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "availability_windows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_blocked_interval: {
        Args: {
          p_block_id: string
          p_ends_at: string
          p_reason: string
          p_starts_at: string
        }
        Returns: {
          blocked_by: string | null
          created_at: string
          ends_at: string
          id: string
          reason: string
          room_id: string
          starts_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "blocked_intervals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_role: "USER" | "ADMIN"
      account_status:
        | "PENDING"
        | "ACTIVE"
        | "REJECTED"
        | "SUSPENDED"
        | "REMOVED"
      email_outbox_status: "PENDING" | "SENT" | "FAILED"
      reservation_status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_role: ["USER", "ADMIN"],
      account_status: ["PENDING", "ACTIVE", "REJECTED", "SUSPENDED", "REMOVED"],
      email_outbox_status: ["PENDING", "SENT", "FAILED"],
      reservation_status: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    },
  },
} as const

