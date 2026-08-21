import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractMessageStatusUpdates,
  normalizeMetaStatusErrorCode,
} from './webhookPayload';

describe('normalizeMetaStatusErrorCode', () => {
  it('stores numeric Meta codes as strings (131049)', () => {
    assert.equal(normalizeMetaStatusErrorCode(131049), '131049');
  });

  it('stores string Meta codes unchanged', () => {
    assert.equal(normalizeMetaStatusErrorCode('131049'), '131049');
  });

  it('returns undefined for empty/invalid codes', () => {
    assert.equal(normalizeMetaStatusErrorCode(undefined), undefined);
    assert.equal(normalizeMetaStatusErrorCode(null), undefined);
    assert.equal(normalizeMetaStatusErrorCode(''), undefined);
    assert.equal(normalizeMetaStatusErrorCode({}), undefined);
  });
});

describe('extractMessageStatusUpdates — Meta error codes', () => {
  function statusPayload(code: unknown) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  {
                    id: 'wamid.TEST',
                    status: 'failed',
                    timestamp: '1700000000',
                    recipient_id: '919999999999',
                    errors: [
                      {
                        code,
                        title: 'This message was not delivered to maintain healthy ecosystem engagement.',
                        message:
                          'This message was not delivered to maintain healthy ecosystem engagement.',
                        error_data: {
                          details:
                            'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.',
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  it('preserves numeric Meta error code 131049 on Message status webhook', () => {
    const updates = extractMessageStatusUpdates(statusPayload(131049));
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.errorCode, '131049');
    assert.match(String(updates[0]?.errorMessage), /healthy ecosystem engagement/i);
  });

  it('preserves string Meta error code 131049', () => {
    const updates = extractMessageStatusUpdates(statusPayload('131049'));
    assert.equal(updates[0]?.errorCode, '131049');
  });
});
