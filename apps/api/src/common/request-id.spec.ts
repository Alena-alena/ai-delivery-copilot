import { getRequestId, resolveRequestId } from './request-id.js';

describe('resolveRequestId', () => {
  it('keeps a short plain id', () => {
    expect(resolveRequestId('abc-123_X.y')).toBe('abc-123_X.y');
  });
  it.each([
    '',
    'x'.repeat(65),
    'a b',
    'id;drop',
    'a\nb',
    '../etc',
    undefined,
    ['a'],
  ])('replaces an unsafe id (%j) with a uuid', (bad) => {
    expect(resolveRequestId(bad)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('getRequestId', () => {
  it('returns string ids and empty string for objects', () => {
    expect(getRequestId({ id: 'r-1' } as never)).toBe('r-1');
    expect(getRequestId({ id: {} } as never)).toBe('');
  });
});
