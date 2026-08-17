"""Values ФИПИ drew as pictures, transcribed once by eye.

In 233 tasks part of the condition exists only as an inline GIF: ФИПИ exported
them from Word together with the formula-as-picture, so the statement arrives
with a hole in it — «Диагональ ромба равна 28, а . Найдите площадь», «Решите
уравнение .». Nothing in the page can fill that hole; the value is pixels.

`data/inline_math.json` holds what those pixels say, keyed by the task's short
id. What is written down is the *input* — a number, a ratio, an equation — never
an answer: the solvers still do the mathematics, and ФИПИ still confirms the
result, so a misread digit costs a rejected candidate rather than a wrong key.
"""

from __future__ import annotations

import json
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "data" / "inline_math.json"


def _load() -> dict[str, dict[str, str]]:
    if not PATH.exists():
        return {}
    with PATH.open(encoding="utf-8") as handle:
        table = json.load(handle)
    return {key: value for key, value in table.items() if isinstance(value, dict)}


TABLE = _load()


def values(short_id: str) -> dict[str, str]:
    """What was read off this task's pictures, or an empty mapping."""
    return TABLE.get(short_id, {})
