"""Checks for the ФИПИ importer. Run with `python3 -m unittest discover tests`.

The fixtures are trimmed from real bank responses, so they carry the quirks the
parser exists to handle: `m:`-prefixed MathML, images written by JavaScript,
and nested tables inside a statement cell.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fipi.classify import AMBIGUOUS, CERTAIN, classify  # noqa: E402
from fipi.config import slots_for_kes  # noqa: E402
from fipi.mathml import inline_math, mathml_to_latex  # noqa: E402
from fipi.parse import parse_page, to_text  # noqa: E402

MATH = "<m:math><m:mstyle displaystyle=\"true\"><m:semantics>{}</m:semantics></m:mstyle></m:math>"

QBLOCK = """
<div class="qblock" id='q041048'>
  <form id='checkform041048'>
  <input type="Hidden" name="guid" value="02F5026F38D4B51C4CFFD8887FD9D1C8">
  <TABLE><TR><TD valign=top class='cell_0'>
    <p>Стоимость колодца рассчитывается по формуле
    <m:math><m:mstyle displaystyle="true"><m:semantics><m:mrow>
      <m:mi>C</m:mi><m:mo>=</m:mo><m:mn>6500</m:mn><m:mo>+</m:mo><m:mn>4000</m:mn><m:mi>n</m:mi>
    </m:mrow></m:semantics></m:mstyle></m:math>.
    Пользуясь этой формулой, рассчитайте стоимость колодца из 11 колец.</p>
    <table><tr><td>вложенная</td><td>таблица</td></tr></table>
  </TD></TR>
  <TR bgcolor="#FFFFFF"><TD><TABLE class='submit-outblock'></TABLE></TD></TR></TABLE>
  </form>
</div>
<div id='i041048'>
  <div class="task-info-content"><table><tbody>
    <tr><td class="param-name">КЭС:</td><td class="param-row"><div>2.1 Буквенные выражения</div></td></tr>
    <tr><td class="param-name">Тип ответа:</td><td>Краткий ответ</td></tr>
  </tbody></table></div>
  <div class="id-text">Номер: <span class="canselect">041048</span></div>
</div>
<div class="qblock" id='q4F5745'>
  <form id='checkform4F5745'>
  <input type="Hidden" name="guid" value="0088136AD101954045CAED9DA7A77650">
  <script>ShowPictureQ('docs/DE0E276E497AB3784C3FC4CC20248DC0/questions/0088136AD101954045CAED9DA7A77650/xs3qstsrc0088_1_1485782157.png','рисунок')</script>
  <TABLE><TR><TD class='cell_0'>
    <p>На клетчатой бумаге с размером клетки 1&times;1 изображён треугольник. Найдите его площадь.</p>
  </TD></TR>
  <TR bgcolor="#FFFFFF"><TD></TD></TR></TABLE>
  </form>
</div>
<div id='i4F5745'>
  <div class="task-info-content"><table><tbody>
    <tr><td class="param-name">КЭС:</td><td class="param-row"><div>7.5 Измерение геометрических величин</div></td></tr>
    <tr><td class="param-name">Тип ответа:</td><td>Краткий ответ</td></tr>
  </tbody></table></div>
  <div class="id-text">Номер: <span class="canselect">4F5745</span></div>
