import { isValidProjectId, normalizeProjectId } from './space-links';

describe('space project id', () => {
  it('normalises spacing and case', () => {
    expect(normalizeProjectId('lære 0001')).toBe('LÆRE0001');
    expect(normalizeProjectId(' fou0002 ')).toBe('FOU0002');
  });

  it.each(['FOU0002', 'LÆRE0001', 'A1234', '1234'])('accepts %s', (id) => {
    expect(isValidProjectId(id)).toBe(true);
  });

  it.each(['TOOLONG0001', 'FOU002', 'FOU00022', 'fou0002', 'FO-0002', ''])(
    'rejects %s',
    (id) => {
      expect(isValidProjectId(id)).toBe(false);
    },
  );
});
