"""Solvers for the probability family of part 1 (ОГЭ task 10).

The bank clones each task from a template and only changes the numbers, so a
handful of shapes covers most of the family. Every answer is still confirmed
against ФИПИ before it is stored, so a misread template costs a rejected
candidate rather than a wrong key.
"""

from __future__ import annotations

import re
from fractions import Fraction

NUM = r"(\d+(?:[.,]\d+)?)"


def _n(text: str) -> Fraction:
    return Fraction(text.replace(",", "."))


def _format(value: Fraction) -> str:
    if value.denominator == 1:
        return str(value.numerator)
    result = float(value)
    text = f"{result:.6f}".rstrip("0").rstrip(".")
    return text


#: «остальные ... поровну»: the leftover splits evenly between two colours.
_SPLIT_RE = re.compile(
    rf"продаётся\s+{NUM}\s+ручек:\s*{NUM}\s+(\w+),\s*{NUM}\s+(\w+),\s*{NUM}\s+(\w+),"
    r"\s*остальные\s+(\w+)\s+и\s+(\w+),\s*их\s+поровну",
    re.IGNORECASE,
)


def _stem(word: str) -> str:
    """Colour root, short enough to survive Russian case endings.

    The statement names a colour in one case («12 фиолетовых») and asks about
    it in another («будет фиолетовой»), so the comparison has to ignore the
    ending. Three letters separate every colour this family uses.
    """
    return word.lower().replace("ё", "е")[:3]


def _pens(statement: str) -> str | None:
    match = _SPLIT_RE.search(statement)
    if not match:
        return None
    total = _n(match.group(1))
    named = {
        _stem(match.group(3)): _n(match.group(2)),
        _stem(match.group(5)): _n(match.group(4)),
        _stem(match.group(7)): _n(match.group(6)),
    }
    leftover = total - sum(named.values())
    if leftover < 0:
        return None
    half = leftover / 2
    named[_stem(match.group(8))] = half
    named[_stem(match.group(9))] = half

    wanted = re.search(r"будет|окажется", statement)
    tail = statement[wanted.end():] if wanted else statement
    colours = re.findall(r"([а-яё]+)(?:ой|ей|ым|им|ая|яя|ой)?\b", tail.lower())
    picked = [named[_stem(colour)] for colour in colours if _stem(colour) in named]
    if len(picked) != 2:
        return None
    return _format(sum(picked) / total)


#: Each entry is (pattern, how to turn the captured numbers into a probability).
_RULES: list[tuple[re.Pattern[str], object]] = [
    # «20 чашек: 10 с красными цветами, остальные с синими … синими»
    (re.compile(rf"{NUM}\s+чашек:\s*{NUM}\s+с\s+красными.*?синими", re.IGNORECASE | re.DOTALL),
     lambda g: (_n(g[0]) - _n(g[1])) / _n(g[0])),
    # «из 80 … двенадцать неисправных … окажется исправен» — word numerals vary,
    # so the count is read from the digits that are present.
    (re.compile(rf"из\s+{NUM}\s+карманных фонариков.*?{NUM}\s+неисправн.*?исправен", re.IGNORECASE | re.DOTALL),
     lambda g: (_n(g[0]) - _n(g[1])) / _n(g[0])),
    # «На экзамене 20 билетов, … не выучил 7 … выученный билет»
    (re.compile(rf"экзамене\s+{NUM}\s+билет.*?не\s+выучил\s+{NUM}.*?выученный", re.IGNORECASE | re.DOTALL),
     lambda g: (_n(g[0]) - _n(g[1])) / _n(g[0])),
    # «Вероятность того, что … плохо …, равна 0,02 … пишет хорошо»
    (re.compile(rf"пишет\s+плохо.*?равна\s+{NUM}.*?пишет\s+хорошо", re.IGNORECASE | re.DOTALL),
     lambda g: 1 - _n(g[0])),
    # «свободно 10 машин: 5 чёрных, 1 жёлтая и 4 зелёных … жёлтое такси»
    (re.compile(rf"свободно\s+{NUM}\s+машин:\s*{NUM}\s+ч[её]рн\w*,\s*{NUM}\s+ж[её]лт\w*\s+и\s+{NUM}\s+зел[её]н\w*.*?ж[её]лтое", re.IGNORECASE | re.DOTALL),
     lambda g: _n(g[2]) / _n(g[0])),
]


def solve_probability(statement: str) -> str | None:
    """Probability for the templated shapes, or None when the shape is new."""
    text = " ".join(statement.split())

    pens = _pens(text)
    if pens is not None:
        return pens

    for pattern, compute in _RULES:
        match = pattern.search(text)
        if not match:
            continue
        try:
            value = compute(match.groups())
        except (ZeroDivisionError, ValueError):
            return None
        if not 0 <= value <= 1:
            return None
        return _format(value)
    return None
