import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { asyncHandler } from '../../middleware/errorHandler';
import { validateEnv } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getTelephonyProvider } from '../../infrastructure/telephony';
import { applyProviderCallEvent } from '../calling/calling.service';
import type { CallRecordStatus } from '@prisma/client';

function authorizeTelephonyWebhook(req: Request): void {
  const secret = validateEnv().TELEPHONY_WEBHOOK_SECRET;
  if (!secret) {
    throw new UnauthorizedError('Telephony webhook is not configured', 'TELEPHONY_WEBHOOK_DISABLED');
  }
  const header =
    (typeof req.headers['x-telephony-secret'] === 'string' && req.headers['x-telephony-secret']) ||
    (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : '');
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnauthorizedError('Invalid telephony webhook secret', 'TELEPHONY_WEBHOOK_UNAUTHORIZED');
  }
}

export function createTelephonyWebhookRouter(): Router {
  const router = Router();
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      authorizeTelephonyWebhook(req);
      const normalized = await getTelephonyProvider().handleWebhook(req.body);
      if (normalized) {
        await applyProviderCallEvent({
          providerCallId: normalized.providerCallId,
          event: normalized.event,
          status: normalized.status as CallRecordStatus | undefined,
          durationSeconds: normalized.durationSeconds,
          recordingReference: normalized.recordingReference,
        });
      }
      AppResponse.success(res, 'Telephony event accepted', { accepted: true });
    }),
  );
  return router;
}
