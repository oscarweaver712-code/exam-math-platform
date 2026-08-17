"""Template solver for the planimetry of part 1 (ОГЭ tasks 15–18).

The bank is heavily cloned: 948 geometry tasks collapse into about a hundred
statements that differ only in their numbers. Solving them one by one would be
absurd, so this module encodes the *template* instead — one rule per family,
each family ten to sixty tasks wide.

Most of these tasks carry a drawing, but in the vast majority it is decorative:
«Катеты прямоугольного треугольника равны 8 и 15» is fully determined by the
sentence. The rules below therefore read the text only, and a family whose
numbers live in the picture (клетчатая бумага, «изображённого на рисунке») has
no rule at all.

As everywhere in this tool the answer is confirmed against ФИПИ's own
`solve.php` before it is stored, so a mis-modelled family costs rejected
candidates rather than wrong keys. Answers that do not come out clean are
dropped before that check — an ОГЭ answer of `0.5833…` means the rule matched
something it does not actually model, and there is no point spending a request
on it.

Standard library only, like the rest of the tool.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from .solver import format_answer

# --- normalisation ---------------------------------------------------------

#: Cyrillic letters that look Latin. The bank mixes them inside formulas —
#: `$СD$` with a Cyrillic С — but only there, so the map is applied to math
#: spans alone. Applied to prose it would eat every «Н» in «Найдите».
_HOMOGLYPHS = str.maketrans("АВСЕНКМОРТХУ", "ABCEHKMOPTXY")

_LATEX = (
    ("\\operatorname{tg}", " tg "),
    ("\\operatorname{ctg}", " ctg "),
    ("\\operatorname{sin}", " sin "),
    ("\\operatorname{cos}", " cos "),
    ("\\sin", " sin "),
    ("\\cos", " cos "),
    ("\\tg", " tg "),
    ("\\angle", " ∠ "),
    ("\\cdot", "*"),
    ("\\times", "×"),
    ("\\left", ""),
    ("\\right", ""),
    ("{,}", ","),
    ("\\,", " "),
    ("\\;", " "),
)


def _flatten(statement: str) -> str:
    """One-line, delimiter-free form of a statement, ready for matching."""
    text = re.sub(
        r"\$([^$]*)\$",
        lambda match: " " + match.group(1).translate(_HOMOGLYPHS) + " ",
        statement,
    )
    for command, replacement in _LATEX:
        text = text.replace(command, replacement)
    text = re.sub(r"\^\s*\{?\s*\\circ\s*\}?", "°", text)
    text = re.sub(r"\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}", r"\1/\2", text)
    text = re.sub(r"\\sqrt\s*\{([^{}]*)\}", r"√\1", text)
    text = re.sub(r"\\sqrt\s*(\d)", r"√\1", text)
    text = text.replace("\u00a0", " ").replace("\u2212", "-")
    # A formula ФИПИ drew instead of writing is a markdown image in the
    # statement. It carries no text, so matching ignores it; the value behind
    # it comes from `data/inline_math.json` instead.
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\s+", " ", text)
    # ФИПИ leaves stray spaces around punctuation and, in a handful of tasks,
    # inside a number itself («сторона AC равна 6 4»).
    text = re.sub(r"(?<=\d) (?=\d)", "", text)
    text = re.sub(r"\s+([.,;])", r"\1", text)
    text = text.replace("∠ ", "∠")
    return text.strip()


# --- numbers ---------------------------------------------------------------

_FACTOR = r"\d+(?:,\d+)?"
#: A quantity as the bank writes it: `40`, `6,5`, `8√3`, `√3`, `4√3/3`, `7/12`.
_NUM = rf"(?:{_FACTOR}/{_FACTOR}|(?:{_FACTOR})?√{_FACTOR}(?:/{_FACTOR})?|{_FACTOR})"
V = f"({_NUM})"
DEG = rf"({_FACTOR})°"

_FRACTION_RE = re.compile(rf"({_FACTOR})/({_FACTOR})")
_SURD_RE = re.compile(rf"({_FACTOR})?√({_FACTOR})(?:/({_FACTOR}))?")


def _plain(token: str) -> float:
    return float(token.replace(",", "."))


def _num(token: str) -> float:
    token = token.strip()
    fraction = _FRACTION_RE.fullmatch(token)
    if fraction:
        return _plain(fraction.group(1)) / _plain(fraction.group(2))
    surd = _SURD_RE.fullmatch(token)
    if surd:
        factor = _plain(surd.group(1)) if surd.group(1) else 1.0
        divisor = _plain(surd.group(3)) if surd.group(3) else 1.0
        return factor * math.sqrt(_plain(surd.group(2))) / divisor
    return _plain(token)


def _sin(degrees: float) -> float:
    return math.sin(math.radians(degrees))


def _tan(degrees: float) -> float:
    return math.tan(math.radians(degrees))


ROOT3 = math.sqrt(3.0)
ROOT2 = math.sqrt(2.0)


# --- families that need more than a formula ---------------------------------


def _right_triangle(text: str) -> float | None:
    """«В треугольнике ABC угол C равен 90°, …» — 60 tasks, one engine.

    Two facts are given out of {leg, leg, hypotenuse, sin, cos, tg of either
    acute angle} and a third is asked. Rather than enumerate the sixty
    combinations, the known quantities are propagated through the right-triangle
    relations until nothing new appears, and the question is then looked up.
    """
    head = re.search(r"В треугольнике ([A-Z])([A-Z])([A-Z]) угол ([A-Z]) равен 90°", text)
    if not head:
        return None
    vertices = head.group(1), head.group(2), head.group(3)
    right = head.group(4)
    if right not in vertices or len(set(vertices)) != 3:
        return None
    first, second = (vertex for vertex in vertices if vertex != right)

    def segment(one: str, other: str) -> frozenset[str]:
        return frozenset((one, other))

    hypotenuse = segment(first, second)
    leg = {first: segment(first, right), second: segment(second, right)}
    #: The leg across from an acute angle is the other vertex's leg.
    across = {first: leg[second], second: leg[first]}

    known: dict[object, float] = {}
    tail = text[head.end():]
    for found in re.finditer(rf"([A-Z])([A-Z])\s*=\s*{V}", tail):
        known[segment(found.group(1), found.group(2))] = _num(found.group(3))
    for found in re.finditer(rf"(sin|cos|tg)\s*([A-Z])\s*=\s*{V}", tail):
        known[(found.group(1), found.group(2))] = _num(found.group(3))
    if not known:
        return None

    for _ in range(5):
        one, other = known.get(leg[first]), known.get(leg[second])
        span = known.get(hypotenuse)
        if one and other and not span:
            known[hypotenuse] = math.hypot(one, other)
        if span and one and not other and span > one:
            known[leg[second]] = math.sqrt(span * span - one * one)
        if span and other and not one and span > other:
            known[leg[first]] = math.sqrt(span * span - other * other)

        for vertex in (first, second):
            opposite, adjacent = known.get(across[vertex]), known.get(leg[vertex])
            span = known.get(hypotenuse)
            sine, cosine, tangent = (
                known.get(("sin", vertex)),
                known.get(("cos", vertex)),
                known.get(("tg", vertex)),
            )
            if opposite and span and sine is None:
                known[("sin", vertex)] = opposite / span
            if adjacent and span and cosine is None:
                known[("cos", vertex)] = adjacent / span
            if opposite and adjacent and tangent is None:
                known[("tg", vertex)] = opposite / adjacent
            if sine and span and opposite is None:
                known[across[vertex]] = sine * span
            if sine and opposite and span is None:
                known[hypotenuse] = opposite / sine
            if cosine and span and adjacent is None:
                known[leg[vertex]] = cosine * span
            if cosine and adjacent and span is None:
                known[hypotenuse] = adjacent / cosine
            if tangent and adjacent and opposite is None:
                known[across[vertex]] = tangent * adjacent
            if tangent and opposite and adjacent is None:
                known[leg[vertex]] = opposite / tangent
            if sine and cosine is None and sine < 1:
                known[("cos", vertex)] = math.sqrt(1 - sine * sine)
            if cosine and sine is None and cosine < 1:
                known[("sin", vertex)] = math.sqrt(1 - cosine * cosine)

    asked = re.search(r"Найдите\s*(sin|cos|tg)\s*([A-Z])", tail)
    if asked:
        return known.get((asked.group(1), asked.group(2)))
    asked = re.search(r"Найдите\s*([A-Z])([A-Z])", tail)
    if asked:
        return known.get(segment(asked.group(1), asked.group(2)))
    return None


_ISOSCELES_RE = re.compile(
    r"В треугольнике [A-Z]{3} известно, что ([A-Z])([A-Z])=([A-Z])([A-Z]), "
    rf"∠([A-Z])([A-Z])([A-Z])={DEG}\. Найдите угол ([A-Z])([A-Z])([A-Z])"
)


def _isosceles(match: re.Match) -> float | None:
    """Base or apex angle of an isosceles triangle, whichever is asked."""
    equal = {match.group(1), match.group(2)} & {match.group(3), match.group(4)}
    if len(equal) != 1:
        return None
    apex = equal.pop()
    given_vertex = match.group(6)
    angle = _num(match.group(8))
    asked_vertex = match.group(10)
    if given_vertex == apex and asked_vertex != apex:
        return (180.0 - angle) / 2
    if given_vertex != apex and asked_vertex == apex:
        return 180.0 - 2 * angle
    if given_vertex != apex and asked_vertex != apex:
        return angle
    return None


_BISECTOR_RE = re.compile(
    rf"∠([A-Z])([A-Z])([A-Z])={DEG}, ([A-Z])([A-Z]) — биссектриса\. "
    r"Найдите угол ([A-Z])([A-Z])([A-Z])"
)


def _bisector(match: re.Match) -> float | None:
    """A bisector halves the angle at its vertex."""
    vertex, angle = match.group(2), _num(match.group(4))
    if match.group(5) != vertex:
        return None
    asked = {match.group(7), match.group(8), match.group(9)}
    if match.group(8) != vertex or match.group(6) not in asked:
        return None
    return angle / 2


_MEDIAN_RE = re.compile(
    rf"В треугольнике ([A-Z])([A-Z])([A-Z]) известно, что ([A-Z])([A-Z])={V}, "
    rf"([A-Z])([A-Z]) — медиана, [A-Z]{{2}}={V}\. Найдите ([A-Z])([A-Z])"
)


def _median(match: re.Match) -> float | None:
    """A median lands on the midpoint, so the asked half is half the side.

    The median's own length is given too and is a red herring.
    """
    triangle = {match.group(1), match.group(2), match.group(3)}
    side = {match.group(4), match.group(5)}
    length = _num(match.group(6))
    foot = match.group(8)
    asked = {match.group(10), match.group(11)}
    if side != triangle - {match.group(7)} or foot not in asked:
        return None
    if not (asked - {foot}) <= side:
        return None
    return length / 2


_MIDLINE_RE = re.compile(
    r"Точки ([A-Z]) и ([A-Z]) являются серединами сторон ([A-Z])([A-Z]) и ([A-Z])([A-Z]) "
    rf"треугольника ([A-Z])([A-Z])([A-Z]), сторона ([A-Z])([A-Z]) равна {V}, "
    rf"сторона ([A-Z])([A-Z]) равна {V}, сторона ([A-Z])([A-Z]) равна {V}\. "
    r"Найдите ([A-Z])([A-Z])"
)


def _midline(match: re.Match) -> float | None:
    """The segment joining two midpoints is half the third side."""
    first, second = {match.group(3), match.group(4)}, {match.group(5), match.group(6)}
    triangle = {match.group(7), match.group(8), match.group(9)}
    if len(first | second) != 3 or (first | second) != triangle:
        return None
    third = (first ^ second)  # the two vertices the midpoints do not share
    lengths = {
        frozenset((match.group(10), match.group(11))): _num(match.group(12)),
        frozenset((match.group(13), match.group(14))): _num(match.group(15)),
        frozenset((match.group(16), match.group(17))): _num(match.group(18)),
    }
    if {match.group(19), match.group(20)} != {match.group(1), match.group(2)}:
        return None
    length = lengths.get(frozenset(third))
    return length / 2 if length else None


_CYCLIC_RE = re.compile(
    r"Четырёхугольник ABCD вписан в окружность\. "
    rf"Угол ([A-Z]{{3}}) равен {DEG}, угол ([A-Z]{{3}}) равен {DEG}\. Найдите угол ([A-Z]{{3}})"
)


def _cyclic_quadrilateral(match: re.Match) -> float | None:
    """Angles CAD and DBC subtend the same arc CD, and BD splits angle ABC."""
    given = {match.group(1): _num(match.group(2)), match.group(3): _num(match.group(4))}
    asked = match.group(5)
    if "CAD" not in given:
        return None
    if asked == "ABD" and "ABC" in given:
        return given["ABC"] - given["CAD"]
    if asked == "ABC" and "ABD" in given:
        return given["ABD"] + given["CAD"]
    return None


_HALF_DIAGONAL_RE = re.compile(
    r"Диагонали ([A-Z])([A-Z]) и ([A-Z])([A-Z]) параллелограмма [A-Z]{4} "
    rf"пересекаются в точке ([A-Z]), ([A-Z]{{2}})={V}, ([A-Z]{{2}})={V}, ([A-Z]{{2}})={V}\. "
    r"Найдите ([A-Z])([A-Z])"
)


def _half_diagonal(match: re.Match) -> float | None:
    """The diagonals of a parallelogram bisect each other."""
    diagonals = [
        frozenset((match.group(1), match.group(2))),
        frozenset((match.group(3), match.group(4))),
    ]
    centre = match.group(5)
    given = {
        frozenset(match.group(6)): _num(match.group(7)),
        frozenset(match.group(8)): _num(match.group(9)),
        frozenset(match.group(10)): _num(match.group(11)),
    }
    asked = {match.group(12), match.group(13)}
    if centre not in asked:
        return None
    endpoint = (asked - {centre}).pop()
    for diagonal in diagonals:
        if endpoint in diagonal and diagonal in given:
            return given[diagonal] / 2
    return None


_WHOLE_DIAGONAL_RE = re.compile(
    r"Диагонали ([A-Z])([A-Z]) и ([A-Z])([A-Z]) прямоугольника [A-Z]{4} "
    rf"пересекаются в точке ([A-Z]), ([A-Z]{{2}})={V}, ([A-Z]{{2}})={V}\. Найдите ([A-Z])([A-Z])"
)


def _whole_diagonal(match: re.Match) -> float | None:
    """A rectangle's diagonals are equal, so half of one gives the other."""
    diagonals = {
        frozenset((match.group(1), match.group(2))),
        frozenset((match.group(3), match.group(4))),
    }
    centre = match.group(5)
    asked = frozenset((match.group(10), match.group(11)))
    if asked not in diagonals:
        return None
    for letters, value in (
        (match.group(6), match.group(7)),
        (match.group(8), match.group(9)),
    ):
        if centre in letters:
            return 2 * _num(value)
    return None


