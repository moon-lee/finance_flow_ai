# Settings and Accounts in the Existing WebContentsView Panel System

## Purpose

This document revises the earlier design note so it matches the implementation that already exists in this project today.

The important point is that the project already has a working WebContentsView-based panel system for extensions. The current goal should be to reuse that system as much as possible for Settings and Accounts, rather than introducing a separate architecture from scratch.

One nuance is worth stating explicitly: the existing panel system is already implemented and working, but it is still extension-oriented in its current bootstrap and routing path. That means the migration for Settings and Accounts should reuse the same lifecycle primitives while adding a thin core-view adapter layer, rather than assuming the current extension flow can be used unchanged.

This document explains:

- how the current panel system actually works
- where Settings and Accounts currently fit into the model
- why the Accounts view has shown unstable behavior during repeated attempts to fix it
- how the existing panel system should be used as the baseline for any future change

---

## Executive Summary

The project already has a working panel architecture built around Electron WebContentsView.

That system is not hypothetical. It is implemented in the Main process and already handles:

- creating a panel WebContentsView
- mounting an extension into that panel
- sending initialization data to the panel
- forwarding UI events back to Main
- focusing, showing, resizing, and hiding panels
- restoring the active panel when overlays are closed

That means the best approach is not to invent a brand-new “Settings/Accounts as webview” design. The better approach is to plug Settings and Accounts into the existing panel lifecycle that already works well for extensions.

This is especially important because the current Accounts bug appears to be a lifecycle/host-problem, not a data-layer problem. If we route the Accounts experience through the same panel host that already handles the working extension panels, we can reduce the chances of the UI being re-mounted or re-initialized unexpectedly.

---

## What the current panel system already does

### 1. Main owns the panel lifecycle

The central controller is [src/main/services/webview-panel-manager.ts](src/main/services/webview-panel-manager.ts).

It owns a map of active panels, each represented by a WebContentsView plus metadata:

- panelId
- extensionId
- viewId
- WebContentsView instance

The manager is responsible for:

- mounting a new panel
- reusing an existing panel when it is already present
- showing a panel
- hiding all other panels
- focusing a panel
- resizing a panel
- unmounting a panel
- restoring panels after overlay activity

This is the core of the current working system.

### 2. The panel host is created in Main

The Main process wires up the panel manager during startup in [src/main/main.ts](src/main/main.ts).

The relevant behavior is:

- the Main process registers IPC handlers for panel operations
- the panel manager is instantiated early
- the panel manager is wired to the extension host UI handler
- Mount requests from the extension host are routed through the panel manager

That means WebContentsView panels are not a side feature. They are a first-class host mechanism in the application shell.

### 3. The panel renderer process is bootstrapped separately

The panel renderer is not the same as the main renderer shell.

It is started through [src/main/resources/panel-bootstrap.ts](src/main/resources/panel-bootstrap.ts), which runs inside the panel WebContentsView renderer process.

That bootstrap:

- waits for `panel:init`
- loads the extension bundle from the shell protocol
- creates a FinanceApi wrapper from the panel preload bridge
- calls the extension’s `activate()` function
- forwards UI events from the extension to Main
- listens for `panel:navigate` and `panel:mount-update` and re-dispatches them as DOM events

This is the working extension-panel contract.

### 4. The preload bridge exposes a panel-specific API

The panel-specific bridge is implemented in [src/preload/panel-preload.ts](src/preload/panel-preload.ts).

It exposes:

- extension read/write table access
- account APIs
- settings APIs
- panel lifecycle callbacks such as `onPanelInit`, `onNavigate`, and `onMountUpdate`

This means the panel renderer can behave like a self-contained extension host embedded inside a WebContentsView.

### 5. The main renderer uses the same shell bridge for panel control

The main renderer-side bridge is [src/preload/preload.ts](src/preload/preload.ts).

That bridge exposes panel control methods such as:

- `panel.focus`
- `panel.show`
- `panel.hideForOverlay`
- `panel.restoreAfterOverlay`
- `panel.list`
- `panel.resize`
- `panel.onMounted`
- `panel.onRequestBounds`

So the shell renderer and the panel renderer are already connected through a stable IPC pattern.

---

## How the extension panel system works in practice

### A. Mount path

When an extension wants to open a panel, the flow is:

1. The extension host or extension logic requests a mount.
2. Main receives that request through the extension IPC layer in [src/main/main.ts](src/main/main.ts).
3. Main forwards the request to [src/main/services/webview-panel-manager.ts](src/main/services/webview-panel-manager.ts).
4. The manager creates a new WebContentsView if needed.
5. The panel loads a `finance-shell://panel/...` URL.
6. The panel bootstrap runs and initializes the extension UI inside the panel.

This is the normal extension-panel lifecycle.

### B. Initialization path

Once the panel is created:

- the panel bootstrap waits for `panel:init`
- Main sends the payload with extensionId, viewId, and mountData
- the bootstrap imports the extension bundle
- the extension activates and mounts its UI

So the extension panel is initialized from a dedicated panel renderer context, not from the main shell renderer DOM.

