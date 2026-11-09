#!/usr/bin/env python3
"""Builds the Comatype logo files (SVG) in this directory.

The mark is a chubby bear in a food coma ("coma"): round cheeks, closed eyes, a snot bubble and a floating "z".
The wordmark is the text "Comatype" converted to outlines (Inter SemiBold, SIL Open Font License) so it renders
the same everywhere without the font.

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

# palettes: body, inner ear / muzzle, features (eyes, nose, mouth), blush, bubble and z
ICON = dict(body="#fff4dc", muzzle="#ffffff", ear="#f9c6d0", line="#2e2670", blush="#f9a8b8", accent="#c7d2fe")
LIGHT = dict(body="#4f46e5", muzzle="#c7d2fe", ear="#a5b4fc", line="#1e1b4b", blush="#f9a8d4", accent="#818cf8")
DARK = dict(body="#818cf8", muzzle="#e0e7ff", ear="#c7d2fe", line="#1e1b4b", blush="#f9a8d4", accent="#c7d2fe")
TEXT = "#1e1b4b"
TEXT_DARK = "#e0e7ff"

# The bear lives in a 512 box: x 56..456, y 60..440
BOX = (56, 60, 456, 440)


def bear(p: dict) -> str:
    return f"""<g>
    <circle cx="136" cy="196" r="58" fill="{p['body']}"/>
    <circle cx="136" cy="196" r="30" fill="{p['ear']}"/>
    <circle cx="376" cy="196" r="58" fill="{p['body']}"/>
    <circle cx="376" cy="196" r="30" fill="{p['ear']}"/>
    <ellipse cx="256" cy="304" rx="196" ry="136" fill="{p['body']}"/>
    <ellipse cx="256" cy="338" rx="84" ry="58" fill="{p['muzzle']}"/>
    <ellipse cx="136" cy="338" rx="38" ry="24" fill="{p['blush']}" opacity="0.75"/>
    <ellipse cx="376" cy="338" rx="38" ry="24" fill="{p['blush']}" opacity="0.75"/>
    <path d="M150 288q32 30 64 0M298 288q32 30 64 0" fill="none" stroke="{p['line']}" stroke-width="15" stroke-linecap="round"/>
    <ellipse cx="256" cy="322" rx="30" ry="21" fill="{p['line']}"/>
    <path d="M256 343v12M234 365q22 18 44 0" fill="none" stroke="{p['line']}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="312" cy="334" r="19" fill="none" stroke="{p['accent']}" stroke-width="8"/>
    <path d="M398 74h52l-52 62h52" fill="none" stroke="{p['accent']}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M440 142h28l-28 34h28" fill="none" stroke="{p['accent']}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </g>"""


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
  <g transform="translate(25.6 25.6) scale(0.9)">
  {bear(ICON)}
  </g>
</svg>
"""


def mark_svg(p: dict) -> str:
    x0, y0, x1, y1 = BOX
    pad = 8
    w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0 - pad} {y0 - pad} {w} {h}" width="{w}" height="{h}" role="img" aria-label="Comatype">
  <title>Comatype</title>
  {bear(p)}
</svg>
"""


def horizontal_svg(p: dict, text_color: str) -> str:
    x0, y0, x1, y1 = BOX
    mark_h = 150.0
    s = mark_h / (y1 - y0)
    mark_w = (x1 - x0) * s
    gap = 28.0
    size = 112.0
    baseline = mark_h / 2 + size * 0.36
    d, adv = text_path("Comatype", size, mark_w + gap, baseline)
    width = mark_w + gap + adv + 4
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 {width + 4:.0f} {mark_h + 8:.0f}" width="{width + 4:.0f}" height="{mark_h + 8:.0f}" role="img" aria-label="Comatype">
  <title>Comatype</title>
  <g transform="translate({-x0 * s:.2f} {-y0 * s:.2f}) scale({s:.4f})">
  {bear(p)}
  </g>
  <path d="{d}" fill="{text_color}"/>
</svg>
"""


(OUT / "logo-icon.svg").write_text(icon_svg())
(OUT / "logo-mark.svg").write_text(mark_svg(LIGHT))
(OUT / "logo-mark-dark.svg").write_text(mark_svg(DARK))
(OUT / "logo-horizontal.svg").write_text(horizontal_svg(LIGHT, TEXT))
(OUT / "logo-horizontal-dark.svg").write_text(horizontal_svg(DARK, TEXT_DARK))
print("wrote SVG files in", OUT)
