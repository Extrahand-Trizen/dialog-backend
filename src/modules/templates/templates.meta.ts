import type { MetaMessageTemplateComponent, MetaMessageTemplateNode } from '../../infrastructure/meta';
import { normalizeTemplateMediaPublicUrl } from '../../infrastructure/storage/templateMediaStorage';
import type { MetaTemplateStatus, TemplateCategory } from './templates.schemas';

export type MappedMetaTemplate = {
  metaTemplateId: string;
  metaTemplateName: string;
  category: TemplateCategory;
  language: string;
  metaStatus: MetaTemplateStatus;
  components: unknown;
  variableSchema: unknown;
  rejectionReason: string | null;
};

export type TemplateButtonPreview =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phoneNumber: string }
  | { type: 'COPY_CODE'; text: string; example: string };

export type CarouselCardPreview = {
  headerType: 'image';
  bodyText: string;
  buttonText?: string;
  imageHandle?: string;
  imageMediaUrl?: string;
};

export type TemplatePreviewDto = {
  templateKind: 'standard' | 'carousel';
  headerType: 'none' | 'text' | 'image' | 'video' | 'document';
  headerText?: string;
  headerMediaHandle?: string;
  headerMediaUrl?: string;
  bodyText: string;
  footerText?: string;
  buttons: TemplateButtonPreview[];
  carouselCards?: CarouselCardPreview[];
  variables: Array<{ key: string; index?: number; sample?: string }>;
};

export type TemplateUrlButtonDraft = {
  type: 'URL';
  text: string;
  url: string;
  urlType?: 'static' | 'dynamic';
};

export type TemplateButtonDraft =
  | { type: 'QUICK_REPLY'; text: string }
  | TemplateUrlButtonDraft
  | { type: 'PHONE_NUMBER'; text: string; phoneNumber: string }
  | { type: 'COPY_CODE'; text: string; example: string };

export type TemplateVariableSchema = {
  variables: { index: number; name?: string }[];
  linkTrackingEnabled?: boolean;
};

export type CarouselCardDraft = {
  imageHandle: string;
  imageMediaUrl?: string;
  bodyText: string;
  button?: { type: 'URL'; text: string; url: string };
};

export type TemplateDraftInput = {
  templateFormat?: 'standard' | 'carousel';
  carouselCards?: CarouselCardDraft[];
  headerText?: string;
  headerMedia?: { format: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; handle: string; mediaUrl?: string };
  bodyText: string;
  footerText?: string;
  variableSamples?: Record<string, string>;
  buttons?: TemplateButtonDraft[];
  linkTrackingEnabled?: boolean;
};

const NAMED_PLACEHOLDER_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*|\d+)\}\}/g;

/** Dialog-only field stored in component examples — never sent to Meta. */
export const DIALOG_HEADER_MEDIA_URL_KEY = 'header_media_url';
export const DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY = 'image_media_url';

export function mapMetaTemplateCategory(value: string | undefined): TemplateCategory {
  switch (value?.toUpperCase()) {
    case 'MARKETING':
      return 'MARKETING';
    case 'AUTHENTICATION':
      return 'AUTHENTICATION';
    default:
      return 'UTILITY';
  }
}

export function mapMetaTemplateStatus(value: string | undefined): MetaTemplateStatus {
  switch (value?.toUpperCase()) {
    case 'APPROVED':
      return 'APPROVED';
    case 'PENDING':
      return 'PENDING';
    case 'REJECTED':
      return 'REJECTED';
    case 'PAUSED':
      return 'PAUSED';
    case 'DISABLED':
      return 'DISABLED';
    case 'DELETED':
      return 'DELETED';
    default:
      return 'UNKNOWN';
  }
}

