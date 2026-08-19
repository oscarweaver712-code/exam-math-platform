"""Answers for the paper-format scenario of the practical block (ОГЭ 1–5).

The shared text defines the А-series completely: А0 is a rectangle of one
square metre, every next format is the previous one cut in half parallel to
the shorter side, and all of them are similar. Two sentences, and every sheet
is determined — the ratio has to be √2, because halving a `a × a√2` sheet gives
`a/√2 × a`, which is similar to it again.

    площадь(n) = 2⁻ⁿ м²      длина(n) = 1000 · 2^(1/4) / 2^(n/2) мм

The bank never prints those numbers: it asks for them. ФИПИ's own keys agree
with the exact model rather than with the rounded ISO table — «ширина А0» is
840,9 mm and the confirmed key is 840, «отношение сторон А4» is 0,707 and the
key is 0,7.
"""

from __future__ import annotations

import math
import re

from .solver import format_answer

#: `А4`, written with a Cyrillic А in the bank and a Latin one by habit.
FORMAT = r"[АA]\s*(\d)"

#: Long side of А0 in millimetres: √(1 000 000 · √2).
A0_LONG = 1000 * 2 ** 0.25

COUNT_RE = re.compile(rf"Сколько листов формата\s*{FORMAT}\s*получится из одного листа формата\s*{FORMAT}")
AREA_RE = re.compile(rf"Найдите площадь листа формата\s*{FORMAT}.*?квадратных сантиметрах", re.DOTALL)
SIDE_RE = re.compile(rf"Найдите (ширину|длину) листа бумаги формата\s*{FORMAT}.*?кратного 10", re.DOTALL)
RATIO_RE = re.compile(
    rf"Найдите отношение длины (меньшей|большей) стороны листа формата\s*{FORMAT}\s*к (большей|меньшей)"
)
PACK_RE = re.compile(
    rf"Бумагу формата\s*{FORMAT}\s*упаковали в пачки по\s*(\d+)\s*листов.*?"
    r"площадью 1 кв\.?\s*м равна\s*(\d+)\s*г",
    re.DOTALL,
)
FONT_RE = re.compile(
    rf"расположен на листе формата\s*{FORMAT}\s*так же.*?"
    rf"шрифтом высотой\s*(\d+)\s*пунктов на листе формата\s*{FORMAT}",
    re.DOTALL,
)
MATCH_RE = re.compile(r"Установите соответствие между форматами и номерами листов")
#: The order the answer must follow, printed as the last line: «А2 А3 А5 А6».
ORDER_RE = re.compile(rf"{FORMAT}(?:\s+{FORMAT})+\s*$")
ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|$", re.MULTILINE)


def _long_side(number: int) -> float:
    """Long side of format Аn in millimetres."""
    return A0_LONG / 2 ** (number / 2)


def _short_side(number: int) -> float:
    return _long_side(number) / math.sqrt(2)


def _to_ten(value: float) -> str:
    """«округлите до ближайшего целого числа, кратного 10»."""
    return str(int(round(value / 10)) * 10)


def _matching(statement: str) -> str | None:
    """Match every named format to the numbered sheet of the table."""
    order = ORDER_RE.search(statement.strip())
    rows = [(int(n), int(length)) for n, length, _ in ROW_RE.findall(statement)]
    if not order or not rows:
        return None

    formats = [int(digit) for digit in re.findall(FORMAT, order.group(0))]
    if len(formats) != len(rows):
        return None

    answer = ""
    for number in formats:
        expected = _long_side(number)
        sheet, length = min(rows, key=lambda row: abs(row[1] - expected))
        # The table is rounded to whole millimetres; a mismatch of more than
        # one millimetre means this is not the sheet, and a guess is worse
        # than no answer.
        if abs(length - expected) > 1:
            return None
        answer += str(sheet)
    return answer


def solve_paper(task: dict) -> str | None:
    """Answer for one question of the paper-format scenario, or None."""
    if "листов бумаги обозначают буквой А" not in (task.get("group_intro") or ""):
        return None
    statement = task.get("statement_text") or ""

    count = COUNT_RE.search(statement)
    if count:
        smaller, larger = int(count.group(1)), int(count.group(2))
        return str(2 ** (smaller - larger)) if smaller >= larger else None

    area = AREA_RE.search(statement)
    if area:
        # 1 кв. м = 10 000 кв. см, halved once per format.
        return format_answer(10000 / 2 ** int(area.group(1)))

    side = SIDE_RE.search(statement)
    if side:
        number = int(side.group(2))
        return _to_ten(_short_side(number) if side.group(1) == "ширину" else _long_side(number))

    ratio = RATIO_RE.search(statement)
    if ratio:
        # Every format is similar to every other, so the number asked for is
        # √2 either way up, whatever the format.
        value = 1 / math.sqrt(2) if ratio.group(1) == "меньшей" else math.sqrt(2)
        return format_answer(round(value, 1))

    pack = PACK_RE.search(statement)
    if pack:
        number, sheets, density = (int(part) for part in pack.groups())
        return format_answer(sheets / 2 ** number * density)

    font = FONT_RE.search(statement)
    if font:
        target, height, source = (int(part) for part in font.groups())
        # The text keeps its place on the sheet, so it scales with the side:
        # one format apart is a factor of √2.
        return str(round(height * 2 ** ((source - target) / 2)))

    if MATCH_RE.search(statement):
        return _matching(statement)

    return None
