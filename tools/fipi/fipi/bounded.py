"""Bounded candidate lists for the answers a solver could not compute.

Most of what is left in part 1 needs a drawing read — a plan, a graph, an arc —
and until those readers exist the answer can still be recovered the way a finite
choice is: propose it and let ФИПИ's checker confirm. The difference from
`solver.bounded_candidates`, which walks a set the form itself defines, is that
here the set is guessed, so the range has to be earned per задача type or the
run turns into a blind sweep of a public host.

Two rules keep it honest:

* **Only where the magnitude is known from the type.** A percentage lives in
  0…100, a distance on a 1×1-km plan in single kilometres, a count of packets in
  small whole numbers. A задача whose answer is «в рублях» runs to thousands and
  is left alone — guessing it would send hundreds of requests that cannot land.
* **Only the sign the quantity can take.** An area, a volume, a distance, a
  share are non-negative, so the sweep starts at zero. A signed quantity —
  temperature is the example — would need a symmetric range; none remain in the
  bank, and `SIGNED` marks the spot if one returns.

Answers are whole or, at the exam's usual precision, half-integers; tenths are
not swept — a задача that rounds «до десятых» stays for a reader that computes
it. Each value is offered in both decimal spellings the sheet accepts.
"""

from __future__ import annotations

import re

#: A задача type: the words that name it, its inclusive range in the answer's
#: own unit, and whether half-integers are worth trying (a count is never ½).
#: Order matters — the first match wins, so the out-of-range types that only
#: return None are listed first to claim their задачи before a looser rule can.
_EXCLUDE = (
    # Out of the reachable range: thousands of roubles, hundreds of grams.
    ("рубл", None),
    (r"\bв\s+граммах\b|\bкг\b|килограмм", None),
    # The drawing carries the answer; it is read, not guessed. Задание 18 and
    # the arc-radius questions of the баня plan both say «на рисунке».
    ("клетчат", None),
)

#: Signed quantities would sweep a symmetric range. None remain; kept as the
#: marker for where to branch if one comes back.
SIGNED: dict[str, tuple[float, float]] = {}

#: (name, pattern, low, high, halves). Positive quantities, tight per type.
_TYPES = (
    ("percent", r"процент", 0, 100, True),
    ("volume", r"кубическ|куб\.?\s*м", 1, 60, True),
    ("area", r"кв\.?\s*м|квадратн", 1, 100, True),
    ("km", r"километр", 1, 35, True),
    # Minutes spent travelling a few kilometres at 10–15 км/ч reach into the
    # low hundreds, so the ceiling is higher than the other types'.
    ("minutes", r"сколько\s+минут|минут\s+затрат", 1, 150, False),
    # Whole packets of tiles, whole sheets: a count is an integer.
    ("count", r"упаковок|упаковк\w*\s+пл", 1, 100, False),
    # A straight-line distance on a metre plan: tens of metres.
    ("distance_m", r"расстояние.*?в\s+метрах", 1, 100, True),
)

#: Never send more than this for one задача, whatever the range would imply.
_CAP = 300

_MATCHING = re.compile(
    r"Установите соответствие|перенесите последовательность|какими цифрами|"
    r"какие месяцы|перенесите числа",
    re.IGNORECASE,
)


def _values(low: float, high: float, halves: bool) -> list[str]:
    """Every candidate in range, integers first, each in both spellings."""
    out: list[str] = []
    for value in range(int(low), int(high) + 1):
        out.append(str(value))
    if halves:
        half = low if low != int(low) else low + 0.5
        value = half if half >= low else half + 1
        while value < high:
            text = f"{value:.1f}"
            out.append(text)
            out.append(text.replace(".", ","))
            value += 1
    return out[:_CAP]


def classify(statement: str) -> str | None:
    """Name of the answer type worth sweeping, or None to leave the задача alone."""
    for pattern, _ in _EXCLUDE:
        if re.search(pattern, statement, re.IGNORECASE):
            return None
    for name, pattern, _low, _high, _halves in _TYPES:
        if re.search(pattern, statement, re.IGNORECASE):
            return name
    return None


def probe_candidates(task: dict) -> list[str] | None:
    """Bounded guesses for one free-numeric задача, or None when it is out of scope.

    A matching or sequence answer is a finite set the form defines, handled by
    `solver.bounded_candidates`; it is declined here so the two never overlap.
    """
    statement = task.get("statement_text") or ""
    if _MATCHING.search(statement):
        return None
    name = classify(statement)
    if name is None:
        return None
    _n, _p, low, high, halves = next(t for t in _TYPES if t[0] == name)
    return _values(low, high, halves)


__all__ = ["probe_candidates", "classify"]
