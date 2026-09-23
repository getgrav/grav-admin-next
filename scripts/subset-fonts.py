#!/usr/bin/env python3
"""
Split the self-hosted Google Sans variable fonts into per-script subsets.

The source fonts (scripts/fonts/*.woff2) cover about 3,300 characters across
some thirty scripts and weigh 1.4 MB (upright) and 1.6 MB (italic). The browser
downloaded all of it on first visit, even though an English admin only ever
draws Basic Latin. Each subset below is declared with its own unicode-range, so
the browser only fetches the files for characters that actually appear.

What changes, and what does not:
  - The wght (400-700) and opsz (17-18) axes stay variable.
  - The GRAD axis is pinned to its default (0). Nothing in the admin sets
    font-variation-settings, so it was dead weight.
  - Every script the source covers stays covered. Scripts no admin language
    uses (Indic, Thai, Ethiopic, Armenian and so on) get a file each, fetched
    only when such text is on screen; stray symbols land in `other`.

Run it from the repo root after replacing a source font:

    python3 -m venv /tmp/ftvenv && /tmp/ftvenv/bin/pip install fonttools brotli
    /tmp/ftvenv/bin/python scripts/subset-fonts.py

It rewrites static/fonts/ and src/routes/google-sans.css.
"""

from __future__ import annotations

import hashlib
import io
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / 'scripts' / 'fonts'
OUT_DIR = ROOT / 'static' / 'fonts'
CSS_FILE = ROOT / 'src' / 'routes' / 'google-sans.css'

SOURCES = [
    ('google-sans', 'normal', 'GoogleSans-VariableFont_GRAD_opsz_wght.woff2'),
    ('google-sans-italic', 'italic', 'GoogleSans-Italic-VariableFont_GRAD_opsz_wght.woff2'),
]

# Marks every Indic subset needs: the Vedic tone marks, danda, the joiners,
# the rupee sign and the dotted circle that shapers draw for a lone mark.
INDIC = 'U+0951-0952, U+0964-0965, U+200C-200D, U+20B9, U+25CC'

