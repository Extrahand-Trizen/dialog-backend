import { validateEnv } from '../../config/env';
import { MetaApiError } from '../../shared/errors/sendErrors';
import type {
  MetaCreateMessageTemplateRequest,
  MetaCreateMessageTemplateResponse,
  MetaUpdateMessageTemplateRequest,
  MetaUpdateMessageTemplateResponse,
  MetaGraphErrorBody,
  MetaMessageTemplatesListResponse,
  MetaPhoneNumberResponse,
  MetaPhoneNumbersListResponse,
  MetaSendMessageResponse,
  MetaSendTemplateComponent,
  MetaSendTemplateRequest,
  MetaWabaResponse,
} from './meta.types';

const PHONE_NUMBER_FIELDS =
  'id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,status';

const MESSAGE_TEMPLATE_FIELDS =
  'id,name,status,category,language,components,rejected_reason';

export class MetaWhatsAppClient {
  constructor(private readonly apiVersion: string) {}

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.apiVersion}`;
  }

  private async request<T>(
    path: string,
    accessToken: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const body = (await response.json()) as T & MetaGraphErrorBody;

    if (!response.ok) {
      const message =
        body.error?.message ?? `Meta Graph API request failed (${response.status})`;
      const errorCode =
        response.status === 429 ? 'META_RATE_LIMITED' : 'META_GRAPH_API_ERROR';
      throw new MetaApiError(message, errorCode, response.status);
    }

    return body;
  }

  async getWaba(metaWabaId: string, accessToken: string): Promise<MetaWabaResponse> {
    return this.request<MetaWabaResponse>(`/${metaWabaId}`, accessToken);
  }

  async listPhoneNumbers(
    metaWabaId: string,
    accessToken: string,
  ): Promise<MetaPhoneNumbersListResponse> {
    return this.request<MetaPhoneNumbersListResponse>(
      `/${metaWabaId}/phone_numbers?fields=${PHONE_NUMBER_FIELDS}`,
      accessToken,
    );
  }

  async getPhoneNumber(
    metaPhoneNumberId: string,
    accessToken: string,
  ): Promise<MetaPhoneNumberResponse> {
    return this.request<MetaPhoneNumberResponse>(
      `/${metaPhoneNumberId}?fields=${PHONE_NUMBER_FIELDS}`,
      accessToken,
    );
  }

  async listMessageTemplates(
    metaWabaId: string,
    accessToken: string,
    after?: string,
  ): Promise<MetaMessageTemplatesListResponse> {
    const params = new URLSearchParams({
      fields: MESSAGE_TEMPLATE_FIELDS,
      limit: '100',
    });
    if (after) {
      params.set('after', after);
    }

    return this.request<MetaMessageTemplatesListResponse>(
      `/${metaWabaId}/message_templates?${params.toString()}`,
      accessToken,
    );
  }

  async createMessageTemplate(
    metaWabaId: string,
    accessToken: string,
    body: MetaCreateMessageTemplateRequest,
  ): Promise<MetaCreateMessageTemplateResponse> {
    return this.request<MetaCreateMessageTemplateResponse>(
      `/${metaWabaId}/message_templates`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  async updateMessageTemplate(
    metaTemplateId: string,
    accessToken: string,
    body: MetaUpdateMessageTemplateRequest,
  ): Promise<MetaUpdateMessageTemplateResponse> {
    return this.request<MetaUpdateMessageTemplateResponse>(
      `/${metaTemplateId}`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  async sendTemplateMessage(
    metaPhoneNumberId: string,
    accessToken: string,
    body: MetaSendTemplateRequest,
  ): Promise<MetaSendMessageResponse> {
    return this.request<MetaSendMessageResponse>(`/${metaPhoneNumberId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async startResumableUpload(
    metaAppId: string,
    accessToken: string,
    input: { fileName: string; fileLength: number; fileType: string },
  ): Promise<{ uploadSessionId: string }> {
    const params = new URLSearchParams({
      file_name: input.fileName,
      file_length: String(input.fileLength),
      file_type: input.fileType,
      access_token: accessToken,
    });

    const url = `${this.baseUrl}/${metaAppId}/uploads?${params.toString()}`;
    const response = await fetch(url, { method: 'POST' });
    const body = (await response.json()) as { id?: string } & MetaGraphErrorBody;

    if (!response.ok || !body.id) {
      const message =
        body.error?.message ?? `Meta upload session failed (${response.status})`;
      const errorCode =
        response.status === 429 ? 'META_RATE_LIMITED' : 'META_UPLOAD_SESSION_FAILED';
      throw new MetaApiError(message, errorCode, response.status);
    }

    return { uploadSessionId: body.id };
  }

  async completeResumableUpload(
    uploadSessionId: string,
    accessToken: string,
    fileBuffer: Buffer,
    fileOffset = 0,
  ): Promise<{ handle: string }> {
    const sessionPath = uploadSessionId.startsWith('upload:')
      ? `/${uploadSessionId}`
      : `/upload:${uploadSessionId}`;

    const url = `${this.baseUrl}${sessionPath}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: String(fileOffset),
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
    });

    const body = (await response.json()) as { h?: string } & MetaGraphErrorBody;

    if (!response.ok || !body.h) {
      const message =
        body.error?.message ?? `Meta upload binary failed (${response.status})`;
      const errorCode =
        response.status === 429 ? 'META_RATE_LIMITED' : 'META_UPLOAD_BINARY_FAILED';
      throw new MetaApiError(message, errorCode, response.status);
    }

    return { handle: body.h };
  }

  async uploadResumableMedia(
    metaAppId: string,
    accessToken: string,
    input: { fileName: string; fileBuffer: Buffer; mimeType: string },
  ): Promise<{ handle: string }> {
    const { uploadSessionId } = await this.startResumableUpload(metaAppId, accessToken, {
      fileName: input.fileName,
      fileLength: input.fileBuffer.byteLength,
      fileType: input.mimeType,
    });

    return this.completeResumableUpload(uploadSessionId, accessToken, input.fileBuffer);
  }
}

let clientInstance: MetaWhatsAppClient | null = null;

export function getMetaWhatsAppClient(): MetaWhatsAppClient {
  if (!clientInstance) {
    clientInstance = new MetaWhatsAppClient(validateEnv().META_API_VERSION);
  }
  return clientInstance;
}
