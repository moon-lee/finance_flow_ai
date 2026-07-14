/**
 * Shared loose types for the salary-history UI component tests.
 *
 * These intentionally do NOT extend the Lit component classes or
 * `HTMLElement` (doing so would collide with the components' `private`
 * members, or with `HTMLElement.shadowRoot`'s `ShadowRoot` type). Each
 * test file intersects `UiEl` with the specific public props and private
 * members it touches, and casts the created element via `as unknown as
 * ...` so the harness can drive internal state.
 *
 * `shadowRoot` is typed non-null and `querySelector` returns `HTMLElement`
 * because every query in these tests runs after `await updateComplete`, at
 * which point the element is upgraded and rendered.
 */

export interface TestShadowRoot {
  querySelector(sel: string): HTMLElement;
  querySelectorAll(sel: string): HTMLElement[];
}

export interface UiEl {
  updateComplete: Promise<boolean>;
  shadowRoot: TestShadowRoot;
  addEventListener(type: string, listener: (e: Event) => void): void;
  removeEventListener(type: string, listener: (e: Event) => void): void;
}
