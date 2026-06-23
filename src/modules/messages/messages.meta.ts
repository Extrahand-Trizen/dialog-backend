import { ValidationError } from '../../shared/errors/AppError';
import type { MetaSendTemplateComponent } from '../../infrastructure/meta';

export type TemplateVariableSchema = {
  variables: { index: number; name?: string }[];
};

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

export function buildTemplateComponentsFromMapping(
  variableMapping: Record<string, string>,
  payload: unknown,
): MetaSendTemplateComponent[] {
  const indices = Object.keys(variableMapping)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (indices.length === 0) {
    return [];
  }

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

  return [{ type: 'body', parameters }];
}

export function buildTemplateComponentsFromVariables(
  variableSchema: unknown,
  variables: Record<string, string> | string[] | undefined,
): MetaSendTemplateComponent[] {
  const schema = parseTemplateVariableSchema(variableSchema);
  if (schema.variables.length === 0) {
    return [];
  }

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

  return [{ type: 'body', parameters }];
}
