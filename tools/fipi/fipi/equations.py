"""Solver for the linear and quadratic equations of part 1 (ОГЭ task 9).

The bank states them as `$x^2-9x+18=0$` or `$10(x-9)=7$` and then asks for the
smaller or the larger root. Rather than parse the algebra, the equation is
treated as a function: both sides are translated to Python by the same code
that evaluates arithmetic expressions, sampled at a few points, and the
polynomial coefficients are read off. A shape that does not fit a quadratic is
rejected, so nothing is answered by accident — and the answer is confirmed
against ФИПИ afterwards regardless.
"""

from __future__ import annotations

import math
import re
from fractions import Fraction

from .solver import SolveError, _evaluate, _latex_to_python, format_answer

EQUATION_RE = re.compile(
    r"(?:Реши(?:те)?\s+уравнение|Найдите\s+корень\s+уравнения)\s*\$(?P<body>[^$]+)\$",
    re.IGNORECASE,
)
SMALLER_RE = re.compile(r"меньш\w+\s+из\s+корней", re.IGNORECASE)
LARGER_RE = re.compile(r"больш\w+\s+из\s+корней", re.IGNORECASE)

#: Sampling points for fitting; three fix a quadratic, the fourth checks it.
_SAMPLES = (Fraction(0), Fraction(1), Fraction(-1), Fraction(2))


def _sample(expression: str, variable: str) -> list[Fraction]:
    values: list[Fraction] = []
    for point in _SAMPLES:
        value = _evaluate(expression, {variable: point})
        if not isinstance(value, Fraction):
            value = Fraction(value).limit_denominator(10**9)
        values.append(value)
    return values


def _coefficients(values: list[Fraction]) -> tuple[Fraction, Fraction, Fraction]:
    """Read a, b, c of `ax² + bx + c` from f(0), f(1), f(-1); verify with f(2)."""
    at_zero, at_one, at_minus_one, at_two = values
    c = at_zero
    a = (at_one + at_minus_one) / 2 - c
    b = (at_one - at_minus_one) / 2
    if 4 * a + 2 * b + c != at_two:
        raise SolveError("не квадратный трёхчлен")
    return a, b, c


def _roots(a: Fraction, b: Fraction, c: Fraction) -> list[Fraction]:
    if a == 0:
        if b == 0:
            return []
        return [-c / b]

    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return []

    # Keep the answer exact: an irrational root is not what these tasks expect.
    numerator = math.isqrt(discriminant.numerator)
    denominator = math.isqrt(discriminant.denominator)
    if numerator * numerator != discriminant.numerator or denominator * denominator != discriminant.denominator:
        return []
    root = Fraction(numerator, denominator)
    return sorted({(-b - root) / (2 * a), (-b + root) / (2 * a)})


def solve_equation(statement: str) -> str | None:
    """Requested root of the stated equation, or None when it is out of scope."""
    match = EQUATION_RE.search(" ".join(statement.split()))
    if not match:
        return None

    body = match.group("body")
    if body.count("=") != 1:
        return None
    left, right = body.split("=")

    variable = "x"
    if "x" not in body:
        found = re.search(r"[a-zA-Zа-яА-Я]", body)
        if not found:
            return None
        variable = found.group(0)

    try:
        expression = f"({_latex_to_python(left)})-({_latex_to_python(right)})"
        roots = _roots(*_coefficients(_sample(expression, variable)))
    except (SolveError, ZeroDivisionError, ValueError, TypeError):
        return None
    if not roots:
        return None

    if len(roots) > 1:
        if SMALLER_RE.search(statement):
            roots = [min(roots)]
        elif LARGER_RE.search(statement):
            roots = [max(roots)]
        else:
            # Ambiguous which root is wanted; leave it for a human.
            return None

    return format_answer(roots[0])
