import { error, isNotNull, checkNotNull, ignore, assert, zip, zip3 } from '../general';

describe('lib-base/general', () => {
  it('error test', () => {
    expect(error).toThrow();
  });

  it('isNotNull tests', () => {
    expect(isNotNull(2)).toBeTruthy();
    expect(isNotNull('2')).toBeTruthy();
    expect(isNotNull([3])).toBeTruthy();
    expect(isNotNull(null)).toBeFalsy();
    expect(isNotNull(undefined)).toBeFalsy();
  });

  it('checkNotNull tests', () => {
    expect(checkNotNull(2)).toBe(2);
    expect(() => checkNotNull(null)).toThrow();
    expect(() => checkNotNull(null, '')).toThrow();
  });

  it('ignore test', () => {
    expect(ignore()).toBeUndefined();
  });

  it('assert test', () => {
    assert(true);
    expect(() => assert(false)).toThrow();
  });

  it('zip test', () => {
    expect(zip([1, 2], ['1', '2'])).toEqual([
      [1, '1'],
      [2, '2'],
    ]);
    expect(zip3([1, 2], ['1', '2'], ['a', 'b'])).toEqual([
      [1, '1', 'a'],
      [2, '2', 'b'],
    ]);
  });
});
