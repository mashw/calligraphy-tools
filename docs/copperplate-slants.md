# Copperplate slant styles

`feature/curvature-aware-slants-option` starts directly at Woven source commit
`91d0745c977abb283ba8cd666c2d2d4f15093a8f`.

## Settings and compatibility

- **Classic (straight)** retains the existing offset-endpoint segments and is the
  default for Curve, Calligram, Path Guides and Layout. `buildGuideSet()` callers
  which omit `slantStyle` receive the original geometry.
- **Flowing (curvature-aware)** integrates the local slant through the offset
  strip. It remains Woven's default, including when opening older Woven files.
- Curve and Calligram have one selector covering every enabled Copperplate band,
  including mixed-script designs. Layout stores the selection per curved-title
  or calligram element. Path Guides stores it per strap; compatible joined
  chains must have the same style and generate one shared pattern along their
  combined baseline. Selecting a style in Path Guides reveals detailed guides.
- No saved-design version changes are required. Existing Layout designs default
  missing styles to Classic; new selections survive Save/Open. Path Guides'
  exported preset JSON carries each strap's selection. Standalone Curve and
  Calligram do not currently offer whole-design Save/Open; their existing local
  storage is calibration-only and is unchanged.

## Geometry and rendering

`src/lib/guides/slant-paths.ts` owns the algorithm extracted from Woven. In
baseline arc length `s` and signed normal offset `u`, the local constant-angle
condition is `ds/du = -cot(angle) / (1 - curvature*u)`. Integration retains the
original 0.15 mm maximum transverse step and curvature sampling. It stops before
an invalid offset cusp rather than bridging folded geometry.

Open paths extrapolate tangents for generation, then trim in intrinsic route
coordinates so partial end slants remain visible. Closed paths wrap sampling and
use the existing evenly spaced seam pattern. Both guide orientation signs and
inverted guides use signed offsets. Woven retains its original route spacing,
angle/secondary angle controls and per-passage over/under clipping; Classic
chords are additionally clipped to the curved band.

GuideOverlay renders the new polylines under the existing band clips and Path
Guides crossing masks. Layout's plotter exporter serializes the same polylines;
its slant-guide option controls Copperplate slants in both styles. Preview zoom
and pan do not enter the geometry generator. Existing SVG, PDF and Print flows
are reused; Woven PDF remains vector. Other tools retain their existing raster
PDF/Print pipelines.

## Validation

- TypeScript and production build pass. This environment requires
  `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` for the existing Google Fonts
  build downloads.
- `npm run test:slant-styles`: 11 tests covering straight/circular/S/reversed
  paths, seams, endpoints, cusps, Woven crossings, mixed-script/multiple-band
  models, saved defaults/round trips, physical plotter export, chord clipping
  and joined-baseline phase.
- `npm run test:woven`: existing 10 tests pass, including local angle accuracy.
- Existing Insular, custom-curve, blackletter, construction-marker/offset and
  polyline-dash suites pass.
- 48 exact sampled-path comparisons confirm the extracted Flowing algorithm
  preserves original Woven behavior.
- 32 exact guide-set comparisons against the source implementation pass for
  Classic/omitted styles, including both orientation signs and inverted guides.
- New files and Woven pass lint. Existing-file lint diagnostics match the source
  branch exactly (59 diagnostics across the inspected files); no new diagnostics.
- Layout Shapes remains at 38/39 passing on both this branch and the untouched
  source commit. The existing failure is the source-text assertion
  `overlapping elements warn without repositioning guideline text`.
- Chromium checks cover both modes, SVG geometry, PDF/Print, preview zoom,
  standalone mixed bands, per-strap defaults/preset JSON, Woven Save/Open and
  Layout element settings/save behavior.

## Limits

A singular offset does not define a valid writing strip; Flowing lines terminate
there and may not reach the far rail. Path Guides' pre-existing restriction on
closed joined-guide chains remains: individual closed straps are supported, but
its join builder only emits open chains. Print checks validate generated output
and physical dimensions, not a physical printer. Existing page styling and
unrelated diagnostics are outside this change.