export function extractVariableSchema(
  components: unknown,
  variableNames?: string[],
): { variables: { index: number; name?: string }[] } {
  const variables: { index: number; name?: string }[] = [];
  const seen = new Set<number>();

  if (!Array.isArray(components)) {
    return { variables };
  }

  for (const component of components) {
    if (!component || typeof component !== 'object') {
      continue;
    }

    const text = 'text' in component && typeof component.text === 'string' ? component.text : '';
    const matches = text.matchAll(/\{\{(\d+)\}\}/g);

    for (const match of matches) {
      const index = Number.parseInt(match[1], 10);
      if (!Number.isFinite(index) || seen.has(index)) {
        continue;
      }
      seen.add(index);
      const name = variableNames?.[index - 1];
      variables.push(name ? { index, name } : { index });
    }
  }

  variables.sort((a, b) => a.index - b.index);
  return { variables };
}

export function componentsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mapMetaTemplateNode(
  node: MetaMessageTemplateNode,
  variableNames?: string[],
): MappedMetaTemplate {
  const components = node.components ?? [];
  const metaStatus = mapMetaTemplateStatus(node.status);

  return {
    metaTemplateId: node.id,
    metaTemplateName: node.name,
    category: mapMetaTemplateCategory(node.category),
    language: node.language,
    metaStatus,
    components,
    variableSchema: extractVariableSchema(components, variableNames),
    rejectionReason: node.rejected_reason ?? null,
  };
}

