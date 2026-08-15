# Task 8 — Global Event Bus (`finance.events.*`)

## 1. Definition

### What it is
`finance.events.*` is a unified, cross-process publish/subscribe event bus for the Finance Flow AI application. It provides a single, consistent mechanism for communication between the three runtime processes: **Main**, **Extension Host**, and **Renderer**.

### Core purpose
The application previously relied on many ad-hoc IPC channels for different kinds of events. Each new event type required new handlers in multiple files, creating scattered coupling and linear growth in boilerplate. The event bus replaces that pattern with one central hub: any runtime side can **publish** to a topic string, and any side can **subscribe** to topics and receive payloads, without knowing who else is listening.

### Why it exists
- Reduce duplicated per-topic IPC wiring
- Provide a single, discoverable place for cross-component events
- Keep the existing JSON-RPC transport; no new messaging layer is introduced
- Enable future features to add events without adding new channel names

---

## 2. Implementation Summary

### Files created
- `src/main/services/event-bus.ts` — Main-side `EventBus` singleton
- `src/extension-host/api/events.ts` — Host-side `EventsApi` and shared handler registry
- `tests/unit/main/services/event-bus.test.ts` — 6 EventBus unit tests
- `tests/unit/extension-host/api/events.test.ts` — 3 Host events API unit tests

### Files modified
- `src/shared/json-rpc-methods.ts` — added `EventSubscribe` and `EventPublish`
- `src/main/main.ts` — instantiated `EventBus`, wired it into `ExtensionIPC`, registered `event:subscribe` and `event:publish` IPC handlers, routed `host:log` through the bus
- `src/main/services/extension-ipc.ts` — added `setEventBus()`, handles Host `event.subscribe` requests, forwards `event.notify` notifications back to Host
- `src/extension-host/host.ts` — added `handleHostEventNotify()` to deliver `event.notify` to per-extension handlers
- `src/extension-host/api/index.ts` — added `events: EventsApi` to `FinanceApi`
- `src/extension-host/api/ui.ts` — added `notify(method, params)` to `RpcClient`
- `src/preload/preload.ts` — exposed `window.financeShell.events.on` and `window.financeShell.events.emit` to renderer
- `src/types/finance.d.ts` — re-exported `EventsApi`
- `src/types/finance-shell.d.ts` — added `EventsApi` interface and `events: EventsApi` to `FinanceShellApi`
- `CHANGELOG.md` — documented the new bus

### Architecture
The bus lives in Main. Host and renderer do not hold shared state; they reach Main through the existing transport:

| Side | Entry point | Transport |
|---|---|---|
| **Main** | `EventBus` direct calls | In-process |
| **Host** | `createEvents(extensionId, rpc)` | JSON-RPC `event.subscribe` / `event.publish` |
| **Renderer** | `window.financeShell.events` | `ipcRenderer.invoke('event:subscribe', topic)` / `ipcRenderer.invoke('event:publish', { topic, payload })` |

Main-side publish flow:
1. `eventBus.publish(topic, payload, excludeSource)`
2. Directly invokes renderer subscribers via `mainWindow.webContents.send('shell:event', { topic, payload })`
3. Forwards to Host subscribers via `extensionIPC.notify(RPC_METHOD.EventPublish, { topic, payload })`

Host-side subscribe flow:
1. `createEvents.on(topic, handler)` sends `event.subscribe` to Main
2. `ExtensionIPC` receives it and registers a callback that posts `event.notify` back to the Host process
3. When Main publishes, the Host callback receives it and delivers to the stored handler map

Renderer-side subscribe flow:
1. `window.financeShell.events.on(topic, callback)` registers an `ipcRenderer.on('shell:event', ...)` listener
2. Calls `ipcRenderer.invoke('event:subscribe', topic)`
3. Main registers a renderer-targeted callback on `EventBus`
4. On publish, Main sends `shell:event`; preload unwraps the payload and calls the callback

### Current wiring
The only live topic today is `host:log`:
- Publisher: `extensionIPC.onHostLog()` in `src/main/main.ts`
- Bus call: `eventBus.publish('host:log', entry, 'host')`
- Legacy path: `mainWindow.webContents.send('extensions:host-log', entry)` still runs in parallel
- Renderer subscriber: `window.financeShell.events.on('host:log', handler)`

No other topics are published yet. The bus is infrastructure-ready for future migration.

---

## 3. User Guide

### For renderer / DevTools usage
```js
// Subscribe
const unsub = window.financeShell.events.on('some.topic', (payload) => {
  console.log('received', payload);
});

// Unsubscribe later
unsub();

// Publish from renderer
await window.financeShell.events.emit('some.topic', { hello: 'world' });
```

### For extension authors
```ts
// Subscribe
const unsub = finance.events.on('some.topic', (payload) => {
  console.log('received', payload);
});

// Unsubscribe later
unsub();

// Publish from an extension
await finance.events.emit('some.topic', { hello: 'world' });
```

### For Main / services usage
```ts
// Publish directly
eventBus.publish('some.topic', payload, 'host'); // exclude Host subscribers
eventBus.publish('some.topic', payload, 'renderer'); // exclude renderer subscribers
eventBus.publish('some.topic', payload); // deliver to all sides

// Check whether anyone is listening
if (eventBus.hasSubscribers('some.topic')) {
  // ...
}
```

### Verified behavior
- Renderer DevTools subscription to `host:log` receives entries through the new bus
- Legacy `extensions:host-log` still works in parallel
- Unit tests cover publish, source exclusion, unsubscribe, and Host handler registration/emit/off

---

## 4. Future Roadmap

### Migration of existing ad-hoc channels
The following channels are candidates for future migration to the bus:
- `extensions:ui-event`
- `panel:mount-update`
- `panel:auto-save-failed`
- `panel:resize` / `workspace:resize`
- DOM `CustomEvent`s where cross-process visibility is needed

Each migration should be a separate task with:
- A defined topic naming convention
- Backward compatibility plan, if any legacy listeners remain
- Tests for the migrated path

### Topic naming convention
Currently only `host:log` is in use. A convention should be defined, for example:
- `host:*` — Host-side lifecycle and logging events
- `account:*` — account management events
- `settings:*` — settings changes
- `panel:*` — panel lifecycle events
- `<extensionId>:*` — extension-specific events

### Source exclusion semantics
Today `publish(topic, payload, excludeSource)` excludes only one source. If future requirements need “send to Main only” or “send to everyone except both Host and renderer,” the exclusion model may need to evolve into a target list or source bitmask.

### Error handling and resilience
- Handler exceptions are caught and logged, but delivery failures are not surfaced to publishers
- Future work may add dead-letter logging, handler timeout protection, or backpressure for high-frequency topics

### Persistence and replay
The current bus is in-memory only. If future features need event replay after restart, a persisted event log or snapshot mechanism would be required.
