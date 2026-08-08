// @vitest-environment happy-dom
/**
 * Tests for the Settings screen's Core Financial Year inputs.
 *
 * `core.financialYear.current` is a text input defaulting to the *current*
 * financial year (computed from today's date + the default `07-01` FY
 * boundary), auto-formatting input to `YYYY-YYYY` on change. `core.financialYear.start`
 * is a text input normalized to `MM-DD`. Formatted inputs (those declaring a
 * `format` function) render a format hint and block invalid values from being saved.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  SettingsScreen,
  computeCurrentFinancialYear,
  formatFinanceYear,
  formatFinanceYearStart,
} from '../../../src/renderer/components/settings-screen';

function mockShell() {
  (window as unknown as Record<string, unknown>).financeShell = {
    extensions: {
      list: vi.fn().mockResolvedValue({ configuration: [] }),
    },
    settings: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('computeCurrentFinancialYear', () => {
  it('computes the current FY for a date after the 07-01 boundary', () => {
    // 2026-08-08 is after 07-01 -> FY 2026-2027
    expect(computeCurrentFinancialYear('2026-08-08')).toBe('2026-2027');
  });

  it('computes the current FY for a date before the 07-01 boundary', () => {
    // 2026-06-30 is before 07-01 -> FY 2025-2026
    expect(computeCurrentFinancialYear('2026-06-30')).toBe('2025-2026');
  });

  it('treats the boundary date as the start of a new FY', () => {
    // 2026-07-01 is exactly the boundary -> FY 2026-2027
    expect(computeCurrentFinancialYear('2026-07-01')).toBe('2026-2027');
  });
});

describe('formatFinanceYear', () => {
  it('formats 8 consecutive digits to YYYY-YYYY', () => {
    expect(formatFinanceYear('20252026')).toBe('2025-2026');
  });

  it('leaves a YYYY-YYYY value unchanged', () => {
    expect(formatFinanceYear('2025-2026')).toBe('2025-2026');
  });

  it('expands legacy YYYY-YY to YYYY-YYYY', () => {
    expect(formatFinanceYear('2025-26')).toBe('2025-2026');
  });

  it('trims surrounding whitespace', () => {
    expect(formatFinanceYear('  20252026  ')).toBe('2025-2026');
  });

  it('returns unrecognized input unchanged', () => {
    expect(formatFinanceYear('hello')).toBe('hello');
  });
});

describe('SettingsScreen financial year dropdown (Task 2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    mockShell();
  });

  it('renders the current financial year as the text input value', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.value).toBe(computeCurrentFinancialYear());
  });

  it('auto-formats raw digit input to YYYY-YYYY on change', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input') as HTMLInputElement | null;
    input!.value = '20252026';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));

    expect(input!.value).toBe('2025-2026');
  });
});

describe('formatFinanceYearStart', () => {
  it('formats 4 consecutive digits to MM-DD', () => {
    expect(formatFinanceYearStart('0701')).toBe('07-01');
  });

  it('pads single-digit month and day', () => {
    expect(formatFinanceYearStart('7-1')).toBe('07-01');
  });

  it('leaves an MM-DD value unchanged', () => {
    expect(formatFinanceYearStart('07-01')).toBe('07-01');
  });

  it('trims surrounding whitespace', () => {
    expect(formatFinanceYearStart('  07-01  ')).toBe('07-01');
  });

  it('returns unrecognized input unchanged', () => {
    expect(formatFinanceYearStart('hello')).toBe('hello');
  });
});

describe('SettingsScreen formatted input validation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    mockShell();
  });

  it('renders placeholder and helper text for the FY current input', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('2025-2026');
    const helper = el.shadowRoot!.querySelector('.setting-helper[data-testid="helper-core.financialYear.current"]');
    expect(helper?.textContent).toContain('Format: YYYY-YYYY');
  });

  it('renders placeholder and helper text for the FY start input', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.start"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('07-01');
    const helper = el.shadowRoot!.querySelector('.setting-helper[data-testid="helper-core.financialYear.start"]');
    expect(helper?.textContent).toContain('Format: MM-DD');
  });

  it('blocks committing an invalid FY value and shows an error', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    input!.value = 'not-a-year';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));

    expect(setMock).not.toHaveBeenCalledWith('core.financialYear.current', 'not-a-year');
    const error = el.shadowRoot!.querySelector('.setting-error[data-testid="error-core.financialYear.current"]');
    expect(error).not.toBeNull();
    expect(input!.getAttribute('aria-invalid')).toBe('true');
  });

  it('commits a valid formatted FY value', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    input!.value = '20252026';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 350));

    expect(setMock).toHaveBeenCalledWith('core.financialYear.current', '2025-2026');
    const error = el.shadowRoot!.querySelector('.setting-error[data-testid="error-core.financialYear.current"]');
    expect(error).toBeNull();
  });

  it('clears the error state on subsequent input', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.current"]') as HTMLInputElement | null;
    input!.value = 'garbage';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));
    expect(el.shadowRoot!.querySelector('.setting-error')).not.toBeNull();

    input!.value = '20';
    input!.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 0));
    expect(el.shadowRoot!.querySelector('.setting-error')).toBeNull();
  });

  it('normalizes and commits a valid FY start value', async () => {
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-core.financialYear.start"]') as HTMLInputElement | null;
    input!.value = '7-1';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 350));

    expect(setMock).toHaveBeenCalledWith('core.financialYear.start', '07-01');
  });

  it('validates an extension config item declared with a string pattern', async () => {
    (window as unknown as { financeShell: { extensions: { list: ReturnType<typeof vi.fn> } } }).financeShell.extensions.list.mockResolvedValue({
      configuration: [
        { extensionId: 'salary-history', configuration: { key: 'salary-history.financialYearStart', type: 'string', label: 'FY Start', pattern: '^\\d{2}-\\d{2}$', formatHint: 'MM-DD', placeholder: '07-01' } },
      ],
    });
    const el = document.createElement('settings-screen') as unknown as SettingsScreen;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const setMock = (window as unknown as { financeShell: { settings: { set: ReturnType<typeof vi.fn> } } }).financeShell.settings.set;
    const input = el.shadowRoot!.querySelector('.setting-control input[data-testid="input-salary-history.financialYearStart"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('07-01');

    input!.value = 'invalid';
    input!.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 0));

    expect(setMock).not.toHaveBeenCalledWith('salary-history.financialYearStart', 'invalid');
    const error = el.shadowRoot!.querySelector('.setting-error[data-testid="error-salary-history.financialYearStart"]');
    expect(error).not.toBeNull();
  });
});
