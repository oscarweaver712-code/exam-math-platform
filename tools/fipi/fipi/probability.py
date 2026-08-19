"""Solvers for the probability family of part 1 (ОГЭ task 10).

The bank clones each task from a template and only changes the numbers, so a
handful of shapes covers most of the family. Every answer is still confirmed
against ФИПИ before it is stored, so a misread template costs a rejected
candidate rather than a wrong key.
"""

from __future__ import annotations

import re
from fractions import Fraction

from .inline import values as inline_values

NUM = r"(\d+(?:[.,]\d+)?)"


def _n(text: str) -> Fraction:
    return Fraction(text.replace(",", "."))


def _terminating(value: Fraction) -> bool:
    """Whether the fraction writes out as a finite decimal, as answers do."""
    denominator = value.denominator
    for factor in (2, 5):
        while denominator % factor == 0:
            denominator //= factor
    return denominator == 1


def _format(value: Fraction) -> str:
    if value.denominator == 1:
        return str(value.numerator)
    result = float(value)
    text = f"{result:.6f}".rstrip("0").rstrip(".")
    return text


#: «остальные ... поровну»: the leftover splits evenly between two colours.
#: The count agrees with the numeral — «продаётся 144 ручки», «165 ручек» — and
#: the list opens either with a colon or with «, из них».
_SPLIT_RE = re.compile(
    rf"продаётся\s+{NUM}\s+руч\w*\s*[:,]\s*(?:из\s+них\s+)?"
    rf"{NUM}\s+(\w+),\s*{NUM}\s+(\w+),\s*{NUM}\s+(\w+),"
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


#: The bank writes some counts as words: «двенадцать неисправных».
WORD_NUMBERS = {
    "один": 1, "одна": 1, "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5,
    "шесть": 6, "семь": 7, "восемь": 8, "девять": 9, "десять": 10,
    "одиннадцать": 11, "двенадцать": 12, "тринадцать": 13, "четырнадцать": 14,
    "пятнадцать": 15, "шестнадцать": 16, "семнадцать": 17, "восемнадцать": 18,
    "девятнадцать": 19, "двадцать": 20, "тридцать": 30, "сорок": 40,
}
COUNT = r"(\d+|[а-яё]+)"


def _count(token: str) -> Fraction | None:
    """A count written either way: `12` or «двенадцать»."""
    token = token.strip().lower().replace("ё", "е")
    if re.fullmatch(r"\d+", token):
        return Fraction(token)
    for word, value in WORD_NUMBERS.items():
        if word.replace("ё", "е") == token:
            return Fraction(value)
    return None


def _flashlights(text: str) -> Fraction | None:
    """«из 80 фонариков двенадцать неисправных … окажется исправен»."""
    match = re.search(
        rf"из\s+{NUM}\s+карманных фонариков.*?{COUNT}\s+неисправн.*?исправен",
        text, re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    total, broken = _n(match.group(1)), _count(match.group(2))
    if broken is None or not total:
        return None
    return (total - broken) / total


def _two_groups(text: str) -> Fraction | None:
    """«18 чёрных и 22 синих маркера … окажется синим» — one draw, two kinds."""
    match = re.search(rf"{NUM}\s+([а-яё]+)\s+и\s+{NUM}\s+([а-яё]+)\s+[а-яё]+", text, re.IGNORECASE)
    asked = re.search(r"(?:окажется|будет)\s+([а-яё]+)", text, re.IGNORECASE)
    if not match or not asked:
        return None
    counts = {_stem(match.group(2)): _n(match.group(1)), _stem(match.group(4)): _n(match.group(3))}
    wanted = counts.get(_stem(asked.group(1)))
    total = sum(counts.values())
    if wanted is None or not total:
        return None
    return wanted / total


def _second_draw(text: str) -> Fraction | None:
    """«первый карандаш зелёный … второй тоже» — one of that colour is gone.

    The condition is not decoration: it removes a pencil from the box, so both
    the favourable count and the total shrink by one.
    """
    match = re.search(rf"{NUM}\s+([а-яё]+)\s+и\s+{NUM}\s+([а-яё]+)\s+карандаш", text, re.IGNORECASE)
    first = re.search(r"первый\s+карандаш\s+оказался\s+([а-яё]+)", text, re.IGNORECASE)
    if not match or not first or "тоже" not in text:
        return None
    counts = {_stem(match.group(2)): _n(match.group(1)), _stem(match.group(4)): _n(match.group(3))}
    drawn = counts.get(_stem(first.group(1)))
    total = sum(counts.values())
    if drawn is None or total < 2:
        return None
    return (drawn - 1) / (total - 1)


#: «первым будет стартовать спортсмен из Швеции» — and, in a fifth of the
#: family, «спортсмен не из России», which asks for the complement.
_START_RE = re.compile(r"стартовать\s+спортсмен\s+(не\s+)?из")


def _by_country(text: str) -> Fraction | None:
    """«7 спортсменов из России, 1 из Швеции и 2 из Норвегии … из Швеции»."""
    parts = re.findall(rf"{NUM}\s+спортсмен\w*\s+из\s+([А-Яа-яЁё]+)", text)
    marker = _START_RE.search(text)
    if len(parts) < 2 or not marker:
        return None
    counts: dict[str, Fraction] = {}
    for number, country in parts:
        counts[_stem(country)] = counts.get(_stem(country), Fraction(0)) + _n(number)
    # «из Норвегии или Швеции» names two countries, so the tail is read whole
    # rather than taking the first word after «из».
    asked = {_stem(word) for word in re.findall(r"[А-Яа-яЁё]+", text[marker.end():])}
    wanted = sum((count for stem, count in counts.items() if stem in asked), Fraction(0))
    total = sum(counts.values())
    if not wanted or not total:
        return None
    return 1 - wanted / total if marker.group(1) else wanted / total


def _puzzles(text: str) -> Fraction | None:
    """«25 пазлов: 18 с машинами и 7 с видами городов … достанется пазл с …»."""
    match = re.search(
        rf"закупил\s+{NUM}\s+пазл\w*.*?из них\s+{NUM}\s+с\s+машинами\s+и\s+{NUM}\s+с\s+вид\w+",
        text, re.IGNORECASE | re.DOTALL,
    )
    asked = re.search(r"достанется\s+пазл\s+с\s+([а-яё]+)", text, re.IGNORECASE)
    if not match or not asked:
        return None
    total = _n(match.group(1))
    wanted = _n(match.group(2)) if _stem(asked.group(1)) == "маш" else _n(match.group(3))
    return wanted / total if total else None


def _counted_outcomes(values: dict[str, str]) -> Fraction | None:
    """«В случайном опыте N равновозможных событий, из которых K благоприятны»

    Both counts are pictures rather than text, so they come from the
    transcription; the division is still done here.
    """
    if "outcomes" not in values or "favourable" not in values:
        return None
    total = Fraction(values["outcomes"])
    return Fraction(values["favourable"]) / total if total else None


#: Only these characters may appear in a transcribed event expression.
_EVENT_OK = set("AB adnotr()| ")


def _euler(values: dict[str, str]) -> Fraction | None:
    """A Euler diagram, read once into four region weights.

    The picture carries everything: how many outcomes lie outside both events,
    in A alone, in B alone and in the overlap. Those four numbers and the asked
    event — itself a picture, `\overline{A}\cup B` — are transcribed; the
    probability is still worked out here, so a misread costs a candidate.
    """
    if "event" not in values:
        return None
    if "tree" in values:
        # A probability tree says the same thing in another shape: P(A) and the
        # two conditional probabilities of B multiply out into the very same
        # four regions, so one evaluator serves both pictures.
        chance_a, given_a, given_not_a = (Fraction(part) for part in values["tree"].split(","))
        chance_not_a = 1 - chance_a
        weights = [
            chance_not_a * (1 - given_not_a), chance_a * (1 - given_a),
            chance_not_a * given_not_a, chance_a * given_a,
        ]
    elif "regions" in values:
        weights = [Fraction(part) for part in values["regions"].split(",")]
    else:
        return None
    if len(weights) != 4:
        return None
    event = values["event"]
    if set(event) - _EVENT_OK:
        return None

    outside, only_a, only_b, both = weights
    total = outside + only_a + only_b + both
    favourable = Fraction(0)
    for weight, in_a, in_b in (
        (outside, False, False), (only_a, True, False),
        (only_b, False, True), (both, True, True),
    ):
        if eval(event, {"__builtins__": {}}, {"A": in_a, "B": in_b}):  # noqa: S307
            favourable += weight
    return favourable / total if total else None


def _dice_sum(text: str) -> Fraction | None:
    """«сумма выпавших очков равна 3, 4 или 5» — 36 outcomes, counted."""
    if "кубик" not in text.lower():
        return None
    # Stop at the closing quote: `[\dи,\s]+` swallows the «и» of «или» and
            # then gives up, losing the last value of the list.
    match = re.search(r"сумма выпавших очков равна\s+([^»\"]+)", text, re.IGNORECASE)
    if not match:
        return None
    wanted = {int(value) for value in re.findall(r"\d+", match.group(1))}
    if not wanted:
        return None
    hits = sum(1 for first in range(1, 7) for second in range(1, 7) if first + second in wanted)
    return Fraction(hits, 36)


#: Each entry is (pattern, how to turn the captured numbers into a probability).
_RULES: list[tuple[re.Pattern[str], object]] = [
    # «20 чашек: 10 с красными цветами, остальные с синими … синими»
    (re.compile(rf"{NUM}\s+чашек:\s*{NUM}\s+с\s+красными.*?синими", re.IGNORECASE | re.DOTALL),
     lambda g: (_n(g[0]) - _n(g[1])) / _n(g[0])),
    # «На экзамене 20 билетов, … не выучил 7 … выученный билет»
    (re.compile(rf"экзамене\s+{NUM}\s+билет.*?не\s+выучил\s+{NUM}.*?выученный", re.IGNORECASE | re.DOTALL),
     lambda g: (_n(g[0]) - _n(g[1])) / _n(g[0])),
    # «Вероятность того, что … плохо …, равна 0,02 … пишет хорошо»
    (re.compile(rf"пишет\s+плохо.*?равна\s+{NUM}.*?пишет\s+хорошо", re.IGNORECASE | re.DOTALL),
     lambda g: 1 - _n(g[0])),
    # «Монету бросили 20 раз. Орёл выпал 9 раз … при десятом броске решка».
    # The question names a particular throw, but the answer does not depend on
    # which: what is asked is the share of tails among the throws made.
    (re.compile(rf"Монету бросили\s+{NUM}\s+раз.*?орёл выпал\s+{NUM}\s+раз.*?решка", re.IGNORECASE | re.DOTALL),
     lambda g: (_n(g[0]) - _n(g[1])) / _n(g[0])),
    # «свободно 10 машин: 5 чёрных, 1 жёлтая и 4 зелёных … жёлтое такси»
    (re.compile(rf"свободно\s+{NUM}\s+машин:\s*{NUM}\s+ч[её]рн\w*,\s*{NUM}\s+ж[её]лт\w*\s+и\s+{NUM}\s+зел[её]н\w*.*?ж[её]лтое", re.IGNORECASE | re.DOTALL),
     lambda g: _n(g[2]) / _n(g[0])),
]


def solve_probability(statement: str, short_id: str = "") -> str | None:
    """Probability for the templated shapes, or None when the shape is new."""
    text = " ".join(statement.split())

    transcribed = inline_values(short_id)
    for read in (_counted_outcomes(transcribed), _euler(transcribed)):
        if read is not None and 0 <= read <= 1 and _terminating(read):
            return _format(read)

    pens = _pens(text)
    if pens is not None:
        return pens

    for shape in (_flashlights, _dice_sum, _puzzles, _by_country, _second_draw, _two_groups):
        try:
            value = shape(text)
        except (ZeroDivisionError, ValueError, TypeError):
            continue
        # An ОГЭ probability is written as a terminating decimal. A value like
        # 5/36 means the shape was read wrong, and the request would be wasted.
        if value is not None and 0 <= value <= 1 and _terminating(value):
            return _format(value)

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
