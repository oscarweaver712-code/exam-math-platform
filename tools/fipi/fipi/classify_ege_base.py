"""Assign a ЕГЭ base-level task its exam position 1–21 from the statement.

Half the base bank carries no КЭС at all, so unlike ОГЭ the number is read
mostly from the wording, which the bank repeats verbatim across hundreds of
clones. Some positions are genuinely indistinguishable in the open bank —
1, 14 and 16 are all «Найдите значение выражения» — so those collapse into a
shared bucket rather than being guessed, the way ОГЭ keeps 23/25 together.

`classify_base(task)` returns (label, confidence, method):
  label      — "5", or a bucket like "1/14/16", or None
  confidence — "certain" | "likely" | "ambiguous"
  method     — which signal fired, for auditing
"""

from __future__ import annotations

import re


#: Ordered (label, confidence, pattern, method). First match wins, so the most
#: specific wordings come first and the broad «Найдите значение» bucket last.
_RULES: tuple[tuple[str, str, str, str], ...] = (
    # --- match-type wordings, unmistakable ---------------------------------
    ("2", "certain", r"соответствие между величинами и их возможными значени", "match:величины"),
    ("18", "certain", r"Каждому из четырёх неравенств.*?соответству", "match:неравенства"),
    ("7", "certain", r"график(и|ов|а)? функци.*?(касательн|производн)", "graph:производная"),
    ("3", "likely", r"изображены графики функций вида|соответствие между (графиками|функциями)", "match:графики"),
    # --- single, confident positions ---------------------------------------
    ("5", "certain", r"вероятност", "prob"),
    ("8", "certain", r"Какое из следующих утверждений|выберите верные утвержд|Какие из следующих утвержд", "statements"),
    ("19", "certain", r"Вычеркните в числе|наименьш(ее|ую)|наибольш(ее|ую).*?(цифр|дел(ит|ят)ся)|десятичн(ую|ой) записи", "numbers"),
    ("17", "certain", r"корень уравнения|Реши(те|ть) уравнение|Реши(те|ть) неравенство", "equation"),
    ("6", "likely", r"(На диаграмме|На рисунке).*?(показан|точками|жирными точками|изображен)", "chart:reading"),
    # --- geometry families (bucketed: open bank can't split them cleanly) --
    ("11/13", "likely",
     r"форм(у|е) (конуса|цилиндра|шара|куба|параллелепипеда|пирамид|призм)|многогранник|объ[её]м|площад[ьи] поверхности",
     "solid"),
    ("9/10/12", "likely",
     r"План местности разбит на клетки|треугольник|окружност|трапеци|параллелограмм|ромб|четыр[её]хугольник|радиус|сторон[аеы]",
     "planar"),
    # --- formula given, one value asked (position 4) -----------------------
    ("4", "likely", r"можно (найти|вычислить|записать|определить) по формуле|Пользуясь (этой |приведённой )?формул|записать в виде\s*\$[^$]*=|по закону|Закон \w+ можно записать", "formula"),
    # --- computation bucket (1, 14, 16 share the exact wording) ------------
    ("1/14/16", "likely", r"Найдите значение выражения|Вычислите", "compute"),
    # --- word problems (4, 20, 21 overlap; bucket) -------------------------
    ("4/20/21", "ambiguous",
     r"(Расстояние между|поезд|автомобил|велосипед|бассейн|рабоч|цех|завод|турист|лодк|катер|теплоход|мотоцикл|сплав|раствор|смес[иь]|проценто?в?|в отношении|скидк)",
     "wordproblem"),
    # --- practical arithmetic that names money/goods/units (position 1/2) --
    ("1/2", "ambiguous",
     r"(рубл|стои(л|т|ла|мость)|копе|килограмм|\bкг\b|\bг\b|литр|метр|\bсм\b|\bмм\b|штук|пачк|упаковк|билет|цен[ауы]|деньг|оплат|тариф|счёт)",
     "practical"),
)


def classify_base(task: dict) -> Result:
    text = " ".join((task.get("statement_text") or "").split())
    for label, confidence, pattern, method in _RULES:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return label, confidence, method
    return None, "ambiguous", "none"


__all__ = ["classify_base"]
