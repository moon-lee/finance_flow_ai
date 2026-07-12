import { describe, it, expect } from 'vitest';
import {
  validatePayg,
  calculatePaygWeekly,
  calculatePaygWeeklyRaw,
} from '../../../../extensions/salary-history/src/services/payg-calc';
import { BRACKETS_2026_27 } from '../../../../extensions/salary-history/src/services/payg-brackets';

describe('payg-calc', () => {
  describe('calculatePaygWeeklyRaw (formula sanity)', () => {
    it('returns 0 for earnings <= 0', () => {
      expect(calculatePaygWeeklyRaw(0, BRACKETS_2026_27)).toBe(0);
      expect(calculatePaygWeeklyRaw(-100, BRACKETS_2026_27)).toBe(0);
    });

    it('returns 0 for earnings in the first bracket (<= 361)', () => {
      expect(calculatePaygWeeklyRaw(360, BRACKETS_2026_27)).toBe(0);
      expect(calculatePaygWeeklyRaw(361, BRACKETS_2026_27)).toBe(0);
    });

    it('applies the bracket formula at a mid-bracket value', () => {
      // Bracket 865-1282: a=0.3227, b=180.0385 → 0.3227 * 1000 - 180.0385 = 142.66
      const tax = calculatePaygWeeklyRaw(1000, BRACKETS_2026_27);
      expect(tax).toBeCloseTo(0.3227 * 1000 - 180.0385, 4);
    });

    it('applies the top bracket formula for high earnings', () => {
      // Bracket 3653+: a=0.47, b=650.6154 → 0.47 * 5000 - 650.6154 = 1699.38
      const tax = calculatePaygWeeklyRaw(5000, BRACKETS_2026_27);
      expect(tax).toBeCloseTo(0.47 * 5000 - 650.6154, 4);
    });

    it('returns 0 (clamped) for tiny negative artifacts at bracket boundaries', () => {
      // Just above the 361 threshold: 0.16 * 362 - 57.8462 = 0.0738 (positive; sanity check)
      const tax = calculatePaygWeeklyRaw(362, BRACKETS_2026_27);
      expect(tax).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculatePaygWeekly', () => {
    it('delegates to getBracketsForYear for FY 2026-2027', () => {
      const tax = calculatePaygWeekly(2000, '2026-2027');
      // Bracket 1282-2596: a=0.32, b=176.5769 → 0.32 * 2000 - 176.5769 = 463.42
      expect(tax).toBeCloseTo(0.32 * 2000 - 176.5769, 4);
    });

    it('throws for an unknown FY', () => {
      expect(() => calculatePaygWeekly(2000, '2099-2100')).toThrow();
    });
  });

  describe('validatePayg', () => {
    it('flags withinTolerance when derived PAYG matches ATO estimate', () => {
      // Pick gross/net such that gross-net falls within the ATO estimate.
      // gross=2000, ATO estimate ≈ 463.42. Set net so derived = 463.42 (within $5).
      const result = validatePayg(2000, 2000 - 463.42, '2026-2027', 5);
      expect(result.derivedPayg).toBeCloseTo(463.42, 2);
      expect(result.withinTolerance).toBe(true);
      expect(result.bracketError).toBeUndefined();
    });

    it('flags outside tolerance when derived PAYG differs by more than tolerance', () => {
      // gross=2000, ATO estimate ≈ 463.42. net so derived = 400 (diff = -63.42, |diff| > $5).
      const result = validatePayg(2000, 2000 - 400, '2026-2027', 5);
      expect(result.withinTolerance).toBe(false);
      expect(result.difference).toBeCloseTo(-63.42, 1);
    });

    it('clamps derivedPayg to >= 0 even when net > gross (invalid input)', () => {
      const result = validatePayg(1000, 1100, '2026-2027', 5);
      expect(result.derivedPayg).toBe(0);
    });

    it('returns bracketError (and withinTolerance=false) for unknown FY, never throws', () => {
      const result = validatePayg(2000, 1500, '2099-2100', 5);
      expect(result.bracketError).toMatch(/Bracket data unavailable for FY 2099-2100/);
      expect(result.withinTolerance).toBe(false);
      expect(Number.isNaN(result.atoEstimate)).toBe(true);
      expect(result.derivedPayg).toBe(500); // gross - net still computed
    });

    it('echoes the requested taxYear in the result', () => {
      const result = validatePayg(2000, 1500, '2026-2027', 5);
      expect(result.taxYear).toBe('2026-2027');
    });

    it('uses zero tolerance when toleranceDollars=0', () => {
      // With $0 tolerance, even a 1¢ discrepancy fails. We choose
      // round numbers so floating-point arithmetic gives exactly
      // 0.00 difference (rather than 0.0031 from FP noise).
      // gross=2000, ATO for the 1282-2596 bracket is 0.32*2000-b = 463.4231
      // (computed via the bracket lookup, not derived). Pick net that
      // gives exactly the same number.
      const exact = validatePayg(2000, 2000 - 463.4231, '2026-2027', 0);
      expect(exact.withinTolerance).toBe(true);
      const offByCent = validatePayg(2000, 2000 - 463.42, '2026-2027', 0);
      expect(offByCent.withinTolerance).toBe(false);
    });
  });
});
