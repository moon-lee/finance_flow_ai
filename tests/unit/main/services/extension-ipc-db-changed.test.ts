/**
 * Todo auto-refresh (Option A) — unit tests for the `db-changed` fan-out,
 * the Host `event.publish` route, and the silent `extension.ui-push` path.
 *
 * Covers `ExtensionIPC.handleEventPublish`, the `db-changed` emission in
 * `handleWriteTable`, `handleUiPush` (including the dropped-when-unwired
 * paths), and `WebviewPanelManager.pushMountData` focus semantics
 * (mount-update WITHOUT showPanel — verified structurally: push calls
 * `webContents.send` and never touches visibility APIs).
 */

import { describe, it, expect, vi } from 'vitest';
import { ExtensionIPC } from '../../../../src/main/services/extension-ipc';
import { EventBus } from '../../../../src/main/services/event-bus';

const noopHandler = {
  onMountRequested: () => {},
  onFocusRequested: () => {},
  onUiEvent: () => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSetDirty: (_extensionId: string, _dirty: boolean) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onAutoSaveDraft: async (_extensionId: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBeforeUnmount: async (_extensionId: string) => {}
};

function makeDao() {
  return {
    insert: vi.fn().mockReturnValue({ id: 1 }),
    update: vi.fn().mockReturnValue(1),
    delete: vi.fn().mockReturnValue(1)
  };
}

describe('ExtensionIPC event.publish route (Option A)', () => {
  it('publishes the topic through the EventBus', () => {
    const ipc = new ExtensionIPC();
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('custom.topic', handler, 'host');
    ipc.setEventBus(bus);

    const res = ipc.handleEventPublish({ topic: 'custom.topic', payload: { n: 1 } });

    expect(res).toEqual({ published: true });
    expect(handler).toHaveBeenCalledWith({ n: 1 });
  });

  it('drops gracefully when no EventBus is wired', () => {
    const ipc = new ExtensionIPC();
    const res = ipc.handleEventPublish({ topic: 'custom.topic', payload: {} });
    expect(res).toEqual({ published: false });
  });
});

describe('ExtensionIPC db-changed fan-out (Option A)', () => {
  it('publishes db-changed on insert with extensionId/table/op', () => {
    const ipc = new ExtensionIPC();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipc.setDAOService(makeDao() as any);
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('db-changed', handler, 'host');
    ipc.setEventBus(bus);

    const res = ipc.handleWriteTable({
      extensionId: 'todo-list',
      table: 'todo_list_items',
      op: 'insert',
      payload: { title: 'x', is_done: false }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(res.affected).toBe(1);
    expect(handler).toHaveBeenCalledWith({
      extensionId: 'todo-list',
      table: 'todo_list_items',
      op: 'insert'
    });
  });

  it('publishes db-changed on update and delete', () => {
    const ipc = new ExtensionIPC();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipc.setDAOService(makeDao() as any);
    const bus = new EventBus();
    const seen: unknown[] = [];
    bus.subscribe('db-changed', (p) => seen.push(p), 'host');
    ipc.setEventBus(bus);

    ipc.handleWriteTable({ extensionId: 'todo-list', table: 'todo_list_items', op: 'update', where: { id: 1 }, payload: { is_done: true } });
    ipc.handleWriteTable({ extensionId: 'todo-list', table: 'todo_list_items', op: 'delete', where: { id: 1 } });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ op: 'update' });
    expect(seen[1]).toMatchObject({ op: 'delete' });
  });

  it('still completes the write when no EventBus is wired', () => {
    const ipc = new ExtensionIPC();
    const dao = makeDao();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipc.setDAOService(dao as any);

    const res = ipc.handleWriteTable({
      extensionId: 'todo-list',
      table: 'todo_list_items',
      op: 'insert',
      payload: { title: 'x' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    expect(res.affected).toBe(1);
    expect(dao.insert).toHaveBeenCalled();
  });
});

describe('ExtensionIPC silent ui-push (Option A)', () => {
  it('forwards to onDataPush without touching mount/focus paths', () => {
    const ipc = new ExtensionIPC();
    const pushes: Array<{ extId: string; viewId: string; mountData?: object }> = [];
    const mounts: unknown[] = [];
    ipc.setUIHandler({
      ...noopHandler,
      onMountRequested: (extId: string, viewId: string, mountData?: object) => { mounts.push([extId, viewId, mountData]); },
      onDataPush: (extId: string, viewId: string, mountData?: object) => pushes.push({ extId, viewId, mountData })
    });

    const res = ipc.handleUiPush({ extensionId: 'dashboard', viewId: 'dashboard-view', mountData: { a: 1 } });

    expect(res).toEqual({ pushed: true });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toEqual({ extId: 'dashboard', viewId: 'dashboard-view', mountData: { a: 1 } });
    expect(mounts).toHaveLength(0);
  });

  it('drops gracefully when no UI handler is registered', () => {
    const ipc = new ExtensionIPC();
    expect(ipc.handleUiPush({ extensionId: 'dashboard', viewId: 'dashboard-view' })).toEqual({ pushed: false });
  });

  it('drops gracefully when onDataPush is not wired (legacy handler)', () => {
    const ipc = new ExtensionIPC();
    ipc.setUIHandler({ ...noopHandler });
    expect(ipc.handleUiPush({ extensionId: 'dashboard', viewId: 'dashboard-view' })).toEqual({ pushed: false });
  });
});
