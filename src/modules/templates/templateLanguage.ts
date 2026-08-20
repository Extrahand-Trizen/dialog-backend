export function coerceMetaTemplateId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function normalizeStoredTemplateLanguage(language: string): string {
  const trimmed = language.trim();
  if (!trimmed) {
    return trimmed;
  }

  // Preserve the full locale (e.g. en_US) replacing hyphens with underscores
  return trimmed.replace('-', '_');
}

export function languageLookupVariants(language?: string): string[] {
  if (!language?.trim()) {
    return [];
  }

  const trimmed = language.trim();
  const normalized = normalizeStoredTemplateLanguage(trimmed);
  const variants = new Set<string>([trimmed, trimmed.toLowerCase(), normalized]);

  return [...variants];
}

export function normalizeTemplateRejectionReason(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === 'NONE') {
    return undefined;
  }

  return trimmed;
}

export function templateLanguagesMatch(left?: string | null, right?: string | null): boolean {
  if (!left || !right) {
    return false;
  }

  const leftVariants = new Set(languageLookupVariants(left));
  return languageLookupVariants(right).some((variant) => leftVariants.has(variant));
}
