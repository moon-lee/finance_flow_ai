/**
 * Phase 7 Task 8 — Main-side global event bus.
 *
 * Owns topic subscriptions from the Extension Host and the main renderer,
 * and routes published events to every subscriber across both surfaces.
 */

export type EventHandler = (payload: unknown) => void;

interface Subscription {
  topic: string;
  handler: EventHandler;
  source: 'host' | 'renderer';
}

export class EventBus {
  private readonly subscriptions = new Map<string, Subscription[]>();

  subscribe(topic: string, handler: EventHandler, source: 'host' | 'renderer'): () => void {
    const existing = this.subscriptions.get(topic) ?? [];
    existing.push({ topic, handler, source });
    this.subscriptions.set(topic, existing);

    return () => {
      const current = this.subscriptions.get(topic) ?? [];
      const next = current.filter((s) => s.handler !== handler || s.source !== source);
      if (next.length === 0) {
        this.subscriptions.delete(topic);
      } else {
        this.subscriptions.set(topic, next);
      }
    };
  }

  publish(topic: string, payload: unknown, excludeSource: 'host' | 'renderer' | null = null): void {
    const subscriptions = this.subscriptions.get(topic) ?? [];
    for (const subscription of subscriptions) {
      if (excludeSource && subscription.source === excludeSource) continue;
      try {
        subscription.handler(payload);
      } catch (err) {
        console.error(`[event-bus] handler threw for topic "${topic}":`, err);
      }
    }
  }

  hasSubscribers(topic: string): boolean {
    return (this.subscriptions.get(topic) ?? []).length > 0;
  }
}