### C. UI event forwarding path

When the extension UI emits events:

- the panel bootstrap forwards them to Main through the preload bridge
- Main validates the event against the allowlist
- Main forwards the event to the extension host and back to the main renderer as needed

This is how extension UI stays isolated while still participating in the broader app shell.

### D. Focus and visibility path

When a panel is shown or focused:

- the panel manager hides all other panels
- it raises the selected panel to the top of the z-order
- it makes the panel visible
- it updates the active panel state

This is the mechanism that makes the panel system behave like a tabbed or single-active-panel workspace.

### E. Overlay handling path

When a main-renderer overlay is opened (such as the command palette), the system hides all panels temporarily:

- [src/renderer/overlay-coordinator.ts](src/renderer/overlay-coordinator.ts) calls the preload overlay methods
- Main receives `panel:hide-overlay`
- the panel manager sets `overlayActive = true`
- every panel becomes invisible

When the overlay closes:

- the manager restores the previously active panel

This is already a proven mechanism and should be reused.

---

## How Settings and Accounts currently fit into this model

### Current state

Settings and Accounts are currently not using the panel system.

They are still mounted directly as custom elements in the main renderer DOM:

- [src/renderer/components/settings-screen.ts](src/renderer/components/settings-screen.ts)
- [src/renderer/components/accounts-manager.ts](src/renderer/components/accounts-manager.ts)

They are activated through the top-level `view-changed` handler in [src/renderer/index.ts](src/renderer/index.ts).

That means the current implementation is a renderer-owned special view path, not a panel-owned path.

### Why this matters

The existing panel system is already the app’s stable host for UI that should behave like its own surface. If Settings or Accounts are intended to behave like a full workspace view with its own lifecycle, then reusing the panel host is the right architectural move.

The current problem with Accounts is consistent with this:

- attempts to re-enter or re-render the Accounts UI from the renderer shell appear to produce unstable transitions
- the bug looks like it is caused by host ownership and view lifecycle rather than the account data service itself

That is precisely the kind of problem the panel system is designed to isolate.

---

## Why the Accounts issue is happening

The Accounts behavior you described appears likely to be a symptom of the current host being the main renderer shell rather than a dedicated panel host.

The evidence from the code is:

- the Accounts view is mounted by the renderer itself in [src/renderer/index.ts](src/renderer/index.ts)
- it is created and removed as part of the special view switch logic
- its lifecycle is coupled to the parent renderer’s view switching path
- it does not currently have its own stable panel lifecycle boundary

That means after a submit or re-entry event, the view can be affected by:

- the surrounding renderer re-render cycle
- the special-view branch that removes or recreates the element
- overlay or workspace visibility changes
- parent-level view state switching

In other words, the bug is likely not “account submit is broken” in the database layer. The more likely problem is that the Accounts UI is being hosted in a way that makes it easy to lose its intended lifecycle state after interaction.

This is exactly the kind of case where a dedicated panel host is beneficial.

---

## Recommended direction: reuse the existing panel system

The current extension panel system should be treated as the working baseline.

### Why reuse it instead of creating a different architecture?

Because it already provides the features you need:

- isolated renderer process
- known mount/show/focus lifecycle
- stable IPC bridge
- overlay suppression
- panel activation state
- host-to-panel communication

That is exactly what Settings and Accounts would need if we want them to behave more like first-class workspace surfaces. The only caveat is that the current implementation is still primarily an extension-panel host, so the migration should include a small adapter layer for core views rather than assuming a direct drop-in.

---

## A practical migration strategy using the current system

## The key design concern: `view-changed` is part of the current problem
A further nuance is that the existing WebContentsView system is a runtime host, not yet a generic core-view registry. In practice that means the migration should add a thin core-view bridge in Main and a dedicated core panel bootstrap path, then reuse the existing panel manager and overlay behavior on top of that bridge.
This is the most important point to clarify.

The current `view-changed` path in [src/renderer/index.ts](src/renderer/index.ts) is already part of the instability you have seen for Settings and Accounts.

That path currently does two different jobs at once:

1. it acts as a view-selection signal from the UI
2. it also decides how the special core views are hosted and mounted

That coupling is the problem.

When the renderer receives `view-changed`, it does not just say “the user picked Settings”. It also says “replace the current special view in the workspace DOM with this new one”. That means the handler is both a routing signal and a host lifecycle controller.

That is why reusing `view-changed` directly for the new panel-based design is not the best idea.

### Why not reuse `view-changed` as the main mechanism?

Because it is already too coupled to the renderer DOM lifecycle.

In the current implementation:

- `view-changed` is used to switch views
- the renderer decides whether to create or remove `settings-screen` / `accounts-manager`
- the renderer owns the mount/unmount behavior
- the parent component tree is involved in the transition

That is exactly the fragility that is showing up in the Accounts flow.

So if we move Settings and Accounts onto the panel system, we should not make `view-changed` the primary owner of their lifecycle again.

### What should replace it?

Instead of making `view-changed` the main control point, the better model is:

