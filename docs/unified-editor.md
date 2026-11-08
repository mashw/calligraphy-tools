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

## Validation (6 November 2026)

- TypeScript: `npx tsc --noEmit` passes.
- Existing npm test scripts: Woven 10/10; Layout shapes 39/39; custom curves 6/6; Insular/design files 12/12; slant styles 11/11.
- Camera regression suite: 57/57, including portrait/landscape/wide bounds, six widths, three heights, padding, focal points and custom resizing.
- Additional source test discovery: all 29 tests under src/ pass (some overlap with npm scripts).
- Corrected a pre-existing source assertion in the Layout tests: it expected `avoidOccludingElements:false` before the called function name, whereas JavaScript places that option inside the call. The production implementation was not changed for this correction.
- Lint runs but is not clean: 52 errors and 96 warnings, compared with 64 errors and 101 warnings on untouched main. These include existing React compiler/effect findings and unused geometry code. Shared editor modules have no lint findings.
- Production build passes, including static generation of all 13 pages. Windows sandbox workers intermittently fail with EPERM creating generated `.next/server/app/*.segments/*` directories. Pre-creating those generated directories during compilation allowed the final build to complete; no build configuration workaround is committed.
- All nine production routes load with camera and inspector present.
- Connected-browser checks covered all nine tools at 360, 390, 768, 1024 and 1440 CSS pixels, plus 390 × 640. No page-level or inspector horizontal overflow remained. The requested 1920 override was capped at roughly 1632 CSS pixels by the browser surface; true 1920 and the three-region Layout arrangement need manual review.
- Verified camera zoom/reset, a Guidelines SVG download with 210 × 297 mm dimensions and physical page viewBox, Layout keyboard creation/duplication/deletion, and the narrow Cricut dialog. The document/export pipelines and geometry libraries are retained.
- Playwright regression specs are included (`npm run test:ui`; install Chromium with `npx playwright install chromium`). The standalone Edge launcher failed in the Windows sandbox, so those specs were not executed here; browser verification used the connected browser instead.

## Remaining manual review

Review pointer dragging/resizing/rotation/snapping, imported/custom SVGs, multi-strap joins and crossing overrides with real designs; compare SVG/PDF/Cricut exports and physically print the calibration ruler at 100%. Review 1920 px, browser zoom, tablet touch, and shorter laptop heights. Existing tiny server/client floating-point hydration differences were observed in development previews; specialist renderer hydration should be checked separately. The connected browser's screenshot capture clipped emulated viewports, so saved screenshots are partial visual evidence, not a complete before/after gallery.

Path Guides design files now optionally include a camera snapshot. Old design and preset data remain readable. View navigation is separate from geometry, and fit framing is frozen when specialist pointer edits begin.

## Density refinement (7 November 2026)

See [density-refinements.md](density-refinements.md) for the latest refinements and verification. The follow-up successfully runs Playwright and checks true 1920 px layouts, superseding the initial pass's browser-runner and viewport limitations.
