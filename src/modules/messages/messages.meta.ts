import { ValidationError } from '../../shared/errors/AppError';
import type { MetaSendTemplateComponent } from '../../infrastructure/meta';
import { normalizeTemplateMediaPublicUrl } from '../../infrastructure/storage/templateMediaStorage';

/** Dialog-only field stored in HEADER example — mirrors templates.meta DIALOG_HEADER_MEDIA_URL_KEY. */
const HEADER_MEDIA_URL_KEY = 'header_media_url';

/** Meta sample / CDN links expire and cause "Media upload error" after Sent. */
const EPHEMERAL_WHATSAPP_MEDIA_HOST_RE =
  /(?:^|\.)(?:scontent\.whatsapp\.net|lookaside\.fbsbx\.com|scontent\.[a-z0-9-]+\.fbcdn\.net)$/i;

export type TemplateVariableSchema = {
  variables: { index: number; name?: string }[];
};

export function isEphemeralWhatsAppMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return EPHEMERAL_WHATSAPP_MEDIA_HOST_RE.test(host);
  } catch {
    return false;
  }
}

/**
 * Normalize and reject media URLs Meta cannot reliably re-fetch on delivery.
 * Prefer durable MinIO / public https links stored as header_media_url.
 */
export function assertDurableTemplateMediaUrl(rawUrl: string, format: string): string {
  const link = normalizeTemplateMediaPublicUrl(rawUrl.trim());
  if (!/^https?:\/\//i.test(link)) {
    throw new ValidationError('Template header media URL must be a public http(s) URL', {
      format,
      mediaUrl: link,
    });
  }

  if (isEphemeralWhatsAppMediaUrl(link)) {
    throw new ValidationError(
      'Template header uses an expired WhatsApp CDN image link — re-upload the header image in Dialog (MinIO) and send again',
      { format, mediaUrl: link },
    );
  }

  // Bare bucket/base URL with no object key → Meta "Media upload error".
  try {
    const parsed = new URL(link);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const segments = pathname.split('/').filter(Boolean);
    const looksLikeBareStorageRoot =
      segments.length === 0 ||
      (segments.length === 1 &&
        /(?:template-media|whatsapp-template-media)$/i.test(segments[0] || ''));
    if (looksLikeBareStorageRoot) {
      throw new ValidationError(
        'Template header media URL is incomplete — re-upload the header image in Dialog',
        { format, mediaUrl: link },
      );
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
  }

  return link;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseTemplateVariableSchema(value: unknown): TemplateVariableSchema {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { variables: [] };
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.variables)) {
    return { variables: [] };
  }

  const variables: TemplateVariableSchema['variables'] = [];

  for (const entry of record.variables) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const index = Number(row.index);
    if (!Number.isFinite(index)) {
      continue;
    }
    const name = typeof row.name === 'string' && row.name.length > 0 ? row.name : undefined;
    variables.push(name ? { index, name } : { index });
  }

  variables.sort((left, right) => left.index - right.index);
  return { variables };
}

export function normalizeRecipientPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new ValidationError('recipientPhone must be a valid phone number', {
      recipientPhone: raw,
    });
  }
  return digits;
}

export function resolvePayloadValue(payload: unknown, path: string): string | undefined {
  const normalizedPath = path.startsWith('payload.') ? path.slice('payload.'.length) : path;
  if (!normalizedPath) {
    return undefined;
  }

  let current: unknown = payload;
  for (const segment of normalizedPath.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null || current === undefined) {
    return undefined;
  }

  if (typeof current === 'string') {
    return current;
  }
  if (typeof current === 'number' || typeof current === 'boolean') {
    return String(current);
  }

  return undefined;
}

/**
 * Media headers require a header parameter on every send.
 * Uses the public media URL stored on the template version components.
 */
