import { kvs } from '@forge/kvs';

export async function messageLogger(payload) {
  console.log(`Logging message: ${payload.message}`);
  const stored = await kvs.get('s4-test');
  return `DECISION_GUARD_RESULT v1\nLOGGED: ${payload.message}\nSTORED: ${stored ?? 'NONE'}`;
}