- the renderer emits a simple intent such as “open core view Settings”
- Main receives that intent and decides which panel to show/focus/create
- the panel host owns the lifecycle
- the core UI is mounted inside that panel

In other words:

- `view-changed` should become a thin UI event
- Main should become the owner of panel activation and visibility
- the panel manager should own the runtime lifecycle

That separation is the real fix.

---

## Recommended ownership model

### Current model (problematic)

- renderer receives UI action
- renderer directly manipulates the special view DOM
- renderer owns mount/unmount lifecycle
- `view-changed` is both router and host controller

### Proposed model (better)

- renderer emits a simple selection intent
- Main receives the request
- Main asks the panel manager to show/focus/create the correct panel
- the panel host owns the actual view lifecycle

This is why the new model should not rely on `view-changed` as the primary lifecycle mechanism.

---

## Practical implication for Settings and Accounts

For Settings and Accounts, the change should be:

1. the UI still knows which core view was chosen
2. but that choice is translated into a panel command rather than directly mounting/unmounting DOM nodes
3. Main owns the panel instance and visibility state
4. the special view UI is mounted inside the panel context

That gives the Accounts experience a stable host boundary instead of making it depend on the renderer’s current DOM tree and view-switch branch.

---

## Bottom line

The reason not to use `view-changed` again as the main mechanism is simple:

- it is already the path that is causing the unstable Settings/Accounts behavior
- it is tightly coupled to the renderer DOM lifecycle
- it is not the right owner for a panel-based host model

The better architecture is:

- keep `view-changed` as a lightweight UI signal if needed
- move the real lifecycle control to Main + the panel manager
- let the panel system own the Settings/Accounts surface instead of the renderer shell

### Phase 1 — Keep the existing UI components

Do not rewrite Settings and Accounts from scratch.

Keep the current UI implementations in:

- [src/renderer/components/settings-screen.ts](src/renderer/components/settings-screen.ts)
- [src/renderer/components/accounts-manager.ts](src/renderer/components/accounts-manager.ts)

These are already the actual feature UI and are a good fit to reuse.

### Phase 2 — Host them through the existing panel bootstrap

Instead of mounting them directly into the main renderer DOM, register them as panel-backed views.

That means:

- a panel entry point loads a small host page
- that host page mounts the existing Settings or Accounts component into its own DOM
- the panel bootstrap path in [src/main/resources/panel-bootstrap.ts](src/main/resources/panel-bootstrap.ts) becomes the mounting mechanism

### Phase 3 — Route view activation through Main

The special-case branch in [src/renderer/index.ts](src/renderer/index.ts) should stop directly creating/removing the Settings/Accounts elements.

Instead, it should request that Main show the right panel, for example through the existing panel control path already exposed by [src/preload/preload.ts](src/preload/preload.ts).

### Phase 4 — Reuse overlay and focus behavior

The existing overlay logic in [src/renderer/overlay-coordinator.ts](src/renderer/overlay-coordinator.ts) and the panel manager’s hide/restore path in [src/main/services/webview-panel-manager.ts](src/main/services/webview-panel-manager.ts) should be reused.

That gives Settings and Accounts the same overlay behavior that already works for the extension panel system.

---

## Files that are most relevant to this approach

### Core panel implementation

- [src/main/services/webview-panel-manager.ts](src/main/services/webview-panel-manager.ts)
- [src/main/main.ts](src/main/main.ts)
- [src/preload/preload.ts](src/preload/preload.ts)
- [src/preload/panel-preload.ts](src/preload/panel-preload.ts)
- [src/main/resources/panel-bootstrap.ts](src/main/resources/panel-bootstrap.ts)

### Current UI components to preserve

- [src/renderer/components/settings-screen.ts](src/renderer/components/settings-screen.ts)
- [src/renderer/components/accounts-manager.ts](src/renderer/components/accounts-manager.ts)

### Renderer routing layer to revise

- [src/renderer/index.ts](src/renderer/index.ts)
- [src/renderer/components/navigation-panel.ts](src/renderer/components/navigation-panel.ts)
- [src/renderer/components/activity-bar.ts](src/renderer/components/activity-bar.ts)
- [src/renderer/overlay-coordinator.ts](src/renderer/overlay-coordinator.ts)

---

## Why this document differs from the earlier one

The earlier document treated Settings and Accounts as if they were a brand-new architecture problem.

That was too abstract.

The current implementation already shows that the project has a working panel architecture for extensions. The better solution is to align Settings and Accounts with that existing architecture rather than inventing a parallel one.

So the updated conclusion is:

- do not replace the current panel system
- do not create a separate one-off host for Settings/Accounts
- reuse the existing WebContentsView panel system for these core views as much as possible

---

## Bottom line

The current panel system is already working and should be the foundation for any change to Settings and Accounts.

The Accounts issue is most likely not a general account-service problem. It is more likely a host/lifecycle problem caused by the current renderer-owned mounting approach.

The best fix is therefore to route Settings and Accounts through the existing panel host that already manages extension panels successfully.
