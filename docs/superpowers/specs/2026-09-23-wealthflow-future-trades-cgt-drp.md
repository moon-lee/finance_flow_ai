# Wealth Flow Future Phases Note — Trades, Cost Base / CGT, DRP

**Date:** 2026-09-23
**Status:** Concept note, NOT a build spec. Companion to `2026-09-23-wealthflow-design.md` (Bank + Stock v1). When these phases activate, each gets its own brainstorm → spec → plan cycle. Assumes v1 tables (`wealthflow_stocks` with REAL `shares`, `wealthflow_dividends`) exist.
**Context:** holder of VAS/VHY-style ETFs; Australian individual taxpayer rules throughout.

## 1. Buy/sell trades + parcels

A trade is an immutable event: `date | stock | side (buy/sell) | quantity | price | brokerage/fees`. Each buy creates a **parcel (lot)** `{qty, price, date, brokerage}` — the unit CGT is computed on. Sells allocate across parcels (default FIFO; specific parcel selection later — real design decision, not just UI). v1 `shares` becomes a derived cached total (sum of parcel quantities).

New tables (names reserved): `wealthflow_trades`, `wealthflow_parcels` (derived, rebuildable), `wealthflow_disposals` per sale-allocation `{trade, parcel, qty, proceeds, cost_base, nominal_gain, discount_eligible, discounted_gain}`. Guard: cannot sell more than held.

## 2. Cost base / CGT (Australian rules that shape the design)

* **Cost base ≈ price + brokerage** per parcel (covers ~all listed-share cases; other statutory elements out of scope).
* **Nominal gain** = proceeds − cost base, computed per parcel-share sold.
* **50% discount:** parcels held ≥ 12 months. Every disposal needs per-parcel age arithmetic.
* **Loss ordering (load-bearing):** capital losses offset gains BEFORE the discount; losses carry forward indefinitely. FY summary must apply this order or numbers are wrong. Carried-forward loss balance needs its own persistent record (reserved: `wealthflow_capital_losses` or a settings key — decided at spec time).
* **ETF sting (our case):** VAS/VHY are AMITs; annual tax statements carry **cost-base adjustments** (up and down) with no trade attached. Without an adjustment-event concept, parcel cost bases drift every July. Reserved: `wealthflow_cost_base_adjustments {parcel/event, date, amount, reason}`.
* Service: `getCapitalGainsSummary(fy)` → `{gross_gains, losses_applied, net_discounted}` — designed Tax-extension input. Views: trades view, parcel ledger, CGT report (shapes deferred to spec).

## 3. DRP automation

One event, two tax consequences: (a) dividend assessable + franking as normal (already in `wealthflow_dividends`); (b) cash converts to new shares = **new parcel** (acquisition date = payment date, cost base = reinvested amount, often DRP-discount price, zero brokerage, fractional qty — the reason v1 `shares` is REAL).

Implementation: `drp: true` + `reinvested_amount`/`new_shares` on the dividend record → auto-creates parcel + bumps holding. Design-against failure: recording only one side (missing income XOR missing parcel).

## 4. Sequencing (each independently shippable, in order)

1. Trades + parcels (`shares` becomes derived).
2. Disposals + discount/loss ordering (+ loss-balance record).
3. DRP linking.
4. AMIT adjustments.
5. Tax feed (`getCapitalGainsSummary`).

## 5. Open questions for the future brainstorm

FIFO default vs specific-identification UI; loss-balance storage shape; wash-sale handling (likely explicit non-goal); small-business concessions (non-goal); super accounts (different discount — out of scope while individual-only).

## Self-review

1. **Placeholders:** none — all deferred items named with a home (§4/§5).
2. **Consistency:** builds only on v1 tables/patterns; no contradiction with the main spec (service additive, same `wealthflow` name).
3. **Scope:** deliberately concept-only; detailed manifest/UI/service shapes belong to the future spec cycle.
4. **Ambiguity:** discount stated as ≥ 12 months individual rule; loss ordering explicit; `gross` meaning inherited from main spec §10 self-review.
