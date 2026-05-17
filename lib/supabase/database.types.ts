// TypeScript only — do not paste into the Supabase SQL Editor.

// Apply migrations in `supabase/migrations/` in timestamp order (includes `20260510140000_playback_command_event_status.sql`).



export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];



export type ShowtimeEventStatus =

  | "setup"

  | "ready"

  | "playing"

  | "paused"

  | "video_ended"

  | "voting_open"

  | "voting_closed"

  | "winner_revealed"

  | "ended";



export type VoteAb = "A" | "B";

export type PlaybackCmd = "play" | "pause" | "restart" | "load";

export interface Database {

  public: {

    Tables: {

      events: {

        Row: {

          id: string;

          code: string;

          title: string;

          status: ShowtimeEventStatus;

          current_node_id: string | null;

          winner: VoteAb | null;

          vote_ends_at: string | null;

          screen_show_closed_tally: boolean;

          screen_show_live_vote_counts: boolean;

          playback_command: PlaybackCmd;

          playback_command_id: string;

          playback_position_seconds: number;

          video_library: Json;

          screen_idle_poster_url: string | null;

          created_at: string;

          updated_at: string;

        };

        Insert: {

          id?: string;

          code: string;

          title: string;

          status?: ShowtimeEventStatus;

          current_node_id?: string | null;

          winner?: VoteAb | null;

          vote_ends_at?: string | null;

          screen_show_closed_tally?: boolean;

          screen_show_live_vote_counts?: boolean;

          playback_command?: PlaybackCmd;

          playback_command_id?: string;

          playback_position_seconds?: number;

          video_library?: Json;

          screen_idle_poster_url?: string | null;

          created_at?: string;

          updated_at?: string;

        };

        Update: {

          id?: string;

          code?: string;

          title?: string;

          status?: ShowtimeEventStatus;

          current_node_id?: string | null;

          winner?: VoteAb | null;

          vote_ends_at?: string | null;

          screen_show_closed_tally?: boolean;

          screen_show_live_vote_counts?: boolean;

          playback_command?: PlaybackCmd;

          playback_command_id?: string;

          playback_position_seconds?: number;

          video_library?: Json;

          screen_idle_poster_url?: string | null;

          created_at?: string;

          updated_at?: string;

        };

        Relationships: [];

      };

      story_nodes: {

        Row: {

          id: string;

          event_id: string;

          node_key: string;

          title: string;

          video: string;

          video_url: string;

          question: string | null;

          option_a_label: string | null;

          option_b_label: string | null;

          option_a_next_node_key: string | null;

          option_b_next_node_key: string | null;

          is_ending: boolean;

          sort_order: number;

          operator_notes: string;

          beat_status: string;

          created_at: string;

        };

        Insert: {

          id?: string;

          event_id: string;

          node_key: string;

          title?: string;

          video?: string;

          video_url?: string;

          question?: string | null;

          option_a_label?: string | null;

          option_b_label?: string | null;

          option_a_next_node_key?: string | null;

          option_b_next_node_key?: string | null;

          is_ending?: boolean;

          sort_order?: number;

          operator_notes?: string;

          beat_status?: string;

          created_at?: string;

        };

        Update: {

          id?: string;

          event_id?: string;

          node_key?: string;

          title?: string;

          video?: string;

          video_url?: string;

          question?: string | null;

          option_a_label?: string | null;

          option_b_label?: string | null;

          option_a_next_node_key?: string | null;

          option_b_next_node_key?: string | null;

          is_ending?: boolean;

          sort_order?: number;

          operator_notes?: string;

          beat_status?: string;

          created_at?: string;

        };

        Relationships: [];

      };

      audience_members: {

        Row: {

          id: string;

          event_id: string;

          session_id: string;

          display_name: string;

          table_number: string | null;

          created_at: string;

        };

        Insert: {

          id?: string;

          event_id: string;

          session_id: string;

          display_name: string;

          table_number?: string | null;

          created_at?: string;

        };

        Update: {

          id?: string;

          event_id?: string;

          session_id?: string;

          display_name?: string;

          table_number?: string | null;

          created_at?: string;

        };

        Relationships: [];

      };

      votes: {

        Row: {

          id: string;

          event_id: string;

          node_id: string;

          session_id: string;

          ballot_option: VoteAb;

          created_at: string;

        };

        Insert: {

          id?: string;

          event_id: string;

          node_id: string;

          session_id: string;

          ballot_option: VoteAb;

          created_at?: string;

        };

        Update: {

          id?: string;

          event_id?: string;

          node_id?: string;

          session_id?: string;

          ballot_option?: VoteAb;

          created_at?: string;

        };

        Relationships: [];

      };

    };

    Views: Record<string, never>;

    Functions: {

      get_audience_member_count: {

        Args: { p_event_id: string };

        Returns: number;

      };

      create_show_for_builder: {

        Args: { p_code: string; p_title: string | null };

        Returns: string;

      };

    };

    Enums: {

      showtime_event_status: ShowtimeEventStatus;

      vote_ab: VoteAb;

      playback_cmd: PlaybackCmd;

    };

    CompositeTypes: Record<string, never>;

  };

}



/** @deprecated Use ShowtimeEventStatus */

export type EventStatus = ShowtimeEventStatus;

/** @deprecated Use VoteAb */

export type VoteOption = VoteAb;


