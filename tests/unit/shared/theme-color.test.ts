import { describe, expect, it } from 'vitest';
import { darkenHex, hexToRgba, isThemeColor, mixWithWhite, resolveThemeColor } from '../../../src/shared/theme-color';

describe('theme-color helper', () => {
  it('accepts valid hex colors', () => {
    expect(isThemeColor('#4EC9B0')).toBe(true);
    expect(isThemeColor('#6366f1')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isThemeColor('red')).toBe(false);
    expect(isThemeColor('#FFF')).toBe(false);
    expect(isThemeColor('#GGGGGG')).toBe(false);
    expect(isThemeColor('123456')).toBe(false);
    expect(isThemeColor(null)).toBe(false);
    expect(isThemeColor(undefined)).toBe(false);
  });

  it('prefers the user setting over the manifest color', () => {
    expect(resolveThemeColor({ setting: '#FF0000', manifest: '#00FF00' })).toBe('#FF0000');
  });

  it('falls back to the manifest color when the setting is invalid', () => {
    expect(resolveThemeColor({ setting: 'red', manifest: '#00FF00' })).toBe('#00FF00');
  });

  it('returns undefined when neither color is valid', () => {
    expect(resolveThemeColor({})).toBeUndefined();
    expect(resolveThemeColor({ setting: 'nope', manifest: 'nope' })).toBeUndefined();
  });

  it('treats empty-string setting as unset without reporting', () => {
    const reported: unknown[] = [];
    expect(resolveThemeColor({ setting: '', manifest: '#00FF00', report: (_m, v) => { reported.push(v); } })).toBe('#00FF00');
    expect(reported).toEqual([]);
  });

  it('routes invalid values through report instead of console', () => {
    const reported: Array<{ message: string; value: unknown }> = [];
    expect(resolveThemeColor({ setting: 'red', manifest: '#00FF00', report: (message, value) => { reported.push({ message, value }); } })).toBe('#00FF00');
    expect(reported).toEqual([{ message: '[theme-color] ignoring invalid user theme color', value: 'red' }]);
  });

  it('darkens a hex color for hover states', () => {
    expect(darkenHex('#FFFFFF', 0.2)).toBe('#cccccc');
    expect(darkenHex('#007ACC', 0.2)).toBe('#0061a3');
  });

  it('converts a hex color to a soft translucent tint', () => {
    expect(hexToRgba('#F59E0B')).toBe('rgba(245, 158, 11, 0.25)');
    expect(hexToRgba('#4EC9B0', 0.5)).toBe('rgba(78, 201, 176, 0.5)');
    expect(hexToRgba('red')).toBe('red');
  });

  it('mixes a hex color toward white for the active background', () => {
    expect(mixWithWhite('#F59E0B', 0.65)).toBe('#fcddaa');
    expect(mixWithWhite('red')).toBe('red');
  });
});