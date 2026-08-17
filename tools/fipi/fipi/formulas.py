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

#: Greek letters, which the bank writes as LaTeX commands and physics needs.
GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "Delta": "Δ",
    "epsilon": "ε", "eta": "η", "theta": "θ", "lambda": "λ", "mu": "μ",
    "nu": "ν", "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ", "phi": "φ",
    "omega": "ω", "Omega": "Ω",
}
#: One quantity: a letter, optionally subscripted. `t_F`, `d_1`, `ω`.
LETTER = r"[A-Za-zА-Яа-я\u0391-\u03c9]"
NAME = rf"{LETTER}(?:_[A-Za-z0-9\u0391-\u03c9])?"


def _normalise_math(latex: str) -> str:
    """LaTeX as the bank writes physics, reduced to plain algebra.

    Units live in `\\text{…}` and quantities in `\\rho`-style commands, and a
    trigonometric factor is a *given number* rather than something to compute:
    the statement says `\\sin α=3/7` outright, so `\\sin α` is folded into a
    single name and treated like any other letter.
    """
    text = latex.replace("\u200b", "").replace("\u00a0", " ")
    text = re.sub(r"\\text\s*\{([^{}]*)\}", r"\1", text)
    for word, letter in GREEK.items():
        text = re.sub(rf"\\{word}(?![A-Za-z])", letter, text)
    # The braces are matched as a pair or not at all: `\sin α}` closes the
    # fraction it sits in, and eating that brace loses the denominator.
    text = re.sub(rf"\\(sin|cos|tg)\s*(?:\{{\s*({NAME})\s*\}}|({NAME}))",
                  lambda f: f"{f.group(1)[0]}_{f.group(2) or f.group(3)}", text)
    return re.sub(rf"({LETTER})_\{{([A-Za-z0-9\u0391-\u03c9])\}}", r"\1_\2", text)


def _explicit_products(latex: str) -> str:
    """Write out the multiplication the notation leaves implied: `ρgV`, `d_1d_2`.

    `\\frac` and `\\sqrt` are hidden behind placeholders first: their own
    letters are commands, not quantities, and would otherwise be multiplied
    together.
    """
    text = latex.replace("\\dfrac", "\x01").replace("\\frac", "\x01").replace("\\sqrt", "\x02")
    previous = None
    while previous != text:
        previous = text
        text = re.sub(rf"({NAME}|[)}}])\s*({NAME})", r"\1*\2", text)
        text = re.sub(rf"(\d)\s*({NAME})", r"\1*\2", text)
    return text.replace("\x01", "\\frac").replace("\x02", "\\sqrt")


def _symbol(latex: str) -> str | None:
    """Python-safe name for a formula letter, e.g. `t_F` -> `t_F`.

    A letter is often introduced together with its value — `$\\rho =1000…$` —
    so anything past the `=` is dropped before reading the name.
    """
    cleaned = _normalise_math(latex).split("=")[0]
    cleaned = cleaned.strip().replace("{", "").replace("}", "").replace("\\", "")
    match = re.fullmatch(rf"({LETTER})(?:_([a-zA-Zа-яА-Я0-9\u0391-\u03c9]))?", cleaned)
    if not match:
        return None
    return match.group(1) + ("_" + match.group(2) if match.group(2) else "")


def _stems(phrase: str) -> set[str]:
    """Content words of a description, shortened past Russian case endings."""
    words = re.findall(r"[а-яёa-z]{4,}", phrase.lower().replace("ё", "е"))
    return {word[:5] for word in words if word not in {"котор", "равна", "равен", "соста"}}


def _prepare(latex: str) -> str:
    """Translate a formula side, keeping subscripted letters as one name."""
    text = _normalise_math(latex)
    text = re.sub(rf"({LETTER})_\{{?([a-zA-Zа-яА-Я0-9])\}}?", r"\1_\2", text)
    return _latex_to_python(_explicit_products(text))


def _leading_number(latex: str) -> Fraction | None:
    """The number a quantity is introduced with, ignoring its units."""
    text = _normalise_math(latex).replace("{,}", ".").replace(",", ".")
    fraction = re.match(r"\s*\\d?frac\s*\{\s*(-?\d+(?:\.\d+)?)\s*\}\s*\{\s*(-?\d+(?:\.\d+)?)\s*\}", text)
    if fraction:
        divisor = Fraction(fraction.group(2))
        return Fraction(fraction.group(1)) / divisor if divisor else None
    plain = re.match(r"\s*(-?\d+(?:\.\d+)?)", text)
    return Fraction(plain.group(1)) if plain else None


def _assignments(text: str, quantities: set[str]) -> dict[str, Fraction]:
    """Values the statement states outright: `$d_1=6$`, `$\\rho =1000\\frac{кг}{м^3}$`.

    A right-hand side that mentions another quantity is a formula, not a value:
    `$t_F=1{,}8t_C+32$` must not be read as «t_F равно 1,8».
    """
    found: dict[str, Fraction] = {}
    for chunk in re.findall(r"\$([^$]+)\$", text):
        normalised = _normalise_math(chunk)
        match = re.match(rf"\s*({NAME})\s*=\s*(.+)$", normalised, re.DOTALL)
        if not match:
            continue
        rest = match.group(2)
        if any(re.search(rf"(?<![A-Za-z_]){re.escape(name)}(?![A-Za-z0-9_])", rest) for name in quantities):
            continue
        value = _leading_number(rest)
        if value is not None:
            found[match.group(1)] = value
    return found


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

    # `_sqrt` is this translator's own helper, not a quantity of the task.
    names = sorted(set(re.findall(NAME, right.replace("_sqrt", " "))))
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
    ask = re.search(r"(?:[Нн]айдите|[Оо]пределите|[Вв]ычислите|[Рр]ассчитайте|Скольким)\s+([^,.0-9]{3,60})", question)
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
    # Values the statement spells out as equations are certain; the prose match
    # below only has to cover what is left.
    known: dict[str, Fraction] = {
        symbol: value
        for symbol, value in _assignments(text[formula.end():], {target, *names}).items()
        if symbol in {target, *names} and symbol != asked
    }

    # ФИПИ splits a single number across `\text{}` groups — `$\text{8}\text{,5}$`
    # is one value, not two — so the question is normalised before its numbers
    # are read, exactly as the formula is.
    question = _normalise_math(question).replace("{,}", ",")
    # A subscript is part of a letter's name, not a value: without this the 2
    # of `$d_2$` is read as «диагональ равна 2» and the unknown disappears.
    question = re.sub(rf"({LETTER})_\{{?[A-Za-z0-9\u0391-\u03c9]\}}?", r"\1", question)
    # Exponents carry numbers that name nothing: `9с^{-1}`, `243м/с^2`. Left in,
    # the -1 of a unit gets read as a given quantity.
    question = re.sub(r"\^\s*\{[^{}]*\}|\^\s*-?\d+", " ", question)
    question = re.sub(r"[–−—]\s*(\d)", r"-\1", question)

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
