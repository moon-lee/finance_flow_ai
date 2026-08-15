// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import '../../../src/renderer/components/accounts-manager';

const originalShell = window.financeShell;

function createEl() {
  const el = document.createElement('accounts-manager') as unknown as {
    updateComplete: Promise<unknown>;
    shadowRoot: ShadowRoot | null;
  };
  document.body.appendChild(el as unknown as Node);
  return el;
}

async function settled(el: { updateComplete: Promise<unknown> }) {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

describe('AccountsManager', () => {
  it('renders empty state when no accounts exist', async () => {
    window.financeShell = {
      ...originalShell,
      accounts: {
        list: async () => [],
        create: async () => ({ id: 1 }),
        count: async () => ({ count: 0 }),
        update: async () => ({ updated: true }),
        delete: async () => ({ deleted: true }),
      },
    } as unknown as typeof originalShell;

    const el = createEl();
    await settled(el);
    const sr = el.shadowRoot;
    expect(sr?.querySelector('h3')?.textContent?.trim()).toBe('No accounts yet');
    expect(sr?.querySelector('button')?.textContent?.trim()).toBe('Create your first account');
  });

  it('renders account rows with name, institution, active badge, and actions', async () => {
    const mockAccounts = [
      { id: 1, name: 'Primary Cheque', institution: 'CBA', is_active: true, created_at: '2026-08-01T00:00:00.000Z' },
      { id: 2, name: 'Savings', institution: null, is_active: false, created_at: '2026-07-15T00:00:00.000Z' },
    ];
    window.financeShell = {
      ...originalShell,
      accounts: {
        list: async () => mockAccounts,
        create: async () => ({ id: 1 }),
        count: async () => ({ count: 2 }),
        update: async () => ({ updated: true }),
        delete: async () => ({ deleted: true }),
      },
    } as unknown as typeof originalShell;

    const el = createEl();
    await settled(el);
    const sr = el.shadowRoot;
    const rows = [...sr?.querySelectorAll('.account-row') ?? []];
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.account-name')?.textContent?.trim()).toBe('Primary Cheque');
    expect(rows[0].querySelector('.account-meta')?.textContent?.trim()).toContain('CBA');
    expect(rows[0].querySelector('.badge-active')?.textContent?.trim()).toBe('Active');
    expect(rows[1].querySelector('.badge-inactive')?.textContent?.trim()).toBe('Inactive');
  });

  it('create account submits form and refreshes list', async () => {
    let created = false;
    window.financeShell = {
      ...originalShell,
      accounts: {
        list: async () => {
          if (created) return [{ id: 1, name: 'New', institution: null, is_active: true, created_at: '2026-08-02T00:00:00.000Z' }];
          return [];
        },
        create: async () => { created = true; return { id: 1 }; },
        count: async () => ({ count: created ? 1 : 0 }),
        update: async () => ({ updated: true }),
        delete: async () => ({ deleted: true }),
      },
    } as unknown as typeof originalShell;

    const el = createEl();
    await settled(el);
    const sr = el.shadowRoot;
    const btn = sr?.querySelector('.empty-state .accounts-btn') as HTMLButtonElement | null;
    btn?.click();
    await settled(el);

    const currentSr = el.shadowRoot;
    const nameInput = currentSr?.querySelector('.form-field input[type="text"]') as HTMLInputElement | null;
    if (nameInput) {
      nameInput.value = 'New';
      nameInput.dispatchEvent(new Event('input'));
      const saveBtn = currentSr?.querySelector('.form-actions .accounts-btn:last-child') as HTMLButtonElement | null;
      saveBtn?.click();
      await settled(el);
    }

    expect(created).toBe(true);
    expect(el.shadowRoot?.querySelector('.account-name')?.textContent?.trim()).toBe('New');
  });

  it('edit account updates row in place', async () => {
    const account = { id: 1, name: 'Primary Cheque', institution: 'CBA', is_active: true, created_at: '2026-08-01T00:00:00.000Z' };
    window.financeShell = {
      ...originalShell,
      accounts: {
        list: async () => [account],
        create: async () => ({ id: 1 }),
        count: async () => ({ count: 1 }),
        update: async (input: unknown) => {
          Object.assign(account, input as Record<string, unknown>);
          return { updated: true };
        },
        delete: async () => ({ deleted: true }),
      },
    } as unknown as typeof originalShell;

    const el = createEl();
    await settled(el);
    const sr = el.shadowRoot;
    const editBtn = sr?.querySelector('.row-actions .accounts-btn-secondary') as HTMLButtonElement | null;
    editBtn?.click();
    await settled(el);

    const currentSr = el.shadowRoot;
    const nameInput = currentSr?.querySelector('.form-field input[type="text"]') as HTMLInputElement | null;
    if (nameInput) {
      nameInput.value = 'Updated Name';
      nameInput.dispatchEvent(new Event('input'));
      const saveBtn = currentSr?.querySelector('.form-actions .accounts-btn:last-child') as HTMLButtonElement | null;
      saveBtn?.click();
      await settled(el);
    }

    expect(el.shadowRoot?.querySelector('.account-name')?.textContent?.trim()).toBe('Updated Name');
  });

  it('deactivate/activate toggle works', async () => {
    const account = { id: 1, name: 'Primary Cheque', institution: 'CBA', is_active: true, created_at: '2026-08-01T00:00:00.000Z' };
    window.financeShell = {
      ...originalShell,
      accounts: {
        list: async () => [account],
        create: async () => ({ id: 1 }),
        count: async () => ({ count: 1 }),
        update: async (input: unknown) => {
          Object.assign(account, input as Record<string, unknown>);
          return { updated: true };
        },
        delete: async () => ({ deleted: true }),
      },
    } as unknown as typeof originalShell;

    const el = createEl();
    await settled(el);
    const sr = el.shadowRoot;
    const toggleBtn = sr?.querySelector('.row-actions .accounts-btn:nth-child(2)') as HTMLButtonElement | null;
    toggleBtn?.click();
    await settled(el);
    expect(el.shadowRoot?.querySelector('.badge-inactive')?.textContent?.trim()).toBe('Inactive');

    const currentSr = el.shadowRoot;
    const activateBtn = currentSr?.querySelector('.row-actions .accounts-btn:nth-child(2)') as HTMLButtonElement | null;
    activateBtn?.click();
    await settled(el);
    expect(el.shadowRoot?.querySelector('.badge-active')?.textContent?.trim()).toBe('Active');
  });

  it('delete blocks last active account', async () => {
    window.financeShell = {
      ...originalShell,
      accounts: {
        list: async () => [{ id: 1, name: 'Primary', institution: 'CBA', is_active: true, created_at: '2026-08-01T00:00:00.000Z' }],
        create: async () => ({ id: 1 }),
        count: async () => ({ count: 1 }),
        update: async () => ({ updated: true }),
        delete: async () => { throw new Error('Cannot delete the last active account'); },
      },
    } as unknown as typeof originalShell;

    const el = createEl();
    await settled(el);
    const sr = el.shadowRoot;
    const deleteBtn = sr?.querySelector('.accounts-btn-danger') as HTMLButtonElement | null;
    deleteBtn?.click();
    await new Promise((r) => setTimeout(r, 100));
    const errorEl = el.shadowRoot?.querySelector('.error');
    expect(errorEl?.textContent?.trim()).toBe('Cannot delete the last active account');
  });

  it('delete removes inactive account', async () => {
    const accounts = [
      { id: 1, name: 'Primary', institution: 'CBA', is_active: true, created_at: '2026-08-01T00:00:00.000Z' },
      { id: 2, name: 'Savings', institution: null, is_active: false, created_at: '2026-07-15T00:00:00.000Z' },
    ];
    window.financeShell = {
      ...originalShell,
      accounts: {
        list: async () => accounts,
        create: async () => ({ id: 1 }),
        count: async () => ({ count: accounts.length }),
        update: async () => ({ updated: true }),
        delete: async () => {
          accounts.splice(1, 1);
          return { deleted: true };
        },
      },
    } as unknown as typeof originalShell;

    const el = createEl();
    await settled(el);
    const sr = el.shadowRoot;
    const rows = [...sr?.querySelectorAll('.account-row') ?? []];
    expect(rows.length).toBe(2);

    const deleteBtn = rows[1].querySelector('.accounts-btn-danger') as HTMLButtonElement | null;
    deleteBtn?.click();
    await settled(el);

    const remaining = [...el.shadowRoot?.querySelectorAll('.account-row') ?? []];
    expect(remaining.length).toBe(1);
  });
});
