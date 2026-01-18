# Calligraphy Tools — Agent Instructions (AGENTS.md)

## Goals

- Keep **all scripts** measured through a single shared measurement API that outputs **millimetres**.
- Keep page components thin: UI/state only. Move measurement/layout/export logic into `src/lib/**` and reusable components.
- Prefer shared “builders” (context, guides, layout) so Align/Curve stay consistent.

## Important file-naming note (ChatGPT Project uploads)

Some attached files may be **renamed copies of `page.tsx`** (e.g. `align.tsx`, `curve.tsx`) purely to avoid upload filename collisions.
Treat their **content** as authoritative; do **not** infer Next.js routing from the uploaded name unless explicitly stated.

## Source of truth

- **Measurement API**: `src/lib/measure/measure-run.ts` exports `measureRun(text, profile, ctx)`.
- **Script registry**: `src/lib/scripts/index.ts` exports `SCRIPT_PROFILES` and `ScriptId`.
- **Context types**: `src/lib/scripts/types.ts`.
- **Guide system**: `src/lib/guides/guide-template.ts` exports `buildGuideSet(...)`.
- **Overlay renderer**: `src/components/preview/GuideOverlay.tsx` draws guide polylines and ticks.

## Non-negotiables

- Do NOT reintroduce per-tool width tables / width math inside `src/app/**/page.tsx` for unit-based scripts.
- Do NOT attempt to “convert Copperplate to nib units”. Copperplate remains an override model and is wrapped into shared output types.
- Keep output units consistent: all measurements and placements are in **millimetres**.
- If geometry is involved (curve normals/tangents, slant frames, offsets), do not “patch blindly”. Document the invariant first, then change code.

## Copperplate specifics

- Copperplate uses the existing Copperplate engine + calibration model.
- A shared context builder must be used:
  - `src/lib/copperplate/context.ts` should be the single place that turns UI calibration inputs into `ScriptContext`.
- Calibration:
  - affects lowercase scale and spacing (via calibration inputs + userScaleFactor/userSpaceFactor)
  - capitals are controlled by `capStyle` presets (simple/flourished), not calibrated per-letter
- Tools should reuse the same Copperplate context construction logic (no duplicated calibration math in pages).

## Broad-edge specifics (Textura Quadrata and similar)

- Broad-edge scripts use unit-based measurement (nib units → mm), controlled by `nibMM`.
- Spacing rules should live in script profiles / measurement helpers, not tool pages.

## Codex vs manual

Every change proposal must include one of:

- **Use Codex** (and why), or
- **Do not use Codex; do this manually** (and why).

Default guidance:

- Use Codex for: refactors, wiring/plumbing, repetitive edits, renames, moving files, UI toggles, adding options, straightforward logic.
- Avoid Codex for: geometry, curve math, coordinate frames, normals/tangents, visual alignment, slant direction, bounding box geometry, guide placement along curves.

## Refactor guidance (preferred directories)

- `src/lib/measure/**` — shared measurement + conversions
- `src/lib/scripts/**` — script profiles, context types, registry
- `src/lib/guides/**` — guide templates + builders
- `src/lib/preview/**` — stage/framing helpers
- `src/lib/curve-helpers.ts` (or `src/lib/curve/**` if extracted later) — curve sampling, arc-length placement, transforms
- `src/lib/export/**` — SVG/PDF/print helpers

## Code quality expectations

- TypeScript strict mode must pass.
- Avoid duplicated constants (centralize in `src/lib/**`).
- Prefer pure helpers (inputs → outputs) for measurement and geometry.