</div>
"""


class MathMLTests(unittest.TestCase):
    def test_operators_and_structure(self) -> None:
        cases = {
            "<m:mrow><m:mi>C</m:mi><m:mo>=</m:mo><m:mn>65</m:mn></m:mrow>": "C=65",
            "<m:msqrt><m:mn>144</m:mn></m:msqrt>": r"\sqrt{144}",
            "<m:mfrac><m:mn>3</m:mn><m:mn>10</m:mn></m:mfrac>": r"\frac{3}{10}",
            "<m:msup><m:mi>x</m:mi><m:mn>2</m:mn></m:msup>": "x^2",
            "<m:msub><m:mi>a</m:mi><m:mn>12</m:mn></m:msub>": "a_{12}",
        }
        for fragment, expected in cases.items():
            self.assertEqual(mathml_to_latex(MATH.format(fragment)), expected)

    def test_dot_operator_becomes_cdot(self) -> None:
        latex = mathml_to_latex(MATH.format("<m:mrow><m:mn>2</m:mn><m:mo>&#x22C5;</m:mo><m:mn>3</m:mn></m:mrow>"))
        self.assertIn(r"\cdot", latex)

    def test_bare_punctuation_is_not_wrapped_in_math(self) -> None:
        # The bank wraps even a lone dash in <m:math>; `$—$` in prose is wrong.
        rendered = inline_math("где " + MATH.format("<m:mo>&#x2014;</m:mo>") + " число колец")
        self.assertNotIn("$", rendered)
        self.assertIn("—", rendered)

    def test_variables_stay_in_math_mode(self) -> None:
        self.assertEqual(inline_math(MATH.format("<m:mi>n</m:mi>")), "$n$")

    def test_malformed_input_degrades_to_text(self) -> None:
        self.assertEqual(mathml_to_latex("<m:math><m:mi>x</m:mi>"), "x")


class ParseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tasks = parse_page(QBLOCK, 0)

    def test_finds_every_block(self) -> None:
        self.assertEqual(len(self.tasks), 2)

    def test_reads_guid_and_short_id(self) -> None:
        self.assertEqual(self.tasks[0].guid, "02F5026F38D4B51C4CFFD8887FD9D1C8")
        self.assertEqual(self.tasks[0].short_id, "041048")

    def test_nested_table_stays_inside_the_statement(self) -> None:
        # A non-greedy `</TD>` match would truncate the statement here.
        self.assertIn("вложенная", self.tasks[0].statement_text)
        self.assertIn("Пользуясь этой формулой", self.tasks[0].statement_text)

    def test_mathml_is_converted_in_the_statement(self) -> None:
        self.assertIn("$C=6500+4000n$", self.tasks[0].statement_text)
        self.assertNotIn("m:math", self.tasks[0].statement_text)

    def test_image_comes_from_the_javascript_call(self) -> None:
        # There is no <img> tag anywhere in the fixture.
        self.assertNotIn("<img", QBLOCK.lower())
        self.assertEqual(len(self.tasks[1].images), 1)
        self.assertTrue(self.tasks[1].images[0].endswith("_1_1485782157.png"))
        self.assertEqual(self.tasks[1].picture_fns, ["ShowPictureQ"])

    def test_metadata(self) -> None:
        self.assertEqual(self.tasks[0].kes_codes, ["2.1"])
        self.assertEqual(self.tasks[0].kes_titles, ["Буквенные выражения"])
        self.assertEqual(self.tasks[0].answer_kind, "short")

    def test_entities_are_unescaped(self) -> None:
        self.assertIn("1×1", self.tasks[1].statement_text)

    def test_to_text_drops_scripts(self) -> None:
        self.assertNotIn("ShowPictureQ", to_text("<script>ShowPictureQ('a')</script><p>текст</p>"))


class SpecificationTests(unittest.TestCase):
    """The inverted specification table, `config.slots_for_kes`.

    Positions 1–4 are assigned the whole codifier (КЭС 1–8) by the
    specification, so every code matches them. That is why `classify` drops
    them whenever a position above 5 also matches — otherwise the practical
    block would swallow every question in the bank.
    """

    def test_practical_block_matches_any_code(self) -> None:
        self.assertEqual(
            [slot.number for slot in slots_for_kes("4", part=1)], [1, 2, 3, 4, 14]
        )

    def test_kes_4_is_the_only_specific_position_for_sequences(self) -> None:
        specific = [slot.number for slot in slots_for_kes("4", part=1) if slot.number > 5]
        self.assertEqual(specific, [14])

    def test_kes_5_splits_by_part(self) -> None:
        part1 = [slot.number for slot in slots_for_kes("5", part=1) if slot.number > 5]
        self.assertEqual(part1, [11])
        # Part 2 has no practical block, so nothing needs filtering there.
        self.assertEqual([slot.number for slot in slots_for_kes("5", part=2)], [22])

    def test_subtheme_code_resolves_through_its_section(self) -> None:
        specific = [slot.number for slot in slots_for_kes("8.2", part=1) if slot.number > 4]
        self.assertEqual(specific, [5, 10])


class ClassifyTests(unittest.TestCase):
    def test_squared_paper_is_position_18(self) -> None:
        verdict = classify("На клетчатой бумаге с размером клетки 1×1 изображён треугольник.", "short", ["7.5"])
        self.assertEqual(verdict.number, 18)
        self.assertEqual(verdict.confidence, CERTAIN)

    def test_true_statement_stem_is_position_19(self) -> None:
        verdict = classify("Какое из следующих утверждений является истинным высказыванием?", "select_one", ["7"])
        self.assertEqual(verdict.number, 19)

    def test_formula_stem_is_position_12(self) -> None:
        verdict = classify("Пользуясь этой формулой, рассчитайте стоимость.", "short", ["2.1"])
        self.assertEqual(verdict.number, 12)

    def test_matching_answer_kind_is_position_11(self) -> None:
        verdict = classify("Установите соответствие между функциями и их графиками.", "match", ["5.1"])
        self.assertEqual(verdict.number, 11)
        self.assertEqual(verdict.confidence, CERTAIN)

    def test_subthemes_split_equations_from_inequalities(self) -> None:
        self.assertEqual(classify("Решите уравнение x²−144=0.", "short", ["3.1"]).number, 9)
        self.assertEqual(classify("Укажите решение системы неравенств.", "select_one", ["3.2"]).number, 13)

    def test_answer_kind_moves_functions_into_part_two(self) -> None:
        self.assertEqual(classify("Дана функция y=kx+b.", "short", ["5.1"]).number, 11)
        self.assertEqual(classify("Исследуйте функцию и обоснуйте.", "full", ["5.1"]).number, 22)

    def test_circle_subtheme_is_position_16(self) -> None:
        self.assertEqual(classify("Найдите длину хорды.", "short", ["7.4"]).number, 16)

    def test_practical_block_is_reported_as_a_block(self) -> None:
        verdict = classify("Сколько миллиметров составляет высота боковины шины?", "short", ["3.3"])
        self.assertIsNone(verdict.number)
        self.assertEqual(verdict.confidence, AMBIGUOUS)
        self.assertEqual(verdict.candidates, [1, 2, 3, 4, 5])

    def test_part_two_geometry_separates_only_the_proof(self) -> None:
        self.assertEqual(classify("Докажите, что AB = CD.", "full", ["7.2"]).number, 24)
        undecided = classify("Найдите высоту ромба ABCD.", "full", ["7.2"])
        self.assertIsNone(undecided.number)
        self.assertEqual(undecided.candidates, [23, 25])

    def test_unknown_metadata_is_unresolved_not_guessed(self) -> None:
        verdict = classify("Некоторый текст без признаков.", "short", [])
        self.assertIsNone(verdict.number)


if __name__ == "__main__":
    unittest.main()
