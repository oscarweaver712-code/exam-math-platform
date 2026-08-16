"""Solver for «расчёты по формуле» (ОГЭ tasks 8 and 12).

The statement gives a formula, explains what each letter means, then supplies
values in words and asks for the one that is missing:

    Мощность постоянного тока (в ваттах) вычисляется по формуле $P=I^2R$,
    где $I$ — сила тока (в амперах), $R$ — сопротивление (в омах).
    Пользуясь этой формулой, найдите сопротивление $R$, если мощность
    составляет 180 Вт, а сила тока равна 6 А.

The letters are matched to the prose by the descriptions the statement itself
provides, so nothing is assumed about the physics. Whatever is left unassigned
is the unknown, and it is found by the same polynomial fit the equation solver
uses. Every answer is confirmed against ФИПИ before it is stored.
"""

from __future__ import annotations

import re
from fractions import Fraction

from .equations import _coefficients, _roots, _sample
from .solver import SolveError, _evaluate, _latex_to_python, format_answer

FORMULA_RE = re.compile(r"формул\w*\s*\$(?P<body>[^$]+)\$")
#: «где $I$ — сила тока (в амперах), $R$ — сопротивление (в омах)»
WHERE_RE = re.compile(r"\$([^$]+?)\$\s*[—–-]\s*([^,.;]+)")
#: A number followed or preceded by the words that name it.
VALUE_RE = re.compile(r"(-?\d+(?:[.,]\d+)?)")


def _symbol(latex: str) -> str | None:
    """Python-safe name for a formula letter, e.g. `t_F` -> `t_F`."""
    cleaned = latex.strip().replace("{", "").replace("}", "").replace("\\", "")
    match = re.fullmatch(r"([a-zA-Zа-яА-Я])(?:_([a-zA-Zа-яА-Я0-9]))?", cleaned)
    if not match:
        return None
    return match.group(1) + ("_" + match.group(2) if match.group(2) else "")


def _stems(phrase: str) -> set[str]:
    """Content words of a description, shortened past Russian case endings."""
    words = re.findall(r"[а-яёa-z]{4,}", phrase.lower().replace("ё", "е"))
    return {word[:5] for word in words if word not in {"котор", "равна", "равен", "соста"}}


def _prepare(latex: str) -> str:
    """Translate a formula side, keeping subscripted letters as one name."""
    text = re.sub(r"([a-zA-Zа-яА-Я])_\{?([a-zA-Zа-яА-Я0-9])\}?", r"\1_\2", latex)
    return _latex_to_python(text)


def solve_formula(statement: str) -> str | None:
    """Value the task asks for, or None when the statement is out of scope."""
    text = " ".join(statement.split())

    formula = FORMULA_RE.search(text)
    if not formula or formula.group("body").count("=") != 1:
        return None
    left_raw, right_raw = formula.group("body").split("=")

    target = _symbol(left_raw)
    if not target:
        return None

    try:
        right = _prepare(right_raw)
    except SolveError:
        return None

    names = sorted(set(re.findall(r"[a-zA-Zа-яА-Я](?:_[a-zA-Zа-яА-Я0-9])?", right)))
    names = [name for name in names if name != "_sqrt"]
    if not names:
        return None

    # What each letter means: the lead sentence names the left-hand side, the
    # «где …» clause names the rest.
    descriptions: dict[str, set[str]] = {target: _stems(text[: formula.start()])}
    for symbol_raw, phrase in WHERE_RE.findall(text[formula.end() :]):
        symbol = _symbol(symbol_raw)
        if symbol:
            descriptions.setdefault(symbol, set()).update(_stems(phrase))

    question = text[formula.end() :]
    marker = re.search(r"[Пп]ользуясь|Скольким|Найдите|Определите|Вычислите|[Рр]ассчитайте", question)
    if marker:
        question = question[marker.start() :]

    # The words right after the asking verb name what is wanted. Excluding that
    # letter matters: «рассчитайте стоимость колодца из 20 колец» mentions the
    # unknown's own words, and without this the 20 is read as the cost.
    asked = None
    ask = re.search(r"(?:Найдите|Определите|Вычислите|[Рр]ассчитайте)\s+([^,.0-9]{3,60})", question)
    if ask:
        wanted_stems = _stems(ask.group(1))
        scored = {
            symbol: len(stems & wanted_stems) for symbol, stems in descriptions.items()
        }
        best = max(scored, key=lambda symbol: scored[symbol], default=None)
        if best is not None and scored[best] > 0:
            asked = best

    # Assign each number to the letter whose description matches the words
    # immediately around it. A narrow window is deliberate: the sentence also
    # repeats the unknown's name, and a wide window lets it win.
    known: dict[str, Fraction] = {}
    for number in VALUE_RE.finditer(question):
        around = question[max(0, number.start() - 32) : number.end() + 22]
        scores = {
            symbol: len(stems & _stems(around))
            for symbol, stems in descriptions.items()
            if symbol not in known and symbol != asked
        }
        best = max(scores, key=lambda symbol: scores[symbol], default=None)
        if best is None or scores[best] == 0:
            continue
        known[best] = Fraction(number.group(1).replace(",", "."))

    unknown = [name for name in [target, *names] if name not in known]
    if len(unknown) != 1:
        return None
    wanted = unknown[0]

    try:
        if wanted == target:
            # Everything on the right is known: just evaluate it.
            value = _evaluate(right, {name: known[name] for name in names})
            return format_answer(value)

        # The left-hand side is known and one right-hand letter is not, so
        # solve `right - target = 0` for it.
        fixed = {name: known[name] for name in names if name in known}
        expression = f"({right})-({known[target]})"
        roots = _roots(*_coefficients(_sample_with(expression, wanted, fixed)))
    except (SolveError, ZeroDivisionError, ValueError, TypeError, KeyError):
        return None

    positive = [root for root in roots if root > 0]
    if len(positive) != 1:
        return None
    return format_answer(positive[0])


def _sample_with(expression: str, variable: str, fixed: dict[str, Fraction]) -> list[Fraction]:
    """Sample `expression` in `variable` with the other letters pinned."""
    values: list[Fraction] = []
    for point in (Fraction(0), Fraction(1), Fraction(-1), Fraction(2)):
        scope = dict(fixed)
        scope[variable] = point
        value = _evaluate(expression, scope)
        values.append(value if isinstance(value, Fraction) else Fraction(value).limit_denominator(10**9))
    return values


__all__ = ["solve_formula"]
