"""Read a figure off squared paper.

Задание 18 gives the statement no numbers at all: «На клетчатой бумаге с
размером клетки 1×1 изображена трапеция. Найдите её площадь». The grid is the
unit and the drawing is the data, so the answer exists only in the picture.

Two things make that readable. The grid is periodic, and the figure is drawn
over it darker than the grid itself — where a base lies along a grid line the
pixels go black while the same line elsewhere stays grey. That second fact is
what makes an axis-parallel side visible at all; without it a rectangle drawn
on the lines would be indistinguishable from the paper.

So the background is modelled rather than thresholded: a pixel counts as ink
only when it is darker than both its own column and its own row would be with
nothing drawn on them. The grid lines then vanish on their own, the figure
stays, and the only ink lost is where a stroke crosses a line — which the
segment test below tolerates by design.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .raster import Image

#: How much darker than the modelled background a pixel must be to count as ink.
INK_MARGIN = 48

#: A column or row whose typical tone is at least this dark carries a grid line.
GRID_TONE = 210


#: A grid line runs the whole way across the picture; a side of a figure never
#: does. Taking the tone this far up the sorted column tells them apart — the
#: median would follow a long vertical side and quietly call it paper.
TONE_PERCENTILE = 0.9


def _tone(values: list[int]) -> int:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * TONE_PERCENTILE))]


@dataclass(frozen=True)
class Grid:
    """The paper: where its lines fall and how far apart they are."""

    xs: list[float]
    ys: list[float]
    pitch_x: float
    pitch_y: float

    def point(self, i: int, j: int) -> tuple[float, float]:
        return self.xs[i], self.ys[j]

    @property
    def size(self) -> tuple[int, int]:
        return len(self.xs), len(self.ys)


def _line_centres(tones: list[int]) -> list[float]:
    """Middle of every run of dark cells — one entry per drawn line."""
    centres: list[float] = []
    run: list[int] = []
    for index, tone in enumerate(tones):
        if tone < GRID_TONE:
            run.append(index)
        elif run:
            centres.append(sum(run) / len(run))
            run = []
    if run:
        centres.append(sum(run) / len(run))
    return centres


def _regularise(centres: list[float]) -> tuple[list[float], float] | None:
    """Fit `x = x0 + k·pitch` to detected lines, dropping any that do not fit.

    A drawing can hide a line — a filled figure sitting on one — and rounding
    splits others in two. Fitting a ruler to what was found puts the missing
    ones back where they belong instead of leaving a hole in the lattice.
    """
    if len(centres) < 3:
        return None
    gaps = sorted(round(b - a, 2) for a, b in zip(centres, centres[1:]))
    pitch = gaps[len(gaps) // 2]
    if pitch < 4:
        return None

    # Index every line against the first one, then least-squares the ruler.
    indexed = [(round((value - centres[0]) / pitch), value) for value in centres]
    indexed = [(k, value) for k, value in indexed if abs(value - centres[0] - k * pitch) < pitch / 3]
    if len(indexed) < 3:
        return None
    n = len(indexed)
    sum_k = sum(k for k, _ in indexed)
    sum_v = sum(v for _, v in indexed)
    sum_kk = sum(k * k for k, _ in indexed)
    sum_kv = sum(k * v for k, v in indexed)
    denominator = n * sum_kk - sum_k * sum_k
    if denominator == 0:
        return None
    fitted_pitch = (n * sum_kv - sum_k * sum_v) / denominator
    origin = (sum_v - fitted_pitch * sum_k) / n
    if fitted_pitch < 4:
        return None

    first, last = indexed[0][0], indexed[-1][0]
    return [origin + k * fitted_pitch for k in range(first, last + 1)], fitted_pitch


class Sheet:
    """One picture, read as ink on a lattice."""

    #: Pixel columns and rows close enough to a paper line to be unreadable.
    _crossing_x: list[bool] = []
    _crossing_y: list[bool] = []

    def __init__(self, image: Image):
        self.image = image
        self.column_tone = [
            _tone([image.luma[y][x] for y in range(image.height)]) for x in range(image.width)
        ]
        self.row_tone = [_tone(list(row)) for row in image.luma]
        grid = self.grid()
        if grid is not None:
            self._crossing_x = [
                any(abs(x - value) <= 1.5 for value in grid.xs) for x in range(image.width)
            ]
            self._crossing_y = [
                any(abs(y - value) <= 1.5 for value in grid.ys) for y in range(image.height)
            ]

    def is_ink(self, x: int, y: int) -> bool:
        """True where something is drawn beyond the paper's own lines."""
        if not (0 <= x < self.image.width and 0 <= y < self.image.height):
            return False
        # Where two paper lines cross, the pixel is darker than either line on
        # its own — the strokes are semi-transparent and multiply. Every
        # intersection would otherwise read as a small drawn mark.
        if self._crossing_x and self._crossing_x[x] and self._crossing_y[y]:
            return False
        background = min(self.column_tone[x], self.row_tone[y])
        return self.image.luma[y][x] <= background - INK_MARGIN

    def ink_near(self, x: float, y: float, radius: int = 0) -> bool:
        cx, cy = int(round(x)), int(round(y))
        return any(
            self.is_ink(cx + dx, cy + dy)
            for dy in range(-radius, radius + 1)
            for dx in range(-radius, radius + 1)
        )

    def at_crossing(self, x: float, y: float) -> bool:
        """Whether a point sits where two paper lines meet, and nothing can be read."""
        cx, cy = int(round(x)), int(round(y))
        if not self._crossing_x or not (0 <= cx < self.image.width and 0 <= cy < self.image.height):
            return False
        return self._crossing_x[cx] and self._crossing_y[cy]

    def on_grid_line(self, x: float, y: float, tolerance: float = 1.5) -> bool:
        """Whether a point sits close enough to a paper line to be unreadable."""
        grid = self.grid()
        if grid is None:
            return False
        near_x = any(abs(x - value) <= tolerance for value in grid.xs)
        near_y = any(abs(y - value) <= tolerance for value in grid.ys)
        return near_x or near_y

    _grid: Grid | None | str = "unset"

    def grid(self) -> Grid | None:
        if self._grid == "unset":
            self._grid = self._find_grid()
        return self._grid  # type: ignore[return-value]

    def _find_grid(self) -> Grid | None:
        columns = _regularise(_line_centres(self.column_tone))
        rows = _regularise(_line_centres(self.row_tone))
        if not columns or not rows:
            return None
        xs, pitch_x = columns
        ys, pitch_y = rows
        # Square cells: the statement says 1×1, so a sheet that came out
        # lopsided means the lines were read wrong, not that the paper is odd.
        if not 0.9 <= pitch_x / pitch_y <= 1.1:
            return None
        return Grid(xs=xs, ys=ys, pitch_x=pitch_x, pitch_y=pitch_y)

    def ascii(self) -> str:
        """The ink alone, for looking at what the model kept."""
        return "\n".join(
            "".join("#" if self.is_ink(x, y) else "." for x in range(self.image.width))
            for y in range(self.image.height)
        )


