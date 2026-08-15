/**
 * Phase 7 Task 8 — Host-side `finance.events` API.
 *
 * Extensions use this to subscribe to and publish topics on the global
 * event bus. Calls cross the Host→Main JSON-RPC boundary using the
 * `event.subscribe` and `event.publish` methods.
 */

import { RPC_METHOD } from '../../shared/json-rpc-methods';
import type { RpcClient } from './ui';

export interface EventsApi {
  on(topic: string, handler: (payload: unknown) => void): () => void;
  off(topic: string, handler: (payload: unknown) => void): void;
  emit(topic: string, payload: unknown): Promise<void>;
}

const hostEventHandlers = new Map<string, Map<string, (payload: unknown) => void>>();

export function getHostEventHandlers(): typeof hostEventHandlers {
  return hostEventHandlers;
}

export function createEvents(extensionId: string, rpc: RpcClient): EventsApi {
  const pendingHandlers = new Map<string, Set<(payload: unknown) => void>>();

  function ensureTopicHandlers(topic: string): Set<(payload: unknown) => void> {
    let handlers = pendingHandlers.get(topic);
    if (!handlers) {
      handlers = new Set();
      pendingHandlers.set(topic, handlers);
      rpc.notify(RPC_METHOD.EventSubscribe, { extensionId, topic });
    }
    return handlers;
  }

  const api: EventsApi = {
    on(topic, handler) {
      ensureTopicHandlers(topic).add(handler);
      let topicMap = hostEventHandlers.get(topic);
      if (!topicMap) {
        topicMap = new Map();
        hostEventHandlers.set(topic, topicMap);
      }
      topicMap.set(extensionId, handler);
      return () => api.off(topic, handler);
    },
    off(topic, handler) {
      const handlers = pendingHandlers.get(topic);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          pendingHandlers.delete(topic);
        }
      }
      const topicMap = hostEventHandlers.get(topic);
      if (topicMap) {
        topicMap.delete(extensionId);
        if (topicMap.size === 0) {
          hostEventHandlers.delete(topic);
        }
      }
    },
    emit(topic, payload) {
      return rpc.request(RPC_METHOD.EventPublish, { extensionId, topic, payload }) as Promise<void>;
    }
  };

  return api;
}