# Ranges follow the ones Google Fonts serves, so the split matches what
# browsers already handle well. Order matters: a code point goes to the first
# subset that lists it, and `other` takes whatever is left.
SUBSETS: list[tuple[str, str]] = [
    ('latin', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'),
    ('latin-ext', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'),
    ('vietnamese', 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB'),
    ('cyrillic', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'),
    ('cyrillic-ext', 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F'),
    ('greek', 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF'),
    ('greek-ext', 'U+1F00-1FFF'),
    ('hebrew', 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F'),
    # Scripts no admin language uses, one file each, so a single Thai or
    # Devanagari page title costs tens of kilobytes rather than the lot.
    ('devanagari', INDIC + ', U+0900-097F, U+1CD0-1CF9, U+A830-A839, U+A8E0-A8FF'),
    ('bengali', INDIC + ', U+0980-09FE'),
    ('gurmukhi', INDIC + ', U+0A01-0A76'),
    ('gujarati', INDIC + ', U+0A81-0AFF'),
    ('oriya', INDIC + ', U+0B01-0B77'),
    ('tamil', INDIC + ', U+0B82-0BFA'),
    ('telugu', INDIC + ', U+0C00-0C7F'),
    ('kannada', INDIC + ', U+0C80-0CF3'),
    ('malayalam', INDIC + ', U+0D00-0D7F'),
    ('sinhala', INDIC + ', U+0D81-0DF4'),
    ('thai', 'U+0E01-0E5B, U+200C-200D, U+25CC'),
    ('lao', 'U+0E81-0EDF, U+200C-200D, U+25CC'),
    ('khmer', 'U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC'),
    ('ethiopic', 'U+1200-139F, U+2D80-2DDE, U+AB01-AB2E'),
    ('georgian', 'U+10A0-10FF, U+1C90-1CBF, U+2D00-2D2F'),
    ('armenian', 'U+0530-058F, U+FB13-FB17'),
]


def parse_ranges(spec: str) -> set[int]:
    cps: set[int] = set()
    for part in spec.split(','):
        part = part.strip().removeprefix('U+')
        if '-' in part:
            lo, hi = part.split('-')
            cps.update(range(int(lo, 16), int(hi, 16) + 1))
        else:
            cps.add(int(part, 16))
    return cps


def format_ranges(cps: set[int]) -> str:
    """Collapse code points into a compact unicode-range list."""
    out: list[str] = []
    ordered = sorted(cps)
    start = prev = ordered[0]
    for cp in ordered[1:] + [None]:
        if cp is not None and cp == prev + 1:
            prev = cp
            continue
        out.append(f'U+{start:04X}' if start == prev else f'U+{start:04X}-{prev:04X}')
        if cp is not None:
            start = prev = cp
    return ', '.join(out)


def instance_without_grad(path: Path) -> TTFont:
    # Keep the source's timestamp so an unchanged source gives identical
    # files (and file names) on every run.
    font = TTFont(path, recalcTimestamp=False)
    axes = {a.axisTag for a in font['fvar'].axes}
    if 'GRAD' in axes:
        font = instancer.instantiateVariableFont(font, {'GRAD': 0})
    return font


def subset_font(font_bytes: bytes, unicodes: set[int]) -> bytes:
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.glyph_names = False
    buf = io.BytesIO()
    # A fresh copy each time: the subsetter prunes the font in place.
    work = TTFont(io.BytesIO(font_bytes), recalcTimestamp=False)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(work)
    work.flavor = 'woff2'
    work.save(buf)
    return buf.getvalue()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob('google-sans*.woff2'):
        old.unlink()

    css = [
        '/*',
        ' * Google Sans, variable (wght 400-700, opsz 17-18), split per script.',
        ' * Generated by scripts/subset-fonts.py; do not edit by hand.',
        ' */',
    ]
    report: list[str] = []

    for stem, style, filename in SOURCES:
        source = SOURCE_DIR / filename
        font = instance_without_grad(source)
        cmap = set(font.getBestCmap())
        instanced = io.BytesIO()
        font.save(instanced)
        font_bytes = instanced.getvalue()
        taken: set[int] = set()
        plan: list[tuple[str, set[int]]] = []

        for name, spec in SUBSETS:
            wanted = parse_ranges(spec)
            present = (wanted & cmap) - taken
            if not present:
                continue
            taken |= present
            plan.append((name, wanted))
        rest = cmap - taken
        if rest:
            plan.append(('other', rest))

        total = 0
        blocks: list[list[str]] = []
        for name, cps in plan:
            data = subset_font(font_bytes, cps & cmap)
            digest = hashlib.sha256(data).hexdigest()[:8]
            out_name = f'{stem}-{name}.{digest}.woff2'
            (OUT_DIR / out_name).write_bytes(data)
            total += len(data)
            report.append(f'{out_name:48} {len(data) / 1024:8.1f} KB')
            # Declare the range the subset actually serves, not the whole
            # spec, so a character the font lacks never triggers a download.
            blocks.append([
                f'/* {name} */',
                '@font-face {',
                "\tfont-family: 'Google Sans';",
                f"\tsrc: url('/fonts/{out_name}') format('woff2');",
                '\tfont-weight: 400 700;',
                f'\tfont-style: {style};',
                '\tfont-display: swap;',
                f'\tunicode-range: {format_ranges(cps & cmap)};',
                '}',
            ])
        # Where ranges overlap (the joiners, the dotted circle), the browser
        # tries the face declared LAST first, so latin goes last, as Google
        # Fonts orders it. Otherwise a stray U+200C would fetch Khmer.
        for block in reversed(blocks):
            css += block
        report.append(f'{stem} total: {total / 1024:.1f} KB (source {source.stat().st_size / 1024:.1f} KB)')

    CSS_FILE.write_text('\n'.join(css) + '\n')
    print('\n'.join(report))


if __name__ == '__main__':
    main()
