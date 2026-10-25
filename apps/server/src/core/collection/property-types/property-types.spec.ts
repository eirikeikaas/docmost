import { BadRequestException } from '@nestjs/common';
import {
  getPropertyType,
  normalizePropsPatch,
  PROPERTY_TYPE_NAMES,
  PROPERTY_TYPES,
} from './property-types';

const select = (ids: string[]) => ({
  options: ids.map((id) => ({ id, name: id })),
});

describe('property types registry', () => {
  it('defines every declared type', () => {
    for (const name of PROPERTY_TYPE_NAMES) {
      expect(PROPERTY_TYPES[name]).toBeDefined();
    }
  });

  it('rejects unknown types', () => {
    expect(() => getPropertyType('formula')).toThrow(BadRequestException);
  });

  it('treats null as no value for every type', () => {
    for (const name of PROPERTY_TYPE_NAMES) {
      expect(PROPERTY_TYPES[name].normalizeValue({}, null)).toBeNull();
    }
  });

  describe('text / url', () => {
    it('accepts strings and rejects other shapes', () => {
      expect(PROPERTY_TYPES.text.normalizeValue({}, 'hi')).toBe('hi');
      expect(() => PROPERTY_TYPES.text.normalizeValue({}, 1)).toThrow();
    });

    it('only allows http(s) urls', () => {
      expect(PROPERTY_TYPES.url.normalizeValue({}, 'https://a.no')).toBe(
        'https://a.no',
      );
      expect(() =>
        PROPERTY_TYPES.url.normalizeValue({}, 'javascript:alert(1)'),
      ).toThrow();
      expect(() => PROPERTY_TYPES.url.normalizeValue({}, 'nope')).toThrow();
    });
  });

  describe('number', () => {
    it('rejects non-finite numbers and strings', () => {
      expect(PROPERTY_TYPES.number.normalizeValue({}, 3)).toBe(3);
      expect(() => PROPERTY_TYPES.number.normalizeValue({}, NaN)).toThrow();
      expect(() => PROPERTY_TYPES.number.normalizeValue({}, '3')).toThrow();
    });
  });

  describe('select / multi_select', () => {
    it('assigns ids to options and rejects duplicates', () => {
      const config = PROPERTY_TYPES.select.normalizeConfig({
        options: [{ name: 'Todo' }, { name: 'Done' }],
      });
      expect(config.options).toHaveLength(2);
      expect(config.options![0].id).toBeTruthy();
      expect(() =>
        PROPERTY_TYPES.select.normalizeConfig({
          options: [
            { id: 'a', name: 'A' },
            { id: 'a', name: 'B' },
          ],
        }),
      ).toThrow();
    });

    it('requires a known option', () => {
      const config = select(['a', 'b']);
      expect(PROPERTY_TYPES.select.normalizeValue(config, 'a')).toBe('a');
      expect(() => PROPERTY_TYPES.select.normalizeValue(config, 'z')).toThrow();
    });

    it('dedupes multi-select and turns an empty list into null', () => {
      const config = select(['a', 'b']);
      expect(
        PROPERTY_TYPES.multi_select.normalizeValue(config, ['a', 'a', 'b']),
      ).toEqual(['a', 'b']);
      expect(PROPERTY_TYPES.multi_select.normalizeValue(config, [])).toBeNull();
      expect(() =>
        PROPERTY_TYPES.multi_select.normalizeValue(config, ['a', 'z']),
      ).toThrow();
    });
  });

  describe('date', () => {
    it('accepts ISO start/end and rejects end before start', () => {
      expect(
        PROPERTY_TYPES.date.normalizeValue({}, {
          start: '2026-10-01',
          end: '2026-10-02',
        }),
      ).toEqual({ start: '2026-10-01', end: '2026-10-02' });
      expect(() =>
        PROPERTY_TYPES.date.normalizeValue({}, {
          start: '2026-10-02',
          end: '2026-10-01',
        }),
      ).toThrow();
      expect(() =>
        PROPERTY_TYPES.date.normalizeValue({}, { start: 'tomorrow' }),
      ).toThrow();
    });
  });

  describe('person / checkbox', () => {
    it('validates uuid and boolean', () => {
      expect(() => PROPERTY_TYPES.person.normalizeValue({}, 'bob')).toThrow();
      expect(
        PROPERTY_TYPES.person.normalizeValue(
          {},
          '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
        ),
      ).toBeTruthy();
      expect(PROPERTY_TYPES.checkbox.normalizeValue({}, false)).toBe(false);
      expect(() => PROPERTY_TYPES.checkbox.normalizeValue({}, 'yes')).toThrow();
    });
  });

  describe('normalizePropsPatch', () => {
    const properties = [
      { id: 'p1', type: 'select', config: select(['a']) },
      { id: 'p2', type: 'number', config: {} },
    ];

    it('normalizes known properties', () => {
      expect(normalizePropsPatch(properties, { p1: 'a', p2: null })).toEqual({
        p1: 'a',
        p2: null,
      });
    });

    it('rejects unknown property ids', () => {
      expect(() => normalizePropsPatch(properties, { nope: 1 })).toThrow(
        BadRequestException,
      );
    });
  });
});
