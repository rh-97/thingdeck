import { describe, expect, it } from 'vitest';
import { safeNext } from './utils';

describe('safeNext', () => {
  it('keeps same-site paths and rejects anything that could leave the site', () => {
    expect(safeNext('/devices?q=lamp')).toBe('/devices?q=lamp');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
  });
});
