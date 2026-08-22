export type TelephonyCallStatus =
  | 'QUEUED'
  | 'RINGING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'MISSED'
  | 'BUSY'
  | 'NO_ANSWER'
  | 'FAILED'
  | 'CANCELLED';

export type AvailableNumber = {
  providerNumberId: string;
  e164: string;
  countryCode: string;
  countryName: string;
  locality: string;
  monthlyFeeUsd: number;
};

export type ProvisionedNumber = {
  providerNumberId: string;
  e164: string;
};

export type InitiatedProviderCall = {
  providerCallId: string;
  providerReference?: string;
  status: TelephonyCallStatus;
};

export type ProviderCallSnapshot = {
  providerCallId: string;
  status: TelephonyCallStatus;
  durationSeconds: number | null;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  recordingReference?: string | null;
  failureReason?: string | null;
};

export type MaskingSessionResult = {
  providerSessionId: string;
  status: 'CREATED' | 'RINGING' | 'ACTIVE';
  expiresAt?: Date | null;
};

export type NormalizedTelephonyEvent = {
  event:
    | 'call.initiated'
    | 'call.ringing'
    | 'call.answered'
    | 'call.completed'
    | 'call.failed'
    | 'call.busy'
    | 'call.no_answer'
    | 'call.ended'
    | 'recording.available';
  providerCallId: string;
  status?: TelephonyCallStatus;
  durationSeconds?: number | null;
  recordingReference?: string | null;
};

export interface TelephonyProvider {
  getAvailableNumbers(query: { country?: string }): Promise<AvailableNumber[]>;
  getNumberDetails(providerNumberId: string): Promise<AvailableNumber | null>;
  provisionNumber(providerNumberId: string): Promise<ProvisionedNumber>;
  releaseNumber(providerNumberId: string): Promise<void>;
  configureNumber(providerNumberId: string, config: Record<string, unknown>): Promise<void>;
  initiateCall(input: {
    fromE164: string;
    toE164: string;
    virtualNumberId: string;
    record?: boolean;
  }): Promise<InitiatedProviderCall>;
  endCall(providerCallId: string): Promise<ProviderCallSnapshot>;
  getCallStatus(providerCallId: string): Promise<ProviderCallSnapshot>;
  createMaskingSession(input: {
    virtualE164: string;
    partyA: string;
    partyB: string;
  }): Promise<MaskingSessionResult>;
  endMaskingSession(providerSessionId: string): Promise<void>;
  getRecording(recordingReference: string): Promise<{ url: string } | null>;
  handleWebhook(payload: unknown): Promise<NormalizedTelephonyEvent | null>;
}