export function buildCreateTemplateBodyComponent(
  body: string,
  variableCount: number,
): MetaMessageTemplateComponent {
  const component: MetaMessageTemplateComponent = {
    type: 'BODY',
    text: body,
  };

  if (variableCount > 0) {
    component.example = {
      body_text: [Array.from({ length: variableCount }, (_, index) => `sample_${index + 1}`)],
    };
  }

  return component;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseHeaderType(format: unknown): TemplatePreviewDto['headerType'] {
  if (typeof format !== 'string') {
    return 'text';
  }
  switch (format.toUpperCase()) {
    case 'IMAGE':
      return 'image';
    case 'VIDEO':
      return 'video';
    case 'DOCUMENT':
      return 'document';
    case 'TEXT':
      return 'text';
    default:
      return 'none';
  }
}

function parseButtonNode(button: unknown): TemplateButtonPreview | null {
  if (!isRecord(button) || typeof button.type !== 'string') {
    return null;
  }

  const text = typeof button.text === 'string' ? button.text : '';

  switch (button.type.toUpperCase()) {
    case 'QUICK_REPLY':
      return text ? { type: 'QUICK_REPLY', text } : null;
    case 'URL': {
      const url = typeof button.url === 'string' ? button.url : '';
      return text && url ? { type: 'URL', text, url } : null;
    }
    case 'PHONE_NUMBER': {
      const phoneNumber =
        typeof button.phone_number === 'string'
          ? button.phone_number
          : typeof button.phoneNumber === 'string'
            ? button.phoneNumber
            : '';
      return text && phoneNumber ? { type: 'PHONE_NUMBER', text, phoneNumber } : null;
    }
    case 'COPY_CODE': {
      const example = Array.isArray(button.example)
        ? String(button.example[0] ?? '')
        : typeof button.example === 'string'
          ? button.example
          : '';
      return text ? { type: 'COPY_CODE', text, example } : null;
    }
    default:
      return null;
  }
}

/** Normalize Meta template components into a UI-friendly preview shape. */
export function parseTemplateComponents(components: unknown): TemplatePreviewDto {
  const preview: TemplatePreviewDto = {
    templateKind: 'standard',
    headerType: 'none',
    bodyText: '',
    buttons: [],
    variables: [],
  };

  if (!Array.isArray(components)) {
    return preview;
  }

  const variableIndexSeen = new Set<number>();

  for (const raw of components) {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      continue;
    }

    const type = raw.type.toUpperCase();

    if (type === 'HEADER') {
      const format = raw.format;
      if (format && String(format).toUpperCase() !== 'TEXT') {
        preview.headerType = parseHeaderType(format);
        const example = isRecord(raw.example) ? raw.example : null;
        const handles =
          example && Array.isArray(example.header_handle) ? example.header_handle : [];
        const handle = typeof handles[0] === 'string' ? handles[0].trim() : '';
        if (handle) {
          preview.headerMediaHandle = handle;
        }
        const mediaUrl =
          example && typeof example[DIALOG_HEADER_MEDIA_URL_KEY] === 'string'
            ? example[DIALOG_HEADER_MEDIA_URL_KEY].trim()
            : '';
        if (mediaUrl) {
          preview.headerMediaUrl = normalizeTemplateMediaPublicUrl(mediaUrl);
        }
      } else if (typeof raw.text === 'string' && raw.text.trim()) {
        preview.headerType = 'text';
        preview.headerText = raw.text;
        for (const match of raw.text.matchAll(/\{\{(\d+)\}\}/g)) {
          const index = Number.parseInt(match[1], 10);
          if (Number.isFinite(index) && !variableIndexSeen.has(index)) {
            variableIndexSeen.add(index);
            preview.variables.push({ key: String(index), index });
          }
        }
      }
      continue;
    }

    if (type === 'BODY' && typeof raw.text === 'string') {
      preview.bodyText = raw.text;
      for (const match of raw.text.matchAll(/\{\{(\d+)\}\}/g)) {
        const index = Number.parseInt(match[1], 10);
        if (Number.isFinite(index) && !variableIndexSeen.has(index)) {
          variableIndexSeen.add(index);
          preview.variables.push({ key: String(index), index });
        }
      }
      continue;
    }

    if (type === 'FOOTER' && typeof raw.text === 'string') {
      preview.footerText = raw.text;
      continue;
    }

    if (type === 'BUTTONS' && Array.isArray(raw.buttons)) {
      for (const button of raw.buttons) {
        const parsed = parseButtonNode(button);
        if (parsed) {
          preview.buttons.push(parsed);
        }
      }
      continue;
    }

    if (type === 'CAROUSEL' && Array.isArray(raw.cards)) {
      preview.templateKind = 'carousel';
      preview.carouselCards = [];

      for (const cardRaw of raw.cards) {
        if (!isRecord(cardRaw) || !Array.isArray(cardRaw.components)) {
          continue;
        }

        let cardBody = '';
        let buttonText: string | undefined;
        let imageHandle: string | undefined;
        let imageMediaUrl: string | undefined;

        for (const compRaw of cardRaw.components) {
          if (!isRecord(compRaw) || typeof compRaw.type !== 'string') {
            continue;
          }

          const compType = compRaw.type.toUpperCase();
          if (compType === 'HEADER') {
            const example = isRecord(compRaw.example) ? compRaw.example : null;
            const handles =
              example && Array.isArray(example.header_handle) ? example.header_handle : [];
            const handle = typeof handles[0] === 'string' ? handles[0].trim() : '';
            if (handle) {
              imageHandle = handle;
            }
            const mediaUrl =
              example && typeof example[DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY] === 'string'
                ? example[DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY].trim()
                : '';
            if (mediaUrl) {
              imageMediaUrl = normalizeTemplateMediaPublicUrl(mediaUrl);
            }
          }

          if (compType === 'BODY' && typeof compRaw.text === 'string') {
            cardBody = compRaw.text;
          }

          if (compType === 'BUTTONS' && Array.isArray(compRaw.buttons)) {
            const firstButton = compRaw.buttons[0];
            if (isRecord(firstButton) && typeof firstButton.text === 'string') {
              buttonText = firstButton.text;
            }
          }
        }

        preview.carouselCards.push({
          headerType: 'image',
          bodyText: cardBody,
          ...(buttonText ? { buttonText } : {}),
          ...(imageHandle ? { imageHandle } : {}),
          ...(imageMediaUrl ? { imageMediaUrl } : {}),
        });
      }
    }
  }

  preview.variables.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return preview;
}

function collectPlaceholderKeysInOrder(...texts: string[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];

  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(NAMED_PLACEHOLDER_RE)) {
      const key = match[1];
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
  }

  return order;
}

function replacePlaceholdersWithMetaIndices(text: string, keyToIndex: Map<string, number>): string {
  return text.replace(NAMED_PLACEHOLDER_RE, (_match, key: string) => {
    const index = keyToIndex.get(key);
    return index ? `{{${index}}}` : `{{${key}}}`;
  });
}