def segment_drawn(
    sheet: Sheet,
    start: tuple[float, float],
    end: tuple[float, float],
    tolerance: int = 0,
) -> bool:
    """Whether a straight stroke runs between two points of the lattice.

    Samples twice per pixel and asks for ink under each one, with a single
    allowance: a sample sitting on a paper line cannot be judged and is skipped.
    The test is deliberately unforgiving about position — a stroke is two or
    three pixels wide, so a candidate that merely runs *alongside* a real side
    would pass any neighbourhood search and add a vertex that is not there.
    """
    x1, y1 = start
    x2, y2 = end
    length = math.hypot(x2 - x1, y2 - y1)
    if length < 2:
        return False
    steps = max(8, int(length * 2))

    # A side lying along a paper line cannot be seen *on* the line — the line is
    # already black there. What it does is make the line thicker, so that case
    # is judged just beside the line instead of on top of it.
    along_line = abs(x2 - x1) < 1 or abs(y2 - y1) < 1
    sideways = (1, 0) if abs(x2 - x1) < abs(y2 - y1) else (0, 1)

    judged = hits = 0
    for step in range(steps + 1):
        t = step / steps
        x = x1 + (x2 - x1) * t
        y = y1 + (y2 - y1) * t
        if along_line:
            # Where the line being followed crosses another one there is
            # nothing to read on either side of it — the crossing is already
            # dark. Those samples are skipped, not counted as a miss.
            if sheet.at_crossing(x, y):
                continue
            judged += 1
            if any(
                sheet.ink_near(x + sideways[0] * shift, y + sideways[1] * shift, tolerance)
                for shift in (-2, -1, 1, 2)
            ):
                hits += 1
            continue
        if sheet.on_grid_line(x, y):
            continue
        judged += 1
        if sheet.ink_near(x, y, tolerance):
            hits += 1
    if judged < max(3, steps // 4):
        return False
    return hits >= judged * 0.9


@dataclass(frozen=True)
class Figure:
    """A drawing recovered in lattice units: vertices in cells, not pixels."""

    vertices: list[tuple[int, int]]
    edges: list[tuple[int, int]]
    #: Sides that were never seen and had to be closed — always axis-parallel,
    #: because those are the ones a dark grid line can swallow whole.
    inferred: int = 0

    def area(self) -> float:
        """Shoelace over the closed outline."""
        order = self.outline()
        if len(order) < 3:
            return 0.0
        total = 0.0
        for (x1, y1), (x2, y2) in zip(order, order[1:] + order[:1]):
            total += x1 * y2 - x2 * y1
        return abs(total) / 2

    def outline(self) -> list[tuple[int, int]]:
        """Vertices walked around the figure, or empty if it is not a cycle."""
        neighbours: dict[int, list[int]] = {index: [] for index in range(len(self.vertices))}
        for a, b in self.edges:
            neighbours[a].append(b)
            neighbours[b].append(a)
        if any(len(items) != 2 for items in neighbours.values()):
            return []
        order = [0]
        previous, current = None, 0
        while True:
            following = [item for item in neighbours[current] if item != previous]
            if not following:
                return []
            previous, current = current, following[0]
            if current == 0:
                break
            order.append(current)
            if len(order) > len(self.vertices):
                return []
        if len(order) != len(self.vertices):
            return []
        return [self.vertices[index] for index in order]


def _maximal(segments: set[tuple[tuple[int, int], tuple[int, int]]]) -> set:
    """Drop every segment that is part of a longer one in the same direction."""
    def direction(a: tuple[int, int], b: tuple[int, int]) -> tuple[int, int]:
        dx, dy = b[0] - a[0], b[1] - a[1]
        step = math.gcd(abs(dx), abs(dy)) or 1
        dx, dy = dx // step, dy // step
        return (-dx, -dy) if (dx, dy) < (0, 0) else (dx, dy)

    def covers(long: tuple, short: tuple) -> bool:
        (ax, ay), (bx, by) = long
        if direction((ax, ay), (bx, by)) != direction(*short):
            return False
        for point in short:
            if not (min(ax, bx) <= point[0] <= max(ax, bx) and min(ay, by) <= point[1] <= max(ay, by)):
                return False
            # collinear with the long segment?
            if (point[0] - ax) * (by - ay) != (point[1] - ay) * (bx - ax):
                return False
        return True

    def length(segment: tuple) -> float:
        (ax, ay), (bx, by) = segment
        return math.hypot(bx - ax, by - ay)

    ordered = sorted(segments, key=length, reverse=True)
    kept: list[tuple] = []
    for segment in ordered:
        if not any(covers(longer, segment) for longer in kept):
            kept.append(segment)
    return set(kept)


def read_figure(sheet: Sheet, max_nodes: int = 220, tolerance: int = 0) -> Figure | None:
    """Recover the drawn outline as lattice coordinates.

    Every pair of lattice points is asked whether a stroke runs between them;
    what survives as a maximal segment is a side. Sides that lie along a fully
    black grid line leave no trace at all, so the outline is closed at the end
    by joining loose ends that share a row or a column — the only shape such an
    invisible side can have.
    """
    grid = sheet.grid()
    if grid is None:
        return None
    columns, rows = grid.size
    if columns * rows > max_nodes:
        return None

    nodes = [(i, j) for j in range(rows) for i in range(columns)]
    drawn: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    for index, first in enumerate(nodes):
        for second in nodes[index + 1 :]:
            if segment_drawn(sheet, grid.point(*first), grid.point(*second), tolerance):
                drawn.add((first, second))
    if not drawn:
        return None

    sides = _maximal(drawn)
    degree: dict[tuple[int, int], int] = {}
    for a, b in sides:
        degree[a] = degree.get(a, 0) + 1
        degree[b] = degree.get(b, 0) + 1

    # An invisible side is axis-parallel by construction: join loose ends that
    # share a row or a column, nearest pair first.
    loose = sorted(point for point, count in degree.items() if count == 1)
    inferred = 0
    while len(loose) >= 2:
        pairs = [
            (abs(a[0] - b[0]) + abs(a[1] - b[1]), a, b)
            for index, a in enumerate(loose)
            for b in loose[index + 1 :]
            if a[0] == b[0] or a[1] == b[1]
        ]
        if not pairs:
            break
        _, a, b = min(pairs)
        sides.add((a, b))
        inferred += 1
        loose.remove(a)
        loose.remove(b)

    vertices = sorted({point for side in sides for point in side})
    position = {point: index for index, point in enumerate(vertices)}
    edges = [(position[a], position[b]) for a, b in sides]
    return Figure(vertices=vertices, edges=edges, inferred=inferred)
