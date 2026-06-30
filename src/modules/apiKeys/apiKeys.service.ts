import { generateApiKey, verifyApiKey, extractApiKeyPrefix } from '../../shared/security/apiKey';
import { UnauthorizedError } from '../../shared/errors/AppError';
import type {
  ApiKeySummaryDto,
  CreateApiKeyInput,
  CreateApiKeyResultDto,
} from './apiKeys.schemas';
import {
  findActiveApiKeysByPrefix,
  insertApiKey,
  listApiKeysByOrganization,
  revokeApiKey,
  touchApiKeyLastUsed,
} from './apiKeys.repository';

export async function createApiKey(
  organizationId: string,
  createdById: string,
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResultDto> {
  const generated = generateApiKey();
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;

  const apiKey = await insertApiKey({
    organizationId,
    createdById,
    name: input.name,
    keyPrefix: generated.keyPrefix,
    keyHash: generated.keyHash,
    scopes: input.scopes,
    expiresAt,
  });

  return { apiKey, secret: generated.fullKey };
}

export async function listApiKeys(organizationId: string): Promise<ApiKeySummaryDto[]> {
  return listApiKeysByOrganization(organizationId);
}

export async function revokeOrganizationApiKey(
  organizationId: string,
  apiKeyId: string,
  revokedById: string,
): Promise<ApiKeySummaryDto> {
  return revokeApiKey({ apiKeyId, organizationId, revokedById });
}

export type ResolvedApiKeyAuth = {
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
};

export async function resolveApiKey(fullKey: string): Promise<ResolvedApiKeyAuth> {
  const keyPrefix = extractApiKeyPrefix(fullKey);
  const candidates = await findActiveApiKeysByPrefix(keyPrefix);

  for (const candidate of candidates) {
    if (verifyApiKey(fullKey, candidate.keyHash)) {
      void touchApiKeyLastUsed(candidate.id);
      return {
        apiKeyId: candidate.id,
        organizationId: candidate.organizationId,
        scopes: candidate.scopes,
      };
    }
  }

  throw new UnauthorizedError('Invalid API key', 'INVALID_API_KEY');
}
