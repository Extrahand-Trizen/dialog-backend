import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldApplyWebhookMessageStatus } from './messages.repository';

describe('shouldApplyWebhookMessageStatus', () => {
  it('allows progression sent → delivered → read', () => {
    assert.equal(shouldApplyWebhookMessageStatus('SENT', 'DELIVERED'), true);
    assert.equal(shouldApplyWebhookMessageStatus('DELIVERED', 'READ'), true);
  });

  it('allows failed from any non-failed status', () => {
    assert.equal(shouldApplyWebhookMessageStatus('SENT', 'FAILED'), true);
    assert.equal(shouldApplyWebhookMessageStatus('DELIVERED', 'FAILED'), true);
  });

  it('blocks late sent from overwriting failed/delivered/read', () => {
    assert.equal(shouldApplyWebhookMessageStatus('FAILED', 'SENT'), false);
    assert.equal(shouldApplyWebhookMessageStatus('DELIVERED', 'SENT'), false);
    assert.equal(shouldApplyWebhookMessageStatus('READ', 'SENT'), false);
  });
});
