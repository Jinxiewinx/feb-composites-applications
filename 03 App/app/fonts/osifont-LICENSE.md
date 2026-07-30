# osifont — the drawing lettering

`osifont-iso3098.woff2` is a **subset** of osifont, the free typeface that
implements the ISO 3098 lettering specification for engineering drawings. It is
what FreeCAD ships as its default drawing font.

- Upstream: <https://github.com/hikikomori82/osifont>
- Version subset here: 0.1.20221020
- Author: Zefram Cochrane, <hikikomori82@gmail.com>
- Licence: **GNU GPL v3 with the GPL font exception**, as stated in the font's
  own name table. The font exception means a document that merely *embeds* or
  *renders with* this font is not itself covered by the GPL — so printing a mold
  drawing with it puts no obligation on anything else in this repo.

## What was changed

Subset to the characters the drawing sheets actually use, and converted to
WOFF2, with `pyftsubset` (fontTools 4.63):

```
pyftsubset osifont.ttf --output-file=osifont-iso3098.woff2 --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,\
U+2022,U+2026,U+2248,U+2212,U+25C2,U+25B8,U+2190-2193,U+00BC-00BE" \
  --layout-features="" --no-hinting --desubroutinize \
  --name-IDs="0,1,2,3,4,5,6,13,14"
```

126 KB of TTF becomes 9.4 KB. Nothing was redrawn; re-run the command above on a
fresh upstream `osifont.ttf` to reproduce or to widen the character set.

## Why it is bundled rather than named in a font stack

Drawing sheets get printed on whatever laptop is next to the ShopSabre. A font
stack that falls back changes text metrics, and changed metrics is precisely how
a dimension label ends up sitting on a line — the failure `tools/test_drawings.mjs`
exists to catch. The test can only speak for what everyone else sees if everyone
else gets the same glyphs.

**Note for whoever widens the drawings:** osifont has no U+2033 ″ (double prime).
The sheets use a plain `"` for the inch mark, which is ordinary drawing notation
and, more to the point, is a glyph this font actually has. Reaching for ″ silently
falls back to another face mid-dimension.
