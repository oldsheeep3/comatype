#!/usr/bin/env python3
"""Builds the Comatype logo files (SVG) in this directory.

The mark is a "C" ring whose top stroke continues into the bar of a "T"; the stem of the T ends in an arrowhead
(one definition, generated downwards). The wordmark is the text "Comatype" converted to outlines (Inter SemiBold,
SIL Open Font License) so it renders the same everywhere without the font.

    uv run --with fonttools python3 assets/logo/build.py /path/to/inter-latin-600-normal.woff
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).parent
FONT = TTFont(sys.argv[1])
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
UPM = FONT["head"].unitsPerEm

INDIGO = "#4f46e5"
INDIGO_DARK = "#818cf8"
TEXT = "#1e1b4b"
TEXT_DARK = "#e0e7ff"

# The mark, in a 512 box (stroke 54, round caps): the C ring, the T bar and the T stem with an arrowhead
MARK_D = "M331 345A132 132 0 1 1 230 128L410 128M340 128L340 246M300 206L340 246L380 206"
MARK_BOX = (75, 105, 433, 415)  # x0, y0, x1, y1 of the stroked mark


def mark_path(color: str) -> str:
    return f'<path d="{MARK_D}" fill="none" stroke="{color}" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>'


def text_path(text: str, size: float, x: float, baseline: float) -> tuple[str, float]:
    """Outline `text` at `size` px; returns (svg path data, advance width)."""
    scale = size / UPM
    pen = SVGPathPen(GLYPHS)
    cursor = 0.0
    for ch in text:
        name = CMAP[ord(ch)]
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x + cursor * scale, baseline))
        GLYPHS[name].draw(tpen)
        cursor += GLYPHS[name].width
    return pen.getCommands(), cursor * scale


def icon_svg() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Comatype">
  <title>Comatype</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  {mark_path("#fff")}
</svg>
"""


def mark_svg(color: str) -> str:
    x0, y0, x1, y1 = MARK_BOX
    pad = 12
    w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0 - pad} {y0 - pad} {w} {h}" width="{w}" height="{h}" role="img" aria-label="Comatype">
  <title>Comatype</title>
  {mark_path(color)}
</svg>
"""


def horizontal_svg(mark_color: str, text_color: str) -> str:
    x0, y0, x1, y1 = MARK_BOX
    mark_h = 128.0
    s = mark_h / (y1 - y0)
    mark_w = (x1 - x0) * s
    gap = 36.0
    size = 112.0
    baseline = mark_h / 2 + size * 0.36
    d, adv = text_path("Comatype", size, mark_w + gap, baseline)
    width = mark_w + gap + adv + 4
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 {width + 4:.0f} {mark_h + 8:.0f}" width="{width + 4:.0f}" height="{mark_h + 8:.0f}" role="img" aria-label="Comatype">
  <title>Comatype</title>
  <g transform="translate({-x0 * s:.2f} {-y0 * s:.2f}) scale({s:.4f})">
    {mark_path(mark_color)}
  </g>
  <path d="{d}" fill="{text_color}"/>
</svg>
"""


(OUT / "logo-icon.svg").write_text(icon_svg())
(OUT / "logo-mark.svg").write_text(mark_svg(INDIGO))
(OUT / "logo-mark-dark.svg").write_text(mark_svg(INDIGO_DARK))
(OUT / "logo-horizontal.svg").write_text(horizontal_svg(INDIGO, TEXT))
(OUT / "logo-horizontal-dark.svg").write_text(horizontal_svg(INDIGO_DARK, TEXT_DARK))
print("wrote SVG files in", OUT)