_TRAPEZOID_DIAGONAL_RE = re.compile(
    r"В равнобедренной трапеции с основаниями [A-Z]{2} и [A-Z]{2} "
    rf"угол ([A-Z]) равен {DEG}\. Диагональ ([A-Z])([A-Z]) образует со стороной ([A-Z]{{2}}) "
    rf"угол {DEG}\. Сколько градусов составляет угол между этой диагональю и меньшим основанием"
)


def _trapezoid_diagonal(match: re.Match) -> float | None:
    """The angle the diagonal makes with the shorter base.

    With the lateral side at the diagonal's *starting* vertex the wanted angle
    closes the triangle on the larger base: `base − given`. With the side at its
    far vertex the triangle is the other one: `180 − base − given`.
    """
    base_angle = _num(match.group(2))
    start, finish = match.group(3), match.group(4)
    side = set(match.group(5))
    given = _num(match.group(6))
    if start in side:
        return base_angle - given
    if finish in side:
        return 180.0 - base_angle - given
    return None


def _extreme(text: str, values: list[float]) -> float | None:
    """Pick the larger or the smaller of the angles a statement allows."""
    if re.search(r"бо.?ьш", text):
        return max(values)
    if re.search(r"меньш", text):
        return min(values)
    return None


# --- one rule per family ----------------------------------------------------

