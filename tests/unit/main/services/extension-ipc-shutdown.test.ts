/**
 * Phase 7 Task 10 — unit tests for the graceful shutdown protocol
 * between Main (`ExtensionIPC.stop()`) and the Extension Host.
 */

import { describe, expect, it, vi } from 'vitest';
import { ExtensionIPC } from '../../../../src/main/services/extension-ipc';
import { RPC_METHOD } from '../../../../src/shared/json-rpc-methods';

describe('ExtensionIPC graceful shutdown (Task 10)', () => {
  it('sends host.shutdown notification when stop() is called', async () => {
    const ipc = new ExtensionIPC();
    const postMessage = vi.fn();
    const exitHandler = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ipc as any).process = {
      postMessage,
      kill: vi.fn(),
      on: vi.fn(),
      once: vi.fn((_event: string, fn: (...args: unknown[]) => void) => {
        exitHandler.mockImplementation(fn);
      }),
      off: vi.fn()
    };

    const stopPromise = (ipc as unknown as { stop: () => Promise<void> }).stop();

    expect(postMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: RPC_METHOD.HostShutdown,
      params: undefined
    });

    exitHandler(0);
    await stopPromise;
  });

  it('resolves when host.shutdown.complete is received before timeout', async () => {
    const ipc = new ExtensionIPC();
    const postMessage = vi.fn();
    const exitHandler = vi.fn();
    const messageHandler = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ipc as any).process = {
      postMessage,
      kill: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        if (event === 'message') messageHandler.mockImplementation(fn);
      }),
      once: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        if (event === 'exit') exitHandler.mockImplementation(fn);
      }),
      off: vi.fn()
    };

    const stopPromise = (ipc as unknown as { stop: () => Promise<void> }).stop();

    messageHandler({
      jsonrpc: '2.0',
      method: RPC_METHOD.HostShutdownComplete,
      params: {}
    });

    exitHandler(0);
    await stopPromise;
  });

  it('falls back to hard-kill after 3s timeout if no ack received', async () => {
    vi.useFakeTimers();
    const ipc = new ExtensionIPC();
    const postMessage = vi.fn();
    const kill = vi.fn();
    const exitHandler = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ipc as any).process = {
      postMessage,
      kill,
      on: vi.fn(),
      once: vi.fn((_event: string, fn: (...args: unknown[]) => void) => {
        if (_event === 'exit') exitHandler.mockImplementation(fn);
      }),
      off: vi.fn()
    };

    const stopPromise = (ipc as unknown as { stop: () => Promise<void> }).stop();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(kill).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: RPC_METHOD.HostShutdown,
      params: undefined
    });

    exitHandler(0);
    await stopPromise;

    vi.useRealTimers();
  });

  it('does not forward host.shutdown.complete to generic listeners', () => {
    const ipc = new ExtensionIPC();
    const listener = vi.fn();
    ipc.onHostStatus(listener);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ipc as any).handleMessage({
      jsonrpc: '2.0',
      method: RPC_METHOD.HostShutdownComplete,
      params: {}
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('resolves immediately if process is null', async () => {
    const ipc = new ExtensionIPC();
    await expect((ipc as unknown as { stop: () => Promise<void> }).stop()).resolves.toBeUndefined();
  });
});
