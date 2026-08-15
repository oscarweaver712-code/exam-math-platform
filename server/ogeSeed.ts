import { and, eq } from "drizzle-orm";
import {
  curriculumUnits,
  examTaskTypes,
  examTrackCurriculumUnits,
  examTracks,
  taskCurriculumUnits,
  taskHints,
  taskSolutionSteps,
  tasks,
  taskTheoryUnits,
  taskVisuals,
  variantGenerationSchedules,
  theoryCurriculumUnits,
  theoryExamTracks,
  theoryTaskTypes,
  theoryUnits,
  theoryVisuals,
  subjects,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createPublishedMonthlyVariant, monthKeyFrom } from "./variantService";

const now = () => Date.now();

const THEORY_SEED = [
  ["percentages-proportions", "Проценты и пропорции", "Находите часть от величины, переводя проценты в дробь или десятичную дробь.", "## Правило\n\n`p% = p / 100`. Чтобы найти `p%` от числа `A`, вычислите `A × p / 100`.\n\n## Алгоритм\n\n1. Определите исходную величину.\n2. Переведите процент в дробь или десятичную запись.\n3. Умножьте исходную величину на полученную дробь.\n4. В задаче о скидке вычтите найденную часть из исходной цены.\n\n## Типичная ошибка\n\nНе путайте **размер скидки** и **цену после скидки**. При скидке 15% покупатель платит 85% исходной цены.\n\n## Практика\n\nРешите задачи на скидку, наценку и нахождение целого по известному проценту.", "calculations-percentages", "6"],
  ["fractions-and-order", "Дроби и порядок действий", "Сначала упрощайте дроби и соблюдайте порядок действий: скобки, умножение и деление, сложение и вычитание.", "## Правило\n\nЧтобы сложить дроби, приведите их к общему знаменателю. Чтобы разделить на дробь, умножьте на обратную.\n\n## Алгоритм\n\n1. Выполните действия в скобках.\n2. Сократите дроби, если это возможно.\n3. Выполните умножение и деление слева направо.\n4. Завершите сложением и вычитанием.\n\n## Типичная ошибка\n\nНельзя складывать числители и знаменатели напрямую: `a/b + c/d` не равно `(a+c)/(b+d)`.\n\n## Практика\n\nТренируйте вычисления с обыкновенными и десятичными дробями.", "calculations-percentages", "6"],
  ["direct-proportion", "Прямая пропорциональность", "При постоянной цене, скорости или производительности во сколько раз растёт одна величина, во столько же раз растёт другая.", "## Правило\n\nДля прямо пропорциональных величин отношение `y / x` постоянно. Удобная запись: `a / b = c / x`.\n\n## Алгоритм\n\n1. Проверьте, что одна величина увеличивается вместе с другой.\n2. Запишите отношение одинаковых величин.\n3. Найдите неизвестный множитель или решите пропорцию крест-накрест.\n4. Проверьте здравый смысл ответа.\n\n## Типичная ошибка\n\nНе используйте прямую пропорцию, если при росте одной величины другая уменьшается: это обратная пропорциональность.\n\n## Практика\n\nРешите задачи на стоимость одинаковых товаров и масштабирование величин.", "calculations-percentages", "6"],
  ["ratios-and-parts", "Отношения и части", "Отношение делит величину на равные части; сначала найдите сумму частей, затем стоимость одной части.", "## Правило\n\nЕсли величины относятся как `a : b`, то всего в модели `a + b` равных частей.\n\n## Алгоритм\n\n1. Сложите числа в отношении.\n2. Разделите общую величину на сумму частей.\n3. Умножьте стоимость одной части на нужное число.\n4. Проверьте, что найденные части дают исходную сумму.\n\n## Типичная ошибка\n\nНе делите общую величину только на одно число отношения: сначала нужна сумма всех частей.\n\n## Практика\n\nРешайте задачи на смеси, классы и распределение общей суммы.", "calculations-percentages", "6"],
  ["linear-equations", "Линейные уравнения", "Собирайте неизвестные в одной части равенства, а числа — в другой.", "## Правило\n\nОдно и то же действие с обеими частями равенства сохраняет равенство.\n\n## Алгоритм\n\n1. Раскройте скобки.\n2. Приведите подобные слагаемые.\n3. Перенесите слагаемые с переменной в одну часть, числа — в другую.\n4. Разделите на коэффициент при переменной.\n5. Подставьте ответ для проверки.\n\n## Типичная ошибка\n\nПри переносе меняется знак у **всего слагаемого**, а не только у числа.\n\n## Практика\n\nНачните с уравнений вида `ax + b = c`, затем добавьте скобки и дробные коэффициенты.", "equations", "8"],
  ["algebraic-expressions", "Раскрытие скобок и подобные слагаемые", "Упрощайте выражение до решения уравнения: распределяйте множитель и складывайте только однотипные слагаемые.", "## Правило\n\n`a(b + c) = ab + ac`. Подобные слагаемые имеют одинаковую буквенную часть.\n\n## Алгоритм\n\n1. Раскройте все скобки.\n2. Запишите слагаемые с переменной рядом.\n3. Сложите коэффициенты при одинаковой переменной.\n4. Отдельно соберите числа.\n\n## Типичная ошибка\n\nМинус перед скобкой меняет знаки у всех слагаемых внутри: `−(x − 3) = −x + 3`.\n\n## Практика\n\nУпростите несколько выражений до подстановки числового значения.", "equations", "8"],
  ["quadratic-equations", "Квадратные уравнения", "В простых квадратных уравнениях сначала вынесите общий множитель или сведите выражение к квадрату числа.", "## Правило\n\nЕсли `x² = a`, то ищут значения `x`, квадрат которых равен `a`. Если в задании просят больший корень, выбирают положительное значение.\n\n## Алгоритм\n\n1. Перенесите все слагаемые в одну часть.\n2. Вынесите общий множитель, если он есть.\n3. Решите каждое простое уравнение.\n4. Прочитайте вопрос: иногда нужен один конкретный корень.\n\n## Типичная ошибка\n\nПосле извлечения квадратного корня из положительного числа не забывайте про два знака, если условие не ограничивает ответ.\n\n## Практика\n\nТренируйте уравнения вида `x² = a` и разложение на множители.", "equations", "8"],
  ["function-value", "Значение функции и график", "Подставляйте известное значение аргумента в формулу или считывайте координату с графика.", "## Правило\n\nВ записи `y = f(x)` каждому значению `x` соответствует значение `y`.\n\n## Алгоритм\n\n1. Для формулы подставьте заданное `x`.\n2. Соблюдайте порядок действий и знак коэффициента.\n3. Для графика найдите `x` по горизонтальной оси.\n4. Проведите мысленно вертикаль до графика и считайте `y` по вертикальной оси.\n\n## Типичная ошибка\n\nНе меняйте местами оси: `x` читается по горизонтали, `y` — по вертикали.\n\n## Практика\n\nРешите задачи на подстановку в линейную функцию и чтение координат с графика.", "graphs-functions", "11"],
  ["coordinate-plane", "Координатная плоскость", "Координаты точки записывают в порядке «сначала по горизонтали, затем по вертикали». ", "## Правило\n\nТочка `A(x; y)` расположена на пересечении вертикали через `x` и горизонтали через `y`.\n\n## Алгоритм\n\n1. Найдите начало координат.\n2. Отложите `x` вправо или влево.\n3. Отложите `y` вверх или вниз.\n4. Сверьте четверть и знаки координат.\n\n## Типичная ошибка\n\nЗапись `(x; y)` нельзя читать как `(y; x)`: порядок координат важен.\n\n## Практика\n\nОпределяйте координаты точек и значения функции по готовой координатной сетке.", "graphs-functions", "11"],
  ["function-zero", "Нули линейной функции", "Нуль функции — значение аргумента, при котором значение функции равно нулю.", "## Правило\n\nДля линейной функции `y = kx + b` нуль находят из уравнения `kx + b = 0`.\n\n## Алгоритм\n\n1. Приравняйте выражение функции к нулю.\n2. Перенесите свободный член в другую часть.\n3. Разделите на коэффициент при `x`.\n4. Проверьте подстановкой.\n\n## Типичная ошибка\n\nНуль функции — это не значение `y`, а соответствующее ему значение `x`.\n\n## Практика\n\nНаходите точки пересечения прямой с осью `Ox` по формуле и графику.", "graphs-functions", "11"],
  ["classical-probability", "Классическая вероятность", "Вероятность равна отношению числа благоприятных исходов к числу всех равновозможных исходов.", "## Формула\n\n`P = m / n`, где `m` — число благоприятных исходов, а `n` — число всех равновозможных исходов.\n\n## Алгоритм\n\n1. Посчитайте все равновозможные исходы.\n2. Отметьте исходы, подходящие условию.\n3. Составьте дробь `m/n`.\n4. Сократите или переведите в десятичную дробь, если это удобно.\n\n## Типичная ошибка\n\nБлагоприятные исходы всегда входят в общее число исходов, поэтому вероятность не бывает больше 1.\n\n## Практика\n\nРешайте задачи с шарами, карточками и выбором одного предмета наугад.", "probability", "10"],
  ["opposite-events", "Противоположные события", "Если проще посчитать нежелательные исходы, используйте правило дополнения до единицы.", "## Правило\n\nВероятность противоположного события: `P(не A) = 1 − P(A)`.\n\n## Алгоритм\n\n1. Сформулируйте событие, которое проще посчитать.\n2. Найдите его вероятность.\n3. Вычтите результат из 1.\n4. Проверьте, что ответ находится от 0 до 1.\n\n## Типичная ошибка\n\nСобытия должны быть действительно противоположными: одно из них обязательно происходит, а оба сразу произойти не могут.\n\n## Практика\n\nНайдите вероятность «не получить бракованный предмет» или «не вытащить нужный цвет».", "probability", "10"],
  ["triangle-angles", "Углы треугольника", "Сумма внутренних углов любого треугольника равна 180°.", "## Правило\n\nВ равнобедренном треугольнике углы при основании равны.\n\n## Алгоритм\n\n1. Сложите известные углы.\n2. Вычтите сумму из 180°.\n3. Если неизвестных равных углов два, разделите остаток пополам.\n4. Проверьте, что каждый угол положительный.\n\n## Типичная ошибка\n\nНе путайте угол при вершине с углами при основании в равнобедренном треугольнике.\n\n## Практика\n\nРешайте задачи с двумя известными углами и с равнобедренными треугольниками.", "plane-geometry", "15"],
  ["triangle-area-perimeter", "Периметр и площадь треугольника", "Периметр складывает длины сторон, а площадь прямоугольного треугольника равна половине произведения катетов.", "## Формулы\n\n`P = a + b + c`\n\n`S = (a × h) / 2`\n\nДля прямоугольного треугольника можно использовать `S = (катет₁ × катет₂) / 2`.\n\n## Алгоритм\n\n1. Определите, что требуется: периметр или площадь.\n2. Выпишите только нужные длины.\n3. Подставьте их в формулу.\n4. Укажите единицы измерения в ответе, если они требуются.\n\n## Типичная ошибка\n\nВысота должна быть проведена именно к той стороне, которую вы приняли за основание.\n\n## Практика\n\nРешите задачи на площадь прямоугольного треугольника и периметр по трём сторонам.", "plane-geometry", "15"],
  ["pythagorean-theorem", "Теорема Пифагора", "В прямоугольном треугольнике квадрат гипотенузы равен сумме квадратов катетов.", "## Формула\n\n`c² = a² + b²`, где `c` — гипотенуза, а `a` и `b` — катеты.\n\n## Алгоритм\n\n1. Убедитесь, что треугольник прямоугольный.\n2. Отметьте гипотенузу: она лежит напротив прямого угла.\n3. Подставьте известные длины в формулу.\n4. Извлеките квадратный корень и проверьте, что гипотенуза длиннее катетов.\n\n## Типичная ошибка\n\nНе подставляйте катет на место гипотенузы: это нарушает структуру формулы.\n\n## Практика\n\nРешайте задачи на диагонали прямоугольника и стороны прямоугольного треугольника.", "plane-geometry", "15"],
  ["triangle-similarity", "Подобие треугольников", "У подобных треугольников соответствующие углы равны, а соответствующие стороны пропорциональны.", "## Правило\n\nЕсли коэффициент подобия равен `k`, то каждая соответствующая сторона второго треугольника в `k` раз больше первой.\n\n## Алгоритм\n\n1. Найдите пары равных углов.\n2. Запишите соответствующие стороны в одинаковом порядке.\n3. Составьте пропорцию.\n4. Проверьте, что коэффициент одинаков для всех сторон.\n\n## Типичная ошибка\n\nНельзя сопоставлять стороны произвольно: они должны лежать напротив соответствующих углов.\n\n## Практика\n\nТренируйте пропорции сторон на рисунках с параллельными прямыми.", "plane-geometry", "15"],
  ["rate-time-distance", "Скорость, время и расстояние", "Связывайте величины формулой `S = v × t` и всегда приводите единицы к одному виду.", "## Три формулы\n\n`S = v × t`\n\n`v = S / t`\n\n`t = S / v`\n\n## Алгоритм\n\n1. Выпишите известные величины с единицами.\n2. Выберите формулу с неизвестной величиной.\n3. Согласуйте единицы времени и расстояния.\n4. Выполните вычисление и оцените ответ.\n\n## Типичная ошибка\n\nНельзя делить километры на минуты, если скорость нужна в километрах в час.\n\n## Практика\n\nРешайте задачи на скорость поезда, время в пути и расстояние на карте.", "practical-context", "1–5"],
  ["unit-conversion", "Единицы измерения", "Перед формулой приводите все величины к одному набору единиц.", "## Базовые переходы\n\n`1 км = 1000 м`\n\n`1 м = 100 см`\n\n`1 ч = 60 мин`\n\n`1 кг = 1000 г`\n\n## Алгоритм\n\n1. Выпишите, в каких единицах дано каждое число.\n2. Выберите единицы, удобные для ответа.\n3. Переведите величины до подстановки в формулу.\n4. Проверьте размерность результата.\n\n## Типичная ошибка\n\nНе забывайте, что при переводе площади и объёма коэффициент нужно возводить в квадрат или куб.\n\n## Практика\n\nТренируйте задачи на время, длину, массу и стоимость товаров.", "practical-context", "1–5"],
  ["tables-and-readings", "Таблицы и практические данные", "В практической задаче сначала отделите нужную строку или столбец от лишней информации.", "## Правило\n\nКаждое число в таблице нужно читать вместе с заголовком строки, столбца и единицей измерения.\n\n## Алгоритм\n\n1. Прочитайте, что именно спрашивают.\n2. Найдите нужный объект в строке или столбце.\n3. Проверьте единицы измерения.\n4. Только затем складывайте, сравнивайте или подставляйте число в формулу.\n\n## Типичная ошибка\n\nНе используйте ближайшее число в таблице без проверки заголовков: похожие столбцы часто содержат разные единицы.\n\n## Практика\n\nРешайте задачи на тарифы, расписания и сравнение величин по таблице.", "practical-context", "1–5"],
] as const;

