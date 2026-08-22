import { validateEnv } from '../../config/env';
import { MockTelephonyProvider } from './MockTelephonyProvider';
import type { TelephonyProvider } from './TelephonyProvider';

let cached: TelephonyProvider | null = null;

export function getTelephonyProvider(): TelephonyProvider {
  if (cached) return cached;
  const driver = validateEnv().TELEPHONY_PROVIDER ?? 'mock';
  if (driver !== 'mock') {
    cached = new MockTelephonyProvider();
    return cached;
  }
  cached = new MockTelephonyProvider();
  return cached;
}
