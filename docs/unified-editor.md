# Unified editor implementation

Base: latest main at the time of checkout. Work stays on feature/unified-editor-ui.

## Audit and plan

All nine routes use client-side React state. Guidelines, Curve and Calligram duplicate preview framing, numeric controls, tooltips and raster export calls. Path Guides has a separate pan convention and persistent design/preset state. Woven exports its vector scene directly; Knot has constrained camera panning and editable crossings. Line Planner uses pixels rather than paper coordinates. Layout keeps its geometry/renderers and plotter export separate, but properties sit below the stage in a horizontal accordion. Borders is an experimental geometry laboratory, including a separate primitive lab that must remain accessible.

The project uses Next 16, React 19 and Tailwind 4 without a component framework. Shared renderers, geometry, design parsers and export libraries live under components/ and lib/. Existing Node tests cover script models, shape geometry, curves, design files, weaving and slant styles. No browser tests existed.

Problems: tall repeated headers; disconnected settings and preview; incompatible fixed zoom multipliers; SVG letterboxing makes pointer deltas inaccurate; horizontal accordion rails consume width; controls use viewport breakpoints inside narrow inspectors; no suite navigation or useful root route; inconsistent dark mode conflicts with hardcoded light controls.

1. Add tokens, shared navigation, workspace slots and vertical disclosures; retain every settings subtree and action.
2. Add a dimension-aware SVG camera with pure tested fit/zoom math, explicit page/content adapters and modifier pan that does not steal object edits.
3. Migrate every route to preview/inspector slots, retaining renderers, document state and exports.
4. Add browser coverage, inspect responsive layouts, run existing tests, lint and build. Record verification limits honestly.

## Intentional interaction changes

Fit modes now frame the full page or relevant design with screen-space padding instead of fixed enlargement. Custom zoom is centered and bounded; modifier wheel zoom anchors at the pointer. Alt-drag or middle-drag pans in all tools. Background drag also pans except in Layout, where plain pointers retain selection. Narrow layouts keep a compact preview visible above a scrolling inspector. Settings use independently expandable vertical sections, with per-selection state in Layout.

Physical geometry, default document settings, parsers and export pipelines remain separate from the camera.
