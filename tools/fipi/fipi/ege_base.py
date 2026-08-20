"""КИМ structure of ЕГЭ base-level mathematics, from the 2026 specification.

Taken from `research/fipi-ege-2026/spec-baz.txt`, «Обобщённый план варианта КИМ
ЕГЭ 2026 (базовый уровень)» — all 21 positions, every one a short answer at
level Б. The `kes` column is the join key against the bank, which tags each
question with a КЭС code but never with a task number, exactly like ОГЭ.

Unlike ОГЭ, the base-level КЭС barely discriminates: positions 1, 2, 6, 14, 15,
16 all carry КЭС 1, and 9–13 all carry КЭС 7. So the number cannot be read off
the КЭС alone — classification leans on text signatures and, within a variant,
position. This module is the spec-derived skeleton; the signatures live in the
classifier built on the crawled bank.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BaseSlot:
    number: int
    title: str
    #: Top-level КЭС codes the specification assigns to this position.
    kes: tuple[str, ...]


#: Titles are condensed from the specification's «проверяемые требования» column.
KIM_SLOTS_BASE: tuple[BaseSlot, ...] = (
    BaseSlot(1, "Вычисления и преобразования", ("1",)),
    BaseSlot(2, "Величины и оценка размеров", ("1",)),
    BaseSlot(3, "Таблицы, диаграммы, графики", ("1", "3", "6")),
    BaseSlot(4, "Вычисления и текстовая задача", ("1", "2")),
    BaseSlot(5, "Вероятность", ("6",)),
    BaseSlot(6, "Чтение графиков и диаграмм", ("1",)),
    BaseSlot(7, "Функция и производная по графику", ("3", "4")),
    BaseSlot(8, "Выбор верных утверждений", ("5",)),
    BaseSlot(9, "Планиметрия: размеры и величины", ("7",)),
    BaseSlot(10, "Планиметрия", ("7",)),
    BaseSlot(11, "Стереометрия", ("7",)),
    BaseSlot(12, "Планиметрия: вычисление", ("7",)),
    BaseSlot(13, "Стереометрия: вычисление", ("7",)),
    BaseSlot(14, "Вычисления и преобразования", ("1",)),
    BaseSlot(15, "Вычисления и текстовая задача", ("1",)),
    BaseSlot(16, "Вычисления и преобразования", ("1",)),
    BaseSlot(17, "Уравнения", ("2",)),
    BaseSlot(18, "Вычисления и неравенства", ("1", "2")),
    BaseSlot(19, "Числа и их свойства", ("1", "2")),
    BaseSlot(20, "Текстовая задача с уравнением", ("2",)),
    BaseSlot(21, "Задача на смекалку", ("1", "2")),
)

BASE_BY_NUMBER = {slot.number: slot for slot in KIM_SLOTS_BASE}


def base_slots_for_kes(kes_code: str) -> list[BaseSlot]:
    """Candidate base positions for a top-level КЭС code."""
    top = kes_code.split(".", 1)[0]
    return [slot for slot in KIM_SLOTS_BASE if top in slot.kes]


__all__ = ["BaseSlot", "KIM_SLOTS_BASE", "BASE_BY_NUMBER", "base_slots_for_kes"]
