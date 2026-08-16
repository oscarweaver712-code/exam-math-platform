"""Deterministic solver for the mechanically computable part of the bank.

ФИПИ publishes no answer keys, so the bank arrives without them. A large slice
of part 1 is nonetheless pure arithmetic — «Найдите значение выражения
$\\frac{21}{5}\\cdot\\frac{3}{7}$» — and can be evaluated outright.

Every candidate this module produces is checked against ФИПИ's own `solve.php`
before it is stored, so the cost of a mis-evaluated expression is a rejected
candidate, never a wrong key in the bank. That is why the evaluator is allowed
to be approximate at the edges: correctness is enforced downstream, not here.

Standard library only, like the rest of the tool.
"""

from __future__ import annotations

import math
import re
from fractions import Fraction

#: `Найдите значение выражения $…$` — optionally with a substitution.
VALUE_RE = re.compile(
    r"Найдите\s+значение\s+выражения\s*\$(?P<expr>.+?)\$\s*(?:при\s+(?P<subs>[^.]+))?\.",
    re.IGNORECASE | re.DOTALL,
)
#: The same task without math delimiters: «Найдите значение выражения 6,9+7,4.»
PLAIN_VALUE_RE = re.compile(
    r"Найдите\s+значение\s+выражения\s*(?P<expr>[\d\s.,:+\-*/()·−]+?)\s*\.\s*$",
    re.IGNORECASE,
)
SUBST_RE = re.compile(r"\$?(?P<name>[a-zA-Zа-яА-Я])\$?\s*=\s*\$?(?P<value>-?[\d.,]+)\$?")


class SolveError(ValueError):
    """The statement is outside the subset this solver handles."""


def _read_group(text: str, index: int) -> tuple[str, int]:
    """Read a balanced `{...}` starting at `index`; returns its body and the end."""
    if index >= len(text) or text[index] != "{":
        # A bare argument such as `\sqrt2`.
        return text[index : index + 1], index + 1
    depth = 0
    for position in range(index, len(text)):
        if text[position] == "{":
            depth += 1
        elif text[position] == "}":
            depth -= 1
            if depth == 0:
                return text[index + 1 : position], position + 1
    raise SolveError("незакрытая скобка")


def _expand_commands(text: str) -> str:
    """Rewrite \frac and \sqrt with balanced-brace arguments.

    A regex cannot do this: `\frac{{(4\sqrt{3})}^2}{60}` nests braces inside
    the numerator, and `[^{}]*` stops at the first inner brace.
    """
    out: list[str] = []
    index = 0
    while index < len(text):
        if text.startswith("\\frac", index) or text.startswith("\\dfrac", index):
            index += len("\\frac") if text.startswith("\\frac", index) else len("\\dfrac")
            numerator, index = _read_group(text, index)
            denominator, index = _read_group(text, index)
            out.append(f"(({_expand_commands(numerator)})/({_expand_commands(denominator)}))")
        elif text.startswith("\\sqrt", index):
            index += 5
            degree = None
            if index < len(text) and text[index] == "[":
                close = text.index("]", index)
                degree = text[index + 1 : close]
                index = close + 1
            radicand, index = _read_group(text, index)
            body = _expand_commands(radicand)
            out.append(f"(({body})**(1/({degree})))" if degree else f"_sqrt(({body}))")
        else:
            out.append(text[index])
            index += 1
    return "".join(out)


