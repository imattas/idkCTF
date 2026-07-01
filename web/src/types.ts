export interface PublicConfig {
  setup_complete: boolean;
  ctf_name: string;
  ctf_description: string;
  mode: "teams" | "users";
  registration_open: boolean;
  site_lockdown: boolean;
  visibility: "public" | "private";
  scoreboard_visible: boolean;
  start_time: number | null;
  end_time: number | null;
  freeze_time: number | null;
  team_size_limit: number;
  paused: boolean;
  theme: string;
  accent: string;
  custom_css: string;
  footer_html: string;
  home_content: string;
  home_format: "markdown" | "html";
  custom_head: string;
  has_logo: boolean;
  require_access_code: boolean;
  email_verification_required: boolean;
}

export interface Bracket {
  id: number;
  name: string;
  description: string | null;
  type: "users" | "teams";
}

export interface NavPage {
  slug: string;
  title: string;
  nav_order: number;
}

export interface ProfileStats {
  score: number;
  rank: number | null;
  solve_count: number;
  solves: { challenge_id: number; name: string; category: string; value: number; created_at: number }[];
  awards: { name: string; value: number; created_at: number }[];
  categories: Record<string, { count: number; points: number }>;
  timeline: { time: number; score: number }[];
}

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  team_id: number | null;
  is_captain: number;
  affiliation: string | null;
  country: string | null;
  website: string | null;
  verified?: number;
  suspended?: number;
  prize_disqualified?: number;
  under_review?: number;
}

export interface Bootstrap {
  config: PublicConfig;
  competition_state: "before" | "running" | "ended";
  server_time: number;
  user: CurrentUser | null;
}

export interface ChallengeSummary {
  id: number;
  name: string;
  category: string;
  type: "static" | "dynamic";
  difficulty?: string;
  state: string;
  value: number;
  solves: number;
  solved: boolean;
  locked: boolean;
}

export interface ChallengeDetail extends ChallengeSummary {
  description: string;
  connection_info: string | null;
  max_attempts: number;
  files: { id: number; name: string; size: number }[];
  hints: { id: number; cost: number; unlocked: boolean; content: string | null }[];
  solvers: { name: string; created_at: number }[];
  requires?: string[];
  attempts: { provided: string; correct: number; created_at: number; by_user: string | null }[];
  honeypot_token?: string | null;
}

export interface StandingRow {
  rank: number;
  account_id: number;
  name: string;
  score: number;
  solves: number;
  under_review?: boolean;
  prize_disqualified?: boolean;
}
