# Density and control refinement — 7 November 2026

Continued from feature/unified-editor-ui at 82b752b. This is a targeted refinement of the existing unified design; rendering algorithms, document defaults and export pipelines are retained.

## Shared workspace changes

- Removed the separate DESIGN WORKSPACE row. The settings toggle uses the existing tool-heading space.
- Reduced stacked wrapper padding and toolbar gaps. Navigation help is now an inline keyboard/touch disclosure; Reset view uses a labelled compact icon on narrow screens.
- Added PreviewMeta for compact statistics and retained detailed instructions in help disclosures. Woven's crossing/route statistics and print/calibration instructions no longer occupy three stacked footer rows.
- Moved section help into disclosure headers and tool descriptions into an optional About this tool disclosure. Information remains accessible.
- Added ActionGroup layouts that do not collapse utility buttons into a single column at field breakpoints.

## Tool-specific changes

Line Planner: removed the extra card and grid shells around the settings sections, removed redundant section wrappers, folded preview instructions into shared help and tightened calibration actions.

Layout: removed the extra properties card, kept the selected-element heading, put all six alignment actions in one compact row (two at very small inspector widths), kept quick size in two rows, and retained a two-column rotation/reset row. On narrow screens, layers and properties share one scrolling settings region below the preview, preventing overlap and blocked pointer targets.

Woven: width, height, loop depth and rotation now have paired sliders and direct numeric entry. Numeric entry supports intermediate typing, fractional values and validation on blur. Uniform Scale (%) multiplies width and height together, clamping one common factor to the existing 50–400 mm limits so the aspect ratio is preserved. Direct width/height editing or opening a file starts a new 100% reference. Scaling retains nib sizes, guides and crossing overrides. Save/Open still uses the existing version-1 width/height fields; no format migration or default changes.

Guidelines: line statistics use the compact meta row. Curved Title, Calligram, Path Guides and Knot receive the shared toolbar, spacing, introduction and section-help improvements. Borders receives the shared preview changes and a flat controls stack instead of an extra boxed card.

## Measured canvas height

Same 390 × 844 CSS-pixel viewport, default documents, before versus final production build:

| Tool | Before (px) | After (px) |
| --- | ---: | ---: |
| /guidelines | 182 | 224 |
| /align | 271 | 299 |
| /curve | 238 | 259 |
| /calligram | 238 | 259 |
| /path-guides | 238 | 259 |
| /layout | 135 | 221 |
| /woven | 156 | 227 |
| /knot | 250 | 271 |
| /borders/dev | 291 | 297 |

At 1440 × 900, Woven's canvas increases from 509 to 688 px. All measured tools gain canvas height.

## Verification

- All existing npm unit suites pass, plus the four proportional-scaling tests: 139 unit tests total.
- All 14 Playwright tests pass. Coverage includes all nine routes at 360, 390, 768, 1024, 1440 and 1920 px; camera/reset and settings visibility; mobile and laptop Layout pointer actions; Line Planner panel structure; Woven fractional input, scaling, sliders and Save/Open; and physical SVG page dimensions after zoom.
- Additional browser measurements and screenshots cover 390 × 844, 768 × 900, 1024 × 768 and 1440 × 900 across all tools, plus 360 × 640. No page or inspector horizontal overflow was found.
- TypeScript and production build pass; all 13 pages are statically generated. The known Windows sandbox EPERM directory-creation issue required preparing generated segment directories during compilation; no build-configuration workaround is committed.
- Lint was run before and after: unchanged at 52 errors and 96 warnings. New shared components, shape-control utility and regression tests have no lint findings.
- The sandbox cancels OS file downloads. UI tests verify the actual download request/filename and inspect the generated Blob, including a real JSON Save/Open round trip, without changing the application's export code. Actual filesystem downloads and physical print output remain manual checks.

Development dependencies were not changed. Browser binaries were installed only in the task's scratch workspace to run the existing Playwright dependency. Nothing has been merged.
