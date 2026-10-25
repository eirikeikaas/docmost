import { extractDecisions } from './utils';

describe('extractDecisions', () => {
  it('returns an empty array for nullish documents', () => {
    expect(extractDecisions(null)).toEqual([]);
    expect(extractDecisions(undefined)).toEqual([]);
  });

  it('extracts decision nodes with status and text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'decision',
          attrs: { id: 'dec-1', status: 'undecided' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Ship the registry' }],
            },
          ],
        },
        {
          type: 'decision',
          attrs: { id: 'dec-2', status: 'decided' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Keep callouts hardcoded' }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Not a decision' }],
        },
      ],
    };

    expect(extractDecisions(doc)).toEqual([
      {
        decisionId: 'dec-1',
        status: 'undecided',
        decisionText: 'Ship the registry',
      },
      {
        decisionId: 'dec-2',
        status: 'decided',
        decisionText: 'Keep callouts hardcoded',
      },
    ]);
  });

  it('skips decisions without ids and dedupes duplicate ids', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'decision',
          attrs: { status: 'undecided' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Missing id' }],
            },
          ],
        },
        {
          type: 'decision',
          attrs: { id: 'dec-1', status: 'undecided' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First' }],
            },
          ],
        },
        {
          type: 'decision',
          attrs: { id: 'dec-1', status: 'decided' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Duplicate' }],
            },
          ],
        },
      ],
    };

    expect(extractDecisions(doc)).toEqual([
      {
        decisionId: 'dec-1',
        status: 'undecided',
        decisionText: 'First',
      },
    ]);
  });
});
