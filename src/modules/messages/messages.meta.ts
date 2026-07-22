import { ValidationError } from '../../shared/errors/AppError';
import type { MetaSendTemplateComponent } from '../../infrastructure/meta';
import { normalizeTemplateMediaPublicUrl } from '../../infrastructure/storage/templateMediaStorage';

/** Dialog-only field stored in HEADER example — mirrors templates.meta DIALOG_HEADER_MEDIA_URL_KEY. */
const HEADER_MEDIA_URL_KEY = 'header_media_url';

export type TemplateVariableSchema = {
  variables: { index: number; name?: string }[];
};

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

    const link = normalizeTemplateMediaPublicUrl(mediaUrlRaw);
    if (!/^https?:\/\//i.test(link)) {
      throw new ValidationError('Template header media URL must be a public http(s) URL', {
        format,
        mediaUrl: link,
      });
    }

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

export function withTemplateSendComponents(
  templateComponents: unknown,
  bodyComponents: MetaSendTemplateComponent[],
  payload: unknown,
): MetaSendTemplateComponent[] {
  const header = buildHeaderComponentFromTemplate(templateComponents);
  const buttons = buildUrlButtonComponentsFromTemplate(templateComponents, payload);
  return [...(header ? [header] : []), ...bodyComponents, ...buttons];
}

export function buildTemplateComponentsFromMapping(
  variableMapping: Record<string, string>,
  payload: unknown,
  templateComponents?: unknown,
): MetaSendTemplateComponent[] {
  const indices = Object.keys(variableMapping)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  const bodyComponents: MetaSendTemplateComponent[] = [];

  if (indices.length > 0) {
    const parameters: { type: 'text'; text: string }[] = [];

    for (const index of indices) {
      const path = variableMapping[String(index)];
      const value = resolvePayloadValue(payload, path);
      if (value === undefined) {
        throw new ValidationError(`Missing template variable for slot ${index}`, {
          index,
          path,
        });
      }
      parameters.push({ type: 'text', text: value });
    }

    bodyComponents.push({ type: 'body', parameters });
  }

  return withTemplateSendComponents(templateComponents, bodyComponents, payload);
}

export function buildTemplateComponentsFromVariables(
  variableSchema: unknown,
  variables: Record<string, string> | string[] | undefined,
  templateComponents?: unknown,
): MetaSendTemplateComponent[] {
  const schema = parseTemplateVariableSchema(variableSchema);
  const bodyComponents: MetaSendTemplateComponent[] = [];

  if (schema.variables.length > 0) {
    const parameters: { type: 'text'; text: string }[] = [];

    for (const slot of schema.variables) {
      let value: string | undefined;

      if (Array.isArray(variables)) {
        value = variables[slot.index - 1];
      } else if (variables) {
        if (slot.name) {
          value = variables[slot.name];
        }
        if (value === undefined) {
          value = variables[String(slot.index)];
        }
      }

      if (value === undefined || value.length === 0) {
        const label = slot.name ?? `slot ${slot.index}`;
        throw new ValidationError(`Missing template variable: ${label}`, {
          index: slot.index,
          name: slot.name,
        });
      }

      parameters.push({ type: 'text', text: value });
    }

    bodyComponents.push({ type: 'body', parameters });
  }

  // Manual sends pass variables only; prefer variables.taskId for URL buttons when present.
  const payloadForButtons =
    variables && !Array.isArray(variables) ? variables : variables ?? {};

  return withTemplateSendComponents(templateComponents, bodyComponents, payloadForButtons);
}
