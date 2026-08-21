import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHeaderComponentFromTemplate,
  buildTemplateComponentsFromVariables,
  sanitizeUrlButtonSuffix,
} from './messages.meta';

describe('buildHeaderComponentFromTemplate', () => {
  it('builds IMAGE header from stored public media URL', () => {
    const header = buildHeaderComponentFromTemplate([
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: {
          header_handle: ['4::handle'],
          header_media_url: 'https://cdn.example.com/header.jpg',
        },
      },
      { type: 'BODY', text: 'Hi {{1}}' },
    ]);

    assert.deepEqual(header, {
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/header.jpg' } }],
    });
  });

  it('returns null for text-only header', () => {
    const header = buildHeaderComponentFromTemplate([
      { type: 'HEADER', format: 'TEXT', text: 'Hello' },
      { type: 'BODY', text: 'Body' },
    ]);
    assert.equal(header, null);
  });

  it('falls back to https header_handle when header_media_url is missing', () => {
    const header = buildHeaderComponentFromTemplate([
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: {
          header_handle: ['https://cdn.example.com/from-handle.jpg'],
        },
      },
    ]);

    assert.deepEqual(header, {
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/from-handle.jpg' } }],
    });
  });
});

describe('sanitizeUrlButtonSuffix', () => {
  it('accepts mongo ObjectIds', () => {
    assert.equal(sanitizeUrlButtonSuffix('507f1f77bcf86cd799439011'), '507f1f77bcf86cd799439011');
  });

  it('rejects titles with spaces (Meta #132018)', () => {
    assert.equal(sanitizeUrlButtonSuffix('Fix kitchen sink leak'), undefined);
    assert.equal(sanitizeUrlButtonSuffix('Rahul Sharma'), undefined);
  });
});

describe('buildTemplateComponentsFromVariables', () => {
  it('prepends media header before body parameters', () => {
    const components = buildTemplateComponentsFromVariables(
      { variables: [{ index: 1, name: 'name' }] },
      { name: 'Ravi', taskId: '507f1f77bcf86cd799439011' },
      [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_media_url: 'https://cdn.example.com/header.jpg' },
        },
        { type: 'BODY', text: 'Hi {{1}}' },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'URL', text: 'Open', url: 'https://extrahand.in/open/tasks/{{1}}' }],
        },
      ],
    );

    assert.equal(components.length, 3);
    assert.equal(components[0]?.type, 'header');
    assert.equal(components[1]?.type, 'body');
    assert.deepEqual(components[1]?.parameters, [{ type: 'text', text: 'Ravi' }]);
    assert.deepEqual(components[2], {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: '507f1f77bcf86cd799439011' }],
    });
  });

  it('throws when IMAGE header is required but no public media URL is stored', () => {
    assert.throws(
      () =>
        buildTemplateComponentsFromVariables(
          { variables: [{ index: 1 }] },
          { '1': 'Ravi' },
          [
            {
              type: 'HEADER',
              format: 'IMAGE',
              example: { header_handle: ['4::meta-handle-only'] },
            },
            { type: 'BODY', text: 'Hi {{1}}' },
          ],
        ),
      /no public media URL/i,
    );
  });

  it('throws when URL button needs a task id but payload has none', () => {
    assert.throws(
      () =>
        buildTemplateComponentsFromVariables(
          { variables: [{ index: 1 }] },
          { '1': 'hello' },
          [
            { type: 'BODY', text: 'Hi {{1}}' },
            {
              type: 'BUTTONS',
              buttons: [
                {
                  type: 'URL',
                  text: 'Open',
                  url: 'https://extrahand.in/open/tasks/{{1}}',
                  example: ['https://extrahand.in/open/tasks/Fix%20kitchen%20sink%20leak'],
                },
              ],
            },
          ],
        ),
      /valid task id/i,
    );
  });

  it('leaves text-only templates unchanged (no media header)', () => {
    const components = buildTemplateComponentsFromVariables(
      { variables: [{ index: 1 }] },
      { '1': 'Ravi' },
      [{ type: 'BODY', text: 'Hi {{1}}' }],
    );
    assert.equal(components.length, 1);
    assert.equal(components[0]?.type, 'body');
  });
});
