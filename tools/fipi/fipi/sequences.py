"""Template solver for the progressions of part 1 (ОГЭ task 14).

Task 14 never says «арифметическая прогрессия» out loud. It tells a story —
a train pulling away, an amphitheatre widening row by row, a colony of microbes
tripling every half hour — and the progression is the reader's job to see. The
stories repeat almost verbatim across the bank, so a handful of them cover the
whole position.

Two shapes are worth naming, because they are the ones a formula alone gets
wrong. «Сколько метров автомобиль прошёл до полной остановки» is a sum whose
length is not given: the car stops when the per-second distance runs out, so
the terms are counted, not plugged in. «При каком по счёту прыжке мячик впервые
не достигнет 20 см» asks for an index rather than a value, and the threshold
arrives in centimetres while the heights are in metres.

Answers are confirmed against ФИПИ before they are stored, as everywhere in
this tool, so a mis-read story costs a rejected candidate.

Standard library only, like the rest of the tool.
"""

from __future__ import annotations

import math
import re

from .inline import values as inline_values
from .solver import format_answer

#: Row and jump indices are spelled out: «в десятом ряду», «в первом ряду».
ORDINALS = {
    "перв": 1, "втор": 2, "трет": 3, "четвёрт": 4, "четверт": 4, "пят": 5,
    "шест": 6, "седьм": 7, "восьм": 8, "девят": 9, "десят": 10,
    "одиннадцат": 11, "двенадцат": 12, "тринадцат": 13, "четырнадцат": 14,
    "пятнадцат": 15, "шестнадцат": 16, "семнадцат": 17, "восемнадцат": 18,
    "девятнадцат": 19, "двадцат": 20,
}
#: «в два раза меньше», «уменьшается вдвое».
CARDINALS = {
    "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6,
    "вдвое": 2, "втрое": 3, "вчетверо": 4,
}

NUM = r"(\d+(?:[.,]\d+)?)"


def _flatten(statement: str) -> str:
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", statement)
    text = re.sub(r"\$([^$]*)\$", r" \1 ", text)
    text = text.replace(" ", " ").replace("{,}", ",")
    return re.sub(r"\s+", " ", text).strip()


def _num(token: str) -> float:
    return float(token.replace(",", "."))


def _ordinal(word: str) -> int | None:
    for stem, value in ORDINALS.items():
        if word.startswith(stem):
            return value
    return None


def _ratio(text: str) -> float | None:
    """How many times each step multiplies or divides the previous one."""
    found = re.search(r"в\s+(\d+|[а-яё]+)\s+раз", text)
    if found:
        token = found.group(1)
        return float(token) if token.isdigit() else CARDINALS.get(token)
    for word, value in CARDINALS.items():
        if word.startswith("в") and word in text:
            return float(value)
    return None


def _sum(first: float, step: float, count: int) -> float:
    return count * (2 * first + (count - 1) * step) / 2


# --- the stories ------------------------------------------------------------


def _moving_body(text: str) -> float | None:
    """A train or a braking car: equal change every second."""
    start = re.search(
        rf"За\s+(?:перв\w+\s+)?секунду[^.]*?\s(?:на|проехал|прошёл|сдвинулся на)\s*{NUM}\s*м",
        text,
    )
    step = re.search(rf"на\s*{NUM}\s*м\s*(больше|меньше),\s*чем\s+за\s+предыдущую", text)
    if not start or not step:
        return None
    first = _num(start.group(1))
    delta = _num(step.group(1)) * (1 if step.group(2) == "больше" else -1)

    span = re.search(rf"за\s+перв\w+\s+{NUM}\s+секунд", text)
    if span:
        return _sum(first, delta, int(_num(span.group(1))))

    if re.search(r"до\s+полной\s+остановки", text) and delta < 0:
        # The car stops when a second would carry it no distance at all, so the
        # number of terms is part of the answer rather than part of the task.
        total = 0.0
        value = first
        while value > 0:
            total += value
            value += delta
        return total
    return None