function resolveSampleValue(
  key: string,
  index: number,
  variableSamples?: Record<string, string>,
): string {
  const trimmed = variableSamples?.[key]?.trim();
  if (trimmed) {
    return trimmed;
  }
  return /^\d+$/.test(key) ? `sample_${index}` : `sample_${key}`;
}

function exampleValuesForText(
  text: string,
  keyToIndex: Map<string, number>,
  variableSamples?: Record<string, string>,
): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(NAMED_PLACEHOLDER_RE)) {
    const key = match[1];
    const index = keyToIndex.get(key) ?? 0;
    values.push(resolveSampleValue(key, index, variableSamples));
  }
  return values;
}

function buildMetaUrlButton(
  button: TemplateUrlButtonDraft,
  keyToIndex: Map<string, number>,
  variableSamples?: Record<string, string>,
): Record<string, unknown> {
  const metaButton: Record<string, unknown> = {
    type: 'URL',
    text: button.text.trim(),
    url: replacePlaceholdersWithMetaIndices(button.url.trim(), keyToIndex),
  };

  const urlPlaceholders = collectPlaceholderKeysInOrder(button.url);
  if (urlPlaceholders.length > 0) {
    const exampleUrl = replacePlaceholdersWithMetaIndices(button.url.trim(), keyToIndex).replace(
      NAMED_PLACEHOLDER_RE,
      (_match, key: string) => {
        const index = keyToIndex.get(key) ?? 1;
        return encodeURIComponent(resolveSampleValue(key, index, variableSamples));
      },
    );
    metaButton.example = [exampleUrl];
  }

  return metaButton;
}

function buildMetaButtons(
  buttons: TemplateButtonDraft[],
  keyToIndex: Map<string, number>,
  variableSamples?: Record<string, string>,
): MetaMessageTemplateComponent['buttons'] {
  return buttons.map((button) => {
    switch (button.type) {
      case 'QUICK_REPLY':
        return { type: 'QUICK_REPLY', text: button.text.trim() };
      case 'URL':
        return buildMetaUrlButton(button, keyToIndex, variableSamples);
      case 'PHONE_NUMBER':
        return {
          type: 'PHONE_NUMBER',
          text: button.text.trim(),
          phone_number: button.phoneNumber.replace(/\D/g, ''),
        };
      case 'COPY_CODE':
        return {
          type: 'COPY_CODE',
          text: button.text.trim(),
          example: [button.example.trim()],
        };
      default:
        throw new Error('Unsupported button type');
    }
  });
}

function validatePhoneNumber(phoneNumber: string): void {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Phone number must be 10–15 digits including country code');
  }
}

export function validateButtonDrafts(buttons: TemplateButtonDraft[]): void {
  if (buttons.length === 0) {
    return;
  }

  const quickReplies = buttons.filter((button) => button.type === 'QUICK_REPLY');
  const ctaButtons = buttons.filter((button) => button.type !== 'QUICK_REPLY');

  if (quickReplies.length > 0 && ctaButtons.length > 0) {
    throw new Error('Quick reply buttons cannot be combined with call-to-action buttons');
  }

  if (quickReplies.length > 3) {
    throw new Error('At most 3 quick reply buttons are allowed');
  }

  const urlButtons = buttons.filter((button) => button.type === 'URL');
  const phoneButtons = buttons.filter((button) => button.type === 'PHONE_NUMBER');
  const copyCodeButtons = buttons.filter((button) => button.type === 'COPY_CODE');

  if (urlButtons.length > 2) {
    throw new Error('At most 2 URL buttons are allowed');
  }
  if (phoneButtons.length > 1) {
    throw new Error('At most 1 phone button is allowed');
  }
  if (copyCodeButtons.length > 1) {
    throw new Error('At most 1 copy code button is allowed');
  }

  for (const button of buttons) {
    if (!button.text.trim()) {
      throw new Error('Button text is required');
    }
    if (button.text.length > 25) {
      throw new Error('Button text must be at most 25 characters');
    }

    if (button.type === 'URL') {
      if (!button.url.trim()) {
        throw new Error('URL button URL is required');
      }
      if (button.url.length > 2000) {
        throw new Error('URL button URL must be at most 2000 characters');
      }
    }

    if (button.type === 'PHONE_NUMBER') {
      validatePhoneNumber(button.phoneNumber);
    }

    if (button.type === 'COPY_CODE') {
      if (!button.example.trim()) {
        throw new Error('Copy code example is required');
      }
      if (button.example.length > 15) {
        throw new Error('Copy code example must be at most 15 characters');
      }
    }
  }
}

