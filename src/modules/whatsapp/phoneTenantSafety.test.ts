import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictError, ExternalServiceError } from '../../shared/errors/AppError';
import {
  assertMessagePhoneSameOrganization,
  assertPhoneUpsertSameOrganization,
} from './phoneTenantSafety';

describe('assertMessagePhoneSameOrganization', () => {
  it('allows same-organization phone reference', () => {
    assert.doesNotThrow(() =>
      assertMessagePhoneSameOrganization({
        messageId: 'msg-1',
        messageOrganizationId: 'org-a',
        phoneNumberId: 'phone-1',
        phoneOrganizationId: 'org-a',
      }),
    );
  });

  it('rejects Organization A message using Organization B phone', () => {
    assert.throws(
      () =>
        assertMessagePhoneSameOrganization({
          messageId: 'msg-1',
          messageOrganizationId: 'org-a',
          phoneNumberId: 'phone-b',
          phoneOrganizationId: 'org-b',
        }),
      (error: unknown) =>
        error instanceof ExternalServiceError &&
        error.errorCode === 'CROSS_ORGANIZATION_PHONE_NUMBER_REFERENCE',
    );
  });
});

describe('assertPhoneUpsertSameOrganization', () => {
  it('allows create when phone does not exist yet', () => {
    assert.doesNotThrow(() =>
      assertPhoneUpsertSameOrganization({
        metaPhoneNumberId: '1330247070161585',
        targetOrganizationId: 'org-a',
        existingOrganizationId: null,
      }),
    );
  });

  it('allows same-organization upsert / reconnect', () => {
    assert.doesNotThrow(() =>
      assertPhoneUpsertSameOrganization({
        metaPhoneNumberId: '1330247070161585',
        targetOrganizationId: 'org-a',
        existingOrganizationId: 'org-a',
      }),
    );
  });

  it('rejects reassignment of Meta phone to another organization', () => {
    assert.throws(
      () =>
        assertPhoneUpsertSameOrganization({
          metaPhoneNumberId: '1141676709035628',
          targetOrganizationId: 'org-b',
          existingOrganizationId: 'org-a',
        }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.errorCode === 'PHONE_NUMBER_OWNED_BY_OTHER_ORGANIZATION',
    );
  });
});
