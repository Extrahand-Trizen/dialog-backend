import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMetaComponentsFromDraft,
  enrichStoredComponentsWithMediaUrls,
  parseTemplateComponents,
  validateButtonDrafts,
} from './templates.meta';

describe('parseTemplateComponents', () => {
  it('parses body, footer, and URL button', () => {
    const preview = parseTemplateComponents([
      { type: 'BODY', text: 'Hello {{1}}, welcome!' },
      { type: 'FOOTER', text: 'Team ExtraHand' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: 'Start Onboarding', url: 'https://extrahand.in' }],
      },
    ]);

    assert.equal(preview.bodyText, 'Hello {{1}}, welcome!');
    assert.equal(preview.footerText, 'Team ExtraHand');
    assert.equal(preview.buttons.length, 1);
    assert.equal(preview.buttons[0]?.type, 'URL');
    assert.equal(preview.variables.length, 1);
    assert.equal(preview.variables[0]?.index, 1);
  });

  it('parses quick reply, phone, and copy code buttons', () => {
    const preview = parseTemplateComponents([
      { type: 'BODY', text: 'Choose an option' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Yes' },
          { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '919876543210' },
          { type: 'COPY_CODE', text: 'Copy offer', example: ['SAVE20'] },
        ],
      },
    ]);

    assert.equal(preview.buttons.length, 3);
    assert.equal(preview.buttons[0]?.type, 'QUICK_REPLY');
    assert.equal(preview.buttons[1]?.type, 'PHONE_NUMBER');
    assert.equal(preview.buttons[2]?.type, 'COPY_CODE');
  });
  it('parses carousel template cards', () => {
    const preview = parseTemplateComponents([
      { type: 'BODY', text: 'Browse our latest offers' },
      {
        type: 'CAROUSEL',
        cards: [
          {
            components: [
              { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['img1'] } },
              { type: 'BODY', text: 'Card one body' },
              {
                type: 'BUTTONS',
                buttons: [{ type: 'URL', text: 'Shop', url: 'https://example.com/1' }],
              },
            ],
          },
          {
            components: [
              { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['img2'] } },
              { type: 'BODY', text: 'Card two body' },
            ],
          },
        ],
      },
    ]);

    assert.equal(preview.templateKind, 'carousel');
    assert.equal(preview.bodyText, 'Browse our latest offers');
    assert.equal(preview.carouselCards?.length, 2);
    assert.equal(preview.carouselCards?.[0]?.buttonText, 'Shop');
    assert.equal(preview.carouselCards?.[0]?.imageHandle, 'img1');
    assert.equal(preview.carouselCards?.[1]?.imageHandle, 'img2');
  });

  it('parses media header handle', () => {
    const preview = parseTemplateComponents([
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: ['4::aW1hZ2UvanBlZw==:handle-token'] },
      },
      { type: 'BODY', text: 'Hello' },
    ]);

    assert.equal(preview.headerType, 'image');
    assert.equal(preview.headerMediaHandle, '4::aW1hZ2UvanBlZw==:handle-token');
  });

  it('enriches stored components with MinIO preview URLs', () => {
    const { components } = buildMetaComponentsFromDraft({
      bodyText: 'Hello',
      headerMedia: {
        format: 'IMAGE',
        handle: 'meta-handle',
        mediaUrl: 'https://cdn.example.com/header.jpg',
      },
    });

    const stored = enrichStoredComponentsWithMediaUrls(components, {
      bodyText: 'Hello',
      headerMedia: {
        format: 'IMAGE',
        handle: 'meta-handle',
        mediaUrl: 'https://cdn.example.com/header.jpg',
      },
    });

    const preview = parseTemplateComponents(stored);
    assert.equal(preview.headerMediaUrl, 'https://cdn.example.com/header.jpg');
    assert.equal(
      (stored[0]?.example as { header_handle?: string[] })?.header_handle?.[0],
      'meta-handle',
    );
  });
});