export function buildHeaderComponentFromTemplate(
  templateComponents: unknown,
): MetaSendTemplateComponent | null {
  const components = coerceTemplateComponentsArray(templateComponents);
  if (!components) {
    return null;
  }

  for (const raw of components) {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      continue;
    }
    if (raw.type.toUpperCase() !== 'HEADER') {
      continue;
    }

    const format = typeof raw.format === 'string' ? raw.format.toUpperCase().trim() : '';
    if (format !== 'IMAGE' && format !== 'VIDEO' && format !== 'DOCUMENT') {
      return null;
    }

    const example = isRecord(raw.example) ? raw.example : null;
    let mediaUrlRaw =
      example && typeof example[HEADER_MEDIA_URL_KEY] === 'string'
        ? example[HEADER_MEDIA_URL_KEY].trim()
        : '';

    // Fallback: some synced templates only keep a public URL in header_handle.
    if (!mediaUrlRaw && example && Array.isArray(example.header_handle)) {
      const handle = example.header_handle.find(
        (entry) => typeof entry === 'string' && /^https?:\/\//i.test(entry.trim()),
      );
      if (typeof handle === 'string') {
        mediaUrlRaw = handle.trim();
      }
    }

    if (!mediaUrlRaw) {
      throw new ValidationError(
        `Template header requires ${format.toLowerCase()} media, but no public media URL is stored on the template`,
        { format },
      );
    }

    const link = assertDurableTemplateMediaUrl(mediaUrlRaw, format);

    if (format === 'IMAGE') {
      return { type: 'header', parameters: [{ type: 'image', image: { link } }] };
    }
    if (format === 'VIDEO') {
      return { type: 'header', parameters: [{ type: 'video', video: { link } }] };
    }
    return { type: 'header', parameters: [{ type: 'document', document: { link } }] };
  }

  return null;
}

/**
 * Renders the final customer-facing template body text (placeholders substituted)
 * so the Inbox can show what was actually sent, not just "Template: name". Works from
 * the already-resolved BODY parameter values — the same shape whether they came from
 * a fresh send (`MetaSendTemplateComponent[]`) or a stored `Message.components` row.
 */
export function renderTemplateBodyTextFromComponents(
  templateComponents: unknown,
  sentComponents: unknown,
): string | null {
  const definition = coerceTemplateComponentsArray(templateComponents);
  const bodyDefinition = definition?.find(
    (raw) => isRecord(raw) && typeof raw.type === 'string' && raw.type.toUpperCase() === 'BODY',
  ) as Record<string, unknown> | undefined;
  const text = bodyDefinition && typeof bodyDefinition.text === 'string' ? bodyDefinition.text : '';
  if (!text) {
    return null;
  }

  const sent = coerceTemplateComponentsArray(sentComponents) ?? [];
  const bodySent = sent.find(
    (raw) => isRecord(raw) && typeof raw.type === 'string' && raw.type.toLowerCase() === 'body',
  ) as Record<string, unknown> | undefined;
  const params = Array.isArray(bodySent?.parameters) ? bodySent.parameters : [];
  const values = params.map((param) =>
    isRecord(param) && typeof param.text === 'string' ? param.text : undefined,
  );

  if (!/\{\{\d+\}\}/.test(text)) {
    return text;
  }

  return text.replace(/\{\{(\d+)\}\}/g, (match, indexStr: string) => {
    const index = Number.parseInt(indexStr, 10);
    return values[index - 1] ?? match;
  });
}

export type RenderedTemplateButton = {
  label: string;
  url?: string;
  phoneNumber?: string;
};

/**
 * Resolves the buttons actually shown for a sent template, using the button LABELS from
 * the template definition (not stored on Message) combined with the dynamic URL suffix
 * that was actually sent (stored on Message.components), so a URL button renders a real,
 * clickable link matching what the customer received on WhatsApp.
 */
