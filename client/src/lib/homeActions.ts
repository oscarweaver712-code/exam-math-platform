import { BookOpenCheck, CheckCircle2, ClipboardList, ClipboardPlus, type LucideIcon } from "lucide-react";

export type LearningRole = "student" | "tutor" | "unselected";

export type HomeAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function getHomeActions(isAuthenticated: boolean, learningRole?: LearningRole): {
  primary: HomeAction;
  secondary: HomeAction;
  helper: string;
} {
  if (learningRole === "tutor") {
    return {
      primary: { href: "/tutor", label: "Добавить задание", description: "Выберите ученика и задачи, которые нужно отработать.", icon: ClipboardPlus },
      secondary: { href: "/bank", label: "Открыть задания", description: "Посмотреть задания перед назначением.", icon: BookOpenCheck },
      helper: "Режим преподавателя: выдавайте практику ученикам и следите за работой.",
    };
  }

  if (learningRole === "student") {
    return {
      primary: { href: "/bank", label: "Решать задания", description: "Выберите тему или номер ОГЭ и начните практику.", icon: BookOpenCheck },
      secondary: { href: "/workspace", label: "Мой прогресс", description: "Вернуться к домашней работе и сохранённым заданиям.", icon: ClipboardList },
      helper: "Режим ученика: решайте задания, смотрите разборы и отслеживайте прогресс.",
    };
  }

  if (isAuthenticated) {
    return {
      primary: { href: "/workspace", label: "Выбрать роль", description: "Укажите, учитесь вы или работаете с учениками.", icon: CheckCircle2 },
      secondary: { href: "/bank", label: "Открыть задания", description: "Начать практику можно уже сейчас.", icon: BookOpenCheck },
      helper: "Выберите роль один раз — главная страница подстроит следующий шаг под вас.",
    };
  }

  return {
    primary: { href: "/bank", label: "Начать решать", description: "Откройте конкретное задание и попробуйте решить его.", icon: BookOpenCheck },
    secondary: { href: "/tutor", label: "Я преподаватель", description: "Войдите, чтобы выдавать задания ученикам.", icon: ClipboardPlus },
    helper: "Начните без регистрации. Вход нужен для прогресса, домашней работы и кабинета преподавателя.",
  };
}
