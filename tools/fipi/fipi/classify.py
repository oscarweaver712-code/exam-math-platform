"""Assign an ОГЭ task number (1–25) to a bank question.

The bank does not carry this information. It tags every question with a КЭС
code from the codifier and an answer type, and nothing else — which is why
«показать все задания №14» is impossible on the ФИПИ site itself. Recovering
the number is the whole point of this project.

Three signals, applied in order of how much they can be trusted:

1. **Answer type splits the exam in half.** «Развернутый ответ» appears only in
   part 2, so it restricts the answer to 20–25 and everything else to 1–19.
2. **Text signatures.** Several positions have a fixed wording that the bank
   reuses verbatim across hundreds of questions — «на клетчатой бумаге», «Какое
   из следующих утверждений является истинным».
3. **КЭС narrowing.** The 2026 specification assigns КЭС codes per position
   (see `config.KIM_SLOTS`); inverting that table turns a code into a candidate
   set, which the two signals above often collapse to one.

Whatever survives all three ambiguous is reported as such rather than guessed.
`verdict.candidates` then holds the shortlist for a model pass or a human.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict

from .config import KIM_BY_NUMBER, slots_for_kes

CERTAIN = "certain"
LIKELY = "likely"
AMBIGUOUS = "ambiguous"
UNRESOLVED = "unresolved"


@dataclass
class Verdict:
    number: int | None
    confidence: str
    method: str
    candidates: list[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _rx(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


# --- signatures ------------------------------------------------------------
# (pattern, number, part restriction or None, confidence)

SIGNATURES: list[tuple[re.Pattern[str], int, int | None, str]] = [
    # Position 18 is the only one that ever mentions squared paper.
    (_rx(r"клетчат\w*\s+бумаг"), 18, 1, CERTAIN),
    (_rx(r"размером\s+клетки"), 18, 1, CERTAIN),
    # Position 19 is a fixed question stem.
    (_rx(r"утвержден\w+\s+явля\w+\s+истинн"), 19, 1, CERTAIN),
    (_rx(r"как(ое|ие)\s+из\s+(следующих|перечисленных)\s+утвержден"), 19, 1, CERTAIN),
    (_rx(r"номера\s+(этих\s+)?(верных|истинных)\s+утвержден"), 19, 1, CERTAIN),
    # «Пользуясь этой формулой» is the position 12 stem.
    (_rx(r"пользуясь\s+(этой|данной|приведённой|приведенной)\s+формул"), 12, 1, CERTAIN),
    (_rx(r"(рассчитыва|вычисля)\w+\s+по\s+формуле"), 12, 1, LIKELY),
    # Position 7 places a number on the line or reads one off it. The bank asks
    # it three ways: a marked point, four points to be told apart by their
    # decimals, and a root to be put between two integers.
    (_rx(r"на\s+координатной\s+прямой\s+отмечен"), 7, 1, CERTAIN),
    (_rx(r"на\s+координатной\s+прямой\s+точк"), 7, 1, CERTAIN),
    (_rx(r"отмечен[оы]?\s+на\s+(числовой|координатной)\s+прямой"), 7, 1, CERTAIN),
    (_rx(r"между\s+какими\s+(целыми\s+)?числами"), 7, 1, CERTAIN),
    (_rx(r"принадлежит\s+(отрезку|промежутку|интервалу)"), 7, 1, CERTAIN),
    (_rx(r"какому\s+промежутку\s+принадлежит"), 7, 1, CERTAIN),
    # The practical block opens with a plan the student has to label.
    (_rx(r"пользуясь\s+описанием,\s+определите"), 1, 1, LIKELY),
    (_rx(r"перенесите\s+последовательность\s+(из\s+)?четыр[её]х\s+цифр"), 1, 1, LIKELY),
    # Position 13 asks which inequality a marked set solves — or, read the
    # other way round, which picture solves the inequality.
    (_rx(r"решением\s+как(ого|ой)\s+из\s+(указанных\s+)?неравенств"), 13, 1, CERTAIN),
    (_rx(r"укажите\s+решение\s+(системы\s+)?неравенств"), 13, 1, CERTAIN),
    (_rx(r"укажите\s+неравенство,\s+решение\s+которого"), 13, 1, CERTAIN),
    # Part 2 stems.
    (_rx(r"^\s*докажите"), 24, 2, LIKELY),
    (_rx(r"докажите,\s+что"), 24, 2, LIKELY),
    (_rx(r"постройте\s+график"), 22, 2, CERTAIN),
    (_rx(r"^\s*реши(те)?\s+(уравнение|неравенство|систему)"), 20, 2, LIKELY),
]

# --- keyword scoring for the geometry band --------------------------------
# Positions 15–18 share one requirement in the specification and one КЭС code,
# so they can only be separated by what the statement talks about.

GEOMETRY_KEYWORDS: dict[int, tuple[tuple[str, int], ...]] = {
    15: (("треугольник", 3), ("катет", 3), ("гипотенуз", 3), ("биссектрис", 2),
         ("медиан", 2), ("высот", 1), ("равнобедренн", 2), ("синус", 2), ("косинус", 2), ("тангенс", 2)),
    16: (("окружност", 3), ("круг", 2), ("хорд", 3), ("касательн", 3), ("дуг", 3),
         ("вписанн", 2), ("центральн", 2), ("радиус", 2), ("диаметр", 2), ("сектор", 2)),
    17: (("параллелограмм", 3), ("трапеци", 3), ("ромб", 3), ("четырёхугольник", 3),
         ("четырехугольник", 3), ("прямоугольник", 2), ("квадрат", 2), ("площад", 2), ("периметр", 1)),
    18: (("клетчат", 5), ("клетк", 4)),
}

#: A figure inscribed in a circle carries the subthemes of both, so the vote
#: ties and the weights above rarely clear the margin `_from_scores` asks for —
#: «Сторона равностороннего треугольника равна 8√3. Найдите радиус описанной
#: окружности» scores 5 against 3. The bank's own answer to the tie is visible
#: in the 150 such questions the weights did resolve: every one of them sits at
#: 16, whether the other figure is a triangle or a trapezoid. So the circle
#: decides, and only a statement without one falls through to its figure.
CIRCLE_SUBJECT = _rx(r"окружност|полуокружност|радиус|диаметр|хорд|касательн|касается|дуг[аиуе]")
QUADRILATERAL_SUBJECT = _rx(r"трапеци|параллелограмм|ромб|четыр[её]хугольник|прямоугольник|квадрат")
TRIANGLE_SUBJECT = _rx(r"треугольник|катет|гипотенуз|биссектрис|медиан")


def _geometry_subject(text: str, band: set[int]) -> int | None:
    """Which figure a part 1 geometry statement is actually about."""
    for pattern, number in (
        (CIRCLE_SUBJECT, 16),
        (QUADRILATERAL_SUBJECT, 17),
        (TRIANGLE_SUBJECT, 15),
    ):
        if number in band and pattern.search(text):
            return number
    return None


#: Positions 23 and 25 are the same task — «геометрическая задача на
#: вычисление» — set at two levels of difficulty, and the bank publishes no
#: difficulty. Asking «найдите» or «площадь» separates neither, it only reads
#: as an answer; the pair therefore stays a pair, and only the proof at 24 is
#: told apart, by a word that means exactly that.
PART2_GEOMETRY_PROOF = _rx(r"докажите")
GEOMETRY_PART2_PAIR = (23, 25)

PART2_ALGEBRA_KEYWORDS: dict[int, tuple[tuple[str, int], ...]] = {
    20: (("решите уравнение", 4), ("решите неравенство", 4), ("решите систему", 4),
         ("сократите", 2), ("упростите", 2), ("найдите корни", 2)),
    21: (("скорост", 3), ("велосипедист", 3), ("автомобил", 2), ("пешеход", 3),
         ("поезд", 2), ("сплав", 3), ("раствор", 3), ("смешал", 3), ("производительност", 3),
         ("рабоч", 2), ("бассейн", 2), ("вклад", 2), ("процент", 1), ("двигаясь", 3)),
    22: (("график", 4), ("функци", 3), ("прямая", 1), ("парабол", 3), ("гипербол", 3)),
}


# --- codifier subtheme → position -----------------------------------------
# The specification only gives top-level КЭС codes, but the bank tags most
# questions at subtheme granularity ("7.4 Окружность и круг"), which is a far
# sharper signal. Each entry lists the positions that subtheme can occupy in
# the given part; a task carrying several subthemes votes with all of them.

SUBTHEME_PART1: dict[str, tuple[int, ...]] = {
    "1.1": (6,), "1.2": (6,), "1.3": (6,), "1.4": (7,), "1.5": (6,),
    "2.1": (12,), "2.2": (8,), "2.3": (8,), "2.4": (8,), "2.5": (8,),
    "3.1": (9,), "3.2": (13,), "3.3": (1, 2, 3, 4, 5),
    "4.1": (14,), "4.2": (14,),
    "5.1": (11,),
    "6.1": (7,), "6.2": (11,),
    "7.1": (19,), "7.2": (15,), "7.3": (17,), "7.4": (16,),
    "7.5": (15, 16, 17, 18), "7.6": (15,),
    "8.1": (5,), "8.2": (10,), "8.3": (10,), "8.4": (19,), "8.5": (5,),
}

SUBTHEME_PART2: dict[str, tuple[int, ...]] = {
    "2.1": (20,), "2.2": (20,), "2.3": (20,), "2.4": (20, 22), "2.5": (20,),
    "3.1": (20,), "3.2": (20,), "3.3": (21,),
    "4.1": (21,), "4.2": (21,),
    "5.1": (22,), "6.1": (20,), "6.2": (22,),
    "7.1": (24,), "7.2": (23, 25), "7.3": (23, 25), "7.4": (23, 25),
    "7.5": (23, 25), "7.6": (23, 25),
}

#: The open bank flattens the practical series: each of the five questions is a
#: separate record, and the statement alone never says which of the five it is.
#: The place inside the block comes from the group the question belongs to and
#: is filled in afterwards by `practical.assign`, which needs every record at
#: once; what is reported here is the block itself.
PRACTICAL_BLOCK = (1, 2, 3, 4, 5)


def _subtheme_votes(kes_codes: list[str], part: int) -> list[tuple[int, int]]:
    table = SUBTHEME_PART1 if part == 1 else SUBTHEME_PART2
    votes: dict[int, int] = {}
    for code in kes_codes:
        for number in table.get(code, ()):
            votes[number] = votes.get(number, 0) + 1
    return sorted(votes.items(), key=lambda item: -item[1])


def _score(text: str, table: dict[int, tuple[tuple[str, int], ...]]) -> list[tuple[int, int]]:
    lowered = text.lower()
    scored = [
        (number, sum(weight for word, weight in words if word in lowered))
        for number, words in table.items()
    ]
    return sorted((item for item in scored if item[1] > 0), key=lambda item: -item[1])


def _from_scores(scored: list[tuple[int, int]], method: str) -> Verdict | None:
    if not scored:
        return None
    best_number, best_score = scored[0]
    runner_up = scored[1][1] if len(scored) > 1 else 0
    if best_score >= runner_up * 2 and best_score >= 3:
        return Verdict(best_number, LIKELY, method, [number for number, _ in scored])
    return Verdict(None, AMBIGUOUS, method, [number for number, _ in scored])


def classify(
    statement: str,
    answer_kind: str,
    kes_codes: list[str],
    extra_cells: list[str] | None = None,
) -> Verdict:
    """Best available exam number for one question."""
    text = "\n".join([statement, *(extra_cells or [])])
    part = 2 if answer_kind == "full" else 1

    # 1. «Установление соответствия» is used at exactly one position in this exam.
    if answer_kind == "match":
        return Verdict(11, CERTAIN, "answer-kind:match")

    # 2. Fixed wording.
    for pattern, number, required_part, confidence in SIGNATURES:
        if required_part is not None and required_part != part:
            continue
        if pattern.search(text):
            return Verdict(number, confidence, f"signature:{number}")

    # 3. Subtheme voting — the sharpest signal the bank actually carries.
    votes = _subtheme_votes(kes_codes, part)
    if votes:
        top_score = votes[0][1]
        winners = [number for number, score in votes if score == top_score]

        if list(winners) == list(PRACTICAL_BLOCK):
            return Verdict(None, AMBIGUOUS, "kes:practical-block", list(PRACTICAL_BLOCK))

        if len(winners) == 1:
            return Verdict(winners[0], CERTAIN, "kes:subtheme")

        band = set(winners)
        if band <= {15, 16, 17, 18}:
            verdict = _from_scores(_score(text, GEOMETRY_KEYWORDS), "keywords:geometry-part1")
            if verdict and verdict.number:
                return verdict
            subject = _geometry_subject(text, band)
            if subject:
                return Verdict(subject, LIKELY, "subject:geometry-part1", sorted(band))
        if band <= {23, 24, 25}:
            if PART2_GEOMETRY_PROOF.search(text):
                return Verdict(24, LIKELY, "keywords:geometry-part2")
            return Verdict(None, AMBIGUOUS, "kes:geometry-part2-pair", list(GEOMETRY_PART2_PAIR))
        if band <= {20, 21, 22}:
            verdict = _from_scores(_score(text, PART2_ALGEBRA_KEYWORDS), "keywords:algebra-part2")
            if verdict and verdict.number:
                return verdict
        return Verdict(None, AMBIGUOUS, "kes:subtheme-tie", sorted(band))

    # 4. No subtheme — fall back to the top-level КЭС from the specification.
    candidates: set[int] = set()
    for code in kes_codes:
        candidates.update(slot.number for slot in slots_for_kes(code, part=part))
    specific = {number for number in candidates if number > 5}
    if specific:
        candidates = specific

    if len(candidates) == 1:
        return Verdict(candidates.pop(), LIKELY, "kes:top-level-unique")

    if candidates <= {15, 16, 17, 18, 19} and candidates:
        verdict = _from_scores(_score(text, GEOMETRY_KEYWORDS), "keywords:geometry-part1")
        if verdict and verdict.number:
            return verdict
        subject = _geometry_subject(text, candidates)
        if subject:
            return Verdict(subject, LIKELY, "subject:geometry-part1", sorted(candidates))
    if candidates <= {23, 24, 25} and candidates:
        if PART2_GEOMETRY_PROOF.search(text):
            return Verdict(24, LIKELY, "keywords:geometry-part2")
        return Verdict(None, AMBIGUOUS, "kes:geometry-part2-pair", list(GEOMETRY_PART2_PAIR))

    if candidates:
        return Verdict(None, AMBIGUOUS, "kes:top-level", sorted(candidates))

    # One question in the bank carries no КЭС at all. «Найдите значение
    # выражения» over roots is the position 8 stem, and nothing else in part 1
    # asks it of an irrational expression.
    if part == 1 and _rx(r"найдите\s+значение\s+выражения").search(text):
        return Verdict(8, LIKELY, "signature:8-no-kes")
    return Verdict(None, UNRESOLVED, "none", [])


def describe(number: int | None) -> str:
    slot = KIM_BY_NUMBER.get(number) if number else None
    return slot.title if slot else "не определено"
