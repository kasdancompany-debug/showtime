// TypeScript only — do not paste this file into the Supabase SQL Editor (that expects SQL).
// Schema / DDL to run in SQL Editor: `supabase/migrations/20260427120000_showtime_core.sql`
// Regenerate from DB: `npx supabase gen types typescript --linked > lib/supabase/database.types.ts`

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type EventStatus = "draft" | "waiting" | "playing" | "voting" | "revealing" | "ended";
export type VoteOption = "A" | "B";

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          event_code: string;
          title: string;
          status: EventStatus;
          current_node_id: string | null;
          active_vote_id: string | null;
          /** Present after migration `20260502100000_events_vote_ends_at`. */
          vote_ends_at?: string | null;
          /** Present after migration `20260501190000_events_allow_anonymous_quick_join`. */
          allow_anonymous_quick_join?: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_code: string;
          title: string;
          status?: EventStatus;
          current_node_id?: string | null;
          active_vote_id?: string | null;
          allow_anonymous_quick_join?: boolean;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_code?: string;
          title?: string;
          status?: EventStatus;
          current_node_id?: string | null;
          active_vote_id?: string | null;
          vote_ends_at?: string | null;
          allow_anonymous_quick_join?: boolean;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      story_nodes: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          video_url: string | null;
          duration_seconds: number | null;
          question: string | null;
          option_a_label: string | null;
          option_b_label: string | null;
          option_a_next_node_id: string | null;
          option_b_next_node_id: string | null;
          is_ending: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          video_url?: string | null;
          duration_seconds?: number | null;
          question?: string | null;
          option_a_label?: string | null;
          option_b_label?: string | null;
          option_a_next_node_id?: string | null;
          option_b_next_node_id?: string | null;
          is_ending?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          title?: string;
          video_url?: string | null;
          duration_seconds?: number | null;
          question?: string | null;
          option_a_label?: string | null;
          option_b_label?: string | null;
          option_a_next_node_id?: string | null;
          option_b_next_node_id?: string | null;
          is_ending?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      audience_members: {
        Row: {
          id: string;
          event_id: string;
          display_name: string;
          table_number: string | null;
          session_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          display_name: string;
          table_number?: string | null;
          session_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          display_name?: string;
          table_number?: string | null;
          session_id?: string;
          user_id?: string;
          joined_at?: string;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          id: string;
          event_id: string;
          story_node_id: string;
          audience_member_id: string;
          vote_option: VoteOption;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          story_node_id: string;
          audience_member_id: string;
          vote_option: VoteOption;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          story_node_id?: string;
          audience_member_id?: string;
          vote_option?: VoteOption;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      event_status: EventStatus;
      vote_option: VoteOption;
    };
    CompositeTypes: Record<string, never>;
  };
}