describe('buildMetaComponentsFromDraft', () => {
  it('maps named variables to Meta indices with custom samples', () => {
    const { components, variableSchema } = buildMetaComponentsFromDraft({
      bodyText: 'Hello {{name}}, enjoy 20% off.',
      variableSamples: { name: 'Ravi' },
    });

    const body = components.find((c) => c.type === 'BODY');
    assert.equal(body?.text, 'Hello {{1}}, enjoy 20% off.');
    assert.deepEqual(body?.example, { body_text: [['Ravi']] });
    assert.equal(variableSchema.variables[0]?.name, 'name');
  });

  it('appends URL button component', () => {
    const { components } = buildMetaComponentsFromDraft({
      bodyText: 'Tap below to continue.',
      buttons: [
        {
          type: 'URL',
          text: 'Visit our website',
          url: 'https://extrahand.in',
          urlType: 'static',
        },
      ],
    });

    const buttonsComponent = components.find((c) => c.type === 'BUTTONS');
    assert.ok(buttonsComponent);
    assert.ok(Array.isArray(buttonsComponent.buttons));
    assert.equal((buttonsComponent.buttons as { url: string }[])[0]?.url, 'https://extrahand.in');
  });

  it('builds phone and copy code buttons', () => {
    const { components, variableSchema } = buildMetaComponentsFromDraft({
      bodyText: 'Contact us',
      buttons: [
        { type: 'PHONE_NUMBER', text: 'Call', phoneNumber: '+919876543210' },
        { type: 'COPY_CODE', text: 'Copy code', example: 'WELCOME' },
      ],
      linkTrackingEnabled: true,
    });

    const buttonsComponent = components.find((c) => c.type === 'BUTTONS');
    const buttons = buttonsComponent?.buttons as Array<Record<string, unknown>>;
    assert.equal(buttons[0]?.type, 'PHONE_NUMBER');
    assert.equal(buttons[0]?.phone_number, '919876543210');
    assert.equal(buttons[1]?.type, 'COPY_CODE');
    assert.deepEqual(buttons[1]?.example, ['WELCOME']);
    assert.equal(variableSchema.linkTrackingEnabled, true);
  });

  it('builds quick reply buttons', () => {
    const { components } = buildMetaComponentsFromDraft({
      bodyText: 'Reply below',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Yes' },
        { type: 'QUICK_REPLY', text: 'No' },
      ],
    });

    const buttons = (components.find((c) => c.type === 'BUTTONS')?.buttons ?? []) as Array<{
      type: string;
      text: string;
    }>;
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0]?.type, 'QUICK_REPLY');
  });

  it('builds carousel components', () => {
    const { components } = buildMetaComponentsFromDraft({
      templateFormat: 'carousel',
      bodyText: 'Swipe to explore',
      carouselCards: [
        {
          imageHandle: 'handle-1',
          bodyText: 'First card',
          button: { type: 'URL', text: 'Buy', url: 'https://example.com' },
        },
        {
          imageHandle: 'handle-2',
          bodyText: 'Second card',
        },
      ],
    });

    const body = components.find((c) => c.type === 'BODY');
    const carousel = components.find((c) => c.type === 'CAROUSEL') as
      | { cards?: Array<{ components: unknown[] }> }
      | undefined;

    assert.equal(body?.text, 'Swipe to explore');
    assert.ok(carousel?.cards);
    assert.equal(carousel.cards?.length, 2);
  });
});

describe('validateButtonDrafts', () => {
  it('rejects more than 2 URL buttons', () => {
    assert.throws(() =>
      validateButtonDrafts([
        { type: 'URL', text: 'One', url: 'https://a.com' },
        { type: 'URL', text: 'Two', url: 'https://b.com' },
        { type: 'URL', text: 'Three', url: 'https://c.com' },
      ]),
    );
  });

  it('rejects mixing quick replies with CTA buttons', () => {
    assert.throws(() =>
      validateButtonDrafts([
        { type: 'QUICK_REPLY', text: 'Yes' },
        { type: 'URL', text: 'Visit', url: 'https://a.com' },
      ]),
    );
  });

  it('rejects more than 3 quick replies', () => {
    assert.throws(() =>
      validateButtonDrafts([
        { type: 'QUICK_REPLY', text: 'A' },
        { type: 'QUICK_REPLY', text: 'B' },
        { type: 'QUICK_REPLY', text: 'C' },
        { type: 'QUICK_REPLY', text: 'D' },
      ]),
    );
  });
});
