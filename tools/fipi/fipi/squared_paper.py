"""Задание 18: answers read off the squared paper itself.

The statement carries no numbers — «изображён ромб, найдите длину его большей
диагонали» — so everything is measured on the drawing: `raster.py` decodes the
picture, `lattice.py` turns it into vertices in cell units, and this module
turns those vertices into the number the answer field wants.

Where the question names a lettered side («средней линии, параллельной стороне
AC») the letters are drawn, not written, and reading them is a different job.
Rather than guess which side is meant, such a task returns the whole short list
of possible answers — three for a triangle's midlines — and ФИПИ's own checker
picks. That stays within the rule the collector works by: propose a finite set,
never search a free numeric answer.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

from .lattice import Sheet, read_figure
from .raster import Image, read_image
from .solver import format_answer

SQUARED_PAPER = re.compile(r"клетчат\w*\s+бумаг", re.IGNORECASE)


def _distance(a: tuple[int, int], b: tuple[int, int]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _ink_blobs(sheet: Sheet, minimum: int = 12, gap: int = 3) -> list[list[tuple[int, int]]]:
    """Groups of ink, largest first — one per drawn object.

    Ink is joined across a gap of a few pixels, because a paper line cuts every
    stroke it crosses: a circle arrives as a dozen arcs and a dot drawn on an
    intersection arrives as four corners. Bridging the cut puts each object
    back together before anything is measured.
    """
    image = sheet.image
    points = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if sheet.is_ink(x, y)
    }
    seen: set[tuple[int, int]] = set()
    blobs: list[list[tuple[int, int]]] = []
    for start in points:
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        blob: list[tuple[int, int]] = []
        while stack:
            cx, cy = stack.pop()
            blob.append((cx, cy))
            for dy in range(-gap, gap + 1):
                for dx in range(-gap, gap + 1):
                    point = (cx + dx, cy + dy)
                    if point in seen or point not in points:
                        continue
                    seen.add(point)
                    stack.append(point)
        if len(blob) >= minimum:
            blobs.append(blob)
    return sorted(blobs, key=len, reverse=True)


def _circles(sheet: Sheet) -> list[float]:
    """Radii in cells of the drawn circles, largest first.

    Measured off the bounding box of each group of ink, then snapped to the
    half-cell a compass would have been set to. This is the weakest reader in
    the module — unlike a straight side, a curve is cut by every paper line it
    crosses, and the pieces do not always regroup — so it declines far more
    often than it answers, and `solve_squared_paper` declines with it.
    """
    grid = sheet.grid()
    if grid is None:
        return []

    radii: list[float] = []
    for blob in _ink_blobs(sheet, minimum=60, gap=8):
        xs = [x for x, _ in blob]
        ys = [y for _, y in blob]
        width, height = max(xs) - min(xs), max(ys) - min(ys)
        # A circle's box is square; a stray label or an arc is not.
        if not 0.9 <= width / max(height, 1e-6) <= 1.11:
            continue
        # The box is drawn from the outside of a stroke about two pixels thick.
        measured = ((width + height) / 4 - 1) / grid.pitch_x
        snapped = round(measured * 2) / 2
        if snapped <= 0 or abs(measured - snapped) > 0.18:
            continue
        radii.append(snapped)
    return sorted(radii, reverse=True)[:2]


def _midline_of_trapezoid(outline: list[tuple[int, int]]) -> float | None:
    """Half the sum of the two parallel sides."""
    if len(outline) != 4:
        return None
    sides = [(outline[i], outline[(i + 1) % 4]) for i in range(4)]

    def direction(side) -> tuple[float, float]:
        (x1, y1), (x2, y2) = side
        length = _distance((x1, y1), (x2, y2))
        return ((x2 - x1) / length, (y2 - y1) / length) if length else (0.0, 0.0)

    for first, second in ((0, 2), (1, 3)):
        a, b = direction(sides[first]), direction(sides[second])
        if abs(abs(a[0] * b[0] + a[1] * b[1]) - 1) < 1e-6:
            return (_distance(*sides[first]) + _distance(*sides[second])) / 2
    return None


def _diagonals(outline: list[tuple[int, int]]) -> list[float]:
    if len(outline) != 4:
        return []
    return sorted(
        [_distance(outline[0], outline[2]), _distance(outline[1], outline[3])],
        reverse=True,
    )


def _legs_of_right_triangle(outline: list[tuple[int, int]]) -> list[float] | None:
    """The two sides meeting at the right angle, longest first."""
    if len(outline) != 3:
        return None
    for index in range(3):
        apex = outline[index]
        one, two = outline[(index + 1) % 3], outline[(index + 2) % 3]
        first = (one[0] - apex[0], one[1] - apex[1])
        second = (two[0] - apex[0], two[1] - apex[1])
        if first[0] * second[0] + first[1] * second[1] == 0:
            return sorted([_distance(apex, one), _distance(apex, two)], reverse=True)
    return None


def _sides(outline: list[tuple[int, int]]) -> list[float]:
    return [_distance(outline[i], outline[(i + 1) % len(outline)]) for i in range(len(outline))]


def _tidy(value: float) -> bool:
    """Whether a number looks like an ОГЭ answer rather than a measurement.

    A drawing on squared paper gives whole and half answers; √17 means the rule
    picked the wrong side of the figure, and proposing it would only spend a
    request to be told no.
    """
    return abs(value * 2 - round(value * 2)) < 1e-6


def _endpoints(sheet: Sheet) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Centres of exactly two small marks — the «две точки» drawings."""
    grid = sheet.grid()
    if grid is None:
        return None
    blobs = [blob for blob in _ink_blobs(sheet, minimum=6) if len(blob) <= 400]
    if len(blobs) != 2:
        return None
    centres = []
    for blob in blobs:
        xs = [x for x, _ in blob]
        ys = [y for _, y in blob]
        centres.append(
            (
                (sum(xs) / len(xs) - grid.xs[0]) / grid.pitch_x,
                (sum(ys) / len(ys) - grid.ys[0]) / grid.pitch_y,
            )
        )
    return centres[0], centres[1]