/** @deprecated Use validateButtonDrafts */
export function validateUrlButtonDrafts(buttons: TemplateUrlButtonDraft[]): void {
  validateButtonDrafts(buttons);
}

export function validateCarouselCardDrafts(cards: CarouselCardDraft[]): void {
  if (cards.length < 2) {
    throw new Error('Carousel templates require at least 2 cards');
  }
  if (cards.length > 10) {
    throw new Error('At most 10 carousel cards are allowed');
  }

  for (const [index, card] of cards.entries()) {
    if (!card.imageHandle.trim()) {
      throw new Error(`Carousel card ${index + 1} requires an image`);
    }
    if (!card.bodyText.trim()) {
      throw new Error(`Carousel card ${index + 1} requires body text`);
    }
    if (card.bodyText.length > 160) {
      throw new Error(`Carousel card ${index + 1} body must be at most 160 characters`);
    }
    if (card.button) {
      if (!card.button.text.trim()) {
        throw new Error(`Carousel card ${index + 1} button text is required`);
      }
      if (!card.button.url.trim()) {
        throw new Error(`Carousel card ${index + 1} button URL is required`);
      }
    }
  }
}

function buildMetaCarouselComponentsFromDraft(draft: TemplateDraftInput): {
  components: MetaMessageTemplateComponent[];
  variableSchema: TemplateVariableSchema;
} {
  const cards = draft.carouselCards ?? [];
  validateCarouselCardDrafts(cards);

  const bodyText = draft.bodyText.trim();
  if (!bodyText) {
    throw new Error('Body text is required');
  }

  const variableSchema: TemplateVariableSchema = {
    variables: [],
    ...(draft.linkTrackingEnabled ? { linkTrackingEnabled: true } : {}),
  };

  const components: MetaMessageTemplateComponent[] = [
    {
      type: 'BODY',
      text: bodyText,
    },
    {
      type: 'CAROUSEL',
      cards: cards.map((card) => ({
        components: [
          {
            type: 'HEADER',
            format: 'IMAGE',
            example: {
              header_handle: [card.imageHandle.trim()],
            },
          },
          {
            type: 'BODY',
            text: card.bodyText.trim(),
          },
          ...(card.button
            ? [
                {
                  type: 'BUTTONS',
                  buttons: [
                    {
                      type: 'URL',
                      text: card.button.text.trim(),
                      url: card.button.url.trim(),
                    },
                  ],
                },
              ]
            : []),
        ],
      })),
    },
  ];

  return { components, variableSchema };
}