const AUTHOR_TASK_EXPANSION = [
  ["percent-increase", "Рост цены на 12,5%", "Цена абонемента составляла 800 рублей. Её увеличили на 12,5%. Сколько рублей стал стоить абонемент?", "short_integer", "900", "Увеличение равно `800 × 0,125 = 100` рублей. Новая цена: `800 + 100 = 900` рублей.", "standard", "calculations-percentages", "6", "percentages-proportions"],
  ["ratio-parts", "Деление в отношении", "64 ученика распределили в две группы в отношении 3:5. Сколько учеников в первой группе?", "short_integer", "24", "Всего частей `3 + 5 = 8`. Одна часть равна `64 / 8 = 8`, первая группа: `3 × 8 = 24`.", "standard", "calculations-percentages", "6", "ratios-and-parts"],
  ["fractional-equation", "Уравнение с дробью", "Решите уравнение: (x − 2) / 4 = 3.", "short_integer", "14", "Умножаем обе части на 4: `x − 2 = 12`. Тогда `x = 14`.", "standard", "equations", "8", "linear-equations"],
  ["quadratic-greater-root", "Больший корень квадратного уравнения", "Решите уравнение x² − 9x = 0. В ответ запишите больший корень.", "short_integer", "9", "Выносим `x`: `x(x − 9) = 0`. Корни: 0 и 9. Больший корень — 9.", "advanced", "equations", "8", "quadratic-equations"],
  ["function-zero", "Нуль линейной функции", "Функция задана формулой y = −4x + 12. Найдите значение x, при котором y = 0.", "short_integer", "3", "Приравниваем функцию к нулю: `−4x + 12 = 0`. Получаем `−4x = −12`, значит `x = 3`.", "standard", "graphs-functions", "11", "function-zero"],
  ["function-input", "Аргумент по значению функции", "Функция задана формулой y = 2x + 5. Найдите x, если y = 19.", "short_integer", "7", "Подставляем известное значение: `2x + 5 = 19`. Тогда `2x = 14`, откуда `x = 7`.", "standard", "graphs-functions", "11", "function-value"],
  ["probability-complement", "Вероятность противоположного события", "В коробке 3 красных и 17 синих маркеров. Наугад выбирают один маркер. Какова вероятность выбрать не красный маркер?", "short_decimal", "0.85", "Всего 20 маркеров, не красных — 17. Вероятность `17 / 20 = 0,85`.", "standard", "probability", "10", "opposite-events"],
  ["probability-even", "Чётное число на кубике", "Игральный кубик бросают один раз. Какова вероятность выпадения чётного числа?", "short_decimal", "0.5", "Чётные исходы: 2, 4 и 6 — всего 3 из 6. `3 / 6 = 0,5`.", "basic", "probability", "10", "classical-probability"],
  ["pythagorean-triangle", "Гипотенуза прямоугольного треугольника", "Катеты прямоугольного треугольника равны 6 см и 8 см. Найдите гипотенузу в сантиметрах.", "short_integer", "10", "По теореме Пифагора: `c² = 6² + 8² = 36 + 64 = 100`. Значит, `c = 10`.", "standard", "plane-geometry", "15", "pythagorean-theorem"],
  ["triangle-area-height", "Площадь треугольника по высоте", "Основание треугольника равно 12 см, высота к этому основанию равна 7 см. Найдите площадь треугольника.", "short_integer", "42", "Площадь равна `S = (12 × 7) / 2 = 42`.", "basic", "plane-geometry", "15", "triangle-area-perimeter"],
  ["distance-unit-conversion", "Перевод расстояния", "Велосипедист проехал 3,6 км. Сколько метров он проехал?", "short_integer", "3600", "В одном километре 1000 метров. Поэтому `3,6 × 1000 = 3600` метров.", "basic", "practical-context", "1–5", "unit-conversion"],
  ["schedule-table-reading", "Расписание по таблице", "Автобус отправился в 08:35 и прибыл в 10:05. Сколько минут длилась поездка?", "short_integer", "90", "От 08:35 до 09:35 проходит 60 минут, затем до 10:05 ещё 30 минут. Всего 90 минут.", "standard", "practical-context", "1–5", "tables-and-readings"],
] as const;