RULES: list[tuple[re.Pattern, object]] = [
    # --- right triangle, without the drawing -------------------------------
    (re.compile(rf"Катеты прямоугольного треугольника равны {V} и {V}\. Найдите гипотенузу"),
     lambda m: math.hypot(_num(m.group(1)), _num(m.group(2)))),
    (re.compile(rf"В прямоугольном треугольнике катет и гипотенуза равны {V} и {V}"),
     lambda m: math.sqrt(_num(m.group(2)) ** 2 - _num(m.group(1)) ** 2)),
    (re.compile(rf"Два катета прямоугольного треугольника равны {V} и {V}\. Найдите площадь"),
     lambda m: _num(m.group(1)) * _num(m.group(2)) / 2),
    (re.compile(rf"Один из острых углов прямоугольного треугольника равен {DEG}"),
     lambda m: 90.0 - _num(m.group(1))),

    # --- triangle, angles ---------------------------------------------------
    (re.compile(rf"В треугольнике два угла равны {DEG} и {DEG}\. Найдите его третий угол"),
     lambda m: 180.0 - _num(m.group(1)) - _num(m.group(2))),
    (_ISOSCELES_RE, _isosceles),
    (_BISECTOR_RE, _bisector),
    (re.compile(rf"В треугольнике [A-Z]{{3}} угол [A-Z] равен {DEG}\. "
                r"Найдите внешний угол при вершине"),
     lambda m: 180.0 - _num(m.group(1))),
    (re.compile(r"В остроугольном треугольнике [A-Z]{3} проведена высота [A-Z]{2}, "
                rf"∠[A-Z]{{3}}={DEG}\. Найдите угол"),
     lambda m: 90.0 - _num(m.group(1))),
    (_MEDIAN_RE, _median),
    (_MIDLINE_RE, _midline),

    # --- triangle, lengths and area ----------------------------------------
    (re.compile(rf"Сторона треугольника равна {V}, а высота, проведённая к этой стороне, "
                rf"равна {V}\. Найдите площадь"),
     lambda m: _num(m.group(1)) * _num(m.group(2)) / 2),
    (re.compile(rf"Периметр треугольника равен {V}, одна из сторон равна {V}, "
                rf"а радиус вписанной в него окружности равен {V}\. Найдите площадь"),
     lambda m: _num(m.group(1)) * _num(m.group(3)) / 2),

    # --- equilateral triangle: median, height and bisector coincide ---------
    (re.compile(rf"Радиус окружности, вписанной в равносторонний треугольник, равен {V}\. "
                r"Найдите длину стороны"),
     lambda m: 2 * ROOT3 * _num(m.group(1))),
    (re.compile(rf"Сторона равностороннего треугольника равна {V}\. "
                r"Найдите радиус окружности, вписанной"),
     lambda m: _num(m.group(1)) / (2 * ROOT3)),
    (re.compile(rf"Сторона равностороннего треугольника равна {V}\. "
                r"Найдите (?:биссектрису|медиану|высоту)"),
     lambda m: _num(m.group(1)) * ROOT3 / 2),
    (re.compile(rf"(?:Медиана|Биссектриса|Высота) равностороннего треугольника равна {V}\. "
                r"Найдите сторону"),
     lambda m: 2 * _num(m.group(1)) / ROOT3),

    # --- circle -------------------------------------------------------------
    (re.compile(r"Центр окружности, описанной около треугольника [A-Z]{3}, лежит на стороне "
                rf"[A-Z]{{2}}\. Найдите угол [A-Z]{{3}}, если угол [A-Z]{{3}} равен {DEG}"),
     lambda m: 90.0 - _num(m.group(1))),
    (re.compile(r"Центр окружности, описанной около треугольника [A-Z]{3}, лежит на стороне "
                rf"[A-Z]{{2}}\. Радиус окружности равен {V}\. "
                rf"Найдите [A-Z]{{2}}, если [A-Z]{{2}}={V}"),
     lambda m: math.sqrt((2 * _num(m.group(1))) ** 2 - _num(m.group(2)) ** 2)),
    (_CYCLIC_RE, _cyclic_quadrilateral),
    (re.compile(rf"Угол [A-Z] четырёхугольника [A-Z]{{4}}, вписанного в окружность, равен {DEG}\. "
                r"Найдите угол"),
     lambda m: 180.0 - _num(m.group(1))),
    (re.compile(r"В окружности с центром в точке [A-Z] отрезки [A-Z]{2} и [A-Z]{2} — диаметры\. "
                rf"Угол [A-Z]{{3}} равен {DEG}\. Найдите угол"),
     lambda m: 90.0 - _num(m.group(1)) / 2),
    (re.compile(r"Отрезки [A-Z]{2} и [A-Z]{2} — диаметры окружности с центром в точке [A-Z]\. "
                rf"Угол [A-Z]{{3}} равен {DEG}\. Найдите угол"),
     lambda m: 180.0 - 2 * _num(m.group(1))),
    (re.compile(r"Треугольник [A-Z]{3} вписан в окружность с центром в точке [A-Z]\. "
                r"Точки [A-Z] и [A-Z] лежат в одной полуплоскости.*?"
                rf"если угол [A-Z]{{3}} равен {DEG}"),
     lambda m: _num(m.group(1)) / 2),
    (re.compile(r"На окружности по разные стороны от диаметра [A-Z]{2} взяты точки [A-Z] и [A-Z]"
                rf".*?∠[A-Z]{{3}}={DEG}\. Найдите угол"),
     lambda m: 90.0 - _num(m.group(1))),
    (re.compile(rf"Четырёхугольник [A-Z]{{4}} описан около окружности, [A-Z]{{2}}={V}, "
                rf"[A-Z]{{2}}={V}, [A-Z]{{2}}={V}\. Найдите"),
     lambda m: _num(m.group(1)) + _num(m.group(3)) - _num(m.group(2))),
    (re.compile(r"Касательные в точках [A-Z] и [A-Z] к окружности с центром в точке [A-Z] "
                rf"пересекаются под углом {DEG}\. Найдите угол"),
     lambda m: _num(m.group(1)) / 2),

    # --- circles, in the wording the classifier could not place -------------
    # These read like tasks 15–17 but carry a КЭС that fits several positions,
    # so they land in the «требует разбора» bucket. The geometry is the same.
    (re.compile(r"Угол [A-Z] трапеции [A-Z]{4} с основаниями [A-Z]{2} и [A-Z]{2}, "
                rf"вписанной в окружность, равен {DEG}\. Найдите угол"),
     # A trapezoid fits a circle only if it is isosceles; the two angles on one
     # lateral side lie between the parallel bases and add up to a straight angle.
     lambda m: 180.0 - _num(m.group(1))),
    (re.compile(rf"Сторона равностороннего треугольника равна {V}\. "
                r"Найдите радиус окружности, описанной"),
     lambda m: _num(m.group(1)) / ROOT3),
    (re.compile(r"Радиус окружности, описанной около равностороннего треугольника, "
                rf"равен {V}\. Найдите длину стороны"),
     lambda m: _num(m.group(1)) * ROOT3),
    (re.compile(rf"В треугольнике [A-Z]{{3}} известно, что [A-Z]{{2}}={V}, [A-Z]{{2}}={V}, "
                rf"sin ∠[A-Z]{{3}}={V}\. Найдите площадь"),
     lambda m: _num(m.group(1)) * _num(m.group(2)) * _num(m.group(3)) / 2),
    (re.compile(r"Трапеция [A-Z]{4} с основаниями [A-Z]{2} и [A-Z]{2} описана около окружности, "
                rf"[A-Z]{{2}}={V}, [A-Z]{{2}}={V}, [A-Z]{{2}}={V}\. Найдите"),
     lambda m: _num(m.group(1)) + _num(m.group(3)) - _num(m.group(2))),
    (re.compile(rf"В треугольнике [A-Z]{{3}} известно, что [A-Z]{{2}}={V}, [A-Z]{{2}}={V}, "
                r"угол [A-Z] равен 90°\. Найдите радиус описанной"),
     # The hypotenuse of a right triangle is a diameter of its circumcircle.
     lambda m: math.hypot(_num(m.group(1)), _num(m.group(2))) / 2),
    (re.compile(rf"В треугольнике [A-Z]{{3}} угол [A-Z] равен {DEG}, [A-Z]{{2}}={V}\. "
                r"Найдите радиус окружности, описанной"),
     lambda m: _num(m.group(2)) / (2 * _sin(_num(m.group(1))))),
    (re.compile(r"Точка [A-Z] является серединой стороны [A-Z]{2} квадрата [A-Z]{4}\. "
                r"Радиус окружности с центром в точке [A-Z], проходящей через вершину [A-Z], "
                rf"равен {V}\. Найдите площадь квадрата"),
     # Half a side and a whole side away from the vertex: R² = a²/4 + a².
     lambda m: 4 * _num(m.group(1)) ** 2 / 5),

    # --- square -------------------------------------------------------------
    (re.compile(rf"Сторона квадрата равна {V}\. Найдите диагональ"),
     lambda m: _num(m.group(1)) * ROOT2),
    (re.compile(rf"Сторона квадрата равна {V}\. Найдите радиус окружности, описанной"),
     lambda m: _num(m.group(1)) / ROOT2),
    (re.compile(rf"Сторона квадрата равна {V}\. Найдите радиус окружности, вписанной"),
     lambda m: _num(m.group(1)) / 2),
    (re.compile(rf"Радиус окружности, описанной около квадрата, равен {V}\. Найдите длину стороны"),
     lambda m: _num(m.group(1)) * ROOT2),
    (re.compile(rf"Радиус вписанной в квадрат окружности равен {V}\. Найдите диагональ"),
     lambda m: 2 * _num(m.group(1)) * ROOT2),
    (re.compile(rf"Найдите площадь квадрата, описанного около окружности радиуса {V}"),
     lambda m: 4 * _num(m.group(1)) ** 2),

    # --- rhombus ------------------------------------------------------------
    (re.compile(rf"Сторона ромба равна {V}, а один из углов этого ромба равен {DEG}\. "
                r"Найдите высоту"),
     lambda m: _num(m.group(1)) * _sin(_num(m.group(2)))),
    (re.compile(rf"Периметр ромба равен {V}, а один из углов равен {DEG}\. Найдите площадь"),
     lambda m: (_num(m.group(1)) / 4) ** 2 * _sin(_num(m.group(2)))),
    (re.compile(rf"В ромбе ABCD угол ABC равен {DEG}\. Найдите угол ACD"),
     lambda m: (180.0 - _num(m.group(1))) / 2),
    (re.compile(rf"Острый угол ромба равен {DEG}\. Сколько градусов составляет угол между "
                r"стороной и меньшей диагональю"),
     lambda m: 90.0 - _num(m.group(1)) / 2),
    (re.compile(rf"Один из углов ромба равен {DEG}\. Сколько градусов составляет угол между "
                r"высотой и большей диагональю"),
     lambda m: 90.0 - min(_num(m.group(1)), 180.0 - _num(m.group(1))) / 2),
    (re.compile(r"Перпендикуляр, проведённый из точки пересечения диагоналей ромба к его стороне, "
                rf"образует с одной из его диагоналей угол {DEG}\. "
                r"Сколько градусов составляет острый угол"),
     lambda m: min(2 * _num(m.group(1)), 180.0 - 2 * _num(m.group(1)))),
    (re.compile(rf"Один из углов ромба равен {DEG}\. Найдите (?:бо.?ьший|меньший) угол"),
     lambda m: _extreme(m.group(0), [_num(m.group(1)), 180.0 - _num(m.group(1))])),
    (re.compile(rf"Диагональ [A-Z]{{2}} ромба [A-Z]{{4}} равна {V}, а tg [A-Z]{{3}}={V}\. "
                r"Найдите площадь"),
     lambda m: _num(m.group(1)) ** 2 * _num(m.group(2)) / 2),

    # --- parallelogram ------------------------------------------------------
    (re.compile(rf"Один из углов параллелограмма равен {DEG}\. Найдите (?:бо.?ьший|меньший) угол"),
     lambda m: _extreme(m.group(0), [_num(m.group(1)), 180.0 - _num(m.group(1))])),
    (re.compile(r"Диагональ [A-Z]{2} параллелограмма [A-Z]{4} образует с его сторонами углы, "
                rf"равные {DEG} и {DEG}\. Найдите (?:бо.?ьший|меньший) угол"),
     lambda m: _extreme(
         m.group(0),
         [_num(m.group(1)) + _num(m.group(2)), 180.0 - _num(m.group(1)) - _num(m.group(2))],
     )),
    (re.compile(r"Найдите острый угол параллелограмма [A-Z]{4}, если биссектриса угла [A-Z] "
                rf"образует со стороной [A-Z]{{2}} угол, равный {DEG}"),
     lambda m: min(2 * _num(m.group(1)), 180.0 - 2 * _num(m.group(1)))),
    (_HALF_DIAGONAL_RE, _half_diagonal),
    (re.compile(rf"Площадь параллелограмма равна {V}, а две его стороны равны {V} и {V}\. "
                r"Найдите его высоты\. В ответе укажите (?:бо.?ьшую|меньшую) высоту"),
     lambda m: _extreme(
         m.group(0),
         [_num(m.group(1)) / _num(m.group(2)), _num(m.group(1)) / _num(m.group(3))],
     )),

    # --- rectangle ----------------------------------------------------------
    (re.compile(rf"Диагональ прямоугольника образует угол {DEG} с одной из его сторон\. "
                r"Найдите острый угол между диагоналями"),
     lambda m: min(2 * _num(m.group(1)), 180.0 - 2 * _num(m.group(1)))),
    (_WHOLE_DIAGONAL_RE, _whole_diagonal),
    (re.compile(rf"Синус угла между стороной и диагональю прямоугольника равен {V}\. "
                rf"Диаметр описанной около него окружности равен {V}\. Найдите площадь"),
     lambda m: _num(m.group(2)) ** 2 * _num(m.group(1))
     * math.sqrt(1 - _num(m.group(1)) ** 2)),

    # --- trapezoid ----------------------------------------------------------
    (re.compile(rf"Основания трапеции равны {V} и {V}, а высота равна {V}\. "
                r"Найдите среднюю линию"),
     lambda m: (_num(m.group(1)) + _num(m.group(2))) / 2),
    (re.compile(rf"Основания трапеции равны {V} и {V}, а высота равна {V}\. Найдите площадь"),
     lambda m: (_num(m.group(1)) + _num(m.group(2))) / 2 * _num(m.group(3))),
    (re.compile(rf"Основания трапеции равны {V} и {V}\. Найдите больший из отрезков, "
                r"на которые делит среднюю линию"),
     lambda m: max(_num(m.group(1)), _num(m.group(2))) / 2),
    (re.compile(r"Радиус окружности, вписанной в (?:равнобедренную |прямоугольную )?трапецию, "
                rf"равен {V}\. Найдите высоту"),
     lambda m: 2 * _num(m.group(1))),
    (re.compile(r"Высота равнобедренной трапеции, проведённая из "
                r"(?:конца её меньшего основания|вершины [A-Z]), делит "
                rf"(?:большее основание|основание [A-Z]{{2}}) на отрезки длиной {V} и {V}"),
     lambda m: abs(_num(m.group(1)) - _num(m.group(2)))),
    (re.compile(rf"Диагональ равнобедренной трапеции образует с её основанием угол {DEG}\. "
                rf"Найдите высоту трапеции, если её основания равны {V} и {V}"),
     lambda m: (_num(m.group(2)) + _num(m.group(3))) / 2 * _tan(_num(m.group(1)))),
    (re.compile(r"Диагональ равнобедренной трапеции образует с боковыми сторонами углы "
                rf"{DEG} и {DEG}\. Сколько градусов составляет угол при большем основании"),
     # The angle at the larger base is the acute one, which fixes which of the
     # two given angles sits at the diagonal's own vertex.
     lambda m: (180.0 + min(_num(m.group(1)), _num(m.group(2)))
                - max(_num(m.group(1)), _num(m.group(2)))) / 2),
    (_TRAPEZOID_DIAGONAL_RE, _trapezoid_diagonal),
    (re.compile(rf"В равнобедренной трапеции [A-Z]{{4}} угол [A-Z] равен {DEG}\. "
                r"Найдите градусную меру угла [A-Z]{3}, если луч [A-Z]{2} является биссектрисой"),
     lambda m: 180.0 - 1.5 * _num(m.group(1))),
    (re.compile(rf"Один из углов равнобедренной трапеции равен {DEG}\. "
                r"Найдите (?:бо.?ьший|меньший) угол"),
     lambda m: _extreme(m.group(0), [_num(m.group(1)), 180.0 - _num(m.group(1))])),
    (re.compile(rf"Один из углов прямоугольной трапеции равен {DEG}\. "
                r"Найдите (?:бо.?ьший|меньший) угол"),
     lambda m: _extreme(m.group(0), [90.0, _num(m.group(1)), 180.0 - _num(m.group(1))])),
    (re.compile(rf"Сумма двух углов равнобедренной трапеции равна {DEG}\. "
                r"Найдите (?:бо.?ьший|меньший) угол"),
     lambda m: _extreme(m.group(0), [_num(m.group(1)) / 2, 180.0 - _num(m.group(1)) / 2])),
    (re.compile(rf"В равнобедренной трапеции основания равны {V} и {V}, а один из углов между "
                rf"боковой стороной и основанием равен {DEG}\. Найдите площадь"),
     lambda m: (_num(m.group(1)) + _num(m.group(2))) / 2
     * abs(_num(m.group(1)) - _num(m.group(2))) / 2 * _tan(_num(m.group(3)))),
]


