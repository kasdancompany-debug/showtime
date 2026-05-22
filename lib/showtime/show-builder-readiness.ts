import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import { hasStoryVideoUrl } from "@/lib/showtime/video-url";

export type ReadinessRow = {
  id: "videos" | "questions" | "branches" | "notes" | "screen" | "save";
  label: string;
  ok: boolean;
  detail: string;
};

/**
 * Checklist for the Show Readiness panel (independent of full `validateBranchStory` errors).
 */
export function computeShowReadiness(args: {
  nodes: BranchEditorNode[];
  structuralErrors: string[];
  screenTestAcknowledged: boolean;
}): ReadinessRow[] {
  const { nodes, structuralErrors, screenTestAcknowledged } = args;
  const keys = new Set(nodes.map((n) => n.node_key.trim()).filter(Boolean));

  let videosOk = nodes.length > 0;
  let videosDetail = "Add at least one beat with a reel.";
  if (nodes.length > 0) {
    const missing = nodes.filter((n) => !hasStoryVideoUrl(n.video_url));
    videosOk = missing.length === 0;
    videosDetail = videosOk
      ? "Every beat has a video path or hosted URL."
      : `Still need a working video on: ${missing.map((n) => n.node_key.trim() || n.title).join(", ")}.`;
  }

  let questionsOk = true;
  let questionsDetail = "No voting beats yet.";
  const voteBeats = nodes.filter((n) => !n.is_ending);
  if (voteBeats.length > 0) {
    const bad = voteBeats.filter(
      (n) =>
        !n.question?.trim() || !n.option_a_label?.trim() || !n.option_b_label?.trim(),
    );
    questionsOk = bad.length === 0;
    questionsDetail = questionsOk
      ? "Every voting beat has a question and both choice labels."
      : `Finish the question and A/B labels on: ${bad.map((b) => b.node_key.trim()).join(", ")}.`;
  } else if (nodes.some((n) => !n.is_ending) === false && nodes.length > 0) {
    questionsDetail = "Only ending beats — add a voting beat if the audience chooses paths.";
  }

  let branchesOk = true;
  let branchesDetail = "No branches to assign yet.";
  if (voteBeats.length > 0) {
    const bad = voteBeats.filter((n) => {
      const a = n.option_a_next_node_key?.trim() ?? "";
      const b = n.option_b_next_node_key?.trim() ?? "";
      return !a || !b || !keys.has(a) || !keys.has(b);
    });
    branchesOk = bad.length === 0;
    branchesDetail = branchesOk
      ? "Option A and Option B each point to a real next beat."
      : `Set both branch targets on: ${bad.map((b) => b.node_key.trim()).join(", ")}.`;
  }

  const withNotes = nodes.filter((n) => n.operator_notes?.trim()).length;
  const notesOk = true;
  let notesDetail = "Optional booth notes per beat — not required to save or launch.";
  if (nodes.length > 0) {
    notesDetail =
      withNotes === nodes.length
        ? `Booth notes on all ${nodes.length} beats.`
        : `Optional — ${withNotes} of ${nodes.length} beats have booth notes.`;
  }

  const screenOk = screenTestAcknowledged;
  const screenDetail = screenOk
    ? "You confirmed the projector page loads for this show."
    : "Open /screen on the projector machine (or a test tab) and confirm it loads, then check the box below.";

  const saveOk = structuralErrors.length === 0;
  const saveDetail = saveOk
    ? "Structural check passes — you can save to the server."
    : `Fix ${structuralErrors.length} blocking issue(s) listed under “Check show”.`;

  return [
    { id: "videos", label: "Videos connected", ok: videosOk, detail: videosDetail },
    { id: "questions", label: "Questions complete", ok: questionsOk, detail: questionsDetail },
    { id: "branches", label: "Branches assigned", ok: branchesOk, detail: branchesDetail },
    { id: "notes", label: "Booth notes (optional)", ok: notesOk, detail: notesDetail },
    { id: "screen", label: "Screen connection tested", ok: screenOk, detail: screenDetail },
    { id: "save", label: "Ready to save", ok: saveOk, detail: saveDetail },
  ];
}