const FULL_OGE_KIM_TYPES = [
  ["1", "Практическая задача: данные и величины", "part1"], ["2", "Практическая задача: таблица и расчёт", "part1"], ["3", "Практическая задача: сравнение условий", "part1"], ["4", "Практическая задача: выбор по данным", "part1"], ["5", "Практическая задача: итоговый расчёт", "part1"],
  ["6", "Числа и вычисления", "part1"], ["7", "Координаты и числовая прямая", "part1"], ["8", "Алгебраические выражения", "part1"], ["9", "Уравнения и неравенства", "part1"], ["10", "Вероятность и статистика", "part1"], ["11", "Функции и графики", "part1"], ["12", "Последовательности", "part1"],
  ["13", "Геометрия: углы и фигуры", "part1"], ["14", "Геометрия: окружность и четырёхугольники", "part1"], ["15", "Геометрия: треугольники", "part1"], ["16", "Геометрия: площади", "part1"], ["17", "Геометрия: длины и теоремы", "part1"], ["18", "Геометрия: утверждения", "part1"], ["19", "Статистика", "part1"],
  ["20", "Алгебраическое уравнение", "part2"], ["21", "Алгебраическая текстовая задача", "part2"], ["22", "Функции и графики", "part2"], ["23", "Геометрическое доказательство", "part2"], ["24", "Геометрическая задача", "part2"], ["25", "Геометрическая задача повышенного уровня", "part2"],
] as const;

