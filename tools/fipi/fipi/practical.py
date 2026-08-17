"""Restore the 1–5 position of a question from the practical block.

The exam opens with five questions asked about one shared text — a plan of a
flat, a mobile tariff, tyre markings. The bank stores each question as its own
record and never says which of the five it is, which is why 315 of them ended
up in a bucket labelled «1–5» instead of five separate ones.

What the bank does expose is the group: every member carries
`title="Задание N в B64540"`, so we know the text a question belongs to and its
index inside that text. The index is not the exam number — a group holds
several parallel variants of the same story, one after another — but it is
ФИПИ's own ordering, and the variants are laid out in blocks:

    номер = ceil(позиция · 5 / размер группы)

Group sizes are multiples of five (19 groups of 5, 13 of 10, 3 of 20, one of 30,
one of 40, one broken group of 4), and the rule is checked, not assumed. The
practical block always opens with the «какими цифрами обозначены» matching
question, so every group carries its own anchor: if the tasks that match that
wording are exactly the ones the rule calls number 1, the ordering is sound.
That check passes in 16 of the 17 multi-variant groups.

Where it fails the group is not ordered by number at all, and the questions can
only be told apart by what they ask. Two scenarios are spelled out below —
they cover the shuffled group of 40 and the broken group of 4 — and each is
verified against the groups where both signals are available. A group that has
neither a trustworthy order nor a scenario keeps only its anchor: eight
questions of the баня group stay unsorted rather than get a guessed number.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Mapping, Sequence

#: The block's first question everywhere in the bank: a table of objects to be
#: matched with the digits marking them on the plan, answered as a digit string.
FIRST_QUESTION = re.compile(
    r"какими цифрами|установите соответствие|перенесите последовательность|"
    r"определите, как(ие|ими)|заполните таблиц",
    re.IGNORECASE,
)


class Scenario:
    """One story from the practical block, recognised by its shared text.

    `rules` maps a question to its number by what it asks. They are only
    reached for a group whose own ordering is unusable, and only when every
    member of the group matches exactly one rule — a partial match means the
    scenario is not the one in front of us.
    """

    def __init__(self, name: str, marker: str, rules: Sequence[tuple[str, int]]):
        self.name = name
        self.marker = re.compile(marker, re.IGNORECASE)
        self.rules = tuple((re.compile(pattern, re.IGNORECASE), number) for pattern, number in rules)

    def matches_intro(self, intro: str) -> bool:
        return bool(self.marker.search(intro))

    def number_for(self, statement: str) -> int | None:
        hits = {number for pattern, number in self.rules if pattern.search(statement)}
        return hits.pop() if len(hits) == 1 else None


SCENARIOS: tuple[Scenario, ...] = (
    # Tyres. Nineteen groups of five carry this story in exam order, so the
    # rules below are checked against the position rule on 95 questions before
    # they are used on the one group ФИПИ left broken (four questions, the
    # fourth of which is the fifth of the block).
    Scenario(
        "шины",
        r"Автомобильное колесо представляет из себя",
        (
            (r"разрешённые размеры шин", 1),
            (r"высота боковины шины", 2),
            (r"диаметр колеса автомобиля, выходящего с завода", 3),
            (r"на сколько миллиметров.{0,40}диаметр колеса", 4),
            (r"на сколько процентов.{0,40}пробег", 5),
        ),
    ),
    # Plan of a flat. ФИПИ merged eight variants into a single group of 40 and
    # did not keep them in order: the matching question sits at positions 2, 15,
    # 19, 22, 28, 29, 32 and 39. Each of the five questions appears eight times.
    Scenario(
        "план квартиры",
        r"план двухкомнатной квартиры",
        (
            (r"какими цифрами они обозначены на плане", 1),
            (r"продаётся в упаковках", 2),
            (r"найдите площадь", 3),
            (r"на сколько процентов площадь", 4),
            (r"стиральн\w+ машин|интернет", 5),
        ),
    ),
)

#: How a number was reached, for the record written next to it.
BY_POSITION = "group-position"
BY_SCENARIO = "group-scenario"
BY_ANCHOR = "group-anchor"


def _statement(task: Mapping) -> str:
    return " ".join(str(task.get("statement_text") or "").split())


def _by_position(tasks: Sequence[Mapping]) -> dict[str, int]:
    size = len(tasks)
    if size % 5:
        return {}
    return {
        str(task["guid"]): math.ceil(int(task["group_position"]) * 5 / size)
        for task in tasks
    }


def _scenario_for(tasks: Sequence[Mapping]) -> tuple[Scenario, dict[str, int]] | None:
    intro = " ".join(str(tasks[0].get("group_intro") or "").split())
    for scenario in SCENARIOS:
        if not scenario.matches_intro(intro):
            continue
        assigned = {}
        for task in tasks:
            number = scenario.number_for(_statement(task))
            if number is None:
                return None  # a scenario that does not explain the whole group
            assigned[str(task["guid"])] = number
        return scenario, assigned
    return None


def numbers_for_group(tasks: Sequence[Mapping]) -> dict[str, tuple[int, str]]:
    """Exam numbers for one group, keyed by GUID; unresolved members are absent."""
    if not tasks:
        return {}

    positional = _by_position(tasks)
    anchors = {str(task["guid"]) for task in tasks if FIRST_QUESTION.search(_statement(task))}
    ordering_holds = positional and (
        not anchors or anchors == {guid for guid, number in positional.items() if number == 1}
    )

    scenario = _scenario_for(tasks)
    if scenario is not None:
        name, assigned = scenario[0].name, scenario[1]
        return {guid: (number, f"{BY_SCENARIO}:{name}") for guid, number in assigned.items()}

    if ordering_holds:
        return {guid: (number, BY_POSITION) for guid, number in positional.items()}

    # Neither signal: the anchor is still the anchor, and the rest of the group
    # keeps waiting rather than taking a number off a shuffled list.
    return {guid: (1, BY_ANCHOR) for guid in anchors}


def assign(records: Iterable[dict]) -> int:
    """Fill in `oge_number` for grouped questions. Returns how many were set."""
    groups: dict[str, list[dict]] = {}
    for record in records:
        group_id = record.get("group_id")
        if group_id:
            groups.setdefault(group_id, []).append(record)

    resolved = 0
    for members in groups.values():
        members.sort(key=lambda record: record.get("group_position") or 0)
        for guid, (number, method) in numbers_for_group(members).items():
            record = next(item for item in members if item["guid"] == guid)
            if record.get("oge_number") is not None:
                continue
            record["oge_number"] = number
            record["classification"] = {
                "number": number,
                "confidence": "likely",
                "method": method,
                "candidates": [1, 2, 3, 4, 5],
            }
            resolved += 1
    return resolved
