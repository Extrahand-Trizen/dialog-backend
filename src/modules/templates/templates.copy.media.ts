import {
  extractObjectKeyFromTemplateMediaUrl,
  getTemplateMediaObject,
} from '../../infrastructure/storage/templateMediaStorage';
import type { MetaMessageTemplateComponent } from '../../infrastructure/meta';
import { ValidationError } from '../../shared/errors/AppError';
import { uploadTemplateHeaderMedia } from '../media/media.service';
import {
  DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY,
  DIALOG_HEADER_MEDIA_URL_KEY,
} from './templates.meta';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function mimeFromHeaderFormat(format: string | undefined): string {
  switch (String(format ?? '').toUpperCase()) {
    case 'VIDEO':
      return 'video/mp4';
    case 'DOCUMENT':
      return 'application/pdf';
    default:
      return 'image/jpeg';
  }
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const pathName = new URL(url).pathname;
    const last = pathName.split('/').pop();
    return last ? decodeURIComponent(last) : fallback;
  } catch {
    return fallback;
  }
}

async function loadMediaFromUrl(input: {
  organizationId: string;
  url: string;
  fallbackMimeType: string;
  fallbackFileName: string;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const objectKey = extractObjectKeyFromTemplateMediaUrl(input.url);
  if (objectKey) {
    const stored = await getTemplateMediaObject({
      organizationId: input.organizationId,
      objectKey,
    });
    return {
      buffer: stored.body,
      mimeType: stored.mimeType,
      fileName: stored.fileName,
    };
  }

  const response = await fetch(input.url);
  if (!response.ok) {
    throw new ValidationError('Could not download template media for copy', {
      url: input.url,
      status: response.status,
    });
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new ValidationError('Template media file is empty', { url: input.url });
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
  return {
    buffer: bytes,
    mimeType: contentType || input.fallbackMimeType,
    fileName: fileNameFromUrl(input.url, input.fallbackFileName),
  };
}

function pickMediaSourceUrl(example: Record<string, unknown> | null): string | undefined {
  if (!example) {
    return undefined;
  }

  for (const key of [DIALOG_HEADER_MEDIA_URL_KEY, DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY]) {
    const value = example[key];
    if (typeof value === 'string' && isHttpUrl(value)) {
      return value.trim();
    }
  }

  const handles = Array.isArray(example.header_handle) ? example.header_handle : [];
  const handle = typeof handles[0] === 'string' ? handles[0].trim() : '';
  return handle && isHttpUrl(handle) ? handle : undefined;
}

async function remapMediaHeader(input: {
  organizationId: string;
  targetWhatsAppAccountId: string;
  header: MetaMessageTemplateComponent;
  fallbackFileName: string;
  dialogKey: typeof DIALOG_HEADER_MEDIA_URL_KEY | typeof DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY;
}): Promise<void> {
  const format = input.header.format;
  if (!format || String(format).toUpperCase() === 'TEXT') {
    return;
  }

  const example = isRecord(input.header.example) ? { ...input.header.example } : {};
  const sourceUrl = pickMediaSourceUrl(example);
  if (!sourceUrl) {
    throw new ValidationError(
      'This template has media that cannot be copied automatically. Upload the media again on the destination WABA, or copy text-only templates.',
    );
  }

  const loaded = await loadMediaFromUrl({
    organizationId: input.organizationId,
    url: sourceUrl,
    fallbackMimeType: mimeFromHeaderFormat(format),
    fallbackFileName: input.fallbackFileName,
  });

  const uploaded = await uploadTemplateHeaderMedia({
    organizationId: input.organizationId,
    whatsAppAccountId: input.targetWhatsAppAccountId,
    fileName: loaded.fileName,
    mimeType: loaded.mimeType,
    buffer: loaded.buffer,
  });

  const dialogKey = input.dialogKey;

  example.header_handle = [uploaded.handle];
  example[dialogKey] = uploaded.mediaUrl;
  if (dialogKey === DIALOG_HEADER_MEDIA_URL_KEY) {
    delete example[DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY];
  } else {
    delete example[DIALOG_HEADER_MEDIA_URL_KEY];
  }
  input.header.example = example;
}

function stripDialogOnlyExampleFields(components: MetaMessageTemplateComponent[]): MetaMessageTemplateComponent[] {
  const clone = JSON.parse(JSON.stringify(components)) as MetaMessageTemplateComponent[];

  const stripExample = (component: MetaMessageTemplateComponent): void => {
    if (!isRecord(component.example)) {
      return;
    }
    const example = { ...component.example };
    delete example[DIALOG_HEADER_MEDIA_URL_KEY];
    delete example[DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY];
    component.example = example;
  };

  for (const component of clone) {
    stripExample(component);
    if (component.type?.toUpperCase() !== 'CAROUSEL' || !Array.isArray(component.cards)) {
      continue;
    }
    for (const card of component.cards) {
      if (!isRecord(card) || !Array.isArray(card.components)) {
        continue;
      }
      for (const cardComponent of card.components as MetaMessageTemplateComponent[]) {
        stripExample(cardComponent);
      }
    }
  }

  return clone;
}

export async function prepareComponentsForWabaCopy(input: {
  organizationId: string;
  targetWhatsAppAccountId: string;
  components: unknown;
  templateName: string;
}): Promise<{
  metaComponents: MetaMessageTemplateComponent[];
  storedComponents: MetaMessageTemplateComponent[];
}> {
  if (!Array.isArray(input.components)) {
    throw new ValidationError('Template has no content to copy', { name: input.templateName });
  }

  const stored = JSON.parse(JSON.stringify(input.components)) as MetaMessageTemplateComponent[];

  for (const component of stored) {
    if (component.type?.toUpperCase() === 'HEADER') {
      await remapMediaHeader({
        organizationId: input.organizationId,
        targetWhatsAppAccountId: input.targetWhatsAppAccountId,
        header: component,
        fallbackFileName: `${input.templateName}-header`,
        dialogKey: DIALOG_HEADER_MEDIA_URL_KEY,
      });
    }

    if (component.type?.toUpperCase() !== 'CAROUSEL' || !Array.isArray(component.cards)) {
      continue;
    }

    for (const [index, card] of component.cards.entries()) {
      if (!isRecord(card) || !Array.isArray(card.components)) {
        continue;
      }
      const header = (card.components as MetaMessageTemplateComponent[]).find(
        (cardComponent) => cardComponent.type?.toUpperCase() === 'HEADER',
      );
      if (!header) {
        continue;
      }
      await remapMediaHeader({
        organizationId: input.organizationId,
        targetWhatsAppAccountId: input.targetWhatsAppAccountId,
        header,
        fallbackFileName: `carousel-${index + 1}.jpg`,
        dialogKey: DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY,
      });
    }
  }

  return {
    storedComponents: stored,
    metaComponents: stripDialogOnlyExampleFields(stored),
  };
}