export function resolveTemplateButtonsFromComponents(
  templateComponents: unknown,
  sentComponents: unknown,
): RenderedTemplateButton[] {
  const definition = coerceTemplateComponentsArray(templateComponents);
  const buttonsDefinition = definition?.find(
    (raw) => isRecord(raw) && typeof raw.type === 'string' && raw.type.toUpperCase() === 'BUTTONS',
  ) as Record<string, unknown> | undefined;
  const definedButtons = Array.isArray(buttonsDefinition?.buttons) ? buttonsDefinition.buttons : [];
  if (definedButtons.length === 0) {
    return [];
  }

  const sent = coerceTemplateComponentsArray(sentComponents) ?? [];
  const sentButtonByIndex = new Map<number, Record<string, unknown>>();
  for (const raw of sent) {
    if (!isRecord(raw) || typeof raw.type !== 'string' || raw.type.toLowerCase() !== 'button') continue;
    const index = Number.parseInt(String(raw.index ?? ''), 10);
    if (Number.isFinite(index)) {
      sentButtonByIndex.set(index, raw);
    }
  }

  const results: RenderedTemplateButton[] = [];

  definedButtons.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const label = typeof raw.text === 'string' ? raw.text : '';
    if (!label) return;
    const buttonType = typeof raw.type === 'string' ? raw.type.toUpperCase() : '';

    if (buttonType === 'URL') {
      const baseUrl = typeof raw.url === 'string' ? raw.url : '';
      if (!baseUrl) return;
      if (!/\{\{\d+\}\}/.test(baseUrl)) {
        results.push({ label, url: baseUrl });
        return;
      }
      const sentButton = sentButtonByIndex.get(index);
      const suffixParam = Array.isArray(sentButton?.parameters) ? sentButton.parameters[0] : undefined;
      const suffix = isRecord(suffixParam) && typeof suffixParam.text === 'string' ? suffixParam.text : '';
      if (!suffix) return;
      results.push({ label, url: baseUrl.replace(/\{\{\d+\}\}/, suffix) });
      return;
    }

    if (buttonType === 'PHONE_NUMBER') {
      const phoneNumber = typeof raw.phone_number === 'string' ? raw.phone_number : '';
      if (phoneNumber) results.push({ label, phoneNumber });
      return;
    }

    // QUICK_REPLY and anything else — informational label only, no real link to follow here.
    results.push({ label });
  });

  return results;
}

export function coerceTemplateComponentsArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** True when the Meta template definition requires an IMAGE/VIDEO/DOCUMENT header param on send. */
export function templateRequiresMediaHeader(templateComponents: unknown): boolean {
  const components = coerceTemplateComponentsArray(templateComponents);
  if (!components) {
    return false;
  }
  return components.some((raw) => {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      return false;
    }
    if (raw.type.toUpperCase() !== 'HEADER') {
      return false;
    }
    const format = typeof raw.format === 'string' ? raw.format.toUpperCase().trim() : '';
    return format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT';
  });
}

export function outboundHasMediaHeader(components: MetaSendTemplateComponent[]): boolean {
  return components.some(
    (component) =>
      component.type === 'header' &&
      Array.isArray(component.parameters) &&
      component.parameters.some((parameter) =>
        ['image', 'video', 'document'].includes(String(parameter.type || '')),
      ),
  );
}

export function withTemplateHeaderComponents(
  templateComponents: unknown,
  bodyComponents: MetaSendTemplateComponent[],
): MetaSendTemplateComponent[] {
  const header = buildHeaderComponentFromTemplate(templateComponents);
  return header ? [header, ...bodyComponents] : bodyComponents;
}

/**
 * Dynamic URL buttons (e.g. https://extrahand.in/open/tasks/{{1}}) require a
 * button component parameter on every send — Meta error #131008 otherwise.
 *
 * ExtraHand deep links expect a Mongo task ObjectId (24 hex). Template examples
 * wrongly use titles like "Fix kitchen sink leak" — those produce Meta #132018.
 */
