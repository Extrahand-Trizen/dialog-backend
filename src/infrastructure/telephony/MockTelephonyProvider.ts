import { randomUUID } from 'crypto';
import { VOICE_CATALOG } from '../../modules/voice/voice.catalog';
import type {
  AvailableNumber,
  InitiatedProviderCall,
  MaskingSessionResult,
  NormalizedTelephonyEvent,
  ProviderCallSnapshot,
  ProvisionedNumber,
  TelephonyProvider,
} from './TelephonyProvider';

type MockCall = {
  snapshot: ProviderCallSnapshot;
};

const mockCalls = new Map<string, MockCall>();

function catalogToAvailable(country?: string): AvailableNumber[] {
  return VOICE_CATALOG.filter((item) =>
    country ? item.countryCode === country.toUpperCase() : true,
  ).map((item) => ({
    providerNumberId: `mock:${item.e164}`,
    e164: item.e164,
    countryCode: item.countryCode,
    countryName: item.countryName,
    locality: item.locality,
    monthlyFeeUsd: item.monthlyFeeUsd,
  }));
}

/**
 * Development/staging adapter. Does not place PSTN calls.
 * Status stays RINGING until endCall — never auto-answers.
 */
export class MockTelephonyProvider implements TelephonyProvider {
  async getAvailableNumbers(query: { country?: string }): Promise<AvailableNumber[]> {
    return catalogToAvailable(query.country);
  }

  async getNumberDetails(providerNumberId: string): Promise<AvailableNumber | null> {
    const e164 = providerNumberId.replace(/^mock:/, '');
    return catalogToAvailable().find((item) => item.e164 === e164) ?? null;
  }

  async provisionNumber(providerNumberId: string): Promise<ProvisionedNumber> {
    const details = await this.getNumberDetails(providerNumberId);
    if (!details) {
      throw new Error('Number is not available');
    }
    return { providerNumberId, e164: details.e164 };
  }

  async releaseNumber(_providerNumberId: string): Promise<void> {
    return;
  }

  async configureNumber(_providerNumberId: string, _config: Record<string, unknown>): Promise<void> {
    return;
  }

  async initiateCall(input: {
    fromE164: string;
    toE164: string;
  }): Promise<InitiatedProviderCall> {
    const providerCallId = `mock-call-${randomUUID()}`;
    mockCalls.set(providerCallId, {
      snapshot: {
        providerCallId,
        status: 'RINGING',
        durationSeconds: null,
      },
    });
    void input;
    return { providerCallId, providerReference: providerCallId, status: 'RINGING' };
  }

  async endCall(providerCallId: string): Promise<ProviderCallSnapshot> {
    const existing = mockCalls.get(providerCallId);
    const snapshot: ProviderCallSnapshot = {
      providerCallId,
      status: existing?.snapshot.status === 'ACTIVE' ? 'COMPLETED' : 'CANCELLED',
      durationSeconds: existing?.snapshot.status === 'ACTIVE' ? existing.snapshot.durationSeconds : null,
      endedAt: new Date(),
    };
    mockCalls.set(providerCallId, { snapshot });
    return snapshot;
  }

  async getCallStatus(providerCallId: string): Promise<ProviderCallSnapshot> {
    return (
      mockCalls.get(providerCallId)?.snapshot ?? {
        providerCallId,
        status: 'RINGING',
        durationSeconds: null,
      }
    );
  }

  async createMaskingSession(): Promise<MaskingSessionResult> {
    return {
      providerSessionId: `mock-mask-${randomUUID()}`,
      status: 'CREATED',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
  }

  async endMaskingSession(_providerSessionId: string): Promise<void> {
    return;
  }

  async getRecording(_recordingReference: string): Promise<{ url: string } | null> {
    return null;
  }

  async handleWebhook(payload: unknown): Promise<NormalizedTelephonyEvent | null> {
    if (!payload || typeof payload !== 'object') return null;
    const body = payload as Record<string, unknown>;
    const providerCallId = typeof body.providerCallId === 'string' ? body.providerCallId : null;
    const event = typeof body.event === 'string' ? body.event : null;
    if (!providerCallId || !event) return null;
    return {
      event: event as NormalizedTelephonyEvent['event'],
      providerCallId,
      status: typeof body.status === 'string' ? (body.status as ProviderCallSnapshot['status']) : undefined,
      durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : null,
      recordingReference: typeof body.recordingReference === 'string' ? body.recordingReference : null,
    };
  }
}