const FULL_KIM_AUTHOR_TASKS = [
  ["kim-01-tariff", "Тариф по условию", "Абонент выбрал тариф: 180 рублей фиксированно и 4 рубля за каждую минуту сверх 30 минут. За месяц он говорил 45 минут. Сколько рублей составила плата?", "short_integer", "240", "Сверх лимита использовано `45 − 30 = 15` минут. Доплата равна `15 × 4 = 60`, итог: `180 + 60 = 240` рублей.", "basic", "practical-context", "1", "rate-time-distance"],
  ["kim-02-fuel", "Расход топлива", "Автомобиль расходует 8 литров топлива на 100 км. Сколько литров потребуется на путь 250 км?", "short_integer", "20", "На 250 км расход увеличится в `2,5` раза: `8 × 2,5 = 20` литров.", "basic", "practical-context", "2", "direct-proportion"],
  ["kim-03-schedule", "Время по расписанию", "Электричка отправилась в 09:18 и прибыла в 10:47. Сколько минут длилась поездка?", "short_integer", "89", "От 09:18 до 10:18 проходит 60 минут, затем ещё 29 минут. Всего `60 + 29 = 89` минут.", "basic", "practical-context", "3", "tables-and-readings"],
  ["kim-04-plan-area", "Площадь по плану", "На плане 1 см соответствует 4 м. Прямоугольная площадка на плане имеет стороны 5 см и 3 см. Найдите её реальную площадь в квадратных метрах.", "short_integer", "240", "Реальные стороны: `5 × 4 = 20` м и `3 × 4 = 12` м. Площадь: `20 × 12 = 240` м².", "standard", "practical-context", "4", "unit-conversion"],
  ["kim-05-purchase", "Покупка со скидкой", "Тетрадь стоит 84 рубля. При покупке трёх тетрадей действует скидка 20% на весь набор. Сколько рублей заплатит покупатель?", "short_integer", "202", "Без скидки набор стоит `84 × 3 = 252` рубля. После скидки платят 80%: `252 × 0,8 = 201,6`, то есть 202 рубля при оплате целыми рублями.", "standard", "practical-context", "5", "percentages-proportions"],
  ["kim-06-fractions", "Вычисление с дробями", "Вычислите: `3/4 + 5/8`.", "short_decimal", "1.375", "Приводим к знаменателю 8: `3/4 = 6/8`. Получаем `6/8 + 5/8 = 11/8 = 1,375`.", "basic", "calculations-percentages", "6", "fractions-and-order"],
  ["kim-07-coordinate", "Координата точки", "Точка A имеет координаты (−3; 5). Чему равна сумма координат точки A?", "short_integer", "2", "Складываем координаты: `−3 + 5 = 2`.", "basic", "graphs-functions", "7", "coordinate-plane"],
  ["kim-08-expression", "Значение выражения", "Найдите значение выражения `2a − 3b`, если `a = 7`, `b = 4`.", "short_integer", "2", "Подставляем значения: `2 × 7 − 3 × 4 = 14 − 12 = 2`.", "basic", "equations", "8", "algebraic-expressions"],
  ["kim-09-inequality", "Линейное неравенство", "Решите неравенство `3x − 5 > 10`. В ответ запишите наименьшее целое решение.", "short_integer", "6", "Получаем `3x > 15`, значит `x > 5`. Наименьшее целое значение — 6.", "standard", "equations", "9", "linear-equations"],
  ["kim-10-probability", "Вероятность выбора", "В коробке 4 зелёных и 6 жёлтых карандашей. Наугад выбирают один карандаш. Какова вероятность выбрать зелёный?", "short_decimal", "0.4", "Всего 10 карандашей, зелёных 4. Вероятность `4/10 = 0,4`.", "basic", "probability", "10", "classical-probability"],
  ["kim-11-function", "Значение линейной функции", "Функция задана формулой `y = 5 − 2x`. Найдите значение функции при `x = −3`.", "short_integer", "11", "Подставляем `−3`: `5 − 2 × (−3) = 5 + 6 = 11`.", "basic", "graphs-functions", "11", "function-value"],
  ["kim-12-sequence", "Арифметическая последовательность", "В арифметической последовательности первый член равен 4, разность равна 3. Найдите пятый член.", "short_integer", "16", "Каждый следующий член увеличивается на 3: `4, 7, 10, 13, 16`. Пятый член — 16.", "basic", "equations", "12", "linear-equations"],
  ["kim-13-angles", "Смежные углы", "Один из смежных углов равен 128°. Найдите другой угол в градусах.", "short_integer", "52", "Смежные углы в сумме дают 180°. Значит, `180 − 128 = 52`.", "basic", "plane-geometry", "13", "triangle-angles"],
  ["kim-14-rectangle", "Диагональ прямоугольника", "Стороны прямоугольника равны 5 см и 12 см. Найдите его диагональ в сантиметрах.", "short_integer", "13", "Диагональ — гипотенуза прямоугольного треугольника: `d² = 5² + 12² = 169`, поэтому `d = 13`.", "standard", "plane-geometry", "14", "pythagorean-theorem"],
  ["kim-15-similarity", "Подобные треугольники", "Сторона малого треугольника равна 6 см. Коэффициент подобия большого треугольника к малому равен 1,5. Найдите соответствующую сторону большого треугольника.", "short_integer", "9", "Соответствующая сторона увеличилась в 1,5 раза: `6 × 1,5 = 9` см.", "standard", "plane-geometry", "15", "triangle-similarity"],
  ["kim-16-area", "Площадь параллелограмма", "Основание параллелограмма равно 11 см, высота к нему равна 6 см. Найдите площадь в квадратных сантиметрах.", "short_integer", "66", "Площадь параллелограмма: `S = a × h = 11 × 6 = 66`.", "basic", "plane-geometry", "16", "triangle-area-perimeter"],
  ["kim-17-hypotenuse", "Катет прямоугольного треугольника", "Гипотенуза прямоугольного треугольника равна 10 см, один катет — 6 см. Найдите второй катет.", "short_integer", "8", "По теореме Пифагора: `b² = 10² − 6² = 100 − 36 = 64`, значит `b = 8`.", "standard", "plane-geometry", "17", "pythagorean-theorem"],
  ["kim-18-statement", "Верное утверждение", "Какое утверждение верно? 1) Диагонали любого прямоугольника перпендикулярны. 2) Сумма углов треугольника равна 180°. 3) Любой ромб является квадратом. В ответ запишите номер верного утверждения.", "short_integer", "2", "Верно утверждение 2. Диагонали прямоугольника не обязаны быть перпендикулярными, а ромб не всегда квадрат.", "basic", "plane-geometry", "18", "triangle-angles"],
  ["kim-19-mean", "Среднее арифметическое", "Найдите среднее арифметическое чисел 6, 8, 11 и 15.", "short_integer", "10", "Сумма чисел равна `6 + 8 + 11 + 15 = 40`. Делим на 4: `40 / 4 = 10`.", "basic", "probability", "19", "classical-probability"],
  ["kim-20-quadratic", "Квадратное уравнение", "Решите уравнение `x² − 7x + 12 = 0`.", "manual", "", "Разложим на множители: `x² − 7x + 12 = (x − 3)(x − 4)`. Поэтому `x = 3` или `x = 4`.", "advanced", "equations", "20", "quadratic-equations"],
  ["kim-21-work", "Совместная работа", "Один мастер выполняет заказ за 6 часов, другой — за 3 часа. За сколько часов они выполнят заказ вместе?", "manual", "", "За час мастера выполняют соответственно `1/6` и `1/3` заказа. Вместе: `1/6 + 1/3 = 1/2` заказа в час, значит весь заказ займёт 2 часа.", "advanced", "practical-context", "21", "direct-proportion"],
  ["kim-22-parabola", "Пересечение графика", "Для функции `y = x² − 4` найдите значения x, при которых `y = 5`.", "manual", "", "Приравниваем: `x² − 4 = 5`, откуда `x² = 9`. Следовательно, `x = −3` или `x = 3`.", "advanced", "graphs-functions", "22", "function-zero"],
  ["kim-23-proof", "Доказательство равенства углов", "В треугольнике ABC стороны AB и AC равны. Докажите, что углы при основании B и C равны.", "manual", "", "Рассмотрим треугольник ABC. Он равнобедренный, так как AB = AC. По свойству равнобедренного треугольника углы при основании равны: ∠B = ∠C.", "advanced", "plane-geometry", "23", "triangle-angles"],
  ["kim-24-radius", "Радиус окружности", "Длина окружности равна `10π` см. Найдите её радиус.", "manual", "", "Используем формулу `C = 2πr`. Из `10π = 2πr` получаем `r = 5` см.", "advanced", "plane-geometry", "24", "triangle-area-perimeter"],
  ["kim-25-complex-geometry", "Площадь трапеции", "Основания трапеции равны 8 см и 14 см, высота равна 5 см. Найдите площадь трапеции.", "manual", "", "Площадь трапеции: `S = (a + b)h / 2 = (8 + 14) × 5 / 2 = 55` см².", "advanced", "plane-geometry", "25", "triangle-area-perimeter"],
] as const;

