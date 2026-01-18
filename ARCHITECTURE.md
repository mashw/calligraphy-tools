# Calligraphy Tools — Architecture

## Overview

Calligraphy Tools generates calligraphy layout previews and exports (SVG/PDF/print) for multiple scripts
(Copperplate, Textura/Blackletter, etc.).

The core rule is:

> **Measure first, layout second.**
>
> Measurement is shared and produces millimetre-based advances.
> Each tool (Align, Curve, etc.) only decides how to place those advances onto geometry.

## Key pipeline

1) **Measure**
- Convert input text into a `MeasuredRun` with per-glyph metrics in **mm**.

2) **Layout**
- Place the measured run onto a geometry:
  - Align: straight baseline placement across lines
  - Curve: arc-length placement along a curve/polyline baseline

3) **Guides / Overlays**
- Build a `GuideSet` from the chosen `GuideTemplate` and the current baseline geometry.
- Render the `GuideSet` with the shared overlay component.

4) **Export**
- Export the same geometry/overlays to SVG/PDF/print.

## Measurement

### `measureRun(text, profile, ctx) → MeasuredRun`

Location: `src/lib/measure/measure-run.ts`

Output model (conceptually):
- `glyphs[]` with per-glyph:
  - `wMM` (body width)
  - `advMM` (advance including spacing)
  - `kind` (glyph/space/etc.)
- `totalAdvanceMM`

### Script profiles and context

- Script registry: `src/lib/scripts/index.ts` exports `SCRIPT_PROFILES` and `ScriptId`.
- Shared context type: `src/lib/scripts/types.ts`.

Profiles may be:
- **Unit-based**: widths/spaces defined in “units” then converted using `nibMM` (e.g. Textura Quadrata).
- **Override-based**: script provides its own measurement engine but still returns a shared `MeasuredRun` (Copperplate).

## Copperplate architecture

Copperplate is not a nib-unit script. It uses a dedicated measurement/model pipeline.

- Shared context builder:
  - `src/lib/copperplate/context.ts` is responsible for turning UI inputs (x-height, capStyle, calibration, userScaleFactor, userSpaceFactor)
    into a `ScriptContext` used by measurement.
- Calibration invariants:
  - calibration affects lowercase scale and spacing
  - capitals are controlled by `capStyle` presets (simple/flourished)

Current tool usage pattern:
- Align uses Copperplate line measurement through the Copperplate model pipeline (via `measureLines`),
  and uses `measureRun` for unit-based scripts.
- Curve uses `measureRun` for both scripts (Copperplate via override profile, unit scripts via unit profiles).

## Textura Quadrata architecture (unit-based)

Textura Quadrata uses nib units:

- Script profile: `src/lib/scripts/textura-quadrata.ts`
- Conversion parameter: `nibMM` (mm per nib)
- Spacing rules belong in profile/measurement helpers rather than page components.

## Guides and overlays

### Guide templates

Location: `src/lib/guides/guide-template.ts`

- A `GuideTemplateId` selects which guide logic to use (e.g. `blackletter`, `copperplate`).
- `buildGuideSet(templateId, params)` produces:
  - 4 guide polylines (asc/waist/base/desc) as point arrays
  - optional ticks (short guide segments)

### Geometry-aware guides

Guides are built against a baseline polyline:
- Align: baseline is typically straight
- Curve: baseline is a sampled curve polyline

This design makes guides “curve-aware” automatically:
- any guide line is constructed by offsetting from the baseline polyline
- ticks are constructed relative to local baseline direction/normal

### Rendering the overlay

Location: `src/components/preview/GuideOverlay.tsx`

- Draws guide polylines as SVG paths
- Draws ticks as SVG line segments
- Provides optional invisible “hit” paths for interactive dragging

## Tools

### Align tool

Location: `src/app/align/page.tsx`

Responsibilities:
- Own UI state (script, x-height, nib size, alignment, calibration controls)
- Build the correct `ScriptContext`
- Measure lines:
  - Copperplate: use Copperplate model line measurement
  - Unit-based scripts: use `measureRun` → `lineMetricFromMeasuredRun`
- Build stage framing and render preview
- Render guide overlay via `buildGuideSet` + `GuideOverlay`

Non-responsibilities:
- Do not embed per-script measurement rules in the page
- Do not implement guide geometry in the page

### Curve tool

Location: `src/app/curve/page.tsx`

Responsibilities:
- Own UI state (curve preset, rotation/scale transform, offsets, view mode, calibration controls)
- Build `ScriptContext` (Copperplate via shared context builder)
- Measure text via `measureRun`
- Build baseline polyline from curve sampling
- Build guides using `buildGuideSet(templateId, { baseline, xMM, ascMM, descMM, ... })`
- Place glyph boxes along arc-length on the baseline geometry
- Export using shared helpers

Non-responsibilities:
- Do not duplicate measurement rules from script profiles
- Keep curve math in shared helpers where possible (`src/lib/curve-helpers.ts`)

## Invariants

- Measurement outputs are always **millimetres**.
- Scripts are selected via `SCRIPT_PROFILES`.
- Pages must not own script width tables or per-script spacing heuristics.
- Geometry-sensitive logic (slant frames, curve tangents/normals, offset polylines) should be centralized and documented with invariants.