def _latex_to_python(latex: str) -> str:
    """Translate the LaTeX subset the bank uses into a Python expression."""
    text = latex.strip()

    text = text.replace("\\left", "").replace("\\right", "")
    text = text.replace("\\cdot", "*").replace("\\times", "*")
    text = text.replace("\\ ", " ").replace("\\,", "")
    text = text.replace("{,}", ".").replace(",", ".")
    # `:` is division in Russian school notation.
    text = text.replace(":", "/")
    text = text.replace("\u2212", "-").replace("\u2013", "-").replace("\u00b7", "*")

    text = _expand_commands(text)

    # Exponents: ^{...} then ^x.
    text = re.sub(r"\^\s*\{([^{}]*)\}", r"**(\1)", text)
    text = re.sub(r"\^\s*(-?\w)", r"**(\1)", text)

    # Remaining braces are grouping.
    text = text.replace("{", "(").replace("}", ")")

    # Implicit multiplication: 2(x+1), (a)(b), 3a, 6\sqrt{11}.
    text = re.sub(r"(\d)\s*\(", r"\1*(", text)
    text = re.sub(r"\)\s*\(", r")*(", text)
    text = re.sub(r"(\d)\s*(_sqrt)", r"\1*\2", text)
    text = re.sub(r"\)\s*(_sqrt)", r")*\1", text)
    text = re.sub(r"(\d)\s*([a-zA-Z\u0430-\u044f\u0410-\u042f])(?!\w)", r"\1*\2", text)
    text = re.sub(r"\)\s*([a-zA-Z])(?!\w)", r")*\1", text)

    if "\\" in text:
        raise SolveError(f"неизвестная команда LaTeX: {text!r}")
    return text


def _sqrt(value):
    """Exact square root when the radicand is a perfect square, else float."""
    fraction = Fraction(value).limit_denominator(10**9) if not isinstance(value, Fraction) else value
    numerator = math.isqrt(fraction.numerator) if fraction.numerator >= 0 else -1
    denominator = math.isqrt(fraction.denominator)
    if numerator >= 0 and numerator * numerator == fraction.numerator and denominator * denominator == fraction.denominator:
        return Fraction(numerator, denominator)
    return math.sqrt(float(fraction))


def _evaluate(expression: str, variables: dict[str, float]) -> float | Fraction:
    # Integer and decimal literals become exact fractions so the arithmetic
    # stays exact for as long as possible.
    prepared = re.sub(r"(?<![\w.])(\d+\.\d+|\d+)(?![\w.])", r"Fraction('\1')", expression)
    scope: dict[str, object] = {
        "Fraction": Fraction,
        "_sqrt": _sqrt,
        "__builtins__": {},
    }
    for name, value in variables.items():
        scope[name] = Fraction(str(value))
    try:
        return eval(prepared, scope)  # noqa: S307 - input is our own translation
    except Exception as error:  # noqa: BLE001
        raise SolveError(f"не вычисляется: {error}") from error


def format_answer(value: float | Fraction) -> str:
    """Render the way an ОГЭ answer field expects it."""
    if isinstance(value, Fraction):
        if value.denominator == 1:
            return str(value.numerator)
        value = float(value)
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    # Trim floating noise, then drop trailing zeros.
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text


def solve_statement(statement: str) -> str | None:
    """Best-effort answer for one task, or None when it is out of scope."""
    match = VALUE_RE.search(statement) or PLAIN_VALUE_RE.search(statement)
    if not match:
        return None

    variables: dict[str, float] = {}
    if match.groupdict().get("subs"):
        for found in SUBST_RE.finditer(match.group("subs")):
            raw = found.group("value").replace(",", ".").rstrip(".")
            try:
                variables[found.group("name")] = float(raw)
            except ValueError:
                return None

    try:
        expression = _latex_to_python(match.group("expr"))
        value = _evaluate(expression, variables)
    except SolveError:
        return None
    except Exception:  # noqa: BLE001 - a novel form must not stop a batch
        return None

    if isinstance(value, complex) or (isinstance(value, float) and not math.isfinite(value)):
        return None
    return format_answer(value)


def answer_variants(answer: str) -> list[str]:
    """Formats worth trying, cheapest first.

    Russian exam sheets use a decimal comma, and the bank has accepted both
    forms historically, so a fractional answer is offered twice.
    """
    variants = [answer]
    if "." in answer:
        variants.append(answer.replace(".", ","))
    return variants