const FULL_KIM_VARIATION_TASKS = [
  ["kim-01-water", "Расход воды", "Кран наполняет 12 литров воды за минуту. Сколько литров он нальёт за 8 минут?", "short_integer", "96", "Умножаем расход на время: `12 × 8 = 96` литров.", "basic", "practical-context", "1", "rate-time-distance"],
  ["kim-02-packages", "Упаковки товара", "В одной упаковке 6 одинаковых блокнотов. Сколько блокнотов в 9 упаковках?", "short_integer", "54", "В девяти упаковках будет `6 × 9 = 54` блокнота.", "basic", "practical-context", "2", "direct-proportion"],
  ["kim-03-break", "Перерыв по времени", "Урок начался в 11:25 и закончился в 12:10. Сколько минут длился урок?", "short_integer", "45", "От 11:25 до 12:00 — 35 минут, затем ещё 10. Итого 45 минут.", "basic", "practical-context", "3", "tables-and-readings"],
  ["kim-04-scale", "Расстояние на карте", "На карте 1 см соответствует 2 км. Расстояние между городами на карте равно 7,5 см. Найдите реальное расстояние в километрах.", "short_integer", "15", "Умножаем длину на масштаб: `7,5 × 2 = 15` км.", "basic", "practical-context", "4", "unit-conversion"],
  ["kim-05-mobile", "Стоимость связи", "За пакет связи нужно заплатить 350 рублей. При оплате через приложение действует скидка 10%. Сколько рублей составит платёж?", "short_integer", "315", "После скидки платят 90% цены: `350 × 0,9 = 315` рублей.", "basic", "practical-context", "5", "percentages-proportions"],
  ["kim-06-decimal", "Десятичная дробь", "Вычислите: `4,8 : 0,6`.", "short_integer", "8", "Умножим делимое и делитель на 10: `48 : 6 = 8`.", "basic", "calculations-percentages", "6", "fractions-and-order"],
  ["kim-07-distance", "Расстояние между координатами", "На координатной прямой отмечены точки A(−4) и B(3). Найдите расстояние между ними.", "short_integer", "7", "Расстояние равно `3 − (−4) = 7`.", "basic", "graphs-functions", "7", "coordinate-plane"],
  ["kim-08-brackets", "Упрощение выражения", "Найдите значение выражения `3(x − 2) + 5`, если `x = 6`.", "short_integer", "17", "Подставляем: `3 × (6 − 2) + 5 = 12 + 5 = 17`.", "basic", "equations", "8", "algebraic-expressions"],
  ["kim-09-equation", "Линейное уравнение", "Решите уравнение `5x + 4 = 29`.", "short_integer", "5", "Вычитаем 4: `5x = 25`. Делим на 5: `x = 5`.", "basic", "equations", "9", "linear-equations"],
  ["kim-10-dice", "Вероятность на кубике", "Игральный кубик бросают один раз. Какова вероятность выпадения числа больше 4?", "short_decimal", "0.3333333333333333", "Подходят числа 5 и 6: два исхода из шести. `2/6 = 1/3`.", "basic", "probability", "10", "classical-probability"],
  ["kim-11-line", "Линейная функция", "Функция задана формулой `y = 4x − 1`. Найдите x, если `y = 15`.", "short_integer", "4", "Решаем `4x − 1 = 15`: `4x = 16`, значит `x = 4`.", "standard", "graphs-functions", "11", "function-zero"],
  ["kim-12-progression", "Член последовательности", "В арифметической последовательности 10, 14, 18, … Найдите четвёртый член.", "short_integer", "22", "Разность равна 4. Четвёртый член: `18 + 4 = 22`.", "basic", "equations", "12", "linear-equations"],
  ["kim-13-triangle", "Угол треугольника", "В треугольнике два угла равны 36° и 74°. Найдите третий угол.", "short_integer", "70", "Сумма углов треугольника 180°. Получаем `180 − 36 − 74 = 70`.", "basic", "plane-geometry", "13", "triangle-angles"],
  ["kim-14-circle", "Диаметр окружности", "Радиус окружности равен 9 см. Найдите её диаметр.", "short_integer", "18", "Диаметр вдвое больше радиуса: `2 × 9 = 18` см.", "basic", "plane-geometry", "14", "triangle-area-perimeter"],
  ["kim-15-isosceles", "Равнобедренный треугольник", "В равнобедренном треугольнике угол при вершине равен 46°. Найдите угол при основании.", "short_integer", "67", "Сумма углов при основании равна `180 − 46 = 134`. Каждый из них: `134 / 2 = 67`.", "basic", "plane-geometry", "15", "triangle-angles"],
  ["kim-16-triangle-area", "Площадь треугольника", "Основание треугольника равно 14 см, высота к нему равна 6 см. Найдите площадь.", "short_integer", "42", "Площадь: `14 × 6 / 2 = 42` см².", "basic", "plane-geometry", "16", "triangle-area-perimeter"],
  ["kim-17-rectangle", "Периметр прямоугольника", "Стороны прямоугольника равны 9 см и 4 см. Найдите его периметр.", "short_integer", "26", "Периметр: `2 × (9 + 4) = 26` см.", "basic", "plane-geometry", "17", "triangle-area-perimeter"],
  ["kim-18-true", "Свойство треугольника", "Какое утверждение верно? 1) В равностороннем треугольнике все углы равны. 2) Любой прямоугольник — квадрат. 3) У ромба все углы прямые. В ответ запишите номер верного утверждения.", "short_integer", "1", "Верно утверждение 1. Равносторонний треугольник имеет равные стороны и равные углы.", "basic", "plane-geometry", "18", "triangle-angles"],
  ["kim-19-median", "Медиана чисел", "Найдите медиану набора чисел 3, 5, 8, 9, 14.", "short_integer", "8", "Числа уже упорядочены. Среднее по месту, третье число, равно 8.", "basic", "probability", "19", "classical-probability"],
  ["kim-20-system", "Система уравнений", "Решите систему: `x + y = 9`, `x − y = 3`.", "manual", "", "Сложим уравнения: `2x = 12`, поэтому `x = 6`. Тогда `y = 3`.", "advanced", "equations", "20", "linear-equations"],
  ["kim-21-mixture", "Задача на проценты", "В 20 литрах раствора содержится 30% соли. Сколько литров соли содержится в растворе?", "manual", "", "Количество соли равно `20 × 0,3 = 6` литров.", "advanced", "practical-context", "21", "percentages-proportions"],
  ["kim-22-graph", "Нули функции", "Найдите нули функции `y = x² − 16`.", "manual", "", "Приравниваем к нулю: `x² = 16`. Получаем `x = −4` и `x = 4`.", "advanced", "graphs-functions", "22", "function-zero"],
  ["kim-23-proof-triangle", "Доказательство о равнобедренном треугольнике", "Докажите, что медиана, проведённая к основанию равнобедренного треугольника, является высотой.", "manual", "", "Медиана делит основание пополам. Треугольники по обе стороны медианы равны по двум сторонам и включённому основанию, поэтому углы при основании медианы равны. Они смежные, значит каждый равен 90°, и медиана является высотой.", "advanced", "plane-geometry", "23", "triangle-angles"],
  ["kim-24-sector", "Площадь прямоугольника", "Длина прямоугольника равна 13 см, ширина — 7 см. Найдите площадь.", "manual", "", "Площадь прямоугольника: `S = 13 × 7 = 91` см².", "advanced", "plane-geometry", "24", "triangle-area-perimeter"],
  ["kim-25-similar", "Подобие и длина", "Два подобных треугольника имеют коэффициент подобия 2. Соответствующая сторона меньшего треугольника равна 7 см. Найдите сторону большего треугольника.", "manual", "", "Сторона увеличивается в 2 раза: `7 × 2 = 14` см.", "advanced", "plane-geometry", "25", "triangle-similarity"],
] as const;

async function ensureOgeTaskTypes(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, trackId: number) {
  const visualKimNumbers = new Set(["1", "2", "3", "4", "5", "7", "11", "13", "14", "15", "16", "17", "18", "22", "23", "24", "25"]);
  const existing = await db.select({ id: examTaskTypes.id, kimNumber: examTaskTypes.kimNumber }).from(examTaskTypes).where(eq(examTaskTypes.examTrackId, trackId));
  const legacy = existing.find(item => item.kimNumber === "1–5");
  if (legacy && !existing.some(item => item.kimNumber === "1")) {
    await db.update(examTaskTypes).set({ kimNumber: "1", title: "Практическая задача: данные и величины", part: "part1", sortOrder: 1, description: "Авторский тип КИМ № 1.", updatedAt: now() }).where(eq(examTaskTypes.id, legacy.id));
  }
  const refreshed = await db.select({ id: examTaskTypes.id, kimNumber: examTaskTypes.kimNumber }).from(examTaskTypes).where(eq(examTaskTypes.examTrackId, trackId));
  const existingByNumber = new Map(refreshed.map(item => [item.kimNumber, item.id]));
  const timestamp = now();
  const missing = FULL_OGE_KIM_TYPES.filter(([kimNumber]) => !existingByNumber.has(kimNumber));
  await Promise.all(FULL_OGE_KIM_TYPES.flatMap(([kimNumber, title, part]) => {
    const id = existingByNumber.get(kimNumber);
    return id ? [db.update(examTaskTypes).set({ title, part, sortOrder: Number(kimNumber), description: `Авторский тип КИМ № ${kimNumber}.`, requiresVisual: visualKimNumbers.has(kimNumber), isActive: true, updatedAt: timestamp }).where(eq(examTaskTypes.id, id))] : [];
  }));
  if (missing.length) await db.insert(examTaskTypes).values(missing.map(([kimNumber, title, part]) => ({ examTrackId: trackId, kimNumber, title, part, sortOrder: Number(kimNumber), description: `Авторский тип КИМ № ${kimNumber}.`, requiresVisual: visualKimNumbers.has(kimNumber), isActive: true, createdAt: timestamp, updatedAt: timestamp })));
}

async function ensureTheorySeed(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, subjectId: number, trackId: number) {
  const existingRows = await db.select({ slug: theoryUnits.slug }).from(theoryUnits).where(eq(theoryUnits.subjectId, subjectId));
  const existingSlugs = new Set(existingRows.map(row => row.slug));
  const missing = THEORY_SEED.filter(([slug]) => !existingSlugs.has(slug));
  if (!missing.length) return;
  const timestamp = now();
  await db.insert(theoryUnits).values(missing.map(([slug, title, lead, bodyMarkdown], index) => ({ subjectId, slug, title, lead, bodyMarkdown, status: "published" as const, sortOrder: existingRows.length + index + 1, createdAt: timestamp, updatedAt: timestamp, publishedAt: timestamp })));
  const theoryRows = await db.select({ id: theoryUnits.id, slug: theoryUnits.slug }).from(theoryUnits).where(eq(theoryUnits.subjectId, subjectId));
  const theoryIds = new Map(theoryRows.map(row => [row.slug, row.id]));
  const topicRows = await db.select({ id: curriculumUnits.id, slug: curriculumUnits.slug }).from(curriculumUnits).where(eq(curriculumUnits.subjectId, subjectId));
  const topicIds = new Map(topicRows.map(row => [row.slug, row.id]));
  const taskTypeRows = await db.select({ id: examTaskTypes.id, kimNumber: examTaskTypes.kimNumber }).from(examTaskTypes).where(eq(examTaskTypes.examTrackId, trackId));
  const taskTypeIds = new Map(taskTypeRows.map(row => [row.kimNumber, row.id]));
  await db.insert(theoryExamTracks).values(missing.map(([slug]) => ({ theoryUnitId: idFor(theoryIds, slug), examTrackId: trackId })));
  await db.insert(theoryCurriculumUnits).values(missing.map(([slug, , , , topicSlug]) => ({ theoryUnitId: idFor(theoryIds, slug), curriculumUnitId: idFor(topicIds, topicSlug) })));
  await db.insert(theoryTaskTypes).values(missing.map(([slug, , , , , kimNumber]) => ({ theoryUnitId: idFor(theoryIds, slug), examTaskTypeId: idFor(taskTypeIds, kimNumber) })));
}