# --- families whose numbers ФИПИ drew instead of writing ---------------------

#: In 193 tasks of the bank a formula is an inline GIF (`innerimgN.gif`) rather
#: than text, so the exported HTML carries an empty `<span>` where the number
#: should be and the statement arrives with a hole in it. Nothing in the page
#: can fill it — the value exists only as pixels — so the 53 geometry tasks
#: affected were read off their own images once and written down in
#: `data/inline_math.json`, keyed by short id. The confirmation step is
#: unchanged: a misread value costs a rejected candidate, not a wrong key.
INLINE_MATH_PATH = Path(__file__).resolve().parent.parent / "data" / "inline_math.json"


def _load_inline_math() -> dict[str, dict[str, str]]:
    if not INLINE_MATH_PATH.exists():
        return {}
    with INLINE_MATH_PATH.open(encoding="utf-8") as handle:
        table = json.load(handle)
    return {key: value for key, value in table.items() if isinstance(value, dict)}


INLINE_MATH = _load_inline_math()

#: `(broken statement, handler)`. The handler receives the match on the
#: hole-ridden text plus the transcribed values for that task.
INLINE_RULES: list[tuple[re.Pattern, object]] = [
    # The centre of an equilateral triangle's circumcircle is also its incentre,
    # so the distance to the sides is the inradius: side = 2r√3.
    (re.compile(r"В окружность с центром в точке вписан равносторонний треугольник\. "
                r"Расстояние от точки до сторон треугольника равно"),
     lambda m, v: 2 * ROOT3 * _num(v["r"])),
    # BM = AM = MC puts M at equal distance from all three vertices, so AC is a
    # diameter and the angle at B is right.
    (re.compile(r"В треугольнике проведена медиана\. Найдите градусную меру угла"),
     lambda m, v: 90.0 - _num(v["c"])),
    # AK = CK makes AKC isosceles, so ∠KAC = ∠C and the bisected angle A is 2∠C.
    (re.compile(r"В треугольнике проведена биссектриса\. Найдите градусную меру угла"),
     lambda m, v: 180.0 - 3 * _num(v["c"])),
    # tg BCA is the ratio of the half-diagonals; the inradius of a rhombus is
    # the leg product over the hypotenuse of that right triangle.
    (re.compile(rf"Диагональ ромба равна {V}, а\. Найдите радиус окружности, вписанной в ромб"),
     lambda m, v: (_num(m.group(1)) / 2) * (_num(v["t"]) * _num(m.group(1)) / 2)
     / math.hypot(_num(m.group(1)) / 2, _num(v["t"]) * _num(m.group(1)) / 2)),
    (re.compile(rf"Диагональ ромба равна {V}, а\. Найдите площадь ромба"),
     lambda m, v: _num(v["t"]) * _num(m.group(1)) ** 2 / 2),
    # The diagonal of a rectangle is the circumcircle's diameter.
    (re.compile(r"Синус угла между стороной и диагональю прямоугольника равен\. "
                rf"Диаметр описанной около него окружности равен {V}"),
     lambda m, v: _num(m.group(1)) ** 2 * _num(v["s"]) * math.sqrt(1 - _num(v["s"]) ** 2)),
]


