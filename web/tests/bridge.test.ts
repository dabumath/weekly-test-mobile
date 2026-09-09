import { describe, expect, it } from 'vitest';
import { isValidBridgeResponse } from '../src/api/appsScriptBridge';

describe('bridge response guard', () => {
  it('accepts the expected channel and nonce shape', () => {
    expect(isValidBridgeResponse({ channel: 'weekly-test-bridge-v1', bridgeNonce: 'abc' })).toBe(true);
  });

  it('rejects an unrelated channel', () => {
    expect(isValidBridgeResponse({ channel: 'other', bridgeNonce: 'abc' })).toBe(false);
  });
});

