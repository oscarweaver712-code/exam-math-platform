"""Answers for the tyre scenario of the practical block (ОГЭ 1–5).

Ninety-nine questions in the bank hang off one shared text: a wheel is a disk
with a tyre on it, the marking `195/65 R15` gives the width in millimetres, the
sidewall height as a percentage of that width, and the disk diameter in inches.
Five questions follow, and every one of them is arithmetic on those three
numbers:

    №1  a table of permitted markings, «шины какой наименьшей ширины…»
    №2  «сколько миллиметров составляет высота боковины шины 225/40 R18»
    №3  «найдите диаметр колеса автомобиля, выходящего с завода»
    №4  «на сколько миллиметров увеличится диаметр колеса, если заменить…»
    №5  «на сколько процентов увеличится пробег при одном обороте колеса…»

The question alone is not enough for three of the five: «выходящего с завода»
means the marking named at the end of the shared text, which the question never
repeats. So this solver reads the group's text, not just the statement.

The wheel diameter is the disk plus two sidewalls:

    D = d · 25,4 + 2 · B · H / 100

and the mileage per turn is πD, so the percentage the question asks about is
the percentage the diameter changes by — π cancels.
"""

from __future__ import annotations

import re

from .solver import format_answer

#: One millimetre count of an inch, as the statement itself spells it out.
INCH_MM = 25.4

#: `185/70 R14`, with the spacing ФИПИ actually uses — «225/40R18» occurs too.
MARKING = r"(\d+)\s*/\s*(\d+)\s*R\s*(\d+)"

#: «…и устанавливает на них колёса с шинами 185/70 R14.» — the only place the
#: factory wheel is named, and three of the five questions lean on it.
FACTORY_RE = re.compile(rf"устанавливает на них колёса с шинами\s*{MARKING}")

WIDTH_QUESTION_RE = re.compile(
    r"Шины какой (наименьшей|наибольшей) ширины.*?диаметр диска равен\s*(\d+)",
    re.IGNORECASE | re.DOTALL,
)
SIDEWALL_RE = re.compile(rf"высота боковины шины,? имеющей маркировку\s*{MARKING}")
FACTORY_DIAMETER_RE = re.compile(r"диаметр колеса автомобиля, выходящего с завода")
DIAMETER_CHANGE_RE = re.compile(
    rf"На сколько миллиметров (?:увеличится|уменьшится) диаметр колеса.*?шинами\s*{MARKING}",
    re.IGNORECASE | re.DOTALL,
)
MILEAGE_CHANGE_RE = re.compile(
    rf"На сколько процентов (?:увеличится|уменьшится) пробег.*?шинами\s*{MARKING}",
    re.IGNORECASE | re.DOTALL,
)

#: A markdown row of the rendered table, as `parse.to_text` writes it.
ROW_RE = re.compile(r"^\|(.+)\|$", re.MULTILINE)


def _diameter(width: float, ratio: float, disk: float) -> float:
    """Wheel diameter in millimetres from one marking."""
    return disk * INCH_MM + 2 * width * ratio / 100


def _factory(intro: str) -> tuple[int, int, int] | None:
    match = FACTORY_RE.search(intro)
    return tuple(int(part) for part in match.groups()) if match else None  # type: ignore[return-value]


def _permitted_widths(statement: str, disk: int) -> list[int]:
    """Widths the table allows for one disk diameter.

    The grid is «ширина шины» down the side and disk diameters across the top,
    with a marking where the pair is allowed and a dash where it is not. ФИПИ
    merges the corner cell over two rows, so the header repeats the side title
    and the diameters land on the row below it — the header is found by its
    contents (all integers) rather than by its position.
    """
    rows = [[cell.strip() for cell in row.group(1).split("|")] for row in ROW_RE.finditer(statement)]
    rows = [row for row in rows if not all(set(cell) <= set("-: ") for cell in row)]

    header: list[str] = []
    widths: list[int] = []
    for row in rows:
        tail = row[1:]
        if not header:
            if tail and all(re.fullmatch(r"\d+", cell) for cell in tail):
                header = tail
            continue
        if not re.fullmatch(r"\d+", row[0]):
            continue
        # A dash is «not allowed»; ФИПИ writes it as an em dash or an en dash.
        allowed = [bool(cell) and not set(cell) <= set("—–- ") for cell in tail]
        for index, diameter in enumerate(header):
            if int(diameter) == disk and index < len(allowed) and allowed[index]:
                widths.append(int(row[0]))
    return widths


def solve_tyres(task: dict) -> str | None:
    """Answer for one question of the tyre scenario, or None when out of scope."""
    intro = task.get("group_intro") or ""
    if "Автомобильное колесо" not in intro:
        return None

    statement = task.get("statement_text") or ""
    factory = _factory(intro)

    width_question = WIDTH_QUESTION_RE.search(statement)
    if width_question:
        widths = _permitted_widths(statement, int(width_question.group(2)))
        if not widths:
            return None
        return str(min(widths) if width_question.group(1) == "наименьшей" else max(widths))

    sidewall = SIDEWALL_RE.search(statement)
    if sidewall:
        width, ratio, _ = (int(part) for part in sidewall.groups())
        return format_answer(width * ratio / 100)

    if not factory:
        return None
    factory_diameter = _diameter(*factory)

    if FACTORY_DIAMETER_RE.search(statement):
        return format_answer(factory_diameter)

    change = DIAMETER_CHANGE_RE.search(statement)
    if change:
        replacement = _diameter(*(int(part) for part in change.groups()))
        return format_answer(abs(replacement - factory_diameter))

    mileage = MILEAGE_CHANGE_RE.search(statement)
    if mileage:
        replacement = _diameter(*(int(part) for part in mileage.groups()))
        # The mileage of one turn is πD, so the ratio of the two is the ratio
        # of the diameters — «результат округлите до десятых».
        percent = abs(replacement - factory_diameter) / factory_diameter * 100
        return format_answer(round(percent, 1))

    return None
