// Handler for the list_decisions tool (action key "list-decisions"). PRD 9.2 and 9.4.
// No inputs. Returns all active decision records, sorted by ID number. Writes no check log entry.

import { buildOutput, toOutputDecision } from "../core/output";
import { listActiveDecisions } from "../storage/decisions";

const INTERNAL_ERROR = "Internal error. The decisions were not read.";

export async function handler(): Promise<string> {
  try {
    const records = await listActiveDecisions();
    return buildOutput({ tool: "list_decisions", decisions: records.map(toOutputDecision) });
  } catch (error: unknown) {
    console.error("list_decisions failed.", error);
    return buildOutput({ tool: "list_decisions", errorReason: INTERNAL_ERROR });
  }
}
