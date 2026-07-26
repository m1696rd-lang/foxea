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
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      capital_contributions: {
        Row: {
          amount: number
          contribution_date: string
          contribution_type: string
          created_at: string
          created_by: string | null
          cycle_id: string | null
          fund_id: string
          id: string
          investor_id: string
          is_correction: boolean
          notes: string | null
          reverses_id: string | null
        }
        Insert: {
          amount: number
          contribution_date?: string
          contribution_type?: string
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          fund_id: string
          id?: string
          investor_id: string
          is_correction?: boolean
          notes?: string | null
          reverses_id?: string | null
        }
        Update: {
          amount?: number
          contribution_date?: string
          contribution_type?: string
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          fund_id?: string
          id?: string
          investor_id?: string
          is_correction?: boolean
          notes?: string | null
          reverses_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capital_contributions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "fund_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_contributions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_contributions_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_contributions_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "capital_contributions"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_withdrawals: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          cycle_id: string | null
          fund_id: string
          id: string
          investor_id: string
          is_correction: boolean
          notes: string | null
          reverses_id: string | null
          withdrawal_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          fund_id: string
          id?: string
          investor_id: string
          is_correction?: boolean
          notes?: string | null
          reverses_id?: string | null
          withdrawal_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          fund_id?: string
          id?: string
          investor_id?: string
          is_correction?: boolean
          notes?: string | null
          reverses_id?: string | null
          withdrawal_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_withdrawals_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "fund_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_withdrawals_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_withdrawals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_withdrawals_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "capital_withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_cycles: {
        Row: {
          closed_at: string | null
          closing_balance: number | null
          created_at: string
          cycle_number: number
          end_date: string | null
          fund_id: string
          fund_return_pct: number | null
          gross_profit: number | null
          id: string
          investor_count: number | null
          open_positions: boolean
          opening_balance: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closing_balance?: number | null
          created_at?: string
          cycle_number: number
          end_date?: string | null
          fund_id: string
          fund_return_pct?: number | null
          gross_profit?: number | null
          id?: string
          investor_count?: number | null
          open_positions?: boolean
          opening_balance?: number
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closing_balance?: number | null
          created_at?: string
          cycle_number?: number
          end_date?: string | null
          fund_id?: string
          fund_return_pct?: number | null
          gross_profit?: number | null
          id?: string
          investor_count?: number | null
          open_positions?: boolean
          opening_balance?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_cycles_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          created_at: string
          current_balance_manual: number
          default_admin_fee_pct: number
          id: string
          initial_capital: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_balance_manual?: number
          default_admin_fee_pct?: number
          id?: string
          initial_capital?: number
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_balance_manual?: number
          default_admin_fee_pct?: number
          id?: string
          initial_capital?: number
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      investor_cycle_snapshots: {
        Row: {
          admin_fee_amount: number
          admin_fee_pct: number
          closing_capital: number
          contributions_in_cycle: number
          created_at: string
          cycle_id: string
          cycle_roi_pct: number
          gross_profit: number
          id: string
          investor_id: string
          net_profit: number
          opening_capital: number
          participation_pct: number
          withdrawals_in_cycle: number
        }
        Insert: {
          admin_fee_amount?: number
          admin_fee_pct?: number
          closing_capital: number
          contributions_in_cycle?: number
          created_at?: string
          cycle_id: string
          cycle_roi_pct: number
          gross_profit: number
          id?: string
          investor_id: string
          net_profit: number
          opening_capital: number
          participation_pct: number
          withdrawals_in_cycle?: number
        }
        Update: {
          admin_fee_amount?: number
          admin_fee_pct?: number
          closing_capital?: number
          contributions_in_cycle?: number
          created_at?: string
          cycle_id?: string
          cycle_roi_pct?: number
          gross_profit?: number
          id?: string
          investor_id?: string
          net_profit?: number
          opening_capital?: number
          participation_pct?: number
          withdrawals_in_cycle?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_cycle_snapshots_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "fund_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_cycle_snapshots_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          created_at: string
          date_joined: string
          display_name: string
          fee_pct: number | null
          fund_id: string
          group_label: string | null
          id: string
          initial_contribution: number
          is_internal: boolean
          notes: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date_joined?: string
          display_name: string
          fee_pct?: number | null
          fund_id: string
          group_label?: string | null
          id?: string
          initial_contribution?: number
          is_internal?: boolean
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date_joined?: string
          display_name?: string
          fee_pct?: number | null
          fund_id?: string
          group_label?: string | null
          id?: string
          initial_contribution?: number
          is_internal?: boolean
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investors_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          updated_at: string
          username: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          username?: string
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "investor"
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
      app_role: ["admin", "investor"],
    },
  },
} as const