async function ensureTheoryPracticeLinks(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, trackId: number) {
  const theoryRows = await db
    .select({ theoryUnitId: theoryUnits.id, curriculumUnitId: theoryCurriculumUnits.curriculumUnitId, examTaskTypeId: theoryTaskTypes.examTaskTypeId })
    .from(theoryExamTracks)
    .innerJoin(theoryUnits, eq(theoryExamTracks.theoryUnitId, theoryUnits.id))
    .innerJoin(theoryCurriculumUnits, eq(theoryUnits.id, theoryCurriculumUnits.theoryUnitId))
    .innerJoin(theoryTaskTypes, eq(theoryUnits.id, theoryTaskTypes.theoryUnitId))
    .where(eq(theoryExamTracks.examTrackId, trackId));
  const taskRows = await db
    .select({ taskId: tasks.id, curriculumUnitId: taskCurriculumUnits.curriculumUnitId, examTaskTypeId: tasks.examTaskTypeId })
    .from(tasks)
    .innerJoin(taskCurriculumUnits, eq(tasks.id, taskCurriculumUnits.taskId))
    .where(eq(tasks.examTrackId, trackId));
  const existing = await db.select({ taskId: taskTheoryUnits.taskId, theoryUnitId: taskTheoryUnits.theoryUnitId }).from(taskTheoryUnits);
  const existingKeys = new Set(existing.map(row => `${row.taskId}:${row.theoryUnitId}`));
  const values: Array<typeof taskTheoryUnits.$inferInsert> = [];
  for (const theory of theoryRows) {
    for (const task of taskRows) {
      if (task.curriculumUnitId !== theory.curriculumUnitId || task.examTaskTypeId !== theory.examTaskTypeId) continue;
      const key = `${task.taskId}:${theory.theoryUnitId}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      values.push({ taskId: task.taskId, theoryUnitId: theory.theoryUnitId });
    }
  }
  if (values.length) await db.insert(taskTheoryUnits).values(values);
}

async function ensureAuthorTaskExpansion(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, subjectId: number, trackId: number) {
  const existingRows = await db.select({ slug: tasks.slug }).from(tasks).where(eq(tasks.examTrackId, trackId));
  const existingSlugs = new Set(existingRows.map(row => row.slug));
  const missing = [...AUTHOR_TASK_EXPANSION, ...FULL_KIM_AUTHOR_TASKS, ...FULL_KIM_VARIATION_TASKS].filter(([slug]) => !existingSlugs.has(slug));
  if (!missing.length) return;
  const [topicRows, taskTypeRows, theoryRows] = await Promise.all([
    db.select({ id: curriculumUnits.id, slug: curriculumUnits.slug }).from(curriculumUnits).where(eq(curriculumUnits.subjectId, subjectId)),
    db.select({ id: examTaskTypes.id, kimNumber: examTaskTypes.kimNumber }).from(examTaskTypes).where(eq(examTaskTypes.examTrackId, trackId)),
    db.select({ id: theoryUnits.id, slug: theoryUnits.slug }).from(theoryUnits).where(eq(theoryUnits.subjectId, subjectId)),
  ]);
  const topicIds = new Map(topicRows.map(row => [row.slug, row.id]));
  const taskTypeIds = new Map(taskTypeRows.map(row => [row.kimNumber, row.id]));
  const theoryIds = new Map(theoryRows.map(row => [row.slug, row.id]));
  const timestamp = now();
  await db.insert(tasks).values(missing.map(([slug, title, statementMarkdown, answerKind, correctAnswer, solutionMarkdown, difficulty, , kimNumber]) => ({
    subjectId,
    examTrackId: trackId,
    examTaskTypeId: idFor(taskTypeIds, kimNumber),
    slug,
    internalId: `TASK-SEED-${slug.toUpperCase()}`,
    title,
    statementMarkdown,
    answerKind,
    correctAnswer,
    acceptableAnswers: [],
    solutionMarkdown,
    difficulty,
    sourceKind: "author" as const,
    contentVersion: 1,
    status: "published" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: timestamp,
  })));
  const taskRows = await db.select({ id: tasks.id, slug: tasks.slug }).from(tasks).where(eq(tasks.examTrackId, trackId));
  const taskIds = new Map(taskRows.map(row => [row.slug, row.id]));
  await db.insert(taskCurriculumUnits).values(missing.map(([slug, , , , , , , topicSlug]) => ({ taskId: idFor(taskIds, slug), curriculumUnitId: idFor(topicIds, topicSlug) })));
  await db.insert(taskTheoryUnits).values(missing.map(([slug, , , , , , , , , theorySlug]) => ({ taskId: idFor(taskIds, slug), theoryUnitId: idFor(theoryIds, theorySlug) })));
}

function idFor(map: Map<string, number>, key: string) {
  const id = map.get(key);
  if (!id) throw new Error(`Seed reference is missing: ${key}`);
  return id;
}

async function ensureTaskVisualSeed(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, trackId: number) {
  const visualSeed = [
    ["triangle-angle", "triangle-angle-48-67", "Схема треугольника с углами 48 и 67 градусов у основания."],
    ["isosceles-angle", "isosceles-40", "Схема равнобедренного треугольника с углом 40 градусов при вершине."],
    ["function-value", "function-line-3x-minus-2", "Координатная плоскость с графиком прямой y равно 3x минус 2 и отмеченной точкой при x равно 4."],
    ["train-speed", "rate-time-distance-180-3", "Схема движения поезда: пройденное расстояние 180 километров за 3 часа."],
    ["kim-07-coordinate", "coordinate-point-minus-3-5", "Координатная плоскость с точкой A с координатами минус 3 и 5."],
    ["kim-14-rectangle", "rectangle-diagonal-5-12", "Прямоугольник со сторонами 5 и 12 и диагональю."],
    ["kim-15-similarity", "similar-triangles-scale-6", "Два подобных треугольника со стороной 6 и коэффициентом подобия 1,5."],
    ["kim-16-area", "parallelogram-base-height", "Параллелограмм с основанием 11 и высотой 6."],
    ["kim-17-hypotenuse", "right-triangle-6-hypotenuse-10", "Прямоугольный треугольник с гипотенузой 10 и катетом 6."],
    ["kim-24-radius", "circle-circumference-10pi", "Окружность с длиной 10 пи и радиусом r."],
    ["kim-25-complex-geometry", "trapezoid-bases-height", "Трапеция с основаниями 8 и 14 и высотой 5."],
  ] as const;
  const taskRows = await db.select({ id: tasks.id, slug: tasks.slug }).from(tasks).where(eq(tasks.examTrackId, trackId));
  const taskIds = new Map(taskRows.map(row => [row.slug, row.id]));
  const existing = await db.select({ taskId: taskVisuals.taskId, diagramKey: taskVisuals.diagramKey }).from(taskVisuals);
  const existingKeys = new Set(existing.map(row => `${row.taskId}:${row.diagramKey ?? ""}`));
  const timestamp = now();
  const values: Array<typeof taskVisuals.$inferInsert> = [];
  for (const [slug, diagramKey, altText] of visualSeed) {
    const taskId = taskIds.get(slug);
    if (!taskId || existingKeys.has(`${taskId}:${diagramKey}`)) continue;
    values.push({ taskId, kind: "inline_svg", placement: "statement", diagramKey, altText, sourceKind: "author", reviewStatus: "approved", sortOrder: values.length, createdAt: timestamp, updatedAt: timestamp });
  }
  if (values.length) await db.insert(taskVisuals).values(values);
}

async function ensureTheoryVisualSeed(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, subjectId: number) {
  const seed = [
    ["pythagorean-theorem", "right-triangle-6-8", "Прямоугольный треугольник с катетами 6 и 8 и неизвестной гипотенузой.", "Схема к теореме Пифагора."],
    ["triangle-similarity", "similar-triangles-scale", "Два подобных треугольника с отмеченными соответствующими сторонами.", "Схема соответствующих сторон подобных треугольников."],
    ["triangle-area-perimeter", "triangle-base-height", "Треугольник с выделенными основанием и высотой.", "Схема основания и высоты треугольника."],
  ] as const;
  const [theoryRows, existing] = await Promise.all([
    db.select({ id: theoryUnits.id, slug: theoryUnits.slug }).from(theoryUnits).where(eq(theoryUnits.subjectId, subjectId)),
    db.select({ theoryUnitId: theoryVisuals.theoryUnitId, diagramKey: theoryVisuals.diagramKey }).from(theoryVisuals),
  ]);
  const ids = new Map(theoryRows.map(row => [row.slug, row.id]));
  const existingKeys = new Set(existing.map(row => `${row.theoryUnitId}:${row.diagramKey ?? ""}`));
  const timestamp = now();
  const values = seed.flatMap(([slug, diagramKey, altText, caption], index) => {
    const theoryUnitId = ids.get(slug);
    if (!theoryUnitId || existingKeys.has(`${theoryUnitId}:${diagramKey}`)) return [];
    return [{ theoryUnitId, kind: "inline_svg" as const, placement: "body" as const, diagramKey, altText, caption, sourceKind: "author" as const, reviewStatus: "approved" as const, sortOrder: index, createdAt: timestamp, updatedAt: timestamp }];
  });
  if (values.length) await db.insert(theoryVisuals).values(values);
}

async function ensureTaskLearningSupport(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, trackId: number) {
  const taskRows = await db.select({ id: tasks.id, solutionMarkdown: tasks.solutionMarkdown }).from(tasks).where(and(eq(tasks.examTrackId, trackId), eq(tasks.sourceKind, "author")));
  const [existingHints, existingSteps] = await Promise.all([
    db.select({ taskId: taskHints.taskId }).from(taskHints),
    db.select({ taskId: taskSolutionSteps.taskId }).from(taskSolutionSteps),
  ]);
  const hinted = new Set(existingHints.map(row => row.taskId));
  const stepped = new Set(existingSteps.map(row => row.taskId));
  const timestamp = now();
  const hintValues = taskRows.flatMap(task => hinted.has(task.id) ? [] : [
    { taskId: task.id, title: "Сначала выделите данные", bodyMarkdown: "Перечитайте вопрос и выпишите известные величины с единицами измерения. Не выполняйте вычисления, пока не ясно, что нужно найти.", sortOrder: 1, createdAt: timestamp, updatedAt: timestamp },
    { taskId: task.id, title: "Выберите математический инструмент", bodyMarkdown: "Соотнесите данные с темой задания: формула, пропорция, уравнение, вероятность или геометрическое свойство. Затем составьте короткую запись решения.", sortOrder: 2, createdAt: timestamp, updatedAt: timestamp },
  ]);
  const stepValues = taskRows.flatMap(task => stepped.has(task.id) ? [] : [
    { taskId: task.id, title: "Шаг 1. Понять вопрос", bodyMarkdown: "Зафиксируйте неизвестную величину и проверьте, что ответ нужен именно в указанном формате.", sortOrder: 1, createdAt: timestamp, updatedAt: timestamp },
    { taskId: task.id, title: "Шаг 2. Выполнить вычисление", bodyMarkdown: task.solutionMarkdown, sortOrder: 2, createdAt: timestamp, updatedAt: timestamp },
    { taskId: task.id, title: "Шаг 3. Самопроверка", bodyMarkdown: "Сверьте единицы измерения, знак и реалистичность результата. Только после этого оформляйте окончательный ответ.", sortOrder: 3, createdAt: timestamp, updatedAt: timestamp },
  ]);
  if (hintValues.length) await db.insert(taskHints).values(hintValues);
  if (stepValues.length) await db.insert(taskSolutionSteps).values(stepValues);
}

let seedPromise: Promise<number | null> | null = null;

/**
 * A small original data set for the user-facing ОГЭ prototype. It demonstrates
 * the full content model without importing or republishing external tasks.
 */
async function seedOgeData() {
  const db = await getDb();
  if (!db) return null;

  const existing = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.slug, "mathematics"))
    .limit(1);

  if (existing[0]) {
    const [existingEge] = await db.select({ id: examTracks.id }).from(examTracks).where(eq(examTracks.slug, "ege-mathematics")).limit(1);
    if (!existingEge) {
      const timestamp = now();
      await db.insert(examTracks).values({ subjectId: existing[0].id, slug: "ege-mathematics", title: "ЕГЭ по математике", examKind: "ege", description: "Маршрут подготовки к ЕГЭ создан; наполнение банка проходит отдельную редакционную калибровку.", isPrototype: true, isActive: true, createdAt: timestamp, updatedAt: timestamp });
    }
    const [track] = await db.select({ id: examTracks.id }).from(examTracks).where(eq(examTracks.slug, "oge-mathematics")).limit(1);
    if (track) {
      await ensureOgeTaskTypes(db, track.id);
      await ensureTheorySeed(db, existing[0].id, track.id);
      await ensureAuthorTaskExpansion(db, existing[0].id, track.id);
      await ensureTheoryPracticeLinks(db, track.id);
      await ensureTaskVisualSeed(db, track.id);
      await ensureTheoryVisualSeed(db, existing[0].id);
      await ensureTaskLearningSupport(db, track.id);
      await createPublishedMonthlyVariant(db, track.id, monthKeyFrom());
      const [schedule] = await db.select({ id: variantGenerationSchedules.id }).from(variantGenerationSchedules).where(eq(variantGenerationSchedules.examTrackId, track.id)).limit(1);
      if (!schedule) await db.insert(variantGenerationSchedules).values({ examTrackId: track.id, cronExpression: "0 0 3 1 * *", isActive: true, createdAt: now(), updatedAt: now() });
    }
    return existing[0].id;
  }

  const timestamp = now();
  await db.insert(subjects).values({
    slug: "mathematics",
    title: "Математика",
    shortTitle: "Математика",
    description: "Первый предмет платформы: подготовка к ОГЭ по математике.",
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const [subject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.slug, "mathematics"))
    .limit(1);
  if (!subject) throw new Error("Mathematics subject was not created");

  await db.insert(examTracks).values({
    subjectId: subject.id,
    slug: "oge-mathematics",
    title: "ОГЭ по математике",
    examKind: "oge",
    description: "Демонстрационная учебная карта по шести базовым блокам ОГЭ.",
    isPrototype: true,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(examTracks).values({
    subjectId: subject.id,
    slug: "ege-mathematics",
    title: "ЕГЭ по математике",
    examKind: "ege",
    description: "Маршрут подготовки к ЕГЭ создан; наполнение банка проходит отдельную редакционную калибровку.",
    isPrototype: true,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const [track] = await db
    .select({ id: examTracks.id })
    .from(examTracks)
    .where(eq(examTracks.slug, "oge-mathematics"))
    .limit(1);
  if (!track) throw new Error("ОГЭ mathematics track was not created");

  const topicSeed = [
    ["calculations-percentages", "Вычисления и проценты", "Проценты, отношения и пропорции."],
    ["equations", "Уравнения", "Линейные и простые квадратные уравнения."],
    ["graphs-functions", "Графики и функции", "Чтение графиков и работа с формулами функций."],
    ["probability", "Вероятность", "Классическое определение вероятности и подсчёт исходов."],
    ["plane-geometry", "Планиметрия", "Углы, треугольники, площади и длины."],
    ["practical-context", "Практико-ориентированные задачи", "Работа с величинами, таблицами и реальными ситуациями."],
  ] as const;

  await db.insert(curriculumUnits).values(
    topicSeed.map(([slug, title, description], index) => ({
      subjectId: subject.id,
      slug,
      title,
      description,
      sortOrder: index + 1,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );

  const topicRows = await db
    .select({ id: curriculumUnits.id, slug: curriculumUnits.slug })
    .from(curriculumUnits)
    .where(eq(curriculumUnits.subjectId, subject.id));
  const topicIds = new Map(topicRows.map(row => [row.slug, row.id]));

  await db.insert(examTrackCurriculumUnits).values(
    topicSeed.map(([slug]) => ({
      examTrackId: track.id,
      curriculumUnitId: idFor(topicIds, slug),
    })),
  );

  await ensureOgeTaskTypes(db, track.id);

  const taskTypeRows = await db
    .select({ id: examTaskTypes.id, kimNumber: examTaskTypes.kimNumber })
    .from(examTaskTypes)
    .where(eq(examTaskTypes.examTrackId, track.id));
  const taskTypeIds = new Map(taskTypeRows.map(row => [row.kimNumber, row.id]));

  const theorySeed = THEORY_SEED;

  await db.insert(theoryUnits).values(
    theorySeed.map(([slug, title, lead, bodyMarkdown], index) => ({
      subjectId: subject.id,
      slug,
      title,
      lead,
      bodyMarkdown,
      status: "published" as const,
      sortOrder: index + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
    })),
  );

  const theoryRows = await db
    .select({ id: theoryUnits.id, slug: theoryUnits.slug })
    .from(theoryUnits)
    .where(eq(theoryUnits.subjectId, subject.id));
  const theoryIds = new Map(theoryRows.map(row => [row.slug, row.id]));

  await db.insert(theoryExamTracks).values(
    theorySeed.map(([slug]) => ({ theoryUnitId: idFor(theoryIds, slug), examTrackId: track.id })),
  );
  await db.insert(theoryCurriculumUnits).values(
    theorySeed.map(([slug, , , , topicSlug]) => ({
      theoryUnitId: idFor(theoryIds, slug),
      curriculumUnitId: idFor(topicIds, topicSlug),
    })),
  );
  await db.insert(theoryTaskTypes).values(
    theorySeed.map(([slug, , , , , kimNumber]) => ({
      theoryUnitId: idFor(theoryIds, slug),
      examTaskTypeId: idFor(taskTypeIds, kimNumber),
    })),
  );

  const taskSeed = [
    ["discount-15", "Скидка 15%", "Куртка стоила 2400 рублей. Во время распродажи на неё сделали скидку 15%. Сколько рублей стала стоить куртка?", "short_integer", "2040", "Цена после скидки равна `2400 × 0,85 = 2040` рублей.", "basic", "calculations-percentages", "6", "percentages-proportions"],
    ["notebooks-proportion", "Тетради и пропорция", "Пять одинаковых тетрадей стоят 275 рублей. Сколько рублей стоят восемь таких тетрадей?", "short_integer", "440", "Одна тетрадь стоит `275 / 5 = 55` рублей. Тогда восемь тетрадей стоят `55 × 8 = 440` рублей.", "basic", "calculations-percentages", "6", "percentages-proportions"],
    ["linear-equation", "Линейное уравнение", "Решите уравнение: 4x − 7 = 21.", "short_integer", "7", "Перенесём −7 вправо: `4x = 28`. Делим обе части на 4: `x = 7`.", "basic", "equations", "8", "linear-equations"],
    ["equation-with-brackets", "Уравнение со скобками", "Решите уравнение: 3(x + 2) = 27.", "short_integer", "7", "Разделим обе части на 3: `x + 2 = 9`. Вычтем 2: `x = 7`.", "standard", "equations", "8", "linear-equations"],
    ["function-value", "Значение функции", "Функция задана формулой y = 3x − 2. Найдите y при x = 4.", "short_integer", "10", "Подставляем `x = 4`: `y = 3 × 4 − 2 = 10`.", "basic", "graphs-functions", "11", "function-value"],
    ["function-negative", "Функция с отрицательным коэффициентом", "Функция задана формулой y = −2x + 3. Найдите y при x = 4.", "short_integer", "-5", "Подставляем `x = 4`: `y = −2 × 4 + 3 = −8 + 3 = −5`.", "standard", "graphs-functions", "11", "function-value"],
    ["white-balls", "Шары в коробке", "В коробке 3 белых и 2 чёрных шара. Наугад выбирают один шар. Какова вероятность выбрать белый шар?", "short_decimal", "0.6", "Всего 5 шаров, благоприятных исходов 3. Вероятность: `3 / 5 = 0,6`.", "basic", "probability", "10", "classical-probability"],
    ["red-cards", "Карточки с числами", "На карточках записаны числа от 1 до 10. Наугад выбирают одну карточку. Какова вероятность, что число будет кратно 3?", "short_decimal", "0.3", "Кратны 3 числа 3, 6 и 9: всего 3 благоприятных исхода из 10. `3 / 10 = 0,3`.", "standard", "probability", "10", "classical-probability"],
    ["triangle-angle", "Угол треугольника", "Два угла треугольника равны 48° и 67°. Найдите третий угол в градусах.", "short_integer", "65", "Сумма углов треугольника равна 180°. Третий угол: `180 − 48 − 67 = 65`.", "basic", "plane-geometry", "15", "triangle-angles"],
    ["isosceles-angle", "Равнобедренный треугольник", "В равнобедренном треугольнике угол при вершине равен 40°. Найдите угол при основании в градусах.", "short_integer", "70", "Два угла при основании равны. Их сумма: `180 − 40 = 140`. Каждый равен `140 / 2 = 70`.", "standard", "plane-geometry", "15", "triangle-angles"],
    ["train-speed", "Скорость поезда", "Поезд прошёл 180 км за 3 часа. Найдите его среднюю скорость в км/ч.", "short_integer", "60", "Скорость равна расстоянию, делённому на время: `180 / 3 = 60` км/ч.", "basic", "practical-context", "1–5", "rate-time-distance"],
    ["walk-time", "Время в пути", "Турист идёт со скоростью 4 км/ч. Сколько часов ему потребуется, чтобы пройти 14 км?", "short_decimal", "3.5", "Время равно расстоянию, делённому на скорость: `14 / 4 = 3,5` часа.", "standard", "practical-context", "1–5", "rate-time-distance"],
  ] as const;

  await db.insert(tasks).values(
    taskSeed.map(([slug, title, statementMarkdown, answerKind, correctAnswer, solutionMarkdown, difficulty, topicSlug, kimNumber]) => ({
      subjectId: subject.id,
      examTrackId: track.id,
      examTaskTypeId: idFor(taskTypeIds, kimNumber),
      slug,
      internalId: `TASK-SEED-${slug.toUpperCase()}`,
      title,
      statementMarkdown,
      answerKind,
      correctAnswer,
      acceptableAnswers: [],
      solutionMarkdown,
      difficulty,
      sourceKind: "author" as const,
      contentVersion: 1,
      status: "published" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
    })),
  );

  const taskRows = await db
    .select({ id: tasks.id, slug: tasks.slug })
    .from(tasks)
    .where(eq(tasks.examTrackId, track.id));
  const taskIds = new Map(taskRows.map(row => [row.slug, row.id]));

  await db.insert(taskCurriculumUnits).values(
    taskSeed.map(([slug, , , , , , , topicSlug]) => ({
      taskId: idFor(taskIds, slug),
      curriculumUnitId: idFor(topicIds, topicSlug),
    })),
  );
  await db.insert(taskTheoryUnits).values(
    taskSeed.map(([slug, , , , , , , , , theorySlug]) => ({
      taskId: idFor(taskIds, slug),
      theoryUnitId: idFor(theoryIds, theorySlug),
    })),
  );
  await ensureAuthorTaskExpansion(db, subject.id, track.id);
  await ensureTheoryPracticeLinks(db, track.id);
  await ensureTaskVisualSeed(db, track.id);
  await ensureTheoryVisualSeed(db, subject.id);
  await ensureTaskLearningSupport(db, track.id);
  await createPublishedMonthlyVariant(db, track.id, monthKeyFrom());
  await db.insert(variantGenerationSchedules).values({ examTrackId: track.id, cronExpression: "0 0 3 1 * *", isActive: true, createdAt: now(), updatedAt: now() });

  return subject.id;
}

export function ensureOgeSeedData() {
  if (!seedPromise) {
    seedPromise = seedOgeData().catch(error => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}
