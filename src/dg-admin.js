import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';

const resolver = new Resolver();

resolver.define('saveTestValue', async ({ payload }) => {
  await kvs.set('s4-test', payload.value);
  return `Saved: ${payload.value}`;
});

export const handler = resolver.getDefinitions();
