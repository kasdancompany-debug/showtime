import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import { DEMO_HOSTED_REELS } from "@/lib/showtime/demo-hosted-videos";

export const NIGHT1_EVENT_CODE = "NIGHT1";

export const NIGHT1_EVENT_TITLE = "E2E demo — Kasdan Co. Player";

/**
 * Five beats: three voting forks, two endings. Opening is lowest `sort_order`.
 * Branching: lobby → backstage OR auditorium; each mid-beat can land either ending.
 */
export function getNight1DemoNodes(): BranchEditorNode[] {
  return [
    {
      node_key: "01_OPENING",
      title: "House lights",
      video_url: DEMO_HOSTED_REELS.opening,
      operator_notes: "Roll walk-on; wait for house to settle.",
      beat_status: "ready",
      question: "Do we hold in the lobby or send everyone to their seats?",
      option_a_label: "Hold in lobby",
      option_b_label: "Take seats",
      option_a_next_node_key: "02_BACKSTAGE",
      option_b_next_node_key: "03_AUDITORIUM",
      is_ending: false,
      sort_order: 0,
    },
    {
      node_key: "02_BACKSTAGE",
      title: "Quick change",
      video_url: DEMO_HOSTED_REELS.wing,
      operator_notes: "Wing cue; keep comms with stage mgr.",
      beat_status: "ready",
      question: "Wardrobe is tight — quick change in the wing or stay in blackout?",
      option_a_label: "Quick change",
      option_b_label: "Stay dark",
      option_a_next_node_key: "04_CURTAIN_CALL",
      option_b_next_node_key: "05_AFTERPARTY",
      is_ending: false,
      sort_order: 1,
    },
    {
      node_key: "03_AUDITORIUM",
      title: "House hold",
      video_url: DEMO_HOSTED_REELS.hold,
      operator_notes: "Hold house; watch SM countdown.",
      beat_status: "ready",
      question: "Program is running long — hold for cues or roll the B-reel cover?",
      option_a_label: "Hold for cues",
      option_b_label: "Roll B-reel",
      option_a_next_node_key: "04_CURTAIN_CALL",
      option_b_next_node_key: "05_AFTERPARTY",
      is_ending: false,
      sort_order: 2,
    },
    {
      node_key: "04_CURTAIN_CALL",
      title: "Curtain call",
      video_url: DEMO_HOSTED_REELS.finale,
      operator_notes: "Finale — no vote after this reel.",
      beat_status: "ready",
      question: "",
      option_a_label: "",
      option_b_label: "",
      option_a_next_node_key: "",
      option_b_next_node_key: "",
      is_ending: true,
      sort_order: 3,
    },
    {
      node_key: "05_AFTERPARTY",
      title: "Wrap party",
      video_url: DEMO_HOSTED_REELS.wrap,
      operator_notes: "Bumper / roll credits feel.",
      beat_status: "ready",
      question: "",
      option_a_label: "",
      option_b_label: "",
      option_a_next_node_key: "",
      option_b_next_node_key: "",
      is_ending: true,
      sort_order: 4,
    },
  ];
}
