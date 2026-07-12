import { describe, it, expect } from 'vitest';
import {
  BRACKETS_2026_27,
  getBracketsForYear,
  getSupportedYears,
} from '../../../../extensions/salary-history/src/services/payg-brackets';

describe('payg-brackets', () => {
  describe('BRACKETS_2026_27', () => {
    it('returns exactly 9 brackets for FY 2026-2027', () => {
      expect(BRACKETS_2026_27).toHaveLength(9);
    });

    it('first bracket covers $0 to $361 with 0% rate', () => {
      const first = BRACKETS_2026_27[0];
      expect(first.thresholdFrom).toBe(0);
      expect(first.thresholdTo).toBe(361);
      expect(first.a).toBe(0);
      expect(first.b).toBe(0);
    });

    it('final bracket has null thresholdTo (open-ended)', () => {
      const last = BRACKETS_2026_27[BRACKETS_2026_27.length - 1];
      expect(last.thresholdTo).toBeNull();
      expect(last.thresholdFrom).toBe(3653);
    });

    it('all consecutive brackets share a boundary (thresholdFrom === previous thresholdTo)', () => {
      for (let i = 1; i < BRACKETS_2026_27.length; i++) {
        expect(BRACKETS_2026_27[i].thresholdFrom).toBe(BRACKETS_2026_27[i - 1].thresholdTo);
      }
    });
  });

  describe('getBracketsForYear', () => {
    it('returns BRACKETS_2026_27 for "2026-2027"', () => {
      expect(getBracketsForYear('2026-2027')).toBe(BRACKETS_2026_27);
    });

    it('throws for an unknown FY label', () => {
      expect(() => getBracketsForYear('2099-2100')).toThrow(/Bracket data unavailable for FY 2099-2100/);
    });

    it('throws for a malformed FY label', () => {
      expect(() => getBracketsForYear('not-a-year')).toThrow();
    });
  });

  describe('getSupportedYears', () => {
    it('includes "2026-2027"', () => {
      expect(getSupportedYears()).toContain('2026-2027');
    });

    it('returns a non-empty readonly list', () => {
      const years = getSupportedYears();
      expect(years.length).toBeGreaterThan(0);
    });
  });
});
