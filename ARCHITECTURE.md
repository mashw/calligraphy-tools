# Calligraphy Tools — Architecture

## Overview

This app generates calligraphy layout previews and exports (SVG/PDF/print) for multiple scripts (Copperplate, Textura/Blackletter, etc.). The core requirement is that **all tools share one measurement pipeline** that outputs per-glyph advances in millimetres, while each tool handles only layout (straight baseline, curve, full-page planner).

## Key concept: measure first, layout second

1. **Measure**: Convert text to a `MeasuredRun` (per-glyph `advMM`) using a `ScriptProfile`.
2. **Layout**: Place those advances onto a geometry:

   * Align tool: straight baseline placement
   * Curve tool: arc-length placement along a curve/path
   * Future full-page planner: composes multiple layouts on one canvas (titles + lines + guides)

## Shared measurement API

### `measureRun(text, profile, ctx) → MeasuredRun`

Location: `src/lib/measure/measure-run.ts`

Outputs:

* `glyphs[]`: each glyph has `wMM` (body width) and `advMM` (advance including spacing)
* `totalAdvanceMM`

### Script profiles

Location: `src/lib/scripts/**`

* Each script registers in `src/lib/scripts/index.ts` and provides either:

  1. **Unit-based** measurement (nib units → mm) — e.g., Textura Quadrata
  2. **Override-based** measurement — Copperplate

## Copperplate measurement

Copperplate uses an existing engine (joins, entry/exit, word-space model, cap presets).

* Core engine files:

  * `src/lib/line-widths.ts`
  * `src/lib/copperplate-widths.ts`
* Copperplate profile:

  * `src/lib/scripts/copperplate.ts` uses `measureRunOverride` to wrap the engine and output `MeasuredRun`.

Calibration behavior:

* Calibration affects lowercase + spacing only.
* Capitals use `capStyle` presets (simple/flourished); no capital calibration.

## Textura Quadrata measurement

Textura Quadrata uses nib units.

* Profile: `src/lib/scripts/textura-quadrata.ts`
* Rules:

  * glyph widths in nib units
  * inter-letter space = 1 nib
  * inter-word space = 2 nib
  * punctuation default = 1 nib, '?' = 2 nib
* Conversion: `nibMM` determines mm per nib.

## Tool architecture

### GuideTemplate overlays

Tools render a shared **GuideTemplate** overlay appropriate to the active script and geometry (straight baseline vs curved baseline). Align/Curve pages should not duplicate guide drawing logic; they should call shared builders and render the reusable overlay layer.

### Align tool (`src/app/align/page.tsx`)

* Owns UI state (text, x-height, alignment, calibration inputs)
* Calls shared measurement (Copperplate via engine / Quadrata via unit profile)
* Produces line segments for preview rendering
* Exports via shared export helpers

### Curve tool (`src/app/curve/page.tsx`)

* Owns UI state (curve geometry, zoom/pan, dragging)
* Calls shared measurement for the chosen script
* Uses shared curve layout engine to place `MeasuredRun` onto a curve/path
* Exports via shared export helpers

## Reuse for future tools

A future “full-page planner” should:

* Reuse measurement (`measureRun`)
* Reuse align placement helpers for body text
* Reuse curve placement helpers for titles
* Render on one shared canvas/preview component without duplicating measurement logic

## Invariants

* Measurement output is always in **millimetres**.
* Scripts are selected via `SCRIPT_PROFILES`.
* Pages should not own script width tables or per-script spacing heuristics.
