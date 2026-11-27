// Shared types for plans, decision records and match results (PRD sections 8, 9.1 and 10.1).

// A plan after validation. All terms and paths are normalized (PRD 8.2).
export type Plan = {
  summary: string;
  terms: string[];
  paths: string[];
  issueKey?: string;
};

export type DecisionStatus = "active" | "retired";

// A stored decision record (PRD 10.1). Terms and paths are stored normalized, with no duplicates.
export type DecisionRecord = {
  id: string;
  title: string;
  statement: string;
  terms: string[];
  paths: string[];
  status: DecisionStatus;
  sourceUrl?: string;
  version: number;
  updatedBy: string;
  // ISO 8601 timestamp.
  updatedAt: string;
};

// The fields that an admin supplies to create or edit a decision record, after validation.
// Decision Guard sets id, status, version, updatedBy and updatedAt.
export type DecisionInput = {
  title: string;
  statement: string;
  terms: string[];
  paths: string[];
  sourceUrl?: string;
};

export type MatchItem = { type: "term" | "path"; value: string };

export type Match = {
  decisionId: string;
  decisionVersion: number;
  matchedOn: MatchItem[];
};

export type Verdict = "CONFLICT" | "CLEAR" | "NO_RECORDS" | "ERROR";

// matchPlan never gives ERROR. The caller gives ERROR for bad input or an internal failure.
export type MatchResult = {
  verdict: Exclude<Verdict, "ERROR">;
  matches: Match[];
};
