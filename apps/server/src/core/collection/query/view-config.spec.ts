import { dropStaleRefs, normalizeViewConfig } from './view-config';

const properties = [
  { id: 'status', type: 'select' },
  { id: 'tags', type: 'multi_select' },
  { id: 'points', type: 'number' },
];

describe('view config', () => {
  it('keeps only whitelisted keys', () => {
    const config = normalizeViewConfig(properties, {
      groupBy: 'status',
      visibleProperties: ['status', 'points'],
      evil: { huge: 'payload' },
    });
    expect(config).toEqual({
      groupBy: 'status',
      visibleProperties: ['status', 'points'],
    });
  });

  it('requires groupBy to be a select property', () => {
    expect(() => normalizeViewConfig(properties, { groupBy: 'points' })).toThrow();
    expect(() => normalizeViewConfig(properties, { groupBy: 'nope' })).toThrow();
  });

  it('rejects unknown property ids and bad widths', () => {
    expect(() =>
      normalizeViewConfig(properties, { cardProperties: ['nope'] }),
    ).toThrow();
    expect(() =>
      normalizeViewConfig(properties, { columnWidths: { points: 5 } }),
    ).toThrow();
    expect(
      normalizeViewConfig(properties, { columnWidths: { points: 120.4 } })
        .columnWidths,
    ).toEqual({ points: 120 });
  });

  it('validates filters and sorts through the query compiler', () => {
    expect(
      normalizeViewConfig(properties, {
        filters: [{ propertyId: 'status', op: 'is', value: 'a' }],
        sorts: [{ propertyId: 'points', direction: 'desc' }],
      }),
    ).toEqual({
      filters: [{ propertyId: 'status', op: 'is', value: 'a' }],
      sorts: [{ propertyId: 'points', direction: 'desc' }],
    });
    expect(() =>
      normalizeViewConfig(properties, {
        filters: [{ propertyId: 'points', op: 'contains', value: 'a' }],
      }),
    ).toThrow();
  });

  it('drops filters and sorts of deleted properties', () => {
    const { filters, sorts } = dropStaleRefs(properties, {
      filters: [
        { propertyId: 'status', op: 'is', value: 'a' },
        { propertyId: 'gone', op: 'is', value: 'a' },
      ],
      sorts: [{ propertyId: 'gone', direction: 'asc' }],
    });
    expect(filters).toHaveLength(1);
    expect(sorts).toHaveLength(0);
  });
});
