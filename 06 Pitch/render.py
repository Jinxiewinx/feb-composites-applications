#!/usr/bin/env python3
"""Render a .pptx to one PNG per slide, for looking at.

There is no pdftoppm in this environment, so the usual
soffice -> pdf -> pdftoppm chain stops halfway. This does the same job with
PyMuPDF, which is installed.

    python3 render.py sn6-app-deck.pptx            -> render/slide-01.png ...
    python3 render.py sn6-app-deck.pptx render-a   -> render-a/slide-01.png ...

Prints the absolute path of every PNG it wrote, one per line, so the paths can
be handed straight to a viewer.
"""

import subprocess
import sys
from pathlib import Path

SOFFICE = "/root/.claude/skills/pptx/scripts/office/soffice.py"
DPI = 110  # enough to read 10pt body copy, small enough to view many at once


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip())
        return 2

    pptx = Path(sys.argv[1]).resolve()
    if not pptx.exists():
        print(f"no such file: {pptx}", file=sys.stderr)
        return 1

    out = Path(sys.argv[2] if len(sys.argv) > 2 else "render").resolve()
    out.mkdir(parents=True, exist_ok=True)
    for stale in out.glob("slide-*.png"):
        stale.unlink()

    # LibreOffice writes the PDF beside the source, named after it.
    subprocess.run(
        [sys.executable, SOFFICE, "--headless", "--convert-to", "pdf",
         "--outdir", str(pptx.parent), str(pptx)],
        check=True, capture_output=True,
    )
    pdf = pptx.with_suffix(".pdf")
    if not pdf.exists():
        print(f"LibreOffice produced no PDF for {pptx.name}", file=sys.stderr)
        return 1

    import fitz  # PyMuPDF

    doc = fitz.open(pdf)
    written = []
    for i, page in enumerate(doc, start=1):
        png = out / f"slide-{i:02d}.png"
        page.get_pixmap(dpi=DPI).save(png)
        written.append(png)
    doc.close()

    for p in written:
        print(p)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