export function buildUrlButtonComponentsFromTemplate(
  templateComponents: unknown,
  payload: unknown,
): MetaSendTemplateComponent[] {
  const components = coerceTemplateComponentsArray(templateComponents);
  if (!components) {
    return [];
  }

  const buttonsComponent = components.find((raw) => {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      return false;
    }
    return raw.type.toUpperCase() === 'BUTTONS' && Array.isArray(raw.buttons);
  });

  if (!buttonsComponent || !isRecord(buttonsComponent) || !Array.isArray(buttonsComponent.buttons)) {
    return [];
  }

  const result: MetaSendTemplateComponent[] = [];

  buttonsComponent.buttons.forEach((rawButton, index) => {
    if (!isRecord(rawButton)) {
      return;
    }
    const buttonType = typeof rawButton.type === 'string' ? rawButton.type.toUpperCase() : '';
    if (buttonType !== 'URL') {
      return;
    }
    const url = typeof rawButton.url === 'string' ? rawButton.url : '';
    if (!/\{\{\d+\}\}/.test(url)) {
      return;
    }

    const suffix = resolveUrlButtonSuffix(payload, index);

    if (!suffix) {
      throw new ValidationError(
        `Template URL button at index ${index} requires a valid task id (24-char Mongo ObjectId)`,
        { index, url },
      );
    }

    result.push({
      type: 'button',
      sub_type: 'url',
      index: String(index),
      parameters: [{ type: 'text', text: suffix }],
    });
  });

  return result;
}

const MONGO_OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const SAFE_TASK_PATH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

/** Only accept ExtraHand deep-link path suffixes Meta will accept (no spaces/titles). */
export function sanitizeUrlButtonSuffix(raw: unknown): string | undefined {
  const value = String(raw ?? '').trim();
  if (!value) return undefined;
  if (/\s/.test(value)) return undefined;
  if (value.includes('/') || value.includes('?') || value.includes('#')) return undefined;
  // Prefer real task ids; allow booknow-pending-* and similar safe tokens.
  if (MONGO_OBJECT_ID_RE.test(value)) return value;
  if (SAFE_TASK_PATH_RE.test(value) && !/\s/.test(value)) return value;
  return undefined;
}

function resolveUrlButtonSuffix(payload: unknown, buttonIndex: number): string | undefined {
  const candidates = [
    resolvePayloadValue(payload, `button.${buttonIndex}`),
    resolvePayloadValue(payload, 'buttonUrlSuffix'),
    resolvePayloadValue(payload, 'taskId'),
    resolvePayloadValue(payload, 'workId'),
    resolvePayloadValue(payload, 'entityId'),
  ];

  for (const candidate of candidates) {
    const safe = sanitizeUrlButtonSuffix(candidate);
    if (safe) return safe;
  }

  return undefined;
}

function buildParametersForComponent(
  component: Record<string, unknown> | undefined,
  resolver: (index: number) => string | undefined,
): { type: 'text'; text: string }[] {
  if (!component) return [];
  const text = typeof component.text === 'string' ? component.text : '';
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  const parameters: { type: 'text'; text: string }[] = [];
  for (const match of matches) {
    const index = Number.parseInt(match[1], 10);
    const value = resolver(index);
    if (value === undefined || value.length === 0) {
      throw new ValidationError(`Missing template variable: slot ${index}`, {
        index,
      });
    }
    parameters.push({ type: 'text', text: value });
  }
  return parameters;
}