def _finish(value: float | None) -> str | None:
    """Reject anything that is not a plausible ОГЭ answer, then format it.

    A length or an angle is positive, and these tasks are built to come out
    round. A ragged value means the rule matched a statement it does not model,
    and there is no point asking ФИПИ about it.
    """
    if value is None:
        return None
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        return None
    if abs(value - round(value, 2)) > 1e-6:
        return None
    return format_answer(round(value, 6))


def solve_geometry(statement: str, short_id: str = "") -> str | None:
    """Answer for one geometry task, or None when no template covers it."""
    text = _flatten(statement)

    transcribed = INLINE_MATH.get(short_id)
    if transcribed:
        for pattern, handler in INLINE_RULES:
            match = pattern.search(text)
            if not match:
                continue
            try:
                return _finish(handler(match, transcribed))
            except (ValueError, ZeroDivisionError, TypeError, KeyError, IndexError):
                return None

    try:
        value = _right_triangle(text)
    except (ValueError, ZeroDivisionError, TypeError):
        value = None
    if value is not None:
        return _finish(value)

    for pattern, handler in RULES:
        match = pattern.search(text)
        if not match:
            continue
        try:
            value = handler(match)
        except (ValueError, ZeroDivisionError, TypeError, IndexError):
            continue
        if value is not None:
            return _finish(value)
    return None
