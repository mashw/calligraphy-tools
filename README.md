Suite of calligraphy tools for...calligraphers.

### Woven Calligraphy (`/woven`)

Create an A4 writing sheet using a continuous six-loop rosette or figure-eight.
Adjust the shape, script proportions and start/end gap; click numbered crossings
to swap over/under. Save/open JSON designs and export clean or annotated vector
SVG/PDF sheets. Print PDFs at actual size and verify the 50 mm ruler.

This first version plans guidelines, not text. Text fitting, SVG import and
freeform curve editing are not implemented. Crossing clearance is calculated
from local tangents; inspect warnings and tight curves before writing. Changing
loop depth, preset or route direction resets manual crossing choices.

Run `npm run test:woven` for geometry, design validation and vector export tests.
