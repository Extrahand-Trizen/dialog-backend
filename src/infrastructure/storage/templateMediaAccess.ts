import { createHmac, timingSafeEqual } from 'node:crypto';
import { validateEnv } from '../../config/env';

const TOKEN_TTL_SECONDS = 60 * 60;

type MediaAccessPayload = {
  organizationId: string;
  objectKey: string;
  exp: number;
  sig: string;
};

function signingSecret(): string {
  const env = validateEnv();
  return env.JWT_SECRET ?? env.ENCRYPTION_KEY ?? 'template-media-access';
}

function signPayload(organizationId: string, objectKey: string, exp: number): string {
  return createHmac('sha256', signingSecret())
    .update(`${organizationId}\n${objectKey}\n${exp}`)
    .digest('base64url');
}

export function createTemplateMediaAccessToken(
  organizationId: string,
  objectKey: string,
): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const sig = signPayload(organizationId, objectKey, exp);
  const payload: MediaAccessPayload = { organizationId, objectKey, exp, sig };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function verifyTemplateMediaAccessToken(token: string): {
  organizationId: string;
  objectKey: string;
} | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as MediaAccessPayload;

    if (
      !parsed ||
      typeof parsed.organizationId !== 'string' ||
      typeof parsed.objectKey !== 'string' ||
      typeof parsed.exp !== 'number' ||
      typeof parsed.sig !== 'string'
    ) {
      return null;
    }

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const expected = signPayload(parsed.organizationId, parsed.objectKey, parsed.exp);
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(parsed.sig);
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return null;
    }

    return {
      organizationId: parsed.organizationId,
      objectKey: parsed.objectKey,
    };
  } catch {
    return null;
  }
}

export function buildTemplateMediaAssetPath(organizationId: string, objectKey: string): string {
  const token = createTemplateMediaAccessToken(organizationId, objectKey);
  return `/media/asset?token=${encodeURIComponent(token)}`;
}