def _picture_for(task: dict, images_dir: str | Path) -> Image | None:
    for relative in task.get("images") or []:
        path = Path(images_dir) / task["guid"] / Path(relative).name
        if path.exists():
            try:
                return read_image(path)
            except ValueError:
                continue
    return None


def solve_squared_paper(task: dict, images_dir: str | Path) -> list[str] | None:
    """Candidate answers for one задание 18, or None when it is out of scope.

    The list is short by construction — one answer where the drawing settles
    the question, two or three where only a drawn letter would.
    """
    statement = " ".join(task.get("statement_text", "").split())
    if not SQUARED_PAPER.search(statement):
        return None

    image = _picture_for(task, images_dir)
    if image is None:
        return None
    sheet = Sheet(image)
    if sheet.grid() is None:
        return None

    lowered = statement.lower()

    # Two circles: the answer is how many times one area contains the other.
    # Only a pair measured cleanly counts — a circle broken by the paper lines
    # comes back in pieces, and two equal radii mean the pieces were mistaken
    # for the whole, since the question itself says one circle is the bigger.
    if "круг" in lowered and "во сколько раз" in lowered:
        radii = _circles(sheet)
        if len(radii) != 2 or radii[1] <= 0 or radii[0] == radii[1]:
            return None
        ratio = (radii[0] / radii[1]) ** 2
        # Both circles are drawn on the lattice, so the ratio is a tidy number;
        # anything ragged means the radii were measured off a smudge.
        if abs(ratio - round(ratio)) > 0.12:
            return None
        return [format_answer(round(ratio))]

    # Two marks and nothing else: the distance between them.
    if "две точки" in lowered or "расстояние между ними" in lowered:
        found = _endpoints(sheet)
        if found is None:
            return None
        (x1, y1), (x2, y2) = found
        value = math.hypot(x2 - x1, y2 - y1)
        if abs(value - round(value)) > 0.12:
            return None
        return [format_answer(round(value))]

    figure = read_figure(sheet)
    if figure is None:
        return None
    outline = figure.outline()
    if not outline:
        return None

    if "площад" in lowered:
        area = figure.area()
        if area <= 0:
            return None
        return [format_answer(area)]

    if "средней линии" in lowered or "среднюю линию" in lowered:
        if "трапеци" in lowered:
            midline = _midline_of_trapezoid(outline)
            return [format_answer(midline)] if midline else None
        if len(outline) == 3:
            # A midline is half the side it runs parallel to; which side the
            # letters name is not in the text, so all three are offered.
            halves = [side / 2 for side in sorted(_sides(outline), reverse=True)]
            return [format_answer(value) for value in halves if _tidy(value)] or None
        return None

    if "диагонал" in lowered:
        diagonals = _diagonals(outline)
        if not diagonals:
            return None
        if "больш" in lowered:
            return [format_answer(diagonals[0])]
        if "меньш" in lowered:
            return [format_answer(diagonals[-1])]
        return [format_answer(value) for value in diagonals]

    if "катет" in lowered:
        legs = _legs_of_right_triangle(outline)
        if not legs:
            return None
        if "больш" in lowered:
            return [format_answer(legs[0])]
        if "меньш" in lowered:
            return [format_answer(legs[-1])]
        return [format_answer(value) for value in legs]

    return None
