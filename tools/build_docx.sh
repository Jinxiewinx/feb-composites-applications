#!/bin/bash
# Fallback docx builder (pandoc) — use only if the python-docx path breaks
# (e.g. venv/lxml unavailable on a future Python). Primary: build_docx.py.
# Fidelity note: header blocks render as plain first-page tables via pandoc.
set -euo pipefail
cd "$(dirname "$0")/.."

REF="02 CS Standards/template/reference.docx"
[ -f "$REF" ] || pandoc -o "$REF" --print-default-data-file reference.docx

pandoc "01 Pain Points and Improvements/src/pain-points.md" \
  --reference-doc="$REF" -o "01 Pain Points and Improvements/SN5 Pain Points and Improvements.docx"

for f in "02 CS Standards/src"/CS-*.md; do
  title=$(head -1 "$f" | sed 's/^# //; s#[/:]#-#g')
  pandoc "$f" --reference-doc="$REF" -o "02 CS Standards/${title}.docx"
  echo "built ${title}.docx"
done
pandoc "02 CS Standards/template/CS-Template.md" --reference-doc="$REF" \
  -o "02 CS Standards/template/CS-Template.docx"
echo done
