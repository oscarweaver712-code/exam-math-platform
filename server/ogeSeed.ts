import { eq } from "drizzle-orm";
import {
  curriculumUnits,
  examTaskTypes,
  examTrackCurriculumUnits,
  examTracks,
  taskCurriculumUnits,
  tasks,
  taskTheoryUnits,
  theoryCurriculumUnits,
  theoryExamTracks,
  theoryTaskTypes,
  theoryUnits,
  subjects,
} from "../drizzle/schema";
import { getDb } from "./db";

const now = () => Date.now();

function idFor(map: Map<string, number>, key: string) {
  const id = map.get(key);
  if (!id) throw new Error(`Seed reference is missing: ${key}`);
  return id;
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

  if (existing[0]) return existing[0].id;

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

  const taskTypeSeed = [
    ["practical", "1–5", "Практико-ориентированные задачи", "part1"],
    ["calculations", "6", "Вычисления и проценты", "part1"],
    ["equations", "8", "Уравнения", "part1"],
    ["graphs", "11", "Графики и функции", "part1"],
    ["probability", "10", "Вероятность", "part1"],
    ["geometry", "15", "Планиметрия", "part1"],
  ] as const;

  await db.insert(examTaskTypes).values(
    taskTypeSeed.map(([key, kimNumber, title, part], index) => ({
      examTrackId: track.id,
      kimNumber,
      title,
      part,
      sortOrder: index + 1,
      description: `Прототипная привязка: ${key}.`,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );

  const taskTypeRows = await db
    .select({ id: examTaskTypes.id, kimNumber: examTaskTypes.kimNumber })
    .from(examTaskTypes)
    .where(eq(examTaskTypes.examTrackId, track.id));
  const taskTypeIds = new Map(taskTypeRows.map(row => [row.kimNumber, row.id]));

  const theorySeed = [
    [
      "percentages-proportions",
      "Проценты и пропорции",
      "Переводите процент в дробь, а затем находите нужную часть от величины.",
      "## Алгоритм\n\n1. Найдите 1%: разделите величину на 100.\n2. Умножьте на нужное число процентов.\n3. Для скидки вычтите полученный результат из исходной цены.\n\n**Проверка:** ответ на задачу о скидке должен быть меньше исходной цены.",
      "calculations-percentages",
      "6",
    ],
    [
      "linear-equations",
      "Линейные уравнения",
      "Собирайте неизвестные в одной части равенства, а числа — в другой.",
      "## Алгоритм\n\nРаскройте скобки, перенесите слагаемые с переменной в одну часть, затем разделите на коэффициент при переменной.\n\n**Ошибка:** менять знак при переносе нужно у всего слагаемого.",
      "equations",
      "8",
    ],
    [
      "function-value",
      "Значение функции и график",
      "Подставляйте известное значение аргумента в формулу или считывайте координату с графика.",
      "## Алгоритм\n\nДля формулы подставьте значение `x` и аккуратно выполните вычисления. Для графика сначала найдите значение по горизонтальной оси, затем считайте соответствующую точку по вертикальной оси.",
      "graphs-functions",
      "11",
    ],
    [
      "classical-probability",
      "Классическая вероятность",
      "Вероятность равна отношению числа благоприятных исходов к числу всех равновозможных исходов.",
      "## Формула\n\n`P = m / n`, где `m` — число благоприятных исходов, а `n` — число всех исходов.\n\nОтвет можно записать обыкновенной или десятичной дробью, если это допускает правило задания.",
      "probability",
      "10",
    ],
    [
      "triangle-angles",
      "Углы треугольника",
      "Сумма внутренних углов треугольника равна 180°.",
      "## Алгоритм\n\nСложите известные углы и вычтите сумму из 180°. В равнобедренном треугольнике углы при основании равны.\n\n**Проверка:** полученный угол должен быть положительным.",
      "plane-geometry",
      "15",
    ],
    [
      "rate-time-distance",
      "Скорость, время и расстояние",
      "Связывайте величины формулой `S = v × t` и всегда приводите единицы к одному виду.",
      "## Три формулы\n\n- `S = v × t`\n- `v = S / t`\n- `t = S / v`\n\nПеред вычислением проверьте, что часы, минуты и километры согласованы.",
      "practical-context",
      "1–5",
    ],
  ] as const;

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
