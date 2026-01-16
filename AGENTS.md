# Calligraphy Tools — Agent Instructions (AGENTS.md)

## Goals

* Keep all scripts measured through a single shared measurement API.
* Keep page components thin: UI/state only. Move measurement/layout/export logic into `src/lib/**` and reusable components/hooks.

## Source of truth

* **Measurement API**: `src/lib/measure/measure-run.ts` exports `measureRun(text, profile, ctx)`.
* **Script registry**: `src/lib/scripts/index.ts` exports `SCRIPT_PROFILES` and `ScriptId`.
* **Copperplate measurement** must use the existing Copperplate engine (override path), not nib-units.

## Non-negotiables

* Do NOT reintroduce per-tool width math in `src/app/**/page.tsx`.
* Do NOT add new `*-widths.ts` tables for broad-edge scripts. Use ScriptProfiles instead.
* Do NOT try to "convert Copperplate to nib units". Copperplate remains its own model and is wrapped via `measureRunOverride`.
* Keep output units consistent: measurement outputs in **millimetres**.

## Copperplate specifics

* Copperplate widths are ratios relative to x-height (or module) and are converted to mm through the Copperplate engine.
* Calibration applies to lowercase + spacing only. Capitals are controlled by `capStyle` presets.
* Curve/Align must reuse shared Copperplate context creation code (no copy-pasted calibration math in pages).

## Broad-edge specifics (Textura Quadrata for now)

* Broad-edge scripts use **nib unit** widths and spacing converted to mm with `nibMM`.
* Inter-letter spacing: 1 nib
* Inter-word spacing: 2 nib
* Punctuation default: 1 nib, question mark: 2 nib

## Refactor guidance

Prefer extracting into these folders:

* `src/lib/measure/**` — shared measurement and conversion helpers
* `src/lib/scripts/**` — script profiles, context types, registry
* `src/lib/curve/**` — curve layout engine (placement along path)
* `src/lib/align/**` — align layout helpers (straight placement)
* `src/lib/export/**` — SVG/PDF/print helpers

## Code quality expectations

* TypeScript strict mode must pass.
* Avoid duplicated constants (centralize in lib).
* Add small unit-test-like pure helpers when possible (even without a test runner).
* Keep functions pure where possible (inputs → outputs).