export function buildTemplateComponentsFromMapping(
  variableMapping: Record<string, string>,
  payload: unknown,
  templateComponents?: unknown,
): MetaSendTemplateComponent[] {
  const components = coerceTemplateComponentsArray(templateComponents) || [];

  const resolver = (index: number): string | undefined => {
    const path = variableMapping[String(index)];
    if (!path) return undefined;
    return resolvePayloadValue(payload, path);
  };

  const headerComponent = components.find(
    (c) => isRecord(c) && typeof c.type === 'string' && c.type.toUpperCase() === 'HEADER'
  ) as Record<string, unknown> | undefined;

  const bodyComponent = components.find(
    (c) => isRecord(c) && typeof c.type === 'string' && c.type.toUpperCase() === 'BODY'
  ) as Record<string, unknown> | undefined;

  const bodyComponents: MetaSendTemplateComponent[] = [];

  // 1. Build Header component parameters if it is TEXT format
  let header: MetaSendTemplateComponent | null = null;
  if (
    headerComponent &&
    typeof headerComponent.format === 'string' &&
    headerComponent.format.toUpperCase().trim() === 'TEXT'
  ) {
    const headerParams = buildParametersForComponent(headerComponent, resolver);
    if (headerParams.length > 0) {
      header = { type: 'header', parameters: headerParams };
    }
  } else {
    // Media header (IMAGE, VIDEO, DOCUMENT) or null
    header = buildHeaderComponentFromTemplate(templateComponents);
  }

  // 2. Build Body component parameters
  const bodyParams = buildParametersForComponent(bodyComponent, resolver);
  if (bodyParams.length > 0) {
    bodyComponents.push({ type: 'body', parameters: bodyParams });
  }

  // 3. Build Buttons
  const buttons = buildUrlButtonComponentsFromTemplate(templateComponents, payload);

  const staged = [...(header ? [header] : []), ...bodyComponents, ...buttons];
  assertOutboundMediaHeaderComplete(templateComponents, staged);
  return staged;
}

export function buildTemplateComponentsFromVariables(
  variableSchema: unknown,
  variables: Record<string, string> | string[] | undefined,
  templateComponents?: unknown,
): MetaSendTemplateComponent[] {
  const components = coerceTemplateComponentsArray(templateComponents) || [];

  const resolver = (index: number): string | undefined => {
    let value: string | undefined;
    if (Array.isArray(variables)) {
      value = variables[index - 1];
    } else if (variables) {
      value = variables[String(index)];
      if (value === undefined) {
        const schema = parseTemplateVariableSchema(variableSchema);
        const slot = schema.variables.find((v) => v.index === index);
        if (slot?.name) {
          value = variables[slot.name];
        }
      }
    }
    return value;
  };

  const headerComponent = components.find(
    (c) => isRecord(c) && typeof c.type === 'string' && c.type.toUpperCase() === 'HEADER'
  ) as Record<string, unknown> | undefined;

  const bodyComponent = components.find(
    (c) => isRecord(c) && typeof c.type === 'string' && c.type.toUpperCase() === 'BODY'
  ) as Record<string, unknown> | undefined;

  const bodyComponents: MetaSendTemplateComponent[] = [];

  // 1. Build Header component parameters if it is TEXT format
  let header: MetaSendTemplateComponent | null = null;
  if (
    headerComponent &&
    typeof headerComponent.format === 'string' &&
    headerComponent.format.toUpperCase().trim() === 'TEXT'
  ) {
    const headerParams = buildParametersForComponent(headerComponent, resolver);
    if (headerParams.length > 0) {
      header = { type: 'header', parameters: headerParams };
    }
  } else {
    // Media header or null
    header = buildHeaderComponentFromTemplate(templateComponents);
  }

  // 2. Build Body component parameters
  const bodyParams = buildParametersForComponent(bodyComponent, resolver);
  if (bodyParams.length > 0) {
    bodyComponents.push({ type: 'body', parameters: bodyParams });
  }

  // 3. Build Buttons
  const payloadForButtons = variables && !Array.isArray(variables) ? variables : {};
  const buttons = buildUrlButtonComponentsFromTemplate(templateComponents, payloadForButtons);

  const staged = [...(header ? [header] : []), ...bodyComponents, ...buttons];
  assertOutboundMediaHeaderComplete(templateComponents, staged);
  return staged;
}

function assertOutboundMediaHeaderComplete(
  templateComponents: unknown,
  staged: MetaSendTemplateComponent[],
): void {
  if (!templateRequiresMediaHeader(templateComponents)) {
    return;
  }
  if (outboundHasMediaHeader(staged)) {
    return;
  }
  throw new ValidationError(
    'Template requires a media header parameter but none was built — check header_media_url on the template (Meta #132012)',
    {
      stagedTypes: staged.map((component) => component.type),
    },
  );
}
