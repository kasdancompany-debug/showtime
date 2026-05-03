/** Kasdan Co. Hollywood — design tokens (mirror CSS vars in globals.css `.kasdan-hollywood`) */

export const kcMotion = {
  curtainIn: 0.72,
  titleReveal: 0.85,
  marqueeShimmer: 2.8,
  voteBarSpring: { stiffness: 88, damping: 22 },
  buttonTap: 0.98,
} as const;

export const kcCopy = {
  presents: "Kasdan Co. presents",
  tagline: "A live interactive picture",
  tonightsFeature: "Tonight’s feature",
  nowProjecting: "Now projecting",
  castYourVote: "Cast your vote",
  audienceMustDecide: "The audience must decide…",
  houseSpoken: "The house has spoken",
  nextReel: "The next reel begins",
  voteCast: "Your vote has been cast.",
  counting: "The studio is counting the ballots…",
} as const;

export type KasdanColorKey =
  | "espresso"
  | "midnight"
  | "cream"
  | "parchment"
  | "burgundy"
  | "velvet"
  | "gold"
  | "champagne"
  | "amberGlow";