/** Convert draft (named {{vars}}, header/body/footer, optional buttons) to Meta components. */
export function buildMetaComponentsFromDraft(draft: TemplateDraftInput): {
  components: MetaMessageTemplateComponent[];
  variableSchema: TemplateVariableSchema;
} {
  if (draft.templateFormat === 'carousel') {
    return buildMetaCarouselComponentsFromDraft(draft);
  }

  const headerText = draft.headerText?.trim();
  const headerMedia = draft.headerMedia;
  const bodyText = draft.bodyText.trim();
  const footerText = draft.footerText?.trim();
  const buttons = draft.buttons ?? [];

  if (!bodyText) {
    throw new Error('Body text is required');
  }

  if (headerText && headerMedia) {
    throw new Error('Template cannot have both text and media headers');
  }

  validateButtonDrafts(buttons);

  const urlButtonTexts = buttons
    .filter((button): button is TemplateUrlButtonDraft => button.type === 'URL')
    .map((button) => button.url);

  const placeholderKeys = collectPlaceholderKeysInOrder(headerText ?? '', bodyText, ...urlButtonTexts);
  const keyToIndex = new Map(placeholderKeys.map((key, index) => [key, index + 1]));

  const variableSchema: TemplateVariableSchema = {
    variables: placeholderKeys.map((key, index) => ({
      index: index + 1,
      ...(/^\d+$/.test(key) ? {} : { name: key }),
    })),
    ...(draft.linkTrackingEnabled ? { linkTrackingEnabled: true } : {}),
  };

  const components: MetaMessageTemplateComponent[] = [];

  if (headerMedia) {
    components.push({
      type: 'HEADER',
      format: headerMedia.format,
      example: {
        header_handle: [headerMedia.handle],
      },
    });
  } else if (headerText) {
    const headerComponent: MetaMessageTemplateComponent = {
      type: 'HEADER',
      format: 'TEXT',
      text: replacePlaceholdersWithMetaIndices(headerText, keyToIndex),
    };
    const headerExamples = exampleValuesForText(headerText, keyToIndex, draft.variableSamples);
    if (headerExamples.length > 0) {
      headerComponent.example = { header_text: headerExamples };
    }
    components.push(headerComponent);
  }

  const bodyComponent: MetaMessageTemplateComponent = {
    type: 'BODY',
    text: replacePlaceholdersWithMetaIndices(bodyText, keyToIndex),
  };
  const bodyExamples = exampleValuesForText(bodyText, keyToIndex, draft.variableSamples);
  if (bodyExamples.length > 0) {
    bodyComponent.example = { body_text: [bodyExamples] };
  }
  components.push(bodyComponent);

  if (footerText) {
    components.push({
      type: 'FOOTER',
      text: footerText,
    });
  }

  if (buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buildMetaButtons(buttons, keyToIndex, draft.variableSamples),
    });
  }

  return { components, variableSchema };
}

/** Attach Dialog-only MinIO preview URLs to stored components (not sent to Meta). */
export function enrichStoredComponentsWithMediaUrls(
  components: MetaMessageTemplateComponent[],
  draft: TemplateDraftInput,
): MetaMessageTemplateComponent[] {
  const stored = JSON.parse(JSON.stringify(components)) as MetaMessageTemplateComponent[];

  if (draft.headerMedia?.mediaUrl?.trim()) {
    const header = stored.find(
      (component) =>
        component.type === 'HEADER' &&
        component.format &&
        String(component.format).toUpperCase() !== 'TEXT',
    );
    if (header) {
      const example =
        header.example && typeof header.example === 'object' && !Array.isArray(header.example)
          ? { ...(header.example as Record<string, unknown>) }
          : {};
      example[DIALOG_HEADER_MEDIA_URL_KEY] = normalizeTemplateMediaPublicUrl(
        draft.headerMedia.mediaUrl.trim(),
      );
      header.example = example;
    }
  }

  if (draft.templateFormat === 'carousel' && draft.carouselCards?.length) {
    const carousel = stored.find((component) => component.type === 'CAROUSEL') as
      | { cards?: Array<{ components?: MetaMessageTemplateComponent[] }> }
      | undefined;

    carousel?.cards?.forEach((card, index) => {
      const mediaUrl = draft.carouselCards?.[index]?.imageMediaUrl?.trim();
      if (!mediaUrl || !Array.isArray(card.components)) {
        return;
      }

      const header = card.components.find(
        (component) =>
          component.type === 'HEADER' &&
          component.format &&
          String(component.format).toUpperCase() === 'IMAGE',
      );
      if (!header) {
        return;
      }

      const example =
        header.example && typeof header.example === 'object' && !Array.isArray(header.example)
          ? { ...(header.example as Record<string, unknown>) }
          : {};
      example[DIALOG_CAROUSEL_IMAGE_MEDIA_URL_KEY] = normalizeTemplateMediaPublicUrl(mediaUrl);
      header.example = example;
    });
  }

  return stored;
}
