export function messageLogger(payload) {
  console.log(`Logging message: ${payload.message}`);
  return `DECISION_GUARD_RESULT v1\nLOGGED: ${payload.message}`;
}
