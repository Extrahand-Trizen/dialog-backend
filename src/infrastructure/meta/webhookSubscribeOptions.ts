import { validateEnv } from '../../config/env';

/** Options for Meta WABA subscribed_apps (optional webhook override). */
export function getMetaWebhookSubscribeOptions():
  | { overrideCallbackUri: string; verifyToken: string }
  | undefined {
  const env = validateEnv();
  const overrideCallbackUri = env.META_WEBHOOK_CALLBACK_URL?.trim();
  const verifyToken = env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!overrideCallbackUri || !verifyToken) {
    return undefined;
  }
  return { overrideCallbackUri, verifyToken };
}
