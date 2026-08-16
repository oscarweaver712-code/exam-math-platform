"""MathML → LaTeX.

The bank renders every formula as Presentation MathML with an `m:` prefix and
no namespace declaration, e.g.

    <m:math><m:mstyle displaystyle="true"><m:semantics><m:mrow>
      <m:mi>C</m:mi><m:mo>=</m:mo><m:mn>6500</m:mn>
    </m:mrow></m:semantics></m:mstyle></m:math>

MathJax 4 renders it in the browser; we convert it once on ingest so the stored
statement is plain text with `$…$` instead of a wall of tags.

The converter covers the element set the ОГЭ bank actually uses. Anything
unknown degrades to its concatenated text rather than raising, so a novel tag
costs fidelity on one formula instead of failing the whole crawl.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from html.entities import html5

MATH_RE = re.compile(r"<m:math\b.*?</m:math>", re.DOTALL | re.IGNORECASE)

_PREFIX_RE = re.compile(r"(</?)m:", re.IGNORECASE)
_NAMED_ENTITY_RE = re.compile(r"&([a-zA-Z][a-zA-Z0-9]*);")
_XML_SAFE = {"amp", "lt", "gt", "quot", "apos"}

#: Operators that read better as LaTeX commands than as raw characters.
_OPERATORS = {
    "−": "-",        # minus sign
    "–": "-",        # en dash used as minus
    "—": "—",   # em dash is real punctuation here
    "·": r"\cdot ",
    "⋅": r"\cdot ",   # U+22C5, what the bank actually emits for multiplication
    "∙": r"\cdot ",
    "×": r"\times ",
    "÷": r"\div ",
    # `<` and `>` must not survive as bare characters: the HTML tag stripper
    # that runs after this would swallow `<0$ , $c>` as if it were a tag, and
    # the inequality would vanish from the statement.
    "<": r"\lt ",
    ">": r"\gt ",
    "≤": r"\le ",
    "≥": r"\ge ",
    "≠": r"\ne ",
    "≈": r"\approx ",
    "±": r"\pm ",
    "∞": r"\infty ",
    "∈": r"\in ",
    "∩": r"\cap ",
    "∪": r"\cup ",
    "∠": r"\angle ",
    "△": r"\triangle ",
    "∥": r"\parallel ",
    "⊥": r"\perp ",
    "→": r"\to ",
    "⇒": r"\Rightarrow ",
    "…": r"\ldots ",
}

#: Greek and other identifiers that need a LaTeX command.
_IDENTIFIERS = {
    "α": r"\alpha", "β": r"\beta", "γ": r"\gamma",
    "δ": r"\delta", "ε": r"\varepsilon", "θ": r"\theta",
    "λ": r"\lambda", "μ": r"\mu", "π": r"\pi",
    "ρ": r"\rho", "σ": r"\sigma", "φ": r"\varphi",
    "ω": r"\omega", "Δ": r"\Delta", "Ω": r"\Omega",
}

#: Multi-letter identifiers the bank writes as function names.
_FUNCTIONS = {"sin", "cos", "tg", "ctg", "tan", "cot", "log", "ln", "lg", "arcsin", "arccos", "arctg"}


def _numeric_entities(fragment: str) -> str:
    """Turn HTML named entities into numeric ones so the XML parser accepts them."""

    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in _XML_SAFE:
            return match.group(0)
        char = html5.get(name + ";") or html5.get(name)
        if not char:
            return match.group(0)
        return "".join(f"&#{ord(c)};" for c in char)

    return _NAMED_ENTITY_RE.sub(repl, fragment)


def _strip_prefix(fragment: str) -> str:
    return _PREFIX_RE.sub(r"\1", fragment)


def _text(node: ET.Element) -> str:
    return "".join(node.itertext()).strip()


def _wrap(latex: str) -> str:
    """Brace a sub-expression only when LaTeX needs it."""
    stripped = latex.strip()
    if len(stripped) == 1 or re.fullmatch(r"\\[a-zA-Z]+", stripped):
        return stripped
    return "{" + stripped + "}"


def _convert(node: ET.Element) -> str:
    tag = node.tag.lower()
    children = list(node)

    if tag in {"math", "mstyle", "semantics", "mrow", "mpadded", "menclose"}:
        return "".join(_convert(child) for child in children)

    if tag == "annotation":
        return ""  # the semantic annotation duplicates the presentation tree

    if tag == "mi":
        raw = _text(node)
        if raw in _IDENTIFIERS:
            return _IDENTIFIERS[raw] + " "
        if raw in _FUNCTIONS:
            return "\\" + ("operatorname{%s}" % raw if raw in {"tg", "ctg", "lg", "arctg"} else raw) + " "
        return raw

    if tag == "mn":
        # The bank writes decimals with a comma; LaTeX math mode needs care.
        return _text(node).replace(",", "{,}")

    if tag == "mo":
        raw = _text(node)
        return _OPERATORS.get(raw, raw)

    if tag == "mtext":
        raw = _text(node)
        return r"\text{%s}" % raw if raw else ""

    if tag == "mspace":
        return " "

    if tag == "mfrac":
        if len(children) == 2:
            return r"\frac{%s}{%s}" % (_convert(children[0]).strip(), _convert(children[1]).strip())
        return "".join(_convert(child) for child in children)

    if tag == "msqrt":
        return r"\sqrt{%s}" % "".join(_convert(child) for child in children).strip()

    if tag == "mroot":
        if len(children) == 2:
            return r"\sqrt[%s]{%s}" % (_convert(children[1]).strip(), _convert(children[0]).strip())
        return r"\sqrt{%s}" % "".join(_convert(child) for child in children).strip()

    if tag == "msup":
        if len(children) == 2:
            return "%s^%s" % (_wrap(_convert(children[0])), _wrap(_convert(children[1])))
        return "".join(_convert(child) for child in children)

    if tag == "msub":
        if len(children) == 2:
            return "%s_%s" % (_wrap(_convert(children[0])), _wrap(_convert(children[1])))
        return "".join(_convert(child) for child in children)

    if tag == "msubsup":
        if len(children) == 3:
            return "%s_%s^%s" % (
                _wrap(_convert(children[0])),
                _wrap(_convert(children[1])),
                _wrap(_convert(children[2])),
            )
        return "".join(_convert(child) for child in children)

    if tag in {"mover", "munder", "munderover"}:
        parts = [_convert(child) for child in children]
        if tag == "mover" and len(parts) == 2:
            return r"\overline{%s}" % parts[0].strip() if parts[1].strip() in {"¯", "-"} else "".join(parts)
        return "".join(parts)

    if tag == "mfenced":
        inner = "".join(_convert(child) for child in children)
        open_char = node.get("open", "(")
        close_char = node.get("close", ")")
        return f"{open_char}{inner}{close_char}"

    if tag in {"mtable", "mtr", "mtd"}:
        # The bank uses tables only for systems; a plain join keeps them readable.
        joined = " ".join(_convert(child) for child in children if _convert(child).strip())
        return joined

    return "".join(_convert(child) for child in children) or _text(node)


def mathml_to_latex(fragment: str) -> str:
    """Convert one `<m:math>` fragment to a LaTeX string without delimiters.

    Returns the fragment's plain text if it cannot be parsed, so a malformed
    formula never aborts an import.
    """
    prepared = _numeric_entities(_strip_prefix(fragment))
    try:
        root = ET.fromstring(prepared)
    except ET.ParseError:
        return re.sub(r"<[^>]+>", "", fragment).strip()

    latex = _convert(root)
    latex = re.sub(r"\s+", " ", latex).strip()
    return latex


_NEEDS_MATH_RE = re.compile(r"[\\^_]|[A-Za-z]")


def inline_math(html: str) -> str:
    """Replace every MathML block in `html` with LaTeX, delimited only when needed.

    The bank wraps *everything* in `<m:math>`, including bare punctuation and
    plain numbers — `«где <m:math>n</m:math> <m:math>—</m:math> число колец»`.
    Delimiting those produces `$—$` in running prose, so a fragment with no
    variables and no LaTeX commands is emitted as plain text instead.
    """

    def repl(match: re.Match[str]) -> str:
        latex = mathml_to_latex(match.group(0))
        if not latex:
            return ""
        if _NEEDS_MATH_RE.search(latex):
            return f"${latex}$"
        return latex.replace("{,}", ",")

    return MATH_RE.sub(repl, html)
