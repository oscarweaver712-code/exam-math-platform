"""Task 12 families whose formula ФИПИ drew instead of writing.

`formulas.py` reads the formula out of the statement. These two tasks do not
let it: the formula is a picture, and the sentence keeps only the words around
it — «Кинетическая энергия тела массой … кг, двигающегося со скоростью …,
вычисляется по формуле …». What survives is still enough, because the sentence
*names* the quantity, and there is exactly one formula for kinetic energy.

So the formula here comes from the name of the quantity rather than from the
page, and only the numbers are read from the text — where they are, in full:
«автомобиль массой 2000 кг обладает кинетической энергией 289 тысяч джоулей».
As everywhere in this tool the result is confirmed against ФИПИ before it is
stored.

Standard library only, like the rest of the tool.
"""

from __future__ import annotations

import math
import re

from .solver import format_answer

NUM = r"(\d+(?:[.,]\d+)?)"
#: ФИПИ's own value for g in this family, stated in the neighbouring tasks.
GRAVITY = 9.8


def _num(token: str) -> float:
    return float(token.replace(",", "."))


def _scaled(text: str, pattern: str) -> float | None:
    """A quantity that may be written «289 тысяч джоулей» rather than 289000."""
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return None
    value = _num(match.group(1))
    tail = text[match.end(1) : match.end(1) + 20]
    if re.match(r"\s*тысяч", tail, re.IGNORECASE):
        value *= 1000
    return value


def _kinetic(text: str) -> float | None:
    """`E = mv²/2` — the sentence names it, the picture only shows it."""
    if "инетическ" not in text:
        return None
    mass = _scaled(text, rf"массой\s+{NUM}\s*кг")
    energy = _scaled(text, rf"энерги[а-яё]+\s+{NUM}")
    speed = _scaled(text, rf"скорость[ю]?\s+{NUM}")

    if re.search(r"Найдите\s+скорость", text) and mass and energy:
        return math.sqrt(2 * energy / mass)
    if re.search(r"Найдите\s+массу", text) and speed and energy:
        return 2 * energy / speed**2
    if re.search(r"Найдите\s+(?:кинетическую\s+)?энергию", text) and mass and speed:
        return mass * speed**2 / 2
    return None


def _potential(text: str) -> float | None:
    """`E = mgh` with ФИПИ's g = 9,8."""
    if "отенциальн" not in text:
        return None
    mass = _scaled(text, rf"массой\s+{NUM}\s*кг")
    height = _scaled(text, rf"высоте\s+{NUM}\s*м")
    energy = _scaled(text, rf"энерги[а-яё]+\s+равна\s+{NUM}")

    if re.search(r"Найдите\s+массу", text) and energy and height:
        return energy / (GRAVITY * height)
    if re.search(r"Найдите\s+высоту", text) and energy and mass:
        return energy / (GRAVITY * mass)
    if re.search(r"Найдите\s+(?:потенциальную\s+)?энергию", text) and mass and height:
        return mass * GRAVITY * height
    return None


def solve_physics(statement: str) -> str | None:
    """Answer for one of the named families, or None when neither applies."""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", statement)
    text = re.sub(r"\s+", " ", text).strip()

    for family in (_kinetic, _potential):
        try:
            value = family(text)
        except (ValueError, ZeroDivisionError, TypeError):
            continue
        if value is None or not math.isfinite(value) or value <= 0:
            continue
        # These answers come out round by construction; a ragged one means the
        # numbers were picked up wrong.
        if abs(value - round(value, 2)) > 1e-6:
            continue
        return format_answer(round(value, 6))
    return None