def _multiplying(text: str) -> float | None:
    """A colony that triples, an isotope that halves."""
    start = re.search(rf"(?:массой|составляла|составляет)\s*{NUM}\s*мг", text)
    period = re.search(rf"кажд\w+\s+(?:{NUM}\s+)?(?:минут|час)", text)
    span = re.search(rf"через\s+{NUM}\s+(?:минут|час)", text)
    if not start or not period or not span:
        return None

    ratio = _ratio(text)
    if not ratio:
        return None
    every = _num(period.group(1)) if period.group(1) else 1.0
    if every <= 0:
        return None
    steps = _num(span.group(1)) / every
    if abs(steps - round(steps)) > 1e-9:
        return None

    growing = "увеличивается" in text or "увеличивалась" in text
    factor = ratio ** round(steps)
    return _num(start.group(1)) * (factor if growing else 1 / factor)


def _amphitheatre(text: str) -> float | None:
    """Rows widening by the same amount, asked three different ways."""
    rows = re.search(rf"В\s+амфитеатре\s+{NUM}\s+ряд", text)
    if not rows:
        return None
    total_rows = int(_num(rows.group(1)))

    asked = re.search(r"Сколько\s+мест\s+в\s+(последнем|[а-яё]+)\s+ряду", text)
    known = re.findall(rf"[Вв]\s+([а-яё]+)\s+ряду\s+{NUM}\s+мест", text)

    if len(known) >= 2:
        # Two rows are given and the step has to be recovered from them.
        (first_word, first_value), (second_word, second_value) = known[:2]
        one, two = _ordinal(first_word), _ordinal(second_word)
        if one is None or two is None or one == two:
            return None
        step = (_num(second_value) - _num(first_value)) / (two - one)
        target = total_rows if asked and asked.group(1) == "последнем" else None
        if target is None and asked:
            target = _ordinal(asked.group(1))
        if target is None:
            return None
        return _num(first_value) + (target - one) * step

    start = re.search(rf"В\s+перв\w+\s+ряду\s+{NUM}\s+мест", text)
    step_match = re.search(rf"на\s*{NUM}\s*(?:места?|мест)\s*больше", text)
    if not start or not step_match:
        return None
    first, step = _num(start.group(1)), _num(step_match.group(1))

    if re.search(r"Сколько\s+всего\s+мест", text):
        return _sum(first, step, total_rows)
    if asked:
        target = total_rows if asked.group(1) == "последнем" else _ordinal(asked.group(1))
        if target:
            return first + (target - 1) * step
    return None


def _bouncing(text: str) -> float | None:
    """«При каком по счёту прыжке» — the answer is an index, not a height."""
    start = re.search(rf"подпрыгнул\s+на\s*{NUM}\s*м", text)
    limit = re.search(rf"высот[ыу]\s*{NUM}\s*(см|м)\b", text)
    if not start or not limit or "по счёту прыжке" not in text:
        return None
    ratio = _ratio(text)
    if not ratio or ratio <= 1:
        return None

    threshold = _num(limit.group(1))
    if limit.group(2) == "см":
        threshold /= 100
    height = _num(start.group(1))
    for index in range(1, 60):
        if height < threshold:
            return float(index)
        height /= ratio
    return None


def _cooling(text: str, values: dict[str, str]) -> float | None:
    """«каждую минуту температура уменьшалась на … начальная составляла …»

    Both temperatures are pictures, so they come from the transcription. The
    answer here is the one in this family that can legitimately be negative:
    the substance starts below zero and goes colder.
    """
    if "равномерно охлаждали" not in text:
        return None
    minutes = re.search(rf"через\s+{NUM}\s+минут", text)
    if not minutes or "rate" not in values or "start" not in values:
        return None
    return _num(values["start"]) - _num(values["rate"]) * _num(minutes.group(1))


RULES = (_moving_body, _multiplying, _amphitheatre, _bouncing)


def solve_sequence(statement: str, short_id: str = "") -> str | None:
    """Answer for one task 14, or None when no story matches."""
    text = _flatten(statement)

    chilled = _cooling(text, inline_values(short_id))
    if chilled is not None and math.isfinite(chilled):
        return format_answer(round(chilled, 6))
    for rule in RULES:
        try:
            value = rule(text)
        except (ValueError, ZeroDivisionError, TypeError, IndexError):
            continue
        if value is None:
            continue
        value = float(value)
        if not math.isfinite(value) or value <= 0:
            continue
        # These answers are built to come out round; a ragged one means the
        # story was read wrong and the request would be wasted.
        if abs(value - round(value, 2)) > 1e-6:
            continue
        return format_answer(round(value, 6))
    return None
