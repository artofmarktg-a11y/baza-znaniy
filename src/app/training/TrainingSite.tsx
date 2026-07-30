"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, FormEvent, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Icons from "lucide-react";
import { formatRussianPhone, isRussianPhone, normalizeRussianPhone } from "@/lib/phone";
import { lessonContentBlocks, validateMobileLessonContent } from "@/lib/lesson-content";

type TrainingModule = {
  id: number;
  order_num: number;
  title: string;
  description: string | null;
  icon: string | null;
  gradient: string | null;
  is_active: boolean;
  is_locked?: boolean;
  parent_id: number | null;
};

type TrainingLessonSummary = {
  id: number;
  module_id: number;
  order_num: number;
  title: string;
  lesson_type: string;
  duration_min: number;
};

type TrainingLesson = TrainingLessonSummary & { content: string };

type LessonAudioItem = {
  label: string;
  src: string;
};

type QuizQuestion = {
  question: string;
  options: string[];
};

type ModuleQuizSummary = {
  id: number;
  module_id: number;
  question_count: number;
  rules: {
    title?: string;
    description?: string;
    pass_score?: number;
    pass_percent?: number;
    max_attempts?: number;
  };
  pass_score: number;
  max_attempts: number | null;
};

type ModuleQuiz = ModuleQuizSummary & { questions: QuizQuestion[] };

type TrainingData = {
  title: string;
  modules: TrainingModule[];
  lessons: TrainingLessonSummary[];
  quizzes: ModuleQuizSummary[];
  access: {
    method: "EXPRESS_TRAINING" | "MAIN_PROGRAM";
    state: "TRAINEE" | "REVIEW_REQUIRED" | "FULL_ACCESS" | "TRAINING_COMPLETED";
    trial_module_id: number;
    review_requested_at: string | null;
    decision_comment: string;
  };
};

type QuizAttempt = {
  score: number;
  total: number;
  passed: boolean;
  answers: number[];
  completedAt: string;
};

type ProgressState = {
  completedLessons: number[];
  quizAttempts: Record<string, QuizAttempt[]>;
};

type ProgressStore = {
  activeEmployeeId: string;
  byEmployee: Record<string, ProgressState>;
};

type ModuleStat = {
  lessons: TrainingLessonSummary[];
  quizzes: ModuleQuizSummary[];
  doneLessons: number;
  passedQuizzes: number;
  totalItems: number;
  doneItems: number;
  duration: number;
  pct: number;
};

type HomeNextStep = {
  kind: "lesson" | "quiz";
  module: TrainingModule;
  lesson?: TrainingLessonSummary;
  href: string;
};

type AccessRole = {
  key: "admin" | "rop" | "knowledge_editor" | "manager";
  title: string;
};

type AccessPermission = {
  key: string;
  title: string;
};

type AccessGroup = {
  title: string;
  permissions: AccessPermission[];
};

type AccessSettings = Record<AccessRole["key"], Record<string, boolean>>;

type Employee = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  position: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  role: AccessRole["key"];
  managerId: string;
  managerName: string;
  hireDate: string;
  isActive: boolean;
  createdAt: string;
  learningProgress: number;
  lastLearningActivityAt: string | null;
  trainingDueDate: string;
  lastReminderAt: string | null;
  trainingAccess: {
    method: "EXPRESS_TRAINING" | "MAIN_PROGRAM";
    state: "TRAINEE" | "REVIEW_REQUIRED" | "FULL_ACCESS" | "TRAINING_COMPLETED";
    trialModuleId: number;
    reviewRequestedAt: string | null;
    reviewedAt: string | null;
    decisionComment: string;
  };
};

type TrainingAssignment = {
  id: string;
  moduleId: number;
  employeeId: string;
  dueDate: string;
  isRequired: boolean;
  lastReminderAt: string | null;
  createdAt: string;
  employeeName: string;
};

type CurrentUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  middleName: string;
  hasAvatar?: boolean;
  role: "ADMIN" | "ROP" | "KNOWLEDGE_EDITOR" | "MANAGER";
};

const expressTrainingTitle = "Экспресс-обучение: старт в продажах";

const accessRoles: AccessRole[] = [
  { key: "admin", title: "Администратор" },
  { key: "rop", title: "Руководитель" },
  { key: "knowledge_editor", title: "Редактор базы знаний" },
  { key: "manager", title: "Менеджер" },
];

const accessGroups: AccessGroup[] = [
  {
    title: "База знаний и обучение",
    permissions: [
      { key: "training", title: "База знаний и личный прогресс" },
      { key: "knowledge_manage", title: "Редактирование материалов" },
      { key: "team_progress_view", title: "Прогресс своей команды" },
      { key: "training_completion_manage", title: "Подтверждение итогов экспресс-обучения" },
    ],
  },
  {
    title: "Сотрудники и доступ",
    permissions: [
      { key: "employees_view", title: "Просмотр сотрудников" },
      { key: "employees_manage", title: "Управление сотрудниками" },
      { key: "access_manage", title: "Настройка ролей и прав" },
    ],
  },
];

const defaultAccessSettings: AccessSettings = {
  admin: {
    training: true, knowledge_manage: true, team_progress_view: true, training_completion_manage: true,
    employees_view: true, employees_manage: true, access_manage: true,
  },
  rop: {
    training: true, knowledge_manage: false, team_progress_view: true, training_completion_manage: true,
    employees_view: false, employees_manage: false, access_manage: false,
  },
  knowledge_editor: {
    training: true, knowledge_manage: true, team_progress_view: false, training_completion_manage: false,
    employees_view: true, employees_manage: false, access_manage: false,
  },
  manager: {
    training: true, knowledge_manage: false, team_progress_view: false, training_completion_manage: false,
    employees_view: false, employees_manage: false, access_manage: false,
  },
};

const databaseRoleByAccessRole: Record<AccessRole["key"], CurrentUser["role"]> = {
  admin: "ADMIN",
  rop: "ROP",
  knowledge_editor: "KNOWLEDGE_EDITOR",
  manager: "MANAGER",
};

const accessRoleByDatabaseRole: Record<CurrentUser["role"], AccessRole["key"]> = {
  ADMIN: "admin",
  ROP: "rop",
  KNOWLEDGE_EDITOR: "knowledge_editor",
  MANAGER: "manager",
};

function pluralLessons(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "урок";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "урока";
  return "уроков";
}

function decodeHtmlValue(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function textFromHtml(value: string) {
  return decodeHtmlValue(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function extractLessonAudios(content: string): LessonAudioItem[] {
  const items: LessonAudioItem[] = [];
  const pairedAudioPattern = /audioplayer__mobile-name[^>]*>([\s\S]*?)<\/div>[\s\S]*?<audio[^>]*\bsrc="([^"]+)"/gi;
  for (const match of content.matchAll(pairedAudioPattern)) {
    items.push({
      label: textFromHtml(match[1]) || `Звонок ${items.length + 1}`,
      src: decodeHtmlValue(match[2]),
    });
  }

  if (items.length) return items;

  const audioPattern = /<audio[^>]*\bsrc="([^"]+)"/gi;
  for (const match of content.matchAll(audioPattern)) {
    items.push({
      label: `Звонок ${items.length + 1}`,
      src: decodeHtmlValue(match[1]),
    });
  }

  return items;
}

function enhanceLessonAudioPlayers(root: HTMLDivElement) {
  const audios = Array.from(root.querySelectorAll("audio"));

  audios.forEach((audio, index) => {
    audio.controls = true;
    audio.preload = "metadata";

    const wrapper = audio.parentElement;
    const getcoursePlayer = wrapper?.querySelector(".container-player .audioplayer");
    const host = getcoursePlayer || wrapper || audio.parentElement;
    if (!host) return;
    if (host.querySelector(".gc-audio-play-button")) return;

    const row = document.createElement("div");
    row.className = "gc-audio-control-row";

    const control = document.createElement("button");
    control.type = "button";
    control.className = "gc-audio-play-button";
    control.textContent = "Прослушать звонок";
    control.setAttribute("aria-label", `Прослушать звонок ${index + 1}`);

    const status = document.createElement("span");
    status.className = "gc-audio-play-status";
    status.textContent = "Готов к прослушиванию";

    const setIdle = () => {
      control.textContent = "Прослушать звонок";
      status.textContent = audio.error ? "Файл звонка недоступен" : "Готов к прослушиванию";
    };
    const setPlaying = () => {
      control.textContent = "Пауза";
      status.textContent = "Воспроизводится";
    };

    control.addEventListener("click", async () => {
      if (!audio.paused) {
        audio.pause();
        return;
      }

      control.textContent = "Загрузка...";
      status.textContent = "Подключаем аудио";
      audios.forEach((item) => {
        if (item !== audio) item.pause();
      });

      try {
        await audio.play();
      } catch {
        control.textContent = "Прослушать звонок";
        status.textContent = "Не удалось запустить аудио";
      }
    });
    audio.addEventListener("play", setPlaying);
    audio.addEventListener("pause", setIdle);
    audio.addEventListener("ended", setIdle);
    audio.addEventListener("error", setIdle);

    row.append(control, status);
    host.append(row);
  });
}

function emptyProgress(): ProgressState {
  return { completedLessons: [], quizAttempts: {} };
}

function copyDefaultAccessSettings(): AccessSettings {
  return accessRoles.reduce((settings, role) => {
    settings[role.key] = { ...defaultAccessSettings[role.key] };
    return settings;
  }, {} as AccessSettings);
}

function accessSettingsEqual(first: AccessSettings, second: AccessSettings) {
  return accessRoles.every((role) => accessGroups.every((group) => group.permissions.every((permission) => (
    Boolean(first[role.key]?.[permission.key]) === Boolean(second[role.key]?.[permission.key])
  ))));
}

function roleTitle(roleKey: AccessRole["key"]) {
  return accessRoles.find((role) => role.key === roleKey)?.title || "Менеджер";
}

function loadErrorMessage(response: Response | null, subject: string) {
  if (response?.status === 401) return `Сессия истекла. Войдите снова, чтобы загрузить ${subject}.`;
  if (response?.status === 403) return `У вас нет доступа к разделу «${subject}».`;
  return `Не удалось загрузить ${subject}. Проверьте подключение и повторите попытку.`;
}

function employeeDisplayName(employee: Employee) {
  return [employee.lastName, employee.firstName, employee.middleName].filter(Boolean).join(" ") || employee.username;
}

function employeeInitials(employee: Employee) {
  const source = [employee.lastName, employee.firstName].filter(Boolean);
  if (!source.length) return employee.username.slice(0, 2).toUpperCase();
  return source.map((part) => part[0]).join("").toUpperCase();
}

function employeeFromCurrentUser(user: CurrentUser): Employee {
  const role: Record<CurrentUser["role"], AccessRole["key"]> = {
    ADMIN: "admin",
    ROP: "rop",
    KNOWLEDGE_EDITOR: "knowledge_editor",
    MANAGER: "manager",
  };
  return {
    id: user.id,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: user.middleName,
    position: "",
    phone: "",
    email: "",
    username: user.username,
    password: "",
    role: role[user.role],
    managerId: "",
    managerName: "",
    hireDate: "",
    isActive: true,
    createdAt: "",
    learningProgress: 0,
    lastLearningActivityAt: null,
    trainingDueDate: "",
    lastReminderAt: null,
    trainingAccess: { method: "EXPRESS_TRAINING", state: "FULL_ACCESS", trialModuleId: 23, reviewRequestedAt: null, reviewedAt: null, decisionComment: "" },
  };
}

function employeeFromApi(user: Omit<CurrentUser, "role"> & { role: CurrentUser["role"]; position: string; phone: string; email: string | null; managerId?: string; managerName?: string; isActive: boolean; hireDate: string; createdAt: string; learningProgress?: number; lastLearningActivityAt?: string | null; trainingDueDate?: string; lastReminderAt?: string | null; trainingAccess?: Employee["trainingAccess"] }): Employee {
  return {
    ...employeeFromCurrentUser(user),
    position: user.position,
    phone: user.phone,
    email: user.email || "",
    managerId: user.managerId || "",
    managerName: user.managerName || "",
    isActive: user.isActive,
    hireDate: user.hireDate,
    createdAt: user.createdAt,
    learningProgress: Math.max(0, Math.min(100, user.learningProgress || 0)),
    lastLearningActivityAt: user.lastLearningActivityAt || null,
    trainingDueDate: user.trainingDueDate || "",
    lastReminderAt: user.lastReminderAt || null,
    trainingAccess: user.trainingAccess || { method: "EXPRESS_TRAINING", state: "FULL_ACCESS", trialModuleId: 23, reviewRequestedAt: null, reviewedAt: null, decisionComment: "" },
  };
}

export default function TrainingSite({ currentUser, initialData, initialLesson, initialQuiz, permissions, isPublicView = false }: { currentUser: CurrentUser; initialData: TrainingData; initialLesson?: TrainingLesson; initialQuiz?: ModuleQuiz; permissions: string[]; isPublicView?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const data = initialData;
  const [employees, setEmployees] = useState<Employee[]>(() => [employeeFromCurrentUser(currentUser)]);
  const [teamEmployees, setTeamEmployees] = useState<Employee[]>([]);
  const [progressStore, setProgressStore] = useState<ProgressStore>(() => ({
    activeEmployeeId: currentUser.id,
    byEmployee: { [currentUser.id]: emptyProgress() },
  }));
  const [isOwnProgressLoading, setIsOwnProgressLoading] = useState(true);
  const [ownProgressError, setOwnProgressError] = useState("");
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(false);
  const [employeesLoadError, setEmployeesLoadError] = useState("");
  const [isTeamProgressLoading, setIsTeamProgressLoading] = useState(false);
  const [teamProgressError, setTeamProgressError] = useState("");
  const canViewUsers = permissions.includes("employees_view");
  const canManageUsers = permissions.includes("employees_manage");
  const canViewTrainingProgress = permissions.includes("team_progress_view");
  const canManageTrainingAdmission = permissions.includes("training_completion_manage");

  const loadOwnProgress = useCallback(async () => {
    if (isPublicView) {
      setIsOwnProgressLoading(false);
      return;
    }
    setIsOwnProgressLoading(true);
    setOwnProgressError("");
    try {
      const response = await fetch("/api/progress");
      if (!response.ok) throw new Error(loadErrorMessage(response, "прогресс обучения"));
      const result = await response.json() as { completedLessons: number[]; quizAttempts: Array<QuizAttempt & { moduleId: number }> };
      const quizAttempts = result.quizAttempts.reduce<Record<string, QuizAttempt[]>>((store, attempt) => {
        const { moduleId, ...quizAttempt } = attempt;
        const attempts = store[String(moduleId)] || [];
        attempts.push(quizAttempt);
        store[String(moduleId)] = attempts;
        return store;
      }, {});
      setProgressStore((current) => ({
        ...current,
        activeEmployeeId: currentUser.id,
        byEmployee: { ...current.byEmployee, [currentUser.id]: { completedLessons: result.completedLessons, quizAttempts } },
      }));
    } catch (error) {
      setOwnProgressError(error instanceof Error ? error.message : "Не удалось загрузить прогресс обучения.");
    } finally {
      setIsOwnProgressLoading(false);
    }
  }, [currentUser.id, isPublicView]);

  useEffect(() => {
    void Promise.resolve().then(loadOwnProgress);
  }, [loadOwnProgress]);

  const loadEmployees = useCallback(async () => {
    if (!canViewUsers) return;
    setIsEmployeesLoading(true);
    setEmployeesLoadError("");
    try {
      const response = await fetch("/api/admin/users");
      if (!response.ok) throw new Error(loadErrorMessage(response, "сотрудников"));
      const users = await response.json() as Array<Parameters<typeof employeeFromApi>[0]>;
      setEmployees(users.map(employeeFromApi));
    } catch (error) {
      setEmployeesLoadError(error instanceof Error ? error.message : "Не удалось загрузить сотрудников.");
    } finally {
      setIsEmployeesLoading(false);
    }
  }, [canViewUsers]);

  useEffect(() => {
    void Promise.resolve().then(loadEmployees);
  }, [loadEmployees]);

  const loadTeamProgress = useCallback(async () => {
    if (!canViewTrainingProgress) return;
    setIsTeamProgressLoading(true);
    setTeamProgressError("");
    try {
      const response = await fetch("/api/admin/progress");
      if (!response.ok) throw new Error(loadErrorMessage(response, "прогресс команды"));
      const { users } = await response.json() as { users: Array<{
        userId: string; username: string; lastName: string; firstName: string; middleName: string; position: string; phone: string; email: string | null;
        role: CurrentUser["role"]; managerId: string; managerName: string; isActive: boolean; hireDate: string; createdAt: string;
        learningProgress?: number; lastLearningActivityAt?: string | null; trainingDueDate?: string; lastReminderAt?: string | null; trainingAccess?: Employee["trainingAccess"]; completedLessons: number[]; quizAttempts: Array<QuizAttempt & { moduleId: number }>;
      }> };
      setTeamEmployees(users.map((user) => employeeFromApi({ ...user, id: user.userId, hasAvatar: false })));
      setProgressStore((current) => {
        const byEmployee = { ...current.byEmployee };
        for (const user of users) {
          const quizAttempts = user.quizAttempts.reduce<Record<string, QuizAttempt[]>>((store, attempt) => {
            const { moduleId, ...quizAttempt } = attempt;
            const attempts = store[String(moduleId)] || [];
            attempts.push(quizAttempt);
            store[String(moduleId)] = attempts;
            return store;
          }, {});
          byEmployee[user.userId] = { completedLessons: user.completedLessons, quizAttempts };
        }
        return { ...current, byEmployee };
      });
    } catch (error) {
      setTeamProgressError(error instanceof Error ? error.message : "Не удалось загрузить прогресс команды.");
    } finally {
      setIsTeamProgressLoading(false);
    }
  }, [canViewTrainingProgress]);

  useEffect(() => {
    void Promise.resolve().then(loadTeamProgress);
  }, [loadTeamProgress]);

  const model = useMemo(() => {
    const modules = [...data.modules].sort((a, b) => a.order_num - b.order_num || a.id - b.id);
    const lessons = [...data.lessons].sort((a, b) => a.order_num - b.order_num || a.id - b.id);
    const topModules = modules.filter((module) => module.parent_id === null);
    const byId = new Map(modules.map((module) => [module.id, module]));
    const childrenByParent = new Map<number, TrainingModule[]>();
    const lessonsByModule = new Map<number, TrainingLessonSummary[]>();
    const quizByModule = new Map(data.quizzes.map((quiz) => [quiz.module_id, quiz]));

    modules.forEach((module) => {
      if (module.parent_id !== null) {
        const children = childrenByParent.get(module.parent_id) || [];
        children.push(module);
        childrenByParent.set(module.parent_id, children);
      }
    });
    lessons.forEach((lesson) => {
      const group = lessonsByModule.get(lesson.module_id) || [];
      group.push(lesson);
      lessonsByModule.set(lesson.module_id, group);
    });

    return { modules, topModules, byId, childrenByParent, lessonsByModule, quizByModule };
  }, [data]);

  const activeEmployeeId = progressStore.activeEmployeeId || employees[0]?.id || currentUser.id;
  const activeProgress = progressStore.byEmployee[activeEmployeeId] || emptyProgress();
  const completed = useMemo(() => new Set(activeProgress.completedLessons), [activeProgress.completedLessons]);

  function quizAttempts(moduleId: number) {
    return activeProgress.quizAttempts[String(moduleId)] || [];
  }

  function bestQuizAttempt(moduleId: number) {
    return quizAttempts(moduleId).reduce<QuizAttempt | null>((best, attempt) => {
      if (!best || attempt.score > best.score) return attempt;
      return best;
    }, null);
  }

  function quizPassed(moduleId: number) {
    return quizAttempts(moduleId).some((attempt) => attempt.passed);
  }

  function lessonsForModule(module: TrainingModule, deep = true): TrainingLessonSummary[] {
    const own = model.lessonsByModule.get(module.id) || [];
    if (!deep) return own;
    const children = model.childrenByParent.get(module.id) || [];
    return children.flatMap((child) => lessonsForModule(child, true)).concat(own);
  }

  function quizzesForModule(module: TrainingModule, deep = true): ModuleQuizSummary[] {
    const own = model.quizByModule.get(module.id);
    const result = own ? [own] : [];
    if (!deep) return result;
    const children = model.childrenByParent.get(module.id) || [];
    return children.flatMap((child) => quizzesForModule(child, true)).concat(result);
  }

  function statFor(module: TrainingModule, deep = true): ModuleStat {
    const lessons = lessonsForModule(module, deep);
    const quizzes = quizzesForModule(module, deep);
    const doneLessons = lessons.filter((lesson) => completed.has(lesson.id)).length;
    const passedQuizzes = quizzes.filter((quiz) => quizPassed(quiz.module_id)).length;
    const totalItems = lessons.length + quizzes.length;
    const doneItems = doneLessons + passedQuizzes;
    const duration = lessons.reduce((sum, lesson) => sum + (lesson.duration_min || 0), 0);
    return {
      lessons,
      quizzes,
      doneLessons,
      passedQuizzes,
      totalItems,
      doneItems,
      duration,
      pct: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
    };
  }

  async function markLessonComplete(lesson: TrainingLessonSummary) {
    const response = await fetch("/api/progress/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId: lesson.id }),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) throw new Error(result?.error || "Не удалось сохранить прохождение урока.");
    setProgressStore((current) => {
      const currentProgress = current.byEmployee[activeEmployeeId] || emptyProgress();
      if (currentProgress.completedLessons.includes(lesson.id)) return current;
      return {
        ...current,
        byEmployee: {
          ...current.byEmployee,
          [activeEmployeeId]: {
            ...currentProgress,
            completedLessons: [...currentProgress.completedLessons, lesson.id],
          },
        },
      };
    });
  }

  function firstLearningUrl(module: TrainingModule) {
    const children = model.childrenByParent.get(module.id) || [];
    if (children.length) return `/training/module/${module.id}`;
    const lessons = model.lessonsByModule.get(module.id) || [];
    if (lessons[0]) return `/training/lesson/${lessons[0].id}`;
    if (model.quizByModule.has(module.id)) return `/training/module/${module.id}/quiz`;
    return `/training/module/${module.id}`;
  }

  function learningLeafModules(module: TrainingModule): TrainingModule[] {
    const children = model.childrenByParent.get(module.id) || [];
    if (!children.length) return [module];
    return children.flatMap((child) => learningLeafModules(child));
  }

  function nextLearningStep(): HomeNextStep | null {
    const leaves = model.topModules.flatMap((module) => learningLeafModules(module));
    for (const leafModule of leaves) {
      const lessons = model.lessonsByModule.get(leafModule.id) || [];
      const nextLesson = lessons.find((lesson) => !completed.has(lesson.id));
      if (nextLesson) {
        return { kind: "lesson", module: leafModule, lesson: nextLesson, href: `/training/lesson/${nextLesson.id}` };
      }
      if (model.quizByModule.has(leafModule.id) && !quizPassed(leafModule.id)) {
        return { kind: "quiz", module: leafModule, href: `/training/module/${leafModule.id}/quiz` };
      }
    }
    return null;
  }

  function nextAfterLesson(lesson: TrainingLessonSummary) {
    const currentModule = model.byId.get(lesson.module_id);
    if (!currentModule) return "/training/basic";

    const localLessons = model.lessonsByModule.get(currentModule.id) || [];
    const index = localLessons.findIndex((item) => item.id === lesson.id);
    if (index >= 0 && index < localLessons.length - 1) {
      return `/training/lesson/${localLessons[index + 1].id}`;
    }
    if (model.quizByModule.has(currentModule.id)) return `/training/module/${currentModule.id}/quiz`;

    if (currentModule.parent_id !== null) {
      const siblings = model.childrenByParent.get(currentModule.parent_id) || [];
      const sectionIndex = siblings.findIndex((item) => item.id === currentModule.id);
      const nextSection = siblings[sectionIndex + 1];
      if (nextSection) return firstLearningUrl(nextSection);
      return `/training/module/${currentModule.parent_id}`;
    }
    return "/training/basic";
  }

  async function submitQuiz(moduleId: number, answers: number[]) {
    const quiz = model.quizByModule.get(moduleId);
    if (!quiz) throw new Error("Не удалось найти тест. Вернитесь к урокам и откройте его снова.");

    let response: Response;
    try {
      response = await fetch("/api/progress/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id, answers }),
      });
    } catch {
      throw new Error("Не удалось сохранить результат теста. Проверьте подключение и повторите попытку.");
    }

    const result = (await response.json().catch(() => null)) as QuizAttempt & { error?: string } | null;
    if (!response.ok || !result) {
      throw new Error(result?.error || "Не удалось сохранить результат теста. Повторите попытку.");
    }
    const attempt: QuizAttempt = {
      score: result.score,
      total: result.total,
      passed: result.passed,
      answers: result.answers,
      completedAt: result.completedAt,
    };

    setProgressStore((current) => {
      const key = String(moduleId);
      const currentProgress = current.byEmployee[activeEmployeeId] || emptyProgress();
      const currentAttempts = currentProgress.quizAttempts[key] || [];
      const completedLessons = new Set(currentProgress.completedLessons);
      if (attempt.passed) {
        (model.lessonsByModule.get(moduleId) || [])
          .filter((lesson) => lesson.title === "Итоговое тестирование")
          .forEach((lesson) => completedLessons.add(lesson.id));
      }
      return {
        ...current,
        byEmployee: {
          ...current.byEmployee,
          [activeEmployeeId]: {
            completedLessons: [...completedLessons],
            quizAttempts: { ...currentProgress.quizAttempts, [key]: [...currentAttempts, attempt] },
          },
        },
      };
    });

  }

  const pathParts = pathname.split("/").filter(Boolean);
  const view = pathParts[1] || "";
  const id = Number(pathParts[2]);
  const action = pathParts[3] || "";

  if (view === "module" && id && action === "quiz") {
    const quizModule = model.byId.get(id);
    const quiz = initialQuiz?.module_id === id ? initialQuiz : undefined;
    if (quizModule?.is_locked) {
      return <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}><TrainingAccessBlocked /></TrainingShell>;
    }
    if (quizModule && quiz) {
      return (
        <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
          <QuizPage
            module={quizModule}
            quiz={quiz}
            attempts={quizAttempts(id)}
            onSubmit={(answers) => submitQuiz(id, answers)}
          />
        </TrainingShell>
      );
    }
  }

  if (view === "module" && id) {
    const routeModule = model.byId.get(id);
    if (routeModule?.is_locked) {
      return <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}><TrainingAccessBlocked /></TrainingShell>;
    }
    if (routeModule) {
      return (
        <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
          <ModulePage
            module={routeModule}
            childModules={model.childrenByParent.get(routeModule.id) || []}
            lessons={model.lessonsByModule.get(routeModule.id) || []}
            quiz={model.quizByModule.get(routeModule.id)}
            statFor={statFor}
            firstLearningUrl={firstLearningUrl}
            bestQuizAttempt={bestQuizAttempt}
            quizPassed={quizPassed}
          />
        </TrainingShell>
      );
    }
  }

  if (view === "lesson" && id) {
    const lesson = initialLesson?.id === id ? initialLesson : undefined;
    const lessonModule = lesson ? model.byId.get(lesson.module_id) : undefined;
    if (lesson && lessonModule) {
      const lessonList = model.lessonsByModule.get(lessonModule.id) || [];
      const moduleStat = statFor(lessonModule, false);
      const lessonIndex = lessonList.findIndex((item) => item.id === lesson.id);
      const continueHref = nextAfterLesson(lesson);
      return (
        <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
          <LessonPage
            lesson={lesson}
            module={lessonModule}
            parent={lessonModule.parent_id ? model.byId.get(lessonModule.parent_id) : undefined}
            lessonList={lessonList}
            completed={completed}
            stat={moduleStat}
            prevLesson={lessonList[lessonIndex - 1]}
            nextLesson={lessonList[lessonIndex + 1]}
            continueHref={continueHref}
            canManageContent={permissions.includes("knowledge_manage")}
            onCompleteAndContinue={async () => {
              await markLessonComplete(lesson);
              router.push(continueHref);
            }}
          />
        </TrainingShell>
      );
    }
    return <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}><TrainingAccessBlocked /></TrainingShell>;
  }

  if (pathname === "/training" || pathname === "/training/") {
    const nextStep = nextLearningStep();
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
        <ManagerHome
          currentUser={currentUser}
          topModules={model.topModules}
          nextStep={nextStep}
          trainingAccess={data.access}
          statFor={statFor}
          isProgressLoading={isOwnProgressLoading}
          progressError={ownProgressError}
          onRetryProgress={loadOwnProgress}
          teamEmployees={teamEmployees}
          employees={employees}
          isTeamProgressLoading={isTeamProgressLoading}
          teamProgressError={teamProgressError}
          onRetryTeamProgress={loadTeamProgress}
          canViewTrainingProgress={canViewTrainingProgress}
        />
      </TrainingShell>
    );
  }

  if (view === "progress") {
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
        <LocalProgress
          topModules={model.topModules}
          employees={teamEmployees}
          progressStore={progressStore}
          lessonsForModule={lessonsForModule}
          quizzesForModule={quizzesForModule}
          isLoading={isTeamProgressLoading}
          loadError={teamProgressError}
          onRetry={loadTeamProgress}
          canManageAdmission={canManageTrainingAdmission}
          onEmployeePlanUpdated={(employeeId, update) => setTeamEmployees((current) => current.map((employee) => employee.id === employeeId ? { ...employee, ...update } : employee))}
        />
      </TrainingShell>
    );
  }

  if (view === "access") {
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
        <AccessRightsPage />
      </TrainingShell>
    );
  }

  if (view === "profile") {
    const ownProgress = progressStore.byEmployee[currentUser.id] || emptyProgress();
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
        <ProfilePage
          currentUser={currentUser}
          trainingEnabled={permissions.includes("training")}
          completedLessons={ownProgress.completedLessons.length}
          totalLessons={data.lessons.length}
          passedQuizzes={Object.values(ownProgress.quizAttempts).flat().filter((attempt) => attempt.passed).length}
          totalQuizzes={data.quizzes.length}
          isProgressLoading={isOwnProgressLoading}
          progressError={ownProgressError}
          onRetryProgress={loadOwnProgress}
        />
      </TrainingShell>
    );
  }

  if (view === "employees") {
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
        <EmployeesPage
          employees={employees}
          setEmployees={setEmployees}
          canManage={canManageUsers}
          isLoading={isEmployeesLoading}
          loadError={employeesLoadError}
          onRetry={loadEmployees}
          onEmployeeDeleted={(employeeId, nextEmployeeId) => {
            setTeamEmployees((current) => current.filter((employee) => employee.id !== employeeId));
            setProgressStore((current) => {
              const byEmployee = { ...current.byEmployee };
              delete byEmployee[employeeId];
              if (!byEmployee[nextEmployeeId]) byEmployee[nextEmployeeId] = emptyProgress();
              return {
                activeEmployeeId: current.activeEmployeeId === employeeId ? nextEmployeeId : current.activeEmployeeId,
                byEmployee,
              };
            });
          }}
        />
      </TrainingShell>
    );
  }

  return (
    <TrainingShell permissions={permissions} currentUser={currentUser} isPublicView={isPublicView}>
      <Dashboard topModules={model.topModules} trainingAccess={data.access} statFor={statFor} firstLearningUrl={firstLearningUrl} isProgressLoading={isOwnProgressLoading} progressError={ownProgressError} onRetryProgress={loadOwnProgress} />
    </TrainingShell>
  );
}

function TrainingAccessBlocked() {
  return <div className="training-access-blocked"><DataEmptyState title="Материал пока недоступен" description="Основная программа откроется после решения руководителя." action={<Link className="control-button control-button--primary" href="/training/basic">К программе</Link>} /></div>;
}

type AppNotification = {
  id: string;
  kind: "MODULE_COMPLETED" | "TRAINING_REMINDER" | "TRAINING_ASSIGNMENT" | "TRAINEE_REVIEW_REQUIRED" | "TRAINING_ACCESS_GRANTED" | "TRAINING_ACCESS_COMPLETED";
  read: boolean;
  createdAt: string;
  employeeName: string;
  moduleTitle: string;
  message: string;
  comment: string;
};

const TopbarActionSlotContext = createContext<HTMLDivElement | null>(null);

function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [markReadError, setMarkReadError] = useState("");

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error(loadErrorMessage(response, "уведомления"));
      const result = await response.json() as { unread: number; notifications: AppNotification[] };
      setUnread(result.unread);
      setNotifications(result.notifications);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить уведомления.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadNotifications);
  }, [loadNotifications]);

  async function markRead() {
    if (!unread || isMarkingRead) return;
    setIsMarkingRead(true);
    setMarkReadError("");
    try {
      const response = await fetch("/api/notifications", { method: "PATCH" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Не удалось отметить уведомления прочитанными. Повторите попытку.");
      }
      setUnread(0);
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    } catch (error) {
      setMarkReadError(error instanceof Error ? error.message : "Не удалось отметить уведомления прочитанными. Повторите попытку.");
    } finally {
      setIsMarkingRead(false);
    }
  }

  return (
    <details className="notification-menu">
      <summary className="notification-trigger" aria-label={unread ? `Уведомления: ${unread} непрочитанных` : "Уведомления"} title="Уведомления">
        <Icons.Bell aria-hidden="true" />
        {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
      </summary>
      <div className="notification-popover">
        <div className="notification-popover-head">
          <strong>Уведомления</strong>
          {unread > 0 && (
            <button type="button" className="notification-mark-read" onClick={() => void markRead()} disabled={isMarkingRead}>
              {isMarkingRead ? "Отмечаем…" : "Отметить всё прочитанным"}
            </button>
          )}
        </div>
        {markReadError && (
          <div className="notification-error" role="alert">
            <span>{markReadError}</span>
            <button type="button" onClick={() => void markRead()} disabled={isMarkingRead}>Повторить</button>
          </div>
        )}
        {isLoading ? (
          <DataSkeleton rows={2} compact label="Загружаем уведомления" />
        ) : loadError ? (
          <div className="notification-error" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadNotifications()}>Повторить</button>
          </div>
        ) : notifications.length ? (
          <div className="notification-list">
            {notifications.map((notification) => (
              <div className={`notification-item ${notification.read ? "" : "is-unread"}`} key={notification.id}>
                {notification.kind === "MODULE_COMPLETED" || notification.kind === "TRAINEE_REVIEW_REQUIRED" ? <Icons.GraduationCap aria-hidden="true" /> : <Icons.BellRing aria-hidden="true" />}
                <div>
                  {notification.kind === "MODULE_COMPLETED" && <span><b>{notification.employeeName}</b> завершил(а) модуль «{notification.moduleTitle}».</span>}
                  {notification.kind === "TRAINEE_REVIEW_REQUIRED" && <span><b>{notification.employeeName}</b> завершил(а) экспресс-обучение. Подтвердите итог.</span>}
                  {notification.kind === "TRAINING_ACCESS_GRANTED" && <span><b>{notification.employeeName}</b> открыл(а) вам основную программу.{notification.comment ? ` ${notification.comment}` : ""}</span>}
                  {notification.kind === "TRAINING_ACCESS_COMPLETED" && <span><b>{notification.employeeName}</b> завершил(а) ваше обучение.{notification.comment ? ` ${notification.comment}` : ""}</span>}
                  {(notification.kind === "TRAINING_REMINDER" || notification.kind === "TRAINING_ASSIGNMENT") && <span><b>{notification.employeeName}</b>: {notification.message || "Пожалуйста, продолжите обучение в Базе знаний."}</span>}
                  <time dateTime={notification.createdAt}>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(notification.createdAt))}</time>
                </div>
              </div>
            ))}
          </div>
        ) : <DataEmptyState compact title="Новых уведомлений нет" description="Здесь появятся напоминания и новости обучения." />}
      </div>
    </details>
  );
}

function TrainingShell({
  children,
  permissions,
  currentUser,
  isPublicView = false,
}: {
  children: React.ReactNode;
  permissions: string[];
  currentUser: CurrentUser;
  isPublicView?: boolean;
}) {
  const pathname = usePathname();
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [topbarActionSlot, setTopbarActionSlot] = useState<HTMLDivElement | null>(null);
  const can = (permission: string) => permissions.includes(permission);
  const userShortName = [currentUser.lastName, currentUser.firstName].filter(Boolean).join(" ") || currentUser.username;
  const userInitials = [currentUser.lastName, currentUser.firstName].filter(Boolean).map((part) => part[0]).join("").toUpperCase() || currentUser.username.slice(0, 2).toUpperCase();
  const navigation = [
    can("training") ? { href: "/training", label: "Главная", icon: Icons.Home, active: pathname === "/training" || pathname === "/training/" } : null,
    can("training") ? { href: "/training/basic", label: "Обучение", icon: Icons.GraduationCap, active: pathname === "/training/basic" || pathname.includes("/training/module") || pathname.includes("/training/lesson") } : null,
    can("team_progress_view") ? { href: "/training/progress", label: "Команда", icon: Icons.BarChart2, active: pathname === "/training/progress" } : null,
    can("employees_view") ? { href: "/training/employees", label: "Сотрудники", icon: Icons.UsersRound, active: pathname === "/training/employees" } : null,
    can("access_manage") ? { href: "/training/access", label: "Настройки", icon: Icons.SlidersHorizontal, active: pathname === "/training/access" } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const mobileNavigation = navigation.filter((item) => ["/training", "/training/basic", "/training/progress"].includes(item.href));
  const mobileMoreNavigation = isPublicView ? [] : [
    { href: "/training/profile", label: userShortName, icon: Icons.UserRound, active: pathname === "/training/profile" },
    ...navigation.filter((item) => ["/training/employees", "/training/access"].includes(item.href)),
  ];
  const isMobileMoreActive = mobileMoreNavigation.some((item) => item.active);
  const topbarContext = (() => {
    if (pathname === "/training" || pathname === "/training/") return "Ваше обучение";
    if (pathname === "/training/basic") return "Базовое обучение";
    if (pathname.includes("/training/module") || pathname.includes("/training/lesson")) return "Материалы обучения";
    if (pathname === "/training/progress") return "Прогресс команды";
    if (pathname === "/training/employees") return "Сотрудники";
    if (pathname === "/training/access") return "Права пользователей";
    if (pathname === "/training/profile") return "Мой профиль";
    return navigation.find((item) => item.active)?.label || "База знаний";
  })();
  const topbarIsPageHeading = !pathname.includes("/training/module") && !pathname.includes("/training/lesson");

  return (
    <TopbarActionSlotContext.Provider value={topbarActionSlot}>
      <div className="app-shell">
      <a className="skip-link" href="#app-content">Перейти к содержимому</a>
      <aside className="app-sidebar" aria-label="Основная навигация">
        <Link href="/training" className="app-brand" aria-label="База знаний, главная">
          <span className="app-brand-mark">БЗ</span>
          <span>База знаний</span>
        </Link>
        <nav className="app-nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            return <Link href={item.href} className={`app-nav-link ${item.active ? "is-active" : ""}`} key={item.href}><Icon aria-hidden="true" /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="app-sidebar-spacer" />
        {!isPublicView && <div className="app-sidebar-account">
          <Link href="/training/profile" className="app-sidebar-profile" aria-label={`Открыть профиль: ${userShortName}`}>
            {currentUser.hasAvatar
              // eslint-disable-next-line @next/next/no-img-element -- The image is a private, cookie-protected profile resource.
              ? <img className="profile-avatar profile-avatar--image" src="/api/me/avatar" alt="" />
              : <span className="profile-avatar" aria-hidden="true">{userInitials}</span>}
            <strong>{userShortName}</strong>
          </Link>
          <NotificationBell />
        </div>}
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="app-topbar-context">{topbarIsPageHeading ? <h1>{topbarContext}</h1> : <span>{topbarContext}</span>}</div>
          <div className="app-topbar-actions" ref={setTopbarActionSlot} />
        </header>
        <main id="app-content" className="app-content">{children}</main>
      </div>
      {!isPublicView && isMobileMoreOpen && (
        <div id="app-mobile-more" className="app-mobile-more">
          <div className="app-mobile-more-heading">
            <span>Ещё</span>
            <div className="app-mobile-more-heading-actions">
              <NotificationBell />
              <button type="button" className="app-mobile-more-close" onClick={() => setIsMobileMoreOpen(false)} aria-label="Закрыть дополнительное меню">
                <Icons.X aria-hidden="true" />
              </button>
            </div>
          </div>
          <nav className="app-mobile-more-list" aria-label="Дополнительные разделы">
            {mobileMoreNavigation.map((item) => {
              const Icon = item.icon;
              return <Link href={item.href} className={`app-mobile-more-link ${item.active ? "is-active" : ""}`} key={item.href} onClick={() => setIsMobileMoreOpen(false)}><Icon aria-hidden="true" /><span>{item.label}</span><Icons.ChevronRight aria-hidden="true" /></Link>;
            })}
          </nav>
        </div>
      )}
      <nav className={`app-mobile-nav ${isPublicView ? "app-mobile-nav--public" : ""}`} aria-label="Мобильная навигация">
        {mobileNavigation.map((item) => {
          const Icon = item.icon;
          return <Link href={item.href} className={`app-mobile-nav-link ${item.active ? "is-active" : ""}`} key={item.href}><Icon aria-hidden="true" /><span>{item.label}</span></Link>;
        })}
        <button type="button" className={`app-mobile-nav-link app-mobile-nav-more ${isMobileMoreActive ? "is-active" : ""}`} onClick={() => setIsMobileMoreOpen((isOpen) => !isOpen)} aria-expanded={isMobileMoreOpen} aria-controls="app-mobile-more">
          <Icons.LayoutGrid aria-hidden="true" /><span>Ещё</span>
        </button>
      </nav>
      </div>
    </TopbarActionSlotContext.Provider>
  );
}

function DataLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="data-load-error" role="alert"><Icons.CircleAlert aria-hidden="true" /><div><strong>Данные не загрузились</strong><span>{message}</span></div><button type="button" className="control-button control-button--secondary control-button--compact" onClick={onRetry}>Повторить</button></div>;
}

function PageHeader({ action, actionClassName = "" }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  copyClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actionClassName?: string;
}) {
  const topbarActionSlot = useContext(TopbarActionSlotContext);
  if (!action || !topbarActionSlot) return null;
  return createPortal(<div className={`topbar-portaled-action ${actionClassName}`.trim()}>{action}</div>, topbarActionSlot);
}

function LearningHeader({
  kind,
  icon: Icon,
  sequence,
  title,
  description,
  meta,
  progress,
  className = "",
}: {
  kind: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  sequence: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  progress?: { label: string; value: string; percent: number };
  className?: string;
}) {
  return (
    <header className={`learning-screen-header ${className}`.trim()}>
      <div className="learning-screen-header-copy">
        <div className="learning-screen-header-kicker"><Icon aria-hidden={true} /><span>{kind}</span><i aria-hidden={true} />{sequence}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {meta && <div className="learning-screen-header-meta">{meta}</div>}
      </div>
      {progress && <div className="learning-screen-header-progress" aria-label={`${progress.label}: ${progress.value}`}>
        <div><span>{progress.label}</span><strong>{progress.value}</strong></div>
        <div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(progress.percent, 100))}%` }} /></div>
      </div>}
    </header>
  );
}

function DataSkeleton({ rows = 4, label = "Загружаем данные", compact = false }: { rows?: number; label?: string; compact?: boolean }) {
  return <div className={`data-skeleton ${compact ? "data-skeleton--compact" : ""}`} role="status" aria-label={label} aria-busy="true"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, index) => <span className="data-skeleton-line" key={index} />)}</div>;
}

function DataEmptyState({ title, description, action, compact = false }: { title: string; description?: string; action?: React.ReactNode; compact?: boolean }) {
  return <div className={`data-empty-state ${compact ? "data-empty-state--compact" : ""}`}><Icons.Inbox aria-hidden="true" /><div><strong>{title}</strong>{description && <span>{description}</span>}</div>{action && <div className="data-empty-state-action">{action}</div>}</div>;
}

function SaveFeedback({ state, children }: { state: "saving" | "success" | "dirty"; children: React.ReactNode }) {
  const Icon = state === "success" ? Icons.CheckCircle2 : state === "saving" ? Icons.LoaderCircle : Icons.CircleAlert;
  return <span className={`save-feedback save-feedback--${state}`} role="status" aria-live="polite"><Icon aria-hidden="true" />{children}</span>;
}

function ManagerHome({
  currentUser,
  topModules,
  nextStep,
  trainingAccess,
  statFor,
  isProgressLoading,
  progressError,
  onRetryProgress,
  teamEmployees,
  employees,
  isTeamProgressLoading,
  teamProgressError,
  onRetryTeamProgress,
  canViewTrainingProgress,
}: {
  currentUser: CurrentUser;
  topModules: TrainingModule[];
  nextStep: HomeNextStep | null;
  trainingAccess: TrainingData["access"];
  statFor: (module: TrainingModule) => ModuleStat;
  isProgressLoading: boolean;
  progressError: string;
  onRetryProgress: () => void;
  teamEmployees: Employee[];
  employees: Employee[];
  isTeamProgressLoading: boolean;
  teamProgressError: string;
  onRetryTeamProgress: () => void;
  canViewTrainingProgress: boolean;
}) {
  const [inactiveThreshold] = useState(() => Date.now() - 14 * 24 * 60 * 60 * 1000);
  if (isProgressLoading) return <div className="home-workspace"><DataSkeleton rows={4} /></div>;
  if (progressError) return <div className="home-workspace"><DataLoadError message={progressError} onRetry={onRetryProgress} /></div>;

  const accessibleModules = topModules.filter((module) => !module.is_locked);
  const totalLessons = accessibleModules.reduce((sum, module) => sum + statFor(module).lessons.length, 0);
  const totalDone = accessibleModules.reduce((sum, module) => sum + statFor(module).doneLessons, 0);
  const totalItems = accessibleModules.reduce((sum, module) => sum + statFor(module).totalItems, 0);
  const doneItems = accessibleModules.reduce((sum, module) => sum + statFor(module).doneItems, 0);
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const passedQuizzes = accessibleModules.reduce((sum, module) => sum + statFor(module).passedQuizzes, 0);
  const remainingLessons = Math.max(totalLessons - totalDone, 0);
  const isTeamWorkspace = canViewTrainingProgress && (currentUser.role === "ADMIN" || currentUser.role === "ROP");
  const today = new Date().toISOString().slice(0, 10);
  const awaitingReview = teamEmployees.filter((employee) => employee.trainingAccess.state === "REVIEW_REQUIRED");
  const overdue = teamEmployees.filter((employee) => employee.trainingDueDate && employee.trainingDueDate < today && employee.learningProgress < 100);
  const inactive = teamEmployees.filter((employee) => !employee.lastLearningActivityAt || new Date(employee.lastLearningActivityAt).getTime() < inactiveThreshold);
  const managersWithoutLeader = currentUser.role === "ADMIN" ? employees.filter((employee) => employee.role === "manager" && !employee.managerId) : [];
  const attentionCount = awaitingReview.length + overdue.length + inactive.length + managersWithoutLeader.length;
  const attentionItems = [
    ...awaitingReview.map((employee) => ({ employee, label: "Экспресс-обучение завершено", href: "/training/progress", kind: "review" })),
    ...overdue.filter((employee) => !awaitingReview.some((item) => item.id === employee.id)).map((employee) => ({ employee, label: "Срок обучения прошёл", href: "/training/progress", kind: "overdue" })),
    ...inactive.filter((employee) => !awaitingReview.some((item) => item.id === employee.id) && !overdue.some((item) => item.id === employee.id)).map((employee) => ({ employee, label: "Нет учебной активности", href: "/training/progress", kind: "inactive" })),
  ].slice(0, 3);
  const nextModule = nextStep ? topModules.find((module) => module.id === nextStep.module.id || module.id === nextStep.module.parent_id) || nextStep.module : null;
  const primaryTitle = nextStep?.kind === "lesson" ? nextStep.lesson?.title || "Продолжить обучение" : "Пройти итоговый тест";
  const primaryMeta = nextStep && nextModule ? `Модуль ${String(nextModule.order_num).padStart(2, "0")} · ${nextModule.title}` : "";
  const headerAction = isTeamWorkspace
    ? <Link href="/training/progress" className="control-button control-button--primary control-button--header">Открыть команду<Icons.ArrowRight aria-hidden="true" /></Link>
    : <Link href={nextStep ? nextStep.href : "/training/basic"} className="control-button control-button--primary control-button--header">{nextStep ? nextStep.kind === "lesson" ? "Продолжить" : "Пройти тест" : "Открыть обучение"}<Icons.ArrowRight aria-hidden="true" /></Link>;

  return (
    <div className="home-workspace">
      <PageHeader title="Главная" action={headerAction} />
      {isTeamWorkspace ? (
        <>
          <section className="home-priority" aria-labelledby="home-priority-title">
            <div className="home-priority-copy"><span><Icons.CircleAlert aria-hidden="true" />Требует внимания</span><h2 id="home-priority-title">{attentionCount ? "Есть задачи, требующие решения" : "Команда под контролем"}</h2><p>{attentionCount ? `В очереди — ${attentionCount}. Проверьте подтверждения, сроки и учебную активность.` : "Нет экспресс-обучений и сроков, ожидающих вашего решения."}</p></div>
            <div className="home-priority-actions"><strong>{attentionCount}</strong><span>сигналов</span></div>
          </section>
          {isTeamProgressLoading ? <DataSkeleton rows={3} compact label="Загружаем сигналы команды" /> : teamProgressError ? <DataLoadError message={teamProgressError} onRetry={onRetryTeamProgress} /> : (
            <section className="home-attention-list" aria-labelledby="home-attention-title"><div className="home-section-head"><h2 id="home-attention-title">Ближайшие действия</h2><Link href="/training/progress" className="control-button control-button--text">Вся команда</Link></div>{attentionItems.length ? attentionItems.map(({ employee, label, href, kind }) => <Link href={href} className={`home-attention-row is-${kind}`} key={`${kind}-${employee.id}`}><span className="home-attention-avatar" aria-hidden="true">{employeeInitials(employee)}</span><span><strong>{employeeDisplayName(employee)}</strong><small>{label}</small></span><span>{employee.learningProgress}%</span><Icons.ChevronRight aria-hidden="true" /></Link>) : <DataEmptyState compact title="Срочных действий нет" description="Новые сигналы команды появятся здесь." />}</section>
          )}
        </>
      ) : (
        <section className="home-priority" aria-labelledby="home-priority-title">
          <div className="home-priority-copy"><span><Icons.Route aria-hidden="true" />Сегодня</span><h2 id="home-priority-title">{nextStep ? primaryTitle : trainingAccess.state === "REVIEW_REQUIRED" ? "Экспресс-обучение завершено" : trainingAccess.state === "TRAINING_COMPLETED" ? "Обучение завершено" : "Маршрут завершён"}</h2><p>{nextStep ? primaryMeta : trainingAccess.state === "REVIEW_REQUIRED" ? "Руководитель проверит результат и примет решение по дальнейшему обучению." : trainingAccess.state === "TRAINING_COMPLETED" ? "Руководитель завершил ваш учебный маршрут." : "Все доступные материалы и тесты пройдены."}</p></div>
          <div className="home-priority-actions"><strong>{pct}%</strong><span>прогресс</span></div>
        </section>
      )}

      <div className="home-support-grid">
        <section className="home-support-card" aria-labelledby="home-learning-status"><div className="home-section-head"><h2 id="home-learning-status">Моё обучение</h2><Link href="/training/basic" className="control-button control-button--text">Программа</Link></div><div className="home-learning-summary"><strong>{pct}%</strong><div><span>{totalDone} из {totalLessons} уроков</span><div className="progress-track" role="progressbar" aria-label={`Личный прогресс: ${pct}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div></div></div><div className="home-learning-meta"><span>{remainingLessons} осталось</span><span>{passedQuizzes} тестов пройдено</span></div></section>
        {isTeamWorkspace && <section className="home-support-card" aria-labelledby="home-team-summary"><div className="home-section-head"><h2 id="home-team-summary">Команда</h2><Link href="/training/progress" className="control-button control-button--text">Открыть</Link></div><div className="home-team-metrics"><span><b>{awaitingReview.length}</b> ожидают решения</span><span><b>{overdue.length}</b> просрочено</span><span><b>{inactive.length}</b> без активности</span>{currentUser.role === "ADMIN" && managersWithoutLeader.length > 0 && <span><b>{managersWithoutLeader.length}</b> без руководителя</span>}</div></section>}
        {currentUser.role === "KNOWLEDGE_EDITOR" && <section className="home-support-card" aria-labelledby="home-content-work"><div className="home-section-head"><h2 id="home-content-work">Материалы базы</h2><Link href="/training/basic" className="control-button control-button--text">Открыть</Link></div><p className="home-content-note">Редактируйте материалы из программы, проверяйте содержание уроков и mobile‑предпросмотр перед публикацией.</p></section>}
      </div>
    </div>
  );
}

function Dashboard({
  topModules,
  trainingAccess,
  statFor,
  firstLearningUrl,
  isProgressLoading,
  progressError,
  onRetryProgress,
}: {
  topModules: TrainingModule[];
  trainingAccess: TrainingData["access"];
  statFor: (module: TrainingModule) => ModuleStat;
  firstLearningUrl: (module: TrainingModule) => string;
  isProgressLoading: boolean;
  progressError: string;
  onRetryProgress: () => void;
}) {
  if (isProgressLoading) return <div className="tr-wrap"><DataSkeleton rows={7} /></div>;
  if (progressError) return <div className="tr-wrap"><DataLoadError message={progressError} onRetry={onRetryProgress} /></div>;
  const stats = topModules.map((module) => ({ module, stat: statFor(module) }));
  const totalItems = stats.reduce((sum, item) => sum + item.stat.totalItems, 0);
  const doneItems = stats.reduce((sum, item) => sum + item.stat.doneItems, 0);
  const totalLessons = stats.reduce((sum, item) => sum + item.stat.lessons.length, 0);
  const doneLessons = stats.reduce((sum, item) => sum + item.stat.doneLessons, 0);
  const modulesDone = stats.filter((item) => item.stat.totalItems > 0 && item.stat.doneItems === item.stat.totalItems).length;
  const overallPct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const passedQuizzes = stats.reduce((sum, item) => sum + item.stat.passedQuizzes, 0);
  const totalQuizzes = stats.reduce((sum, item) => sum + item.stat.quizzes.length, 0);
  const activeModuleId = stats.find((item) => item.stat.totalItems > 0 && item.stat.doneItems < item.stat.totalItems)?.module.id;

  return (
    <div className="tr-wrap">
      <PageHeader title="Базовое обучение" />
      <section className="course-summary" aria-labelledby="course-summary-title">
        <div className="course-summary-main">
          <span className="course-summary-kicker"><Icons.GraduationCap aria-hidden="true" />Программа</span>
          <h2 id="course-summary-title">Курс продаж металлопроката</h2>
          <p>{topModules.length} модулей · {totalLessons} {pluralLessons(totalLessons)}</p>
        </div>
        <div className="course-summary-progress" aria-label={`Общий прогресс: ${overallPct}%`}>
          <div><span>Общий прогресс</span><strong>{overallPct}%</strong></div>
          <div className="progress-track"><span style={{ width: `${overallPct}%` }} /></div>
        </div>
        <dl className="course-summary-stats">
          <div><dt>Модули</dt><dd>{modulesDone}<span> / {topModules.length}</span></dd></div>
          <div><dt>Уроки</dt><dd>{doneLessons}<span> / {totalLessons}</span></dd></div>
          <div><dt>Тесты</dt><dd>{passedQuizzes}<span> / {totalQuizzes}</span></dd></div>
        </dl>
      </section>

      {trainingAccess.state === "REVIEW_REQUIRED" && <div className="training-access-notice" role="status"><Icons.Clock3 aria-hidden="true" /><span><strong>Экспресс-обучение завершено.</strong> Основная программа откроется после подтверждения итога руководителем.</span></div>}
      {trainingAccess.state === "TRAINING_COMPLETED" && <div className="training-access-notice training-access-notice--closed" role="status"><Icons.CircleCheck aria-hidden="true" /><span><strong>Обучение завершено.</strong>{trainingAccess.decision_comment ? ` ${trainingAccess.decision_comment}` : ""}</span></div>}

      <section className="course-program" aria-labelledby="course-program-title">
        <div className="course-program-head">
          <div><h2 id="course-program-title">Программа</h2></div>
          <span>{topModules.length} модулей</span>
        </div>
        <div className="course-program-labels" aria-hidden="true"><span /><span>Модуль</span><span>Прогресс</span><span>Объём</span><span>Статус</span><span /></div>
        <div className="course-program-list">
        {stats.map(({ module, stat }) => module.is_locked ? (
          <article
            className={`course-program-row ${stat.totalItems > 0 && stat.doneItems === stat.totalItems ? "is-done" : ""} ${module.id === activeModuleId ? "is-current" : ""}`}
            key={module.id}
          >
            <span className="course-program-number" aria-hidden="true"><Icons.LockKeyhole /></span>
            <span className="course-program-name">
              <small>Модуль {String(module.order_num).padStart(2, "0")}</small>
              <strong>{module.title}</strong>
            </span>
            <span className="course-program-locked-copy">Основная программа станет доступна после решения руководителя.</span>
            <span className="status-pill status-pill--empty"><Icons.LockKeyhole aria-hidden="true" />Закрыт</span>
          </article>
        ) : (
          <Link href={firstLearningUrl(module)} className={`course-program-row ${stat.totalItems > 0 && stat.doneItems === stat.totalItems ? "is-done" : ""} ${module.id === activeModuleId ? "is-current" : ""}`} key={module.id}>
            <span className="course-program-number" aria-hidden="true">{stat.totalItems > 0 && stat.doneItems === stat.totalItems ? <Icons.Check /> : String(module.order_num).padStart(2, "0")}</span>
            <span className="course-program-name"><small>Модуль {String(module.order_num).padStart(2, "0")}</small><strong>{module.title}</strong></span>
            <span className="course-program-progress"><span><b>{stat.pct}%</b><small>{stat.doneItems} из {stat.totalItems}</small></span><span className="progress-track progress-track--mini"><span style={{ width: `${stat.pct}%` }} /></span></span>
            <span className="course-program-volume"><span><Icons.BookOpen aria-hidden="true" />{stat.lessons.length} {pluralLessons(stat.lessons.length)}</span>{module.title !== expressTrainingTitle && <span><Icons.Clock aria-hidden="true" />~{stat.duration} мин</span>}</span>
            <Status stat={stat} />
            <span className="course-program-action"><span>{module.id === activeModuleId ? "Продолжить" : "Открыть"}</span><Icons.ChevronRight aria-hidden="true" /></span>
          </Link>
        ))}
        </div>
      </section>
    </div>
  );
}

function Status({ stat }: { stat: ModuleStat }) {
  if (stat.totalItems === 0) return <span className="status-pill status-pill--empty"><Icons.Circle />Без уроков</span>;
  if (stat.doneItems === stat.totalItems) return <span className="status-pill status-pill--done"><Icons.CheckCircle2 />Завершён</span>;
  if (stat.doneItems > 0) return <span className="status-pill status-pill--active"><Icons.PlayCircle />В процессе</span>;
  return <span className="status-pill status-pill--new"><Icons.Circle />Начать</span>;
}

function ModulePage({
  module,
  childModules,
  lessons,
  quiz,
  statFor,
  firstLearningUrl,
  bestQuizAttempt,
  quizPassed,
}: {
  module: TrainingModule;
  childModules: TrainingModule[];
  lessons: TrainingLessonSummary[];
  quiz?: ModuleQuizSummary;
  statFor: (module: TrainingModule, deep?: boolean) => ModuleStat;
  firstLearningUrl: (module: TrainingModule) => string;
  bestQuizAttempt: (moduleId: number) => QuizAttempt | null;
  quizPassed: (moduleId: number) => boolean;
}) {
  const parentHref = module.parent_id ? `/training/module/${module.parent_id}` : "/training/basic";
  const moduleStat = statFor(module);
  const unitCount = childModules.length || lessons.length;
  const rows = childModules.length
    ? childModules.map((child) => ({ module: child, href: firstLearningUrl(child), stat: statFor(child, false), quiz: undefined as ModuleQuizSummary | undefined }))
    : lessons.map((lesson) => ({ lesson, href: `/training/lesson/${lesson.id}` }));

  return (
    <div className="trs-wrap">
      <Breadcrumb items={[["База знаний", "/training/basic"], [module.title]]} />
      <LearningHeader
        kind="Модуль"
        icon={Icons.Layers}
        sequence={`Модуль ${String(module.order_num).padStart(2, "0")}`}
        title={module.title}
        description={module.description}
        meta={<><span><Icons.BookOpen aria-hidden="true" />{unitCount} {childModules.length ? "разделов" : pluralLessons(unitCount)}</span>{module.title !== expressTrainingTitle && moduleStat.duration > 0 && <span><Icons.Clock aria-hidden="true" />~{moduleStat.duration} мин</span>}</>}
        progress={{ label: "Прогресс модуля", value: `${moduleStat.pct}%`, percent: moduleStat.pct }}
        className="learning-screen-header--module"
      />

      <div className="trs-list-title">
        {childModules.length ? "Разделы модуля" : "Уроки модуля"}
        <span>{childModules.length || lessons.length}</span>
      </div>
      <div className="trs-list">
        {rows.map((row) => {
          if ("lesson" in row) {
            return (
              <Link href={row.href} className="trs-row" key={row.lesson.id}>
                <div className="trs-num">{String(row.lesson.order_num).padStart(2, "0")}</div>
                <div className="trs-body">
                  <div className="trs-section-num">Урок {String(row.lesson.order_num).padStart(2, "0")}</div>
                  <div className="trs-section-title">{row.lesson.title}</div>
                  <div className="trs-section-meta">
                    <span><Icons.BookOpen />Читать</span>
                    {module.title !== expressTrainingTitle && <span><Icons.Clock />~{row.lesson.duration_min} мин</span>}
                  </div>
                </div>
                <Icons.ChevronRight className="trs-arrow" />
              </Link>
            );
          }

          const childQuiz = row.stat.quizzes[0];
          const attempt = bestQuizAttempt(row.module.id);
          return (
            <Link
              href={row.href}
              className={`trs-row ${row.stat.totalItems > 0 && row.stat.doneItems === row.stat.totalItems ? "trs-row--done" : row.stat.doneItems > 0 ? "trs-row--active" : ""}`}
              key={row.module.id}
            >
              <div className="trs-num">{String(row.module.order_num).padStart(2, "0")}</div>
              <div className="trs-body">
                <div className="trs-section-num">Раздел {String(row.module.order_num).padStart(2, "0")}</div>
                <div className="trs-section-title">{row.module.title}</div>
                <div className="trs-section-meta">
                  {row.stat.lessons.length > 0 && <span><Icons.BookOpen />{row.stat.lessons.length} {pluralLessons(row.stat.lessons.length)}</span>}
                  {childQuiz && <span><Icons.FileQuestion />Итоговый тест</span>}
                  {childQuiz && attempt && <span><Icons.ClipboardCheck />{attempt.score} / {attempt.total}</span>}
                  {module.title !== expressTrainingTitle && row.stat.duration > 0 && <span><Icons.Clock />~{row.stat.duration} мин</span>}
                  {quizPassed(row.module.id) && <span className="status-pill status-pill--done"><Icons.CheckCircle2 />Завершён</span>}
                </div>
              </div>
              {row.stat.totalItems > 0 && (
                <div className="trs-progress-mini">
                  <strong>{row.stat.pct}%</strong>
                  <div className="progress-track progress-track--mini"><span style={{ width: `${row.stat.pct}%` }} /></div>
                </div>
              )}
              <Icons.ChevronRight className="trs-arrow" />
            </Link>
          );
        })}
        {!childModules.length && quiz && (
          <Link href={`/training/module/${module.id}/quiz`} className="trs-row">
            <div className="trs-num"><Icons.FileQuestion /></div>
            <div className="trs-body">
              <div className="trs-section-num">Итоговое тестирование</div>
              <div className="trs-section-title">{quiz.rules.title || "Тест по модулю"}</div>
              <div className="trs-section-meta">
                <span><Icons.ListChecks />{quiz.question_count} вопросов</span>
                <span>проходной балл {quiz.pass_score} из {quiz.question_count}</span>
                {bestQuizAttempt(module.id) && <span><Icons.ClipboardCheck />{bestQuizAttempt(module.id)?.score} / {quiz.question_count}</span>}
              </div>
            </div>
            <Icons.ChevronRight className="trs-arrow" />
          </Link>
        )}
      </div>

      <div className="page-actions">
        <Link href={parentHref} className="btn-nav"><Icons.ArrowLeft />Назад</Link>
      </div>
    </div>
  );
}

function LessonAudioPanel({ audios }: { audios: LessonAudioItem[] }) {
  const audioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [statusByIndex, setStatusByIndex] = useState<Record<number, string>>({});

  async function toggleAudio(index: number) {
    const audio = audioRefs.current[index];
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      setPlayingIndex(null);
      setStatusByIndex((current) => ({ ...current, [index]: "Пауза" }));
      return;
    }

    audioRefs.current.forEach((item, itemIndex) => {
      if (item && itemIndex !== index) item.pause();
    });

    setStatusByIndex((current) => ({ ...current, [index]: "Загрузка" }));
    try {
      await audio.play();
      setPlayingIndex(index);
      setStatusByIndex((current) => ({ ...current, [index]: "Воспроизводится" }));
    } catch {
      setPlayingIndex(null);
      setStatusByIndex((current) => ({ ...current, [index]: "Не удалось запустить аудио" }));
    }
  }

  if (!audios.length) return null;

  return (
    <section className="lesson-audio-panel" aria-label="Телефонные звонки">
      <div className="lesson-audio-panel__head">
        <Icons.PhoneCall aria-hidden="true" />
        <div>
          <h2>Телефонные звонки</h2>
          <p>Нажмите кнопку рядом с нужной записью.</p>
        </div>
      </div>
      <div className="lesson-audio-list">
        {audios.map((audio, index) => (
          <div className="lesson-audio-item" key={`${audio.src}-${index}`}>
            <div className="lesson-audio-item__meta">
              <span>{index + 1}</span>
              <strong>{audio.label}</strong>
              <small>{statusByIndex[index] || "Готов к прослушиванию"}</small>
            </div>
            <button type="button" className="lesson-audio-item__button" onClick={() => toggleAudio(index)}>
              {playingIndex === index ? <Icons.Pause aria-hidden="true" /> : <Icons.Play aria-hidden="true" />}
              {playingIndex === index ? "Пауза" : "Прослушать звонок"}
            </button>
            <audio
              ref={(node) => {
                audioRefs.current[index] = node;
              }}
              src={audio.src}
              preload="metadata"
              onEnded={() => {
                setPlayingIndex((current) => current === index ? null : current);
                setStatusByIndex((current) => ({ ...current, [index]: "Прослушано" }));
              }}
              onPause={() => {
                setPlayingIndex((current) => current === index ? null : current);
              }}
              onError={() => {
                setStatusByIndex((current) => ({ ...current, [index]: "Файл недоступен" }));
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function LessonPage({
  lesson,
  module,
  parent,
  lessonList,
  completed,
  stat,
  prevLesson,
  nextLesson,
  continueHref,
  onCompleteAndContinue,
  canManageContent,
}: {
  lesson: TrainingLesson;
  module: TrainingModule;
  parent?: TrainingModule;
  lessonList: TrainingLessonSummary[];
  completed: Set<number>;
  stat: ModuleStat;
  prevLesson?: TrainingLessonSummary;
  nextLesson?: TrainingLessonSummary;
  continueHref: string;
  onCompleteAndContinue: () => Promise<void>;
  canManageContent: boolean;
}) {
  const isCompleted = completed.has(lesson.id);
  const hideTime = parent?.title === expressTrainingTitle;
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(lesson.title);
  const [draftContent, setDraftContent] = useState(lesson.content);
  const [editorError, setEditorError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLessonContentsOpen, setIsLessonContentsOpen] = useState(false);
  const lessonContentsTriggerRef = useRef<HTMLButtonElement>(null);
  const lessonContentsCloseRef = useRef<HTMLButtonElement>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const lessonBodyRef = useRef<HTMLDivElement>(null);
  const mobileContentIssues = validateMobileLessonContent(draftContent);
  const lessonTypeMeta = {
    theory: { label: "Теория", className: "theory", icon: Icons.FileText },
    practice: { label: "Практика", className: "practice", icon: Icons.PencilLine },
    quiz: { label: "Тест", className: "quiz", icon: Icons.FileQuestion },
  }[lesson.lesson_type.toLowerCase()] || { label: "Теория", className: "theory", icon: Icons.FileText };
  const LessonTypeIcon = lessonTypeMeta.icon;
  const bindLessonBodyRef = useCallback((node: HTMLDivElement | null) => {
    lessonBodyRef.current = node;
    if (!node || isEditing) return;
    window.setTimeout(() => enhanceLessonAudioPlayers(node), 0);
  }, [isEditing, draftContent]);

  useEffect(() => {
    if (!isLessonContentsOpen) return;
    lessonContentsCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsLessonContentsOpen(false);
      window.requestAnimationFrame(() => lessonContentsTriggerRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLessonContentsOpen]);

  useEffect(() => {
    if (isEditing) return;
    const root = lessonBodyRef.current;
    if (!root) return;
    enhanceLessonAudioPlayers(root);
    return;

    const audios = Array.from(root!.querySelectorAll("audio"));
    const cleanups: Array<() => void> = [];

    audios.forEach((audio, index) => {
      audio.controls = true;
      audio.preload = "metadata";

      const wrapper = audio.parentElement;
      const getcoursePlayer = wrapper?.querySelector(".container-player .audioplayer");
      const host = getcoursePlayer || wrapper || audio.parentElement;
      if (!host) return;

      let control = host.querySelector<HTMLButtonElement>(".gc-audio-play-button");
      let status = host.querySelector<HTMLSpanElement>(".gc-audio-play-status");
      if (!control) {
        const row = document.createElement("div");
        row.className = "gc-audio-control-row";

        control = document.createElement("button");
        control.type = "button";
        control.className = "gc-audio-play-button";
        control.textContent = "Прослушать звонок";
        control.setAttribute("aria-label", `Прослушать звонок ${index + 1}`);

        status = document.createElement("span");
        status.className = "gc-audio-play-status";
        status.textContent = "Готов к прослушиванию";

        row.append(control, status);
        host.append(row);
      }
      if (!control || !status) return;

      const setIdle = () => {
        control.textContent = "Прослушать звонок";
        status.textContent = audio.error ? "Файл звонка недоступен" : "Готов к прослушиванию";
      };
      const setPlaying = () => {
        control.textContent = "Пауза";
        status.textContent = "Воспроизводится";
      };
      const setLoading = () => {
        control.textContent = "Загрузка...";
        status.textContent = "Подключаем аудио";
      };
      const onClick = async () => {
        if (!audio.paused) {
          audio.pause();
          return;
        }

        setLoading();
        audios.forEach((item) => {
          if (item !== audio) item.pause();
        });

        try {
          await audio.play();
        } catch {
          control.textContent = "Прослушать звонок";
          status.textContent = "Не удалось запустить. Попробуйте стандартный play ниже.";
        }
      };

      control.addEventListener("click", onClick);
      audio.addEventListener("play", setPlaying);
      audio.addEventListener("pause", setIdle);
      audio.addEventListener("ended", setIdle);
      audio.addEventListener("error", setIdle);

      cleanups.push(() => {
        control?.removeEventListener("click", onClick);
        audio.removeEventListener("play", setPlaying);
        audio.removeEventListener("pause", setIdle);
        audio.removeEventListener("ended", setIdle);
        audio.removeEventListener("error", setIdle);
      });
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [draftContent, isEditing]);

  function closeLessonContents(returnFocus = true) {
    setIsLessonContentsOpen(false);
    if (returnFocus) window.requestAnimationFrame(() => lessonContentsTriggerRef.current?.focus());
  }

  async function saveLesson() {
    if (mobileContentIssues.length) {
      setEditorError(`Перед публикацией исправьте mobile-версию: ${mobileContentIssues[0]}`);
      return;
    }
    setIsSaving(true);
    setEditorError("");
    try {
      const response = await fetch(`/api/admin/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, content: draftContent }),
      });
      const result = await response.json().catch(() => null) as { title?: string; content?: string; error?: string } | null;
      if (!response.ok || !result) throw new Error(result?.error || "Не удалось сохранить урок.");
      setDraftTitle(result.title || draftTitle);
      setDraftContent(result.content || draftContent);
      setIsEditing(false);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Не удалось сохранить урок.");
    } finally {
      setIsSaving(false);
    }
  }

  function insertContentBlock(html: string) {
    setDraftContent((current) => `${current.trim()}${current.trim() ? "\n\n" : ""}${html}\n`);
    setEditorError("");
  }

  async function completeAndContinue() {
    if (isCompleted || isCompleting) return;
    setIsCompleting(true);
    setCompletionError("");
    try {
      await onCompleteAndContinue();
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : "Не удалось сохранить прохождение урока.");
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className="trl-wrap">
      <Breadcrumb items={[["База знаний", "/training/basic"], [parent ? parent.title : module.title, parent ? `/training/module/${parent.id}` : `/training/module/${module.id}`], [lesson.title]]} />
      <div className="trl-layout">
        <article className="trl-content">
          <div className="lesson-context-rail">
            <button ref={lessonContentsTriggerRef} type="button" className="lesson-contents-trigger" onClick={() => setIsLessonContentsOpen(true)} aria-expanded={isLessonContentsOpen} aria-controls="lesson-contents-panel">
              <Icons.List aria-hidden="true" /><span>Содержание</span><span className="lesson-contents-trigger-meta">Урок {lesson.order_num} из {lessonList.length}</span><Icons.ChevronDown aria-hidden="true" />
            </button>
            <span className="lesson-context-rail-module">Модуль {String(module.order_num).padStart(2, "0")} · {module.title}</span>
          </div>
          <LearningHeader
            kind={lessonTypeMeta.label}
            icon={LessonTypeIcon}
            sequence={`Модуль ${String(module.order_num).padStart(2, "0")} · Урок ${lesson.order_num}`}
            title={draftTitle}
            meta={<>{!hideTime && <span><Icons.Clock aria-hidden="true" />~{lesson.duration_min} мин</span>}<span><Icons.BookOpen aria-hidden="true" />Чтение</span>{isCompleted && <span className="trl-badge trl-badge--done"><Icons.CheckCircle2 aria-hidden="true" />Пройден</span>}</>}
            progress={{ label: "Прогресс модуля", value: `${stat.doneLessons} из ${stat.lessons.length}`, percent: stat.pct }}
            className="learning-screen-header--lesson"
          />
          {canManageContent && !isEditing && <button type="button" className="lesson-edit-trigger" onClick={() => setIsEditing(true)}><Icons.PencilLine aria-hidden="true" />Редактировать</button>}
          {isEditing ? (
            <div className="lesson-editor">
              <label><span>Заголовок</span><input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></label>
              <div className="lesson-content-library" aria-label="Шаблоны блоков урока">
                <div><strong>Блоки для адаптивного урока</strong><span>Добавьте шаблон в конец HTML и замените пример своим содержанием.</span></div>
                <div className="lesson-content-library-actions">
                  {lessonContentBlocks.map((block) => <button type="button" key={block.id} onClick={() => insertContentBlock(block.html)} title={block.description}>{block.title}</button>)}
                </div>
              </div>
              <label><span>Содержание урока (HTML)</span><textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={22} /></label>
              <div className={`lesson-mobile-check ${mobileContentIssues.length ? "has-issues" : "is-ready"}`} role="status">
                {mobileContentIssues.length ? <><Icons.TriangleAlert aria-hidden="true" /><span><strong>Проверьте mobile-версию</strong>{mobileContentIssues.map((issue) => <small key={issue}>{issue}</small>)}</span></> : <><Icons.Smartphone aria-hidden="true" /><span><strong>Mobile-проверка пройдена</strong><small>В уроке нет известных конфликтов ширины.</small></span></>}
              </div>
              <button type="button" className="lesson-mobile-preview-toggle" onClick={() => setIsMobilePreviewOpen((open) => !open)} aria-expanded={isMobilePreviewOpen} aria-controls="lesson-mobile-preview"><Icons.Smartphone aria-hidden="true" />{isMobilePreviewOpen ? "Скрыть mobile-предпросмотр" : "Открыть mobile-предпросмотр"}</button>
              {isMobilePreviewOpen && <div id="lesson-mobile-preview" className="lesson-mobile-preview"><div className="lesson-mobile-preview-head"><Icons.Smartphone aria-hidden="true" />Ширина 390 px</div><div className="lesson-mobile-preview-device"><iframe title="Предпросмотр урока на mobile" sandbox="" srcDoc={mobilePreviewDocument(draftContent || emptyLessonHtml)} /></div></div>}
              {editorError && <div className="form-error" role="alert">{editorError}</div>}
              <div className="lesson-editor-actions">
                <button type="button" className="btn-cancel" onClick={() => { setDraftTitle(lesson.title); setDraftContent(lesson.content); setEditorError(""); setIsMobilePreviewOpen(false); setIsEditing(false); }}>Отмена</button>
                <button type="button" className="btn-save" onClick={saveLesson} disabled={isSaving || mobileContentIssues.length > 0}>{isSaving ? "Сохраняем…" : "Опубликовать урок"}</button>
              </div>
            </div>
          ) : <div ref={bindLessonBodyRef} className="trl-body" dangerouslySetInnerHTML={{ __html: draftContent || emptyLessonHtml }} />}
          <div className="trl-footer">
            {completionError && <div className="form-error trl-completion-error" role="alert">{completionError}</div>}
            <div>
              {prevLesson ? (
                <Link href={`/training/lesson/${prevLesson.id}`} className="btn-nav"><Icons.ArrowLeft />Назад</Link>
              ) : (
                <Link href={parent ? `/training/module/${parent.id}` : "/training/basic"} className="btn-nav btn-nav--ghost"><Icons.LayoutGrid />К курсу</Link>
              )}
            </div>
            <div className="trl-footer-actions">
              {isCompleted ? (
                <Link href={continueHref} className="btn-complete">{nextLesson ? "Следующий урок" : "Продолжить"}<Icons.ArrowRight /></Link>
              ) : (
                <>
                  <button type="button" className="btn-complete" onClick={completeAndContinue} disabled={isCompleting}>
                    <Icons.CheckCircle2 />{isCompleting ? "Сохраняем…" : "Завершить и продолжить"}<Icons.ArrowRight />
                  </button>
                  <Link href={continueHref} className="btn-nav btn-nav--skip">{nextLesson ? "Следующий урок без отметки" : "Продолжить без отметки"}<Icons.ArrowRight /></Link>
                </>
              )}
            </div>
          </div>
        </article>
      </div>
      {isLessonContentsOpen && <div className="lesson-contents-layer">
        <button type="button" className="lesson-contents-backdrop" aria-label="Закрыть содержание уроков" onClick={() => closeLessonContents()} />
        <aside id="lesson-contents-panel" className="lesson-contents-panel" role="dialog" aria-modal="true" aria-labelledby="lesson-contents-title">
          <div className="lesson-contents-panel-head">
            <div><span>Модуль {String(module.order_num).padStart(2, "0")}</span><h2 id="lesson-contents-title">Содержание</h2><p>{stat.doneLessons} из {stat.lessons.length} пройдено · {stat.pct}%</p></div>
            <button ref={lessonContentsCloseRef} type="button" className="control-button control-button--secondary control-button--icon" aria-label="Закрыть содержание уроков" onClick={() => closeLessonContents()}><Icons.X aria-hidden="true" /></button>
          </div>
          <div className="lesson-contents-panel-module">{module.title}</div>
          <ul className="lesson-contents-list">
            {lessonList.map((item) => (
              <li key={item.id}>
                <Link href={`/training/lesson/${item.id}`} onClick={() => closeLessonContents(false)} className={`lesson-contents-item ${item.id === lesson.id ? "current" : completed.has(item.id) ? "done" : ""}`}>
                  <span className="lesson-contents-item-number">{item.order_num}</span>
                  {completed.has(item.id) ? <Icons.CheckCircle2 aria-hidden="true" /> : item.id === lesson.id ? <Icons.PlayCircle aria-hidden="true" /> : <Icons.Circle aria-hidden="true" />}
                  <span>{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>}
    </div>
  );
}

function QuizPage({
  module,
  quiz,
  attempts,
  onSubmit,
}: {
  module: TrainingModule;
  quiz: ModuleQuiz;
  attempts: QuizAttempt[];
  onSubmit: (answers: number[]) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<number[]>(Array(quiz.questions.length).fill(-1));
  const [resultIndex, setResultIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const lastAttempt = attempts[attempts.length - 1] || null;
  const hasPassed = attempts.some((attempt) => attempt.passed);
  const attemptsLeft = quiz.max_attempts ? Math.max(quiz.max_attempts - attempts.length, 0) : null;
  const locked = Boolean(quiz.max_attempts && (hasPassed || attempts.length >= quiz.max_attempts));
  const visibleResult = resultIndex !== null ? attempts[resultIndex] : null;
  const answered = answers.filter((answer) => answer >= 0).length;

  async function submitAnswers() {
    if (answered !== quiz.questions.length || locked || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await onSubmit(answers);
      setResultIndex(attempts.length);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить результат теста. Повторите попытку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (answered !== quiz.questions.length || locked) return;
    void submitAnswers();
  }

  const result = visibleResult;
  const quizProgressValue = result ? `${result.score} / ${result.total}` : `${answered} / ${quiz.questions.length}`;
  const quizProgressPercent = result ? (result.total ? Math.round((result.score / result.total) * 100) : 0) : (quiz.questions.length ? Math.round((answered / quiz.questions.length) * 100) : 0);

  return (
    <div className="qz-wrap">
      <Breadcrumb items={[["База знаний", "/training/basic"], [module.title, `/training/module/${module.id}`], ["Тест"]]} />
      <LearningHeader
        kind="Тест"
        icon={Icons.FileQuestion}
        sequence={`Модуль ${String(module.order_num).padStart(2, "0")}`}
        title={quiz.rules.title || `Тест: ${module.title}`}
        description={quiz.rules.description}
        meta={<><span><Icons.ListChecks aria-hidden="true" />{quiz.questions.length} вопросов</span><span>Проходной балл: {quiz.pass_score} из {quiz.questions.length}</span>{quiz.max_attempts ? <span>Попытки: {attempts.length} / {quiz.max_attempts}</span> : null}</>}
        progress={{ label: result ? "Результат" : "Ответы", value: quizProgressValue, percent: quizProgressPercent }}
        className="learning-screen-header--quiz"
      />

      {lastAttempt && !result && (
        <div className="qz-note">
          Предыдущая попытка: <strong>{lastAttempt.score}/{lastAttempt.total}</strong> {lastAttempt.passed ? "— зачтено" : "— не зачтено"}
          {attemptsLeft !== null ? <><br />Осталось попыток: <strong>{attemptsLeft}</strong> из {quiz.max_attempts}</> : null}
        </div>
      )}

      {locked && !result && (
        <>
          <div className="qz-lock">
            {hasPassed ? <strong>Тест уже зачтён.</strong> : <strong>Попытки закончились.</strong>} По правилам теста повторное прохождение сейчас закрыто.
          </div>
          <div className="qz-actions">
            <Link href={`/training/module/${module.parent_id || module.id}`} className="qz-btn qz-btn--primary">Вернуться к разделам</Link>
            <Link href="/training/basic" className="qz-btn qz-btn--outline">К базовому обучению</Link>
          </div>
        </>
      )}

      {result ? (
        <>
          <ResultBanner result={result} passScore={quiz.pass_score} />
          <div className="qz-questions">
            {quiz.questions.map((question, index) => (
              <div className="qz-card" key={`${question.question}-${index}`}>
                <div className="qz-num">Вопрос {index + 1}</div>
                <div className="qz-question">{question.question}</div>
                <div className="qz-options">
                  {question.options.map((option, optionIndex) => {
                    const isChosen = result.answers[index] === optionIndex;
                    return (
                      <div className={`qz-option ${isChosen ? "qz-option--chosen" : ""}`} key={option}>
                        {isChosen ? <Icons.CheckCircle2 /> : <span className="qz-placeholder" />}
                        {option}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="qz-actions">
            {result.passed ? (
              <>
                <Link href="/training/basic" className="qz-btn qz-btn--primary">Вернуться к базовому обучению</Link>
                <Link href={`/training/module/${module.parent_id || module.id}`} className="qz-btn qz-btn--outline">К разделам курса</Link>
              </>
            ) : locked ? (
              <Link href={`/training/module/${module.parent_id || module.id}`} className="qz-btn qz-btn--primary">Вернуться к разделам</Link>
            ) : (
              <>
                <button type="button" className="qz-btn qz-btn--primary" onClick={() => setResultIndex(null)}>Пройти ещё раз</button>
                <Link href={`/training/module/${module.id}`} className="qz-btn qz-btn--outline">Повторить уроки</Link>
              </>
            )}
          </div>
        </>
      ) : !locked ? (
        <form onSubmit={handleSubmit}>
          {submitError && (
            <div className="form-error" role="alert">
              <Icons.CircleAlert aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}
          <div className="qz-questions">
            {quiz.questions.map((question, index) => (
              <div className="qz-card" key={`${question.question}-${index}`}>
                <div className="qz-num">Вопрос {index + 1} из {quiz.questions.length}</div>
                <div className="qz-question">{question.question}</div>
                <div className="qz-options">
                  {question.options.map((option, optionIndex) => (
                    <label className="qz-option" key={option}>
                      <input
                        type="radio"
                        name={`q${index}`}
                        value={optionIndex}
                        checked={answers[index] === optionIndex}
                        onChange={() => setAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? optionIndex : value))}
                        disabled={isSubmitting}
                        required
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="qz-progress-line">
            <div>
              <span>Отвечено: {answered} / {quiz.questions.length}</span>
              <span>Проходной балл: {quiz.pass_score} из {quiz.questions.length}{attemptsLeft !== null ? `; осталось попыток: ${attemptsLeft}` : ""}</span>
            </div>
            <div className="progress-track"><span style={{ width: `${(answered / quiz.questions.length) * 100}%` }} /></div>
          </div>
          <div className="qz-actions">
            {submitError ? (
              <button type="button" className="qz-btn qz-btn--primary" onClick={() => void submitAnswers()} disabled={isSubmitting}>
                {isSubmitting ? "Сохраняем…" : "Повторить сохранение"}
              </button>
            ) : (
              <button type="submit" className="qz-btn qz-btn--primary" disabled={answered !== quiz.questions.length || isSubmitting}>
                {isSubmitting ? "Сохраняем…" : "Сдать тест"}
              </button>
            )}
            <Link href={`/training/module/${module.id}`} className="qz-btn qz-btn--outline">Вернуться к урокам</Link>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ResultBanner({ result, passScore }: { result: QuizAttempt; passScore: number }) {
  const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
  return (
    <div className={`qz-result ${result.passed ? "qz-result--pass" : "qz-result--fail"}`}>
      <div className="qz-result__score">{result.score}/{result.total}</div>
      <div className="qz-result__label">правильных ответов</div>
      <div className="qz-result__msg">{result.passed ? "Тест пройден" : "Тест не пройден"}</div>
      <div className="qz-result__sub">{pct}% · {result.passed ? "модуль зачтён" : `нужно минимум ${passScore} правильных ответов`}</div>
    </div>
  );
}

function LocalProgress({
  topModules,
  employees,
  progressStore,
  lessonsForModule,
  quizzesForModule,
  isLoading,
  loadError,
  onRetry,
  canManageAdmission,
  onEmployeePlanUpdated,
}: {
  topModules: TrainingModule[];
  employees: Employee[];
  progressStore: ProgressStore;
  lessonsForModule: (module: TrainingModule, deep?: boolean) => TrainingLessonSummary[];
  quizzesForModule: (module: TrainingModule, deep?: boolean) => ModuleQuizSummary[];
  isLoading: boolean;
  loadError: string;
  onRetry: () => void;
  canManageAdmission: boolean;
  onEmployeePlanUpdated: (employeeId: string, update: Pick<Employee, "trainingDueDate" | "lastReminderAt">) => void;
}) {
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [planEmployeeId, setPlanEmployeeId] = useState<string | null>(null);
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [planError, setPlanError] = useState("");
  const [planNotice, setPlanNotice] = useState("");
  const [isSavingDueDate, setIsSavingDueDate] = useState(false);
  const [remindingEmployeeId, setRemindingEmployeeId] = useState("");
  const planDialogRef = useRef<HTMLDialogElement>(null);
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState("");
  const [assignmentModuleId, setAssignmentModuleId] = useState(0);
  const [assignmentTarget, setAssignmentTarget] = useState<"employee" | "team">("employee");
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState("");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [assignmentRequired, setAssignmentRequired] = useState(true);
  const [assignmentError, setAssignmentError] = useState("");
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [remindingAssignmentId, setRemindingAssignmentId] = useState("");
  const assignmentDialogRef = useRef<HTMLDialogElement>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [reviewEmployeeId, setReviewEmployeeId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [isSavingReview, setIsSavingReview] = useState(false);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);

  function employeeStats(employee: Employee) {
    const progress = progressStore.byEmployee[employee.id] || emptyProgress();
    const completedSet = new Set(progress.completedLessons);
    const moduleRows = topModules.map((module) => {
      const lessons = lessonsForModule(module, true);
      const quizzes = quizzesForModule(module, true);
      const doneLessons = lessons.filter((lesson) => completedSet.has(lesson.id)).length;
      const quizResults = quizzes.map((quiz) => {
        const attempts = progress.quizAttempts[String(quiz.module_id)] || [];
        const best = attempts.reduce<QuizAttempt | null>((currentBest, attempt) => {
          if (!currentBest || attempt.score > currentBest.score) return attempt;
          return currentBest;
        }, null);
        const passed = attempts.some((attempt) => attempt.passed);
        const finalFailed = Boolean(quiz.max_attempts && attempts.length >= quiz.max_attempts && !passed);
        const percent = best?.total ? Math.round((best.score / best.total) * 100) : null;
        return { quiz, attempts, best, passed, finalFailed, percent };
      });
      const passedQuizzes = quizResults.filter((result) => result.passed).length;
      const startedQuizzes = quizResults.filter((result) => result.attempts.length > 0).length;
      const finalFailedQuizzes = quizResults.filter((result) => result.finalFailed).length;
      const averageQuizPercent = startedQuizzes
        ? Math.round(quizResults.reduce((sum, result) => sum + (result.percent || 0), 0) / startedQuizzes)
        : null;
      const totalItems = lessons.length + quizzes.length;
      const doneItems = doneLessons + passedQuizzes;
      return {
        module,
        lessonsTotal: lessons.length,
        lessonsDone: doneLessons,
        quizzesTotal: quizzes.length,
        quizzesPassed: passedQuizzes,
        quizzesStarted: startedQuizzes,
        quizzesFinalFailed: finalFailedQuizzes,
        averageQuizPercent,
        totalItems,
        doneItems,
        pct: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
        allDone: totalItems > 0 && doneItems === totalItems,
      };
    });
    const totalLessons = moduleRows.reduce((sum, row) => sum + row.lessonsTotal, 0);
    const doneLessons = moduleRows.reduce((sum, row) => sum + row.lessonsDone, 0);
    const totalQuizzes = moduleRows.reduce((sum, row) => sum + row.quizzesTotal, 0);
    const passedQuizzes = moduleRows.reduce((sum, row) => sum + row.quizzesPassed, 0);
    const totalItems = moduleRows.reduce((sum, row) => sum + row.totalItems, 0);
    const doneItems = moduleRows.reduce((sum, row) => sum + row.doneItems, 0);
    return {
      moduleRows,
      totalLessons,
      doneLessons,
      totalQuizzes,
      passedQuizzes,
      totalItems,
      doneItems,
      overallPct: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
      allDone: totalItems > 0 && doneItems === totalItems,
    };
  }

  const rows = employees.filter((employee) => employee.role === "manager").map((employee) => ({ employee, stats: employeeStats(employee) }));
  const plannedRow = rows.find((row) => row.employee.id === planEmployeeId) || null;
  const reviewRow = rows.find((row) => row.employee.id === reviewEmployeeId) || null;
  const reviewRows = rows.filter((row) => row.employee.trainingAccess.state === "REVIEW_REQUIRED");

  useEffect(() => {
    const dialog = reviewDialogRef.current;
    if (!dialog) return;
    if (reviewEmployeeId && !dialog.open) dialog.showModal();
    if (!reviewEmployeeId && dialog.open) dialog.close();
  }, [reviewEmployeeId]);

  useEffect(() => {
    const dialog = planDialogRef.current;
    if (!dialog) return;
    if (planEmployeeId && !dialog.open) dialog.showModal();
    if (!planEmployeeId && dialog.open) dialog.close();
  }, [planEmployeeId]);

  const loadAssignments = useCallback(async () => {
    setIsAssignmentsLoading(true);
    setAssignmentsError("");
    try {
      const response = await fetch("/api/admin/assignments", { cache: "no-store" });
      const result = await response.json().catch(() => null) as { assignments?: TrainingAssignment[]; error?: string } | null;
      if (!response.ok || !result?.assignments) throw new Error(result?.error || "Не удалось загрузить назначения обучения.");
      setAssignments(result.assignments);
    } catch (error) {
      setAssignmentsError(error instanceof Error ? error.message : "Не удалось загрузить назначения обучения.");
    } finally {
      setIsAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAssignments);
  }, [loadAssignments]);

  useEffect(() => {
    const dialog = assignmentDialogRef.current;
    if (!dialog) return;
    if (assignmentModuleId && !dialog.open) dialog.showModal();
    if (!assignmentModuleId && dialog.open) dialog.close();
  }, [assignmentModuleId]);

  function openAssignmentDialog() {
    if (!rows.length || !topModules.length) return;
    setAssignmentModuleId(topModules[0].id);
    setAssignmentTarget("employee");
    setAssignmentEmployeeId(rows[0].employee.id);
    setAssignmentDueDate("");
    setAssignmentRequired(true);
    setAssignmentError("");
  }

  function closeAssignmentDialog(force = false) {
    if (isCreatingAssignment && !force) return;
    setAssignmentModuleId(0);
    setAssignmentError("");
  }

  async function createAssignment() {
    const employeeIds = assignmentTarget === "team" ? rows.map((row) => row.employee.id) : assignmentEmployeeId ? [assignmentEmployeeId] : [];
    if (!assignmentModuleId || !assignmentDueDate || !employeeIds.length || isCreatingAssignment) {
      setAssignmentError("Выберите модуль, получателей и срок выполнения.");
      return;
    }
    setIsCreatingAssignment(true);
    setAssignmentError("");
    try {
      const response = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: assignmentModuleId, employeeIds, dueDate: assignmentDueDate, isRequired: assignmentRequired }),
      });
      const result = await response.json().catch(() => null) as { assignments?: TrainingAssignment[]; error?: string } | null;
      if (!response.ok || !result?.assignments) throw new Error(result?.error || "Не удалось назначить обучение.");
      setAssignments((current) => {
        const createdKeys = new Set(result.assignments!.map((assignment) => `${assignment.moduleId}:${assignment.employeeId}`));
        return [...current.filter((assignment) => !createdKeys.has(`${assignment.moduleId}:${assignment.employeeId}`)), ...result.assignments!];
      });
      closeAssignmentDialog(true);
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Не удалось назначить обучение.");
    } finally {
      setIsCreatingAssignment(false);
    }
  }

  async function sendAssignmentReminder(assignment: TrainingAssignment) {
    if (remindingAssignmentId) return;
    setRemindingAssignmentId(assignment.id);
    setAssignmentsError("");
    try {
      const response = await fetch(`/api/admin/assignments/${assignment.id}/remind`, { method: "POST" });
      const result = await response.json().catch(() => null) as { ok?: boolean; lastReminderAt?: string; error?: string } | null;
      if (!response.ok || !result?.ok || !result.lastReminderAt) throw new Error(result?.error || "Не удалось отправить напоминание.");
      setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, lastReminderAt: result.lastReminderAt! } : item));
    } catch (error) {
      setAssignmentsError(error instanceof Error ? error.message : "Не удалось отправить напоминание.");
    } finally {
      setRemindingAssignmentId("");
    }
  }

  function openEmployeePlan(employee: Employee) {
    setPlanEmployeeId(employee.id);
    setDueDateDraft(employee.trainingDueDate);
    setPlanError("");
    setPlanNotice("");
  }

  function closeEmployeePlan() {
    if (isSavingDueDate || remindingEmployeeId) return;
    setPlanEmployeeId(null);
    setPlanError("");
    setPlanNotice("");
  }

  function openTrainingReview(employee: Employee) {
    setReviewEmployeeId(employee.id);
    setReviewComment("");
    setReviewError("");
  }

  function closeTrainingReview(force = false) {
    if (isSavingReview && !force) return;
    setReviewEmployeeId(null);
    setReviewComment("");
    setReviewError("");
  }

  async function decideTrainingAccess(decision: "grant" | "complete" | "return") {
    if (!reviewRow || isSavingReview) return;
    setIsSavingReview(true);
    setReviewError("");
    try {
      const response = await fetch(`/api/admin/training-access/${reviewRow.employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: reviewComment }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Не удалось сохранить решение по обучению.");
      closeTrainingReview(true);
      onRetry();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Не удалось сохранить решение по обучению.");
    } finally {
      setIsSavingReview(false);
    }
  }

  async function saveDueDate() {
    if (!plannedRow || isSavingDueDate) return;
    setIsSavingDueDate(true);
    setPlanError("");
    setPlanNotice("");
    try {
      const response = await fetch(`/api/admin/team-training/${plannedRow.employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: dueDateDraft || null }),
      });
      const result = await response.json().catch(() => null) as { trainingDueDate?: string; lastReminderAt?: string | null; error?: string } | null;
      if (!response.ok || !result) throw new Error(result?.error || "Не удалось сохранить срок обучения.");
      const trainingDueDate = result.trainingDueDate || "";
      setDueDateDraft(trainingDueDate);
      onEmployeePlanUpdated(plannedRow.employee.id, { trainingDueDate, lastReminderAt: result.lastReminderAt || plannedRow.employee.lastReminderAt });
      setPlanNotice(trainingDueDate ? "Срок обучения сохранён." : "Срок обучения снят.");
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Не удалось сохранить срок обучения.");
    } finally {
      setIsSavingDueDate(false);
    }
  }

  async function sendEmployeeReminder(employee: Employee) {
    if (remindingEmployeeId) return;
    setRemindingEmployeeId(employee.id);
    setPlanError("");
    setPlanNotice("");
    try {
      const response = await fetch(`/api/admin/team-training/${employee.id}`, { method: "POST" });
      const result = await response.json().catch(() => null) as { ok?: boolean; lastReminderAt?: string; error?: string } | null;
      if (!response.ok || !result?.ok || !result.lastReminderAt) throw new Error(result?.error || "Не удалось отправить напоминание.");
      onEmployeePlanUpdated(employee.id, { trainingDueDate: employee.trainingDueDate, lastReminderAt: result.lastReminderAt });
      if (planEmployeeId === employee.id) setPlanNotice("Напоминание отправлено в центр уведомлений сотрудника.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить напоминание.";
      if (planEmployeeId === employee.id) setPlanError(message);
    } finally {
      setRemindingEmployeeId("");
    }
  }

  function activityText(value: string | null) {
    return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Учебной активности пока нет";
  }

  const assignmentRows = assignments.flatMap((assignment) => {
    const employeeRow = rows.find((row) => row.employee.id === assignment.employeeId);
    const moduleRow = employeeRow?.stats.moduleRows.find((row) => row.module.id === assignment.moduleId);
    if (!employeeRow || !moduleRow) return [];
    const status = moduleRow.allDone
      ? { label: "Завершено", className: "done" }
      : assignment.dueDate < today
        ? { label: "Срок прошёл", className: "overdue" }
        : moduleRow.pct === 0
          ? { label: "Не начато", className: "new" }
          : { label: "В процессе", className: "active" };
    return [{ assignment, employee: employeeRow.employee, moduleRow, status }];
  }).sort((left, right) => Number(left.moduleRow.allDone) - Number(right.moduleRow.allDone) || left.assignment.dueDate.localeCompare(right.assignment.dueDate));
  const overdueEmployeeIds = new Set(assignmentRows.filter((row) => row.status.className === "overdue").map((row) => row.employee.id));
  const teamStatus = (employee: Employee, stats: ReturnType<typeof employeeStats>) => {
    if (stats.allDone) return { label: "Завершил", className: "done", rank: 4 };
    if (overdueEmployeeIds.has(employee.id)) return { label: "Срок прошёл", className: "overdue", rank: 0 };
    if (stats.overallPct === 0) return { label: "Не начал", className: "new", rank: 1 };
    if (stats.overallPct < 50) return { label: "Нужна помощь", className: "behind", rank: 2 };
    return { label: "В процессе", className: "active", rank: 3 };
  };
  const attentionRows = rows
    .filter((row) => !row.stats.allDone)
    .map((row) => ({ ...row, status: teamStatus(row.employee, row.stats), incompleteModules: row.stats.moduleRows.filter((moduleRow) => moduleRow.totalItems > 0 && !moduleRow.allDone).length }))
    .sort((left, right) => left.status.rank - right.status.rank || left.stats.overallPct - right.stats.overallPct)
    .slice(0, 5);

  return (
    <div className="trp-wrap">
      <PageHeader
        className="trp-header"
        title="Прогресс команды"
        action={<button type="button" className="control-button control-button--primary control-button--header trp-assign-button" onClick={openAssignmentDialog} disabled={!rows.length || !topModules.length}><Icons.Plus aria-hidden="true" />Назначить обучение</button>}
      />

      {canManageAdmission && (
        <section className="team-attention training-review-queue" aria-labelledby="training-review-title">
          <div className="team-attention-head"><div><h2 id="training-review-title">Экспресс-курс пройден</h2></div><span>{reviewRows.length}</span></div>
          {reviewRows.length ? <div className="team-attention-list">
            {reviewRows.map(({ employee, stats }) => (
              <article className="team-attention-row" key={employee.id}>
                <div className="team-attention-person"><strong>{employeeDisplayName(employee)}</strong><span><span className="team-status team-status--active">Экспресс-курс пройден</span>{employee.trainingAccess.reviewRequestedAt ? ` ${activityText(employee.trainingAccess.reviewRequestedAt)}` : ""}</span></div>
                <div className="team-attention-progress"><strong>{stats.moduleRows.find((row) => row.module.id === employee.trainingAccess.trialModuleId)?.pct || 100}%</strong><small>Экспресс-обучение</small></div>
                <div className="team-attention-actions"><button type="button" className="control-button control-button--primary control-button--compact" onClick={() => openTrainingReview(employee)}>Подтвердить итог</button></div>
              </article>
            ))}
          </div> : <DataEmptyState compact title="Нет завершённых экспресс-курсов" description="Здесь появятся сотрудники после завершения экспресс-обучения." />}
        </section>
      )}

      <section className="trp-assignments data-grid data-grid--assignments" aria-labelledby="team-assignments-title">
        <div className="trp-assignments-head"><div><h2 id="team-assignments-title">Назначения</h2></div><span>{assignmentRows.length}</span></div>
        {isAssignmentsLoading ? <DataSkeleton rows={2} compact /> : assignmentsError ? <DataLoadError message={assignmentsError} onRetry={loadAssignments} /> : assignmentRows.length ? (
          <div className="trp-assignment-list data-grid__list">
            {assignmentRows.map(({ assignment, employee, moduleRow, status }) => (
              <article className="trp-assignment-card data-grid__row" key={assignment.id}>
                <div className="trp-assignment-main"><span className={`team-status team-status--${status.className}`}>{status.label}</span><strong>{moduleRow.module.title}</strong><span>{employeeDisplayName(employee)} · {moduleRow.pct}% · до {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(`${assignment.dueDate}T00:00:00`))}</span></div>
                <div className="trp-assignment-meta"><span>{assignment.isRequired ? "Обязательное" : "Рекомендуемое"}</span><button type="button" className="control-button control-button--secondary control-button--compact trp-assignment-remind" onClick={() => void sendAssignmentReminder(assignment)} disabled={Boolean(remindingAssignmentId) || moduleRow.allDone}><Icons.Bell aria-hidden="true" />{remindingAssignmentId === assignment.id ? "Отправляем…" : "Напомнить"}</button><button type="button" className="control-button control-button--secondary control-button--compact trp-assignment-plan" onClick={() => openEmployeePlan(employee)}><Icons.ListChecks aria-hidden="true" />План</button></div>
              </article>
            ))}
          </div>
        ) : <DataEmptyState compact title="Назначений пока нет" />}
      </section>

      <dialog
        className="delete-employee-dialog training-review-dialog"
        ref={reviewDialogRef}
        aria-labelledby="training-review-dialog-title"
        onCancel={(event) => { event.preventDefault(); closeTrainingReview(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeTrainingReview(); }}
      >
        <div className="delete-employee-dialog__icon"><Icons.GraduationCap aria-hidden="true" /></div>
        <h2 id="training-review-dialog-title">Итог экспресс-обучения</h2>
        {reviewRow && <p><strong>{employeeDisplayName(reviewRow.employee)}</strong> завершил(а) экспресс-обучение. Откройте основную программу или завершите обучение.</p>}
        <label className="form-field"><span>Комментарий для сотрудника</span><textarea className="control-field" value={reviewComment} maxLength={1000} rows={3} onChange={(event) => setReviewComment(event.target.value)} placeholder="Необязательно" /></label>
        {reviewError && <div className="form-error" role="alert">{reviewError}</div>}
        <div className="delete-employee-dialog__actions training-review-dialog__actions">
          <button type="button" className="btn-cancel" onClick={() => void decideTrainingAccess("return")} disabled={isSavingReview}>Вернуть на доработку</button>
          <button type="button" className="danger-btn" onClick={() => void decideTrainingAccess("complete")} disabled={isSavingReview}>Завершить обучение</button>
          <button type="button" className="btn-save" onClick={() => void decideTrainingAccess("grant")} disabled={isSavingReview}>{isSavingReview ? "Сохраняем…" : "Открыть программу"}</button>
        </div>
      </dialog>

      {isLoading ? <DataSkeleton rows={6} label="Загружаем прогресс команды" /> : loadError ? <DataLoadError message={loadError} onRetry={onRetry} /> : !rows.length ? <DataEmptyState title="В команде пока нет сотрудников" description="Добавьте сотрудника, чтобы отслеживать его обучение и назначать модули." /> : <>
      <section className="team-attention" aria-labelledby="team-attention-title">
        <div className="team-attention-head"><div><h2 id="team-attention-title">Требуют внимания</h2></div><span>{attentionRows.length}</span></div>
        {attentionRows.length ? <div className="team-attention-list">
          {attentionRows.map(({ employee, stats, status, incompleteModules }) => (
            <article className="team-attention-row" key={employee.id}>
              <div className="team-attention-person"><strong>{employeeDisplayName(employee)}</strong><span><span className={`team-status team-status--${status.className}`}>{status.label}</span>{incompleteModules} незаверш. мод.</span></div>
              <div className="team-attention-progress"><strong>{stats.overallPct}%</strong><span className="progress-track progress-track--mini"><span style={{ width: `${stats.overallPct}%` }} /></span><small>{stats.doneLessons}/{stats.totalLessons} уроков</small></div>
              <div className="team-attention-activity"><Icons.Activity aria-hidden="true" /><span>{activityText(employee.lastLearningActivityAt)}</span></div>
              <div className="team-attention-actions"><button type="button" className="control-button control-button--secondary control-button--compact" onClick={() => void sendEmployeeReminder(employee)} disabled={Boolean(remindingEmployeeId)}><Icons.Bell aria-hidden="true" />{remindingEmployeeId === employee.id ? "Отправляем…" : "Напомнить"}</button><button type="button" className="control-button control-button--secondary control-button--compact" onClick={() => openEmployeePlan(employee)}><Icons.ListChecks aria-hidden="true" />План</button></div>
            </article>
          ))}
        </div> : <DataEmptyState compact title="Команда идёт по плану" description="Сейчас нет сотрудников с незавершённым обучением." />}
      </section>
      <section className="trp-matrix-section" aria-labelledby="team-matrix-title">
        <div className="trp-matrix-head"><div><h2 id="team-matrix-title">Матрица прогресса</h2></div><span>{rows.length} сотрудников</span></div>
      <div className="trp-mobile-list" aria-label="Прогресс сотрудников">
        {rows.map(({ employee, stats }) => {
          const isOpen = expandedEmployeeId === employee.id;
          const incompleteModules = stats.moduleRows.filter((moduleRow) => moduleRow.totalItems > 0 && !moduleRow.allDone).length;
          const status = stats.allDone ? "Завершил" : stats.overallPct === 0 ? "Не начал" : stats.overallPct < 50 ? "Отстаёт" : "В процессе";
          const statusClass = stats.allDone ? "done" : stats.overallPct === 0 ? "new" : stats.overallPct < 50 ? "behind" : "active";

          return (
            <section className={`trp-mobile-card ${isOpen ? "is-open" : ""}`} key={employee.id}>
              <button type="button" className="trp-mobile-card-trigger" onClick={() => setExpandedEmployeeId((currentId) => currentId === employee.id ? null : employee.id)} aria-expanded={isOpen} aria-controls={`employee-progress-${employee.id}`}>
                <span className="trp-mobile-card-main">
                  <span className="trp-mobile-card-name">{employeeDisplayName(employee)}</span>
                  <span className={`trp-mobile-status trp-mobile-status--${statusClass}`}>{status}</span>
                </span>
                <span className="trp-mobile-card-score"><strong>{stats.overallPct}%</strong><Icons.ChevronDown aria-hidden="true" /></span>
                <span className="trp-mobile-card-progress"><span style={{ width: `${stats.overallPct}%` }} /></span>
                <span className="trp-mobile-card-meta">{stats.doneLessons}/{stats.totalLessons} уроков · {stats.passedQuizzes}/{stats.totalQuizzes} тестов{incompleteModules ? ` · ${incompleteModules} незаверш.` : ""}</span>
              </button>
              {isOpen && (
                <div id={`employee-progress-${employee.id}`} className="trp-mobile-card-detail">
                  <div className="trp-mobile-detail-heading">Прогресс по модулям</div>
                  <div className="trp-mobile-plan-facts">
                    <span><Icons.Activity aria-hidden="true" />{activityText(employee.lastLearningActivityAt)}</span>
                    <span><Icons.CalendarClock aria-hidden="true" />{employee.trainingDueDate ? `Срок: ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(`${employee.trainingDueDate}T00:00:00`))}` : "Срок не назначен"}</span>
                  </div>
                  {stats.moduleRows.filter((moduleRow) => moduleRow.totalItems > 0).sort((left, right) => Number(left.allDone) - Number(right.allDone)).map((moduleRow) => (
                    <div className={`trp-mobile-module ${moduleRow.allDone ? "is-done" : ""}`} key={moduleRow.module.id}>
                      <div className="trp-mobile-module-heading"><span>Модуль {String(moduleRow.module.order_num).padStart(2, "0")}</span><strong>{moduleRow.pct}%</strong></div>
                      <div className="trp-mobile-module-title">{moduleRow.module.title}</div>
                      <div className="trp-mobile-module-progress"><span style={{ width: `${moduleRow.pct}%` }} /></div>
                      <div className="trp-mobile-module-meta"><span>{moduleRow.lessonsDone}/{moduleRow.lessonsTotal} уроков · {moduleRow.quizzesPassed}/{moduleRow.quizzesTotal} тестов</span><span>{moduleRow.allDone ? "Завершён" : "Не завершён"}</span></div>
                    </div>
                  ))}
                  <button type="button" className="control-button control-button--secondary control-button--compact trp-plan-button" onClick={() => openEmployeePlan(employee)}><Icons.ListChecks aria-hidden="true" />Открыть план сотрудника</button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="trp-table-wrap">
        <table className="trp-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>
                <div className="trp-th-mod">
                  <div className="trp-th-num">Экспресс</div>
                  <div className="trp-th-title">Обучение МОП</div>
                </div>
              </th>
              {topModules.map((module) => (
                <th key={module.id}>
                  <div className="trp-th-mod">
                    <div className="trp-th-num">Модуль {String(module.order_num).padStart(2, "0")}</div>
                    <div className="trp-th-title">{module.title}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ employee, stats }) => (
              <tr className={employee.id === progressStore.activeEmployeeId ? "trp-row--active" : ""} key={employee.id}>
                <td className="trp-user-cell">
                  <div className="trp-user-name">{employeeDisplayName(employee)}</div>
                  <div className="trp-user-meta">
                    <span className="trp-overall">{stats.overallPct}% курса</span>
                  </div>
                  <div className="trp-user-activity"><Icons.Activity aria-hidden="true" />{activityText(employee.lastLearningActivityAt)}</div>
                  <div className={`trp-user-due ${employee.trainingDueDate ? "" : "is-empty"}`}><Icons.CalendarClock aria-hidden="true" />{employee.trainingDueDate ? `Срок: ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(`${employee.trainingDueDate}T00:00:00`))}` : "Срок не назначен"}</div>
                  <button type="button" className="control-button control-button--secondary control-button--compact trp-user-plan" onClick={() => openEmployeePlan(employee)}><Icons.ListChecks aria-hidden="true" />План</button>
                  <div className={`trp-ready ${stats.allDone ? "trp-ready--yes" : "trp-ready--no"}`}>
                    {stats.allDone ? <Icons.CheckCircle2 /> : <Icons.Clock />}
                    {stats.passedQuizzes}/{stats.totalQuizzes} тестов
                  </div>
                </td>
                <ProgressMatrixCell
                  pct={stats.overallPct}
                  lessonsDone={stats.doneLessons}
                  lessonsTotal={stats.totalLessons}
                  quizzesPassed={stats.passedQuizzes}
                  quizzesTotal={stats.totalQuizzes}
                  allDone={stats.allDone}
                />
                {stats.moduleRows.map((moduleRow) => (
                  <ProgressMatrixCell
                    key={moduleRow.module.id}
                    pct={moduleRow.pct}
                    lessonsDone={moduleRow.lessonsDone}
                    lessonsTotal={moduleRow.lessonsTotal}
                    quizzesPassed={moduleRow.quizzesPassed}
                    quizzesTotal={moduleRow.quizzesTotal}
                    allDone={moduleRow.allDone}
                    finalFailed={moduleRow.quizzesFinalFailed > 0}
                    averageQuizPercent={moduleRow.averageQuizPercent}
                    quizzesStarted={moduleRow.quizzesStarted}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
      </>}
      <dialog
        className="trp-assignment-dialog"
        ref={assignmentDialogRef}
        aria-labelledby="assignment-dialog-title"
        onCancel={(event) => { event.preventDefault(); closeAssignmentDialog(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeAssignmentDialog(); }}
      >
        <div className="trp-plan-dialog-head">
          <div><span>Новое назначение</span><h2 id="assignment-dialog-title">Назначить обучение</h2></div>
          <button type="button" className="trp-plan-close" onClick={() => closeAssignmentDialog()} disabled={isCreatingAssignment} aria-label="Закрыть окно назначения"><Icons.X aria-hidden="true" /></button>
        </div>
        <div className="trp-assignment-form">
          <div className="trp-assignment-select"><span>Модуль</span><SelectMenu value={assignmentModuleId} onChange={setAssignmentModuleId} ariaLabel="Модуль для назначения" options={topModules.map((module) => ({ value: module.id, label: module.title }))} /></div>
          <fieldset>
            <legend>Получатели</legend>
            <label><input type="radio" name="assignment-target" checked={assignmentTarget === "employee"} onChange={() => setAssignmentTarget("employee")} />Один сотрудник</label>
            <label><input type="radio" name="assignment-target" checked={assignmentTarget === "team"} onChange={() => setAssignmentTarget("team")} />Вся команда ({rows.length})</label>
          </fieldset>
          {assignmentTarget === "employee" && <div className="trp-assignment-select"><span>Сотрудник</span><SelectMenu value={assignmentEmployeeId} onChange={setAssignmentEmployeeId} ariaLabel="Сотрудник для назначения" options={rows.map((row) => ({ value: row.employee.id, label: employeeDisplayName(row.employee) }))} /></div>}
          <label><span>Срок выполнения</span><input type="date" value={assignmentDueDate} onChange={(event) => setAssignmentDueDate(event.target.value)} required /></label>
          <label className="trp-assignment-required"><input type="checkbox" checked={assignmentRequired} onChange={(event) => setAssignmentRequired(event.target.checked)} />Это обязательное назначение</label>
        </div>
        {assignmentError && <div className="form-error" role="alert">{assignmentError}</div>}
        <div className="trp-plan-actions"><button type="button" className="btn-cancel" onClick={() => closeAssignmentDialog()} disabled={isCreatingAssignment}>Отмена</button><button type="button" className="control-button control-button--primary trp-reminder-button" onClick={() => void createAssignment()} disabled={isCreatingAssignment}>{isCreatingAssignment ? "Назначаем…" : "Назначить"}</button></div>
      </dialog>
      <dialog
        className="trp-plan-dialog"
        ref={planDialogRef}
        aria-labelledby="team-plan-title"
        onCancel={(event) => { event.preventDefault(); closeEmployeePlan(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeEmployeePlan(); }}
      >
        {plannedRow && (
          <>
            <div className="trp-plan-dialog-head">
              <div><span>План обучения</span><h2 id="team-plan-title">{employeeDisplayName(plannedRow.employee)}</h2></div>
              <button type="button" className="trp-plan-close" onClick={closeEmployeePlan} disabled={isSavingDueDate || Boolean(remindingEmployeeId)} aria-label="Закрыть план"><Icons.X aria-hidden="true" /></button>
            </div>
            <div className="trp-plan-summary">
              <div><span>Прогресс</span><strong>{plannedRow.stats.overallPct}%</strong></div>
              <div><span>Последняя учебная активность</span><strong>{activityText(plannedRow.employee.lastLearningActivityAt)}</strong></div>
              <div><span>Последнее напоминание</span><strong>{plannedRow.employee.lastReminderAt ? activityText(plannedRow.employee.lastReminderAt) : "Не отправляли"}</strong></div>
            </div>
            <label className="trp-plan-due-date"><span>Назначенный срок</span><input type="date" value={dueDateDraft} onChange={(event) => setDueDateDraft(event.target.value)} disabled={isSavingDueDate} /></label>
            <div className="trp-plan-actions">
              <button type="button" className="btn-cancel" onClick={() => void saveDueDate()} disabled={isSavingDueDate}>{isSavingDueDate ? "Сохраняем…" : "Сохранить срок"}</button>
              <button type="button" className="control-button control-button--primary trp-reminder-button" onClick={() => plannedRow && void sendEmployeeReminder(plannedRow.employee)} disabled={remindingEmployeeId === plannedRow.employee.id}>{remindingEmployeeId === plannedRow.employee.id ? "Отправляем…" : "Напомнить сотруднику"}</button>
            </div>
            {planError && <div className="form-error" role="alert">{planError}</div>}
            {planNotice && <SaveFeedback state="success">{planNotice}</SaveFeedback>}
            <section className="trp-plan-incomplete">
              <h3>Незавершённые модули</h3>
              {plannedRow.stats.moduleRows.filter((moduleRow) => moduleRow.totalItems > 0 && !moduleRow.allDone).sort((left, right) => left.pct - right.pct).map((moduleRow) => (
                <div className="trp-plan-module" key={moduleRow.module.id}>
                  <div><strong>{moduleRow.module.title}</strong><span>{moduleRow.lessonsDone}/{moduleRow.lessonsTotal} уроков · {moduleRow.quizzesPassed}/{moduleRow.quizzesTotal} тестов</span></div>
                  <b>{moduleRow.pct}%</b>
                </div>
              ))}
              {plannedRow.stats.allDone && <p className="trp-plan-complete"><Icons.CheckCircle2 aria-hidden="true" />Обучение завершено.</p>}
            </section>
          </>
        )}
      </dialog>
    </div>
  );
}

function ProgressMatrixCell({
  pct,
  lessonsDone,
  lessonsTotal,
  quizzesPassed,
  quizzesTotal,
  allDone,
  finalFailed = false,
  averageQuizPercent = null,
  quizzesStarted = 0,
}: {
  pct: number;
  lessonsDone: number;
  lessonsTotal: number;
  quizzesPassed: number;
  quizzesTotal: number;
  allDone: boolean;
  finalFailed?: boolean;
  averageQuizPercent?: number | null;
  quizzesStarted?: number;
}) {
  const hasContent = lessonsTotal + quizzesTotal > 0;
  const fillClass = allDone ? "trp-pct-fill--green" : pct > 0 ? "trp-pct-fill--yellow" : "trp-pct-fill--gray";
  const quizLabel = (() => {
    if (!quizzesTotal) return "";
    if (quizzesPassed === quizzesTotal) return quizzesTotal === 1 ? "тест сдан" : `тесты ${quizzesPassed}/${quizzesTotal}`;
    if (finalFailed) return "тест не пройден";
    if (quizzesStarted > 0 && averageQuizPercent !== null) return `тесты ${quizzesPassed}/${quizzesTotal} · ср. ${averageQuizPercent}%`;
    return quizzesTotal === 1 ? "тест не начат" : "тесты не начаты";
  })();

  return (
    <td className="trp-mod-cell">
      {!hasContent ? (
        <span className="trp-cell-none">—</span>
      ) : (
        <div className="trp-cell-block">
          <div className="trp-pct-bar">
            <div className={`trp-pct-fill ${fillClass}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="trp-pct-text">{pct}%</div>
          <div className="trp-lessons-count">
            {lessonsTotal > 0 ? `${lessonsDone}/${lessonsTotal} ур.` : ""}
            {quizzesTotal > 0 ? `${lessonsTotal > 0 ? " · " : ""}${quizzesPassed}/${quizzesTotal} тест` : ""}
          </div>
          {quizLabel && (
            <span className={`trp-quiz-badge ${quizzesPassed === quizzesTotal ? "trp-quiz-badge--pass" : finalFailed || quizzesStarted > 0 ? "trp-quiz-badge--fail" : "trp-quiz-badge--none"}`}>
              {quizzesPassed === quizzesTotal ? <Icons.Check /> : finalFailed || quizzesStarted > 0 ? <Icons.X /> : <Icons.Minus />}
              {quizLabel}
            </span>
          )}
        </div>
      )}
    </td>
  );
}

type OwnProfile = {
  username: string;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
  position: string;
  role: CurrentUser["role"];
  hasAvatar: boolean;
};

function ProfilePage({
  currentUser,
  trainingEnabled,
  completedLessons,
  totalLessons,
  passedQuizzes,
  totalQuizzes,
  isProgressLoading,
  progressError,
  onRetryProgress,
}: {
  currentUser: CurrentUser;
  trainingEnabled: boolean;
  completedLessons: number;
  totalLessons: number;
  passedQuizzes: number;
  totalQuizzes: number;
  isProgressLoading: boolean;
  progressError: string;
  onRetryProgress: () => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<OwnProfile>({
    username: currentUser.username,
    lastName: currentUser.lastName,
    firstName: currentUser.firstName,
    middleName: currentUser.middleName,
    phone: "",
    email: "",
    position: "",
    role: currentUser.role,
    hasAvatar: Boolean(currentUser.hasAvatar),
  });
  const [savedProfile, setSavedProfile] = useState<OwnProfile | null>(null);
  const [avatarChange, setAvatarChange] = useState<string | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить профиль.");
        return response.json() as Promise<OwnProfile>;
      })
      .then((result) => {
        if (!cancelled) {
          setProfile(result);
          setSavedProfile(result);
        }
      })
      .catch((error) => { if (!cancelled) setProfileError(error instanceof Error ? error.message : "Не удалось загрузить профиль."); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [profileLoadAttempt]);

  function retryProfileLoad() {
    setIsLoading(true);
    setProfileError("");
    setProfileLoadAttempt((attempt) => attempt + 1);
  }

  const displayName = [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(" ") || profile.username;
  const initials = [profile.lastName, profile.firstName].filter(Boolean).map((part) => part[0]).join("").toUpperCase() || profile.username.slice(0, 2).toUpperCase();
  const avatarSource = avatarChange === null ? "" : avatarChange || (profile.hasAvatar ? "/api/me/avatar" : "");
  const learningProgress = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;

  function updateProfile(field: keyof Pick<OwnProfile, "username" | "lastName" | "firstName" | "middleName" | "phone" | "email">, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    setProfileError("");
    setProfileNotice("");
  }

  function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setProfileError("Выберите фотографию PNG, JPEG или WebP размером до 1 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarChange(reader.result);
        void persistProfile(reader.result, "Фотография сохранена.");
      }
    };
    reader.readAsDataURL(file);
  }

  function cancelProfileEdit() {
    if (savedProfile) setProfile(savedProfile);
    setAvatarChange(undefined);
    setProfileError("");
    setProfileNotice("");
    setIsEditingProfile(false);
  }

  async function persistProfile(avatar: string | null | undefined, successMessage: string) {
    if (!isRussianPhone(profile.phone)) {
      setProfileError("Введите российский номер: 10 цифр после +7.");
      return;
    }
    setIsSaving(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profile.username,
          lastName: profile.lastName,
          firstName: profile.firstName,
          middleName: profile.middleName,
          phone: profile.phone,
          email: profile.email,
          avatar,
        }),
      });
      const result = await response.json().catch(() => null) as OwnProfile & { error?: string } | null;
      if (!response.ok || !result) throw new Error(result?.error || "Не удалось сохранить профиль.");
      setProfile(result);
      setSavedProfile(result);
      setAvatarChange(undefined);
      setProfileNotice(successMessage);
      setIsEditingProfile(false);
      router.refresh();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Не удалось сохранить профиль.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await persistProfile(avatarChange, "Профиль сохранён.");
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Новый пароль и подтверждение не совпадают.");
      return;
    }
    setIsChangingPassword(true);
    try {
      const response = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json().catch(() => null) as { error?: string; revokedSessions?: number } | null;
      if (!response.ok) throw new Error(result?.error || "Не удалось сменить пароль.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice(result?.revokedSessions ? `Пароль изменён. Завершено сеансов на других устройствах: ${result.revokedSessions}.` : "Пароль изменён.");
      setIsEditingPassword(false);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Не удалось сменить пароль.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  if (isLoading) {
    return <div className="profile-wrap profile-wrap--deck"><PageHeader title="Мой профиль" /><DataSkeleton rows={5} label="Загружаем профиль" /></div>;
  }

  if (!savedProfile && profileError) {
    return <div className="profile-wrap profile-wrap--deck"><PageHeader title="Мой профиль" /><DataLoadError message={profileError} onRetry={retryProfileLoad} /></div>;
  }

  return (
    <div className="profile-wrap profile-wrap--deck">
      <PageHeader
        className="profile-page-header"
        title="Мой профиль"
        action={<button type="button" className="control-button control-button--secondary control-button--header profile-page-edit" onClick={() => setIsEditingProfile(true)}><Icons.PencilLine aria-hidden="true" />Редактировать</button>}
      />

      <div className="profile-deck-notices" aria-live="polite">
        {profileNotice && <SaveFeedback state="success">{profileNotice}</SaveFeedback>}
        {profileError && <div className="form-error" role="alert">{profileError}</div>}
      </div>

      <div className="profile-deck-grid">
        <section className="profile-deck-card profile-deck-card--details" id="profile-details">
          <div className="profile-deck-card-head"><h2>Личные данные</h2><span className="profile-page-avatar-wrap">{avatarSource
            // eslint-disable-next-line @next/next/no-img-element -- The image can be a local preview before it is uploaded.
            ? <img className="profile-page-avatar" src={avatarSource} alt="Фотография профиля" />
            : <span className="profile-page-avatar" aria-hidden="true">{initials}</span>}<label className="profile-page-avatar-edit" aria-label="Изменить фотографию" title="Изменить фотографию"><Icons.Camera aria-hidden="true" /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectAvatar} /></label></span></div>
          {isEditingProfile ? (
            <form className="profile-deck-form" onSubmit={saveProfile}>
              <div className="form-grid form-grid--3">
                <Field label="Фамилия" value={profile.lastName} onChange={(value) => updateProfile("lastName", value)} placeholder="Иванов" />
                <Field label="Имя" value={profile.firstName} onChange={(value) => updateProfile("firstName", value)} placeholder="Иван" />
                <Field label="Отчество" value={profile.middleName} onChange={(value) => updateProfile("middleName", value)} placeholder="Иванович" />
              </div>
              <div className="form-grid form-grid--2">
                <PhoneField value={profile.phone} onChange={(value) => updateProfile("phone", value)} />
                <Field label="Email" value={profile.email} onChange={(value) => updateProfile("email", value)} placeholder="name@example.ru" type="email" />
              </div>
              <div className="profile-deck-actions">
                {(avatarSource || profile.hasAvatar) && <button type="button" className="profile-deck-remove-photo" onClick={() => setAvatarChange(null)}>Удалить фото</button>}
                <button type="button" className="profile-deck-card-action" onClick={cancelProfileEdit}>Отмена</button>
                <button type="submit" className="btn-save" disabled={isSaving || isLoading}>{isSaving ? "Сохраняем…" : "Сохранить"}</button>
              </div>
            </form>
          ) : (
            <>
              <dl className="profile-deck-definition profile-deck-definition--summary">
                <div><dt>ФИО</dt><dd>{displayName}</dd></div>
                <div><dt>Телефон</dt><dd>{profile.phone || "Не указан"}</dd></div>
                <div><dt>Email</dt><dd>{profile.email || "Не указан"}</dd></div>
              </dl>
              <button type="button" className="profile-deck-card-action" onClick={() => setIsEditingProfile(true)}>Изменить</button>
            </>
          )}
        </section>

        <section className="profile-deck-card profile-deck-card--security">
          <div className="profile-deck-card-head"><h2>Безопасность</h2><Icons.KeyRound aria-hidden="true" /></div>
          {passwordError && <div className="form-error" role="alert">{passwordError}</div>}
          {passwordNotice && <SaveFeedback state="success">{passwordNotice}</SaveFeedback>}
          {isEditingPassword ? (
            <form className="profile-deck-form" onSubmit={changePassword}>
              <Field label="Текущий пароль" value={currentPassword} onChange={setCurrentPassword} type="password" required />
              <Field label="Новый пароль" value={newPassword} onChange={setNewPassword} type="password" placeholder="Не менее 12 символов" required />
              <Field label="Подтвердите новый пароль" value={confirmPassword} onChange={setConfirmPassword} type="password" required />
              <div className="profile-deck-actions"><button type="button" className="profile-deck-card-action" onClick={() => setIsEditingPassword(false)}>Отмена</button><button type="submit" className="btn-save" disabled={isChangingPassword}>{isChangingPassword ? "Меняем пароль…" : "Сменить пароль"}</button></div>
            </form>
          ) : (
            <>
              <dl className="profile-deck-definition profile-deck-definition--summary"><div><dt>Пароль</dt><dd>••••••••••••</dd></div></dl>
              <button type="button" className="profile-deck-card-action" onClick={() => setIsEditingPassword(true)}>Сменить пароль</button>
            </>
          )}
        </section>

        <section className="profile-deck-card profile-deck-card--account">
          <div className="profile-deck-card-head"><h2>Учётная запись</h2><Icons.UserCog aria-hidden="true" /></div>
          {isEditingProfile ? (
            <form className="profile-deck-form" onSubmit={saveProfile}>
              <Field label="Логин" value={profile.username} onChange={(value) => updateProfile("username", value)} placeholder="ivanov" required />
              <dl className="profile-deck-definition">
                <div><dt>Роль</dt><dd>{roleTitle(accessRoleByDatabaseRole[profile.role])}</dd></div>
                <div><dt>Должность</dt><dd>{profile.position || "Не указана"}</dd></div>
              </dl>
              <div className="profile-deck-actions"><button type="button" className="profile-deck-card-action" onClick={cancelProfileEdit}>Отмена</button><button type="submit" className="btn-save" disabled={isSaving || isLoading}>{isSaving ? "Сохраняем…" : "Сохранить"}</button></div>
            </form>
          ) : (
            <>
              <dl className="profile-deck-definition profile-deck-definition--summary">
                <div><dt>Логин</dt><dd>{profile.username}</dd></div>
                <div><dt>Роль</dt><dd>{roleTitle(accessRoleByDatabaseRole[profile.role])}</dd></div>
                <div><dt>Должность</dt><dd>{profile.position || "Не указана"}</dd></div>
              </dl>
              <button type="button" className="profile-deck-card-action" onClick={() => setIsEditingProfile(true)}>Изменить</button>
            </>
          )}
        </section>

        <section className="profile-deck-card profile-deck-card--learning">
          <div className="profile-deck-card-head"><h2>Обучение</h2><Icons.GraduationCap aria-hidden="true" /></div>
          {isProgressLoading ? <DataSkeleton rows={3} /> : progressError ? <DataLoadError message={progressError} onRetry={onRetryProgress} /> : trainingEnabled ? (
            <>
              <div className="profile-deck-learning-progress">
                <strong>{learningProgress}%</strong>
                <div className="profile-deck-progress-track" role="progressbar" aria-label="Прогресс обучения" aria-valuemin={0} aria-valuemax={100} aria-valuenow={learningProgress}>
                  <span style={{ width: `${learningProgress}%` }} />
                </div>
              </div>
              <div className="profile-deck-learning-stats">
                <div><strong>{completedLessons} / {totalLessons}</strong><span>Уроки</span></div>
                <div><strong>{passedQuizzes} / {totalQuizzes}</strong><span>Тесты</span></div>
              </div>
              <Link className="profile-learning-link" href="/training/basic">Перейти к обучению<Icons.ArrowRight aria-hidden="true" /></Link>
            </>
          ) : (
            <p className="profile-learning-empty">Обучение не назначено</p>
          )}
        </section>
      </div>
    </div>
  );
}

function emptyEmployee(): Employee {
  return {
    id: "",
    lastName: "",
    firstName: "",
    middleName: "",
    position: "",
    phone: "",
    email: "",
    username: "",
    password: "",
    role: "manager",
    managerId: "",
    managerName: "",
    hireDate: "",
    isActive: true,
    createdAt: "",
    learningProgress: 0,
    lastLearningActivityAt: null,
    trainingDueDate: "",
    lastReminderAt: null,
    trainingAccess: { method: "EXPRESS_TRAINING", state: "TRAINEE", trialModuleId: 23, reviewRequestedAt: null, reviewedAt: null, decisionComment: "" },
  };
}

function EmployeesPage({
  employees,
  setEmployees,
  canManage,
  onEmployeeDeleted,
  isLoading,
  loadError,
  onRetry,
}: {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  canManage: boolean;
  onEmployeeDeleted: (employeeId: string, nextEmployeeId: string) => void;
  isLoading: boolean;
  loadError: string;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState<Employee>(() => emptyEmployee());
  const [editingId, setEditingId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isEmployeeEditorOpen, setIsEmployeeEditorOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Employee["role"]>("all");
  const [accountFilter, setAccountFilter] = useState<"all" | "active" | "inactive">("all");
  const [activityFilter, setActivityFilter] = useState<"all" | "recent" | "none">("all");
  const [progressFilter, setProgressFilter] = useState<"all" | "not_started" | "behind" | "in_progress" | "completed">("all");
  const [sortBy, setSortBy] = useState<"name" | "behind" | "recent" | "inactive">("name");
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const employeeEditorRef = useRef<HTMLDialogElement>(null);

  const activeFilterCount = [roleFilter !== "all", accountFilter !== "all", activityFilter !== "all", progressFilter !== "all"].filter(Boolean).length;
  const [recentActivityThreshold] = useState(() => Date.now() - 14 * 24 * 60 * 60 * 1000);
  const filteredEmployees = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru-RU");
    const activityTime = (employee: Employee) => employee.lastLearningActivityAt ? new Date(employee.lastLearningActivityAt).getTime() : 0;
    const hasRecentActivity = (employee: Employee) => activityTime(employee) >= recentActivityThreshold;
    const hasNoRecentActivity = (employee: Employee) => !activityTime(employee) || !hasRecentActivity(employee);

    return employees
      .filter((employee) => {
        const searchable = `${employeeDisplayName(employee)} ${employee.username}`.toLocaleLowerCase("ru-RU");
        if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
        if (roleFilter !== "all" && employee.role !== roleFilter) return false;
        if (accountFilter === "active" && !employee.isActive) return false;
        if (accountFilter === "inactive" && employee.isActive) return false;
        if (activityFilter === "recent" && !hasRecentActivity(employee)) return false;
        if (activityFilter === "none" && !hasNoRecentActivity(employee)) return false;
        if (progressFilter === "not_started" && employee.learningProgress !== 0) return false;
        if (progressFilter === "behind" && (employee.learningProgress === 0 || employee.learningProgress >= 50)) return false;
        if (progressFilter === "in_progress" && (employee.learningProgress < 50 || employee.learningProgress >= 100)) return false;
        if (progressFilter === "completed" && employee.learningProgress < 100) return false;
        return true;
      })
      .sort((left, right) => {
        if (sortBy === "behind") {
          return left.learningProgress - right.learningProgress || activityTime(left) - activityTime(right) || employeeDisplayName(left).localeCompare(employeeDisplayName(right), "ru");
        }
        if (sortBy === "recent") {
          return activityTime(right) - activityTime(left) || employeeDisplayName(left).localeCompare(employeeDisplayName(right), "ru");
        }
        if (sortBy === "inactive") {
          const leftNoActivity = Number(!activityTime(left));
          const rightNoActivity = Number(!activityTime(right));
          return rightNoActivity - leftNoActivity || activityTime(left) - activityTime(right) || employeeDisplayName(left).localeCompare(employeeDisplayName(right), "ru");
        }
        return employeeDisplayName(left).localeCompare(employeeDisplayName(right), "ru");
      });
  }, [accountFilter, activityFilter, employees, progressFilter, recentActivityThreshold, roleFilter, searchQuery, sortBy]);

  function activityLabel(employee: Employee) {
    if (!employee.lastLearningActivityAt) return "Учебной активности пока нет";
    return `Учился ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(employee.lastLearningActivityAt))}`;
  }

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (employeeToDelete && !dialog.open) dialog.showModal();
    if (!employeeToDelete && dialog.open) dialog.close();
  }, [employeeToDelete]);

  useEffect(() => {
    const dialog = employeeEditorRef.current;
    if (!dialog) return;
    if (isEmployeeEditorOpen && !dialog.open) dialog.showModal();
    if (!isEmployeeEditorOpen && dialog.open) dialog.close();
  }, [isEmployeeEditorOpen]);

  function updateDraft(field: keyof Employee, value: string | boolean) {
    setError("");
    setNotice("");
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateTrainingMethod(method: Employee["trainingAccess"]["method"]) {
    setError("");
    setNotice("");
    setDraft((current) => ({
      ...current,
      trainingAccess: {
        ...current.trainingAccess,
        method,
        state: method === "MAIN_PROGRAM" ? "FULL_ACCESS" : "TRAINEE",
        reviewRequestedAt: null,
        reviewedAt: null,
        decisionComment: "",
      },
    }));
  }

  function startCreate() {
    setEditingId("");
    setDraft(emptyEmployee());
    setError("");
    setNotice("");
    setIsEmployeeEditorOpen(true);
  }

  function closeEmployeeEditor() {
    if (isSavingEmployee) return;
    setIsEmployeeEditorOpen(false);
    setEditingId("");
    setDraft(emptyEmployee());
    setError("");
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setDraft(employee);
    setError("");
    setNotice("");
    setIsEmployeeEditorOpen(true);
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault();
    const normalizedUsername = draft.username.trim();
    const normalizedEmail = draft.email.trim().toLowerCase();
    if (draft.role === "manager" && !draft.managerId) {
      setError("Для менеджера выберите руководителя.");
      return;
    }
    if (!normalizedUsername) {
      setError("Укажите логин сотрудника.");
      return;
    }
    if ((!editingId && draft.password.trim().length < 12) || (editingId && draft.password && draft.password.trim().length < 12)) {
      setError("Пароль должен быть не короче 12 символов.");
      return;
    }
    const usernameTaken = employees.some(
      (employee) => employee.id !== editingId && employee.username.trim().toLowerCase() === normalizedUsername.toLowerCase(),
    );
    if (usernameTaken) {
      setError("Сотрудник с таким логином уже есть.");
      return;
    }
    if (normalizedEmail) {
      const emailTaken = employees.some(
        (employee) => employee.id !== editingId && employee.email.trim().toLowerCase() === normalizedEmail,
      );
      if (emailTaken) {
        setError("Сотрудник с такой почтой уже есть.");
        return;
      }
    }

    const newId = editingId || crypto.randomUUID();
    const previousMethod = editingId ? employees.find((employee) => employee.id === editingId)?.trainingAccess.method : undefined;
    if (previousMethod && previousMethod !== draft.trainingAccess.method && !window.confirm("Изменить метод обучения? Текущий маршрут будет заменён, а история прохождения сохранится.")) return;
    const prepared: Employee = {
      ...draft,
      id: newId,
      username: normalizedUsername,
      email: normalizedEmail,
      password: draft.password.trim(),
      lastName: draft.lastName.trim(),
      firstName: draft.firstName.trim(),
      middleName: draft.middleName.trim(),
      position: draft.position.trim(),
      phone: draft.phone.trim(),
      managerName: employees.find((employee) => employee.id === draft.managerId) ? employeeDisplayName(employees.find((employee) => employee.id === draft.managerId)!) : "",
      hireDate: draft.hireDate,
      createdAt: draft.createdAt || new Date().toISOString(),
    };

    const role: Record<Employee["role"], CurrentUser["role"]> = { admin: "ADMIN", rop: "ROP", knowledge_editor: "KNOWLEDGE_EDITOR", manager: "MANAGER" };
    const payload = { ...prepared, role: role[prepared.role], trainingMethod: prepared.trainingAccess.method };
    setIsSavingEmployee(true);
    try {
      const response = await fetch(editingId ? `/api/admin/users/${editingId}` : "/api/admin/users", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; id?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Не удалось сохранить сотрудника.");
      if (editingId) {
        setEmployees((current) => current.map((employee) => employee.id === editingId ? { ...prepared, password: "" } : employee));
      } else {
        const created = result as { id: string };
        setEmployees((current) => [{ ...prepared, id: created.id, password: "" }, ...current]);
      }
      setNotice(editingId ? "Данные сотрудника обновлены." : "Сотрудник добавлен.");
      setEditingId("");
      setDraft(emptyEmployee());
      setIsEmployeeEditorOpen(false);
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : "Не удалось сохранить сотрудника.");
    } finally {
      setIsSavingEmployee(false);
    }
  }

  async function toggleEmployee(employee: Employee) {
    const role: Record<Employee["role"], CurrentUser["role"]> = { admin: "ADMIN", rop: "ROP", knowledge_editor: "KNOWLEDGE_EDITOR", manager: "MANAGER" };
    const response = await fetch(`/api/admin/users/${employee.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...employee, password: "", role: role[employee.role], isActive: !employee.isActive }),
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { setError(result?.error || "Не удалось изменить статус сотрудника."); return; }
    setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, isActive: !item.isActive } : item));
    setNotice(employee.isActive ? "Сотрудник отключён." : "Сотрудник включён.");
  }

  function requestEmployeeDelete(employee: Employee) {
    const activeAdmins = employees.filter((item) => item.isActive && item.role === "admin").length;
    if (employee.role === "admin" && activeAdmins <= 1) {
      setError("Нельзя удалить последнего активного администратора.");
      return;
    }
    setError("");
    setNotice("");
    setDeleteError("");
    setEmployeeToDelete(employee);
  }

  function closeDeleteDialog() {
    if (isDeleting) return;
    setEmployeeToDelete(null);
    setDeleteError("");
  }

  async function deleteEmployee() {
    if (!employeeToDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    const employee = employeeToDelete;
    try {
      const response = await fetch(`/api/admin/users/${employee.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Не удалось удалить сотрудника.");
      const nextEmployees = employees.filter((item) => item.id !== employee.id);
      const nextEmployeeId = nextEmployees[0]?.id || "";
      setEmployees(nextEmployees);
      if (nextEmployeeId) onEmployeeDeleted(employee.id, nextEmployeeId);
      if (editingId === employee.id) closeEmployeeEditor();
      setEmployeeToDelete(null);
      setNotice("Сотрудник удалён.");
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Не удалось удалить сотрудника.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="employees-wrap">
      <PageHeader
        className="employees-head employees-head--compact page-header--compact-action"
        copyClassName="employees-head-copy"
        titleClassName="employees-title"
        title="Сотрудники"
        action={canManage ? <button type="button" className="control-button control-button--primary control-button--header employees-add employees-add--header" onClick={startCreate} aria-label="Добавить сотрудника"><Icons.Plus aria-hidden="true" /><span>Добавить</span></button> : undefined}
      />

      {!isEmployeeEditorOpen && error && <div className="alert alert-error"><Icons.CircleAlert />{error}</div>}
      {notice && <SaveFeedback state="success">{notice}</SaveFeedback>}

      {isLoading ? <DataSkeleton rows={6} /> : loadError ? <DataLoadError message={loadError} onRetry={onRetry} /> : <div className="employees-layout employees-layout--directory">
        {canManage && (
          <dialog
            className="employee-editor-dialog"
            ref={employeeEditorRef}
            aria-labelledby="employee-editor-title"
            onCancel={(event) => { event.preventDefault(); closeEmployeeEditor(); }}
            onClick={(event) => { if (event.target === event.currentTarget) closeEmployeeEditor(); }}
          >
          <section className="employee-form-card employee-editor-panel">
          <div className="employee-form-head">
            <div>
              <p className="employee-editor-kicker">Карточка сотрудника</p>
              <h2 id="employee-editor-title">{editingId ? "Редактировать сотрудника" : "Новый сотрудник"}</h2>
            </div>
            <button type="button" className="icon-btn" onClick={closeEmployeeEditor} aria-label="Закрыть карточку сотрудника"><Icons.X /></button>
          </div>

          <form className="employee-form" onSubmit={saveEmployee}>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="form-section-label">Личные данные</div>
            <div className="form-grid form-grid--3">
              <Field label="Фамилия" value={draft.lastName} onChange={(value) => updateDraft("lastName", value)} placeholder="Иванов" />
              <Field label="Имя" value={draft.firstName} onChange={(value) => updateDraft("firstName", value)} placeholder="Иван" />
              <Field label="Отчество" value={draft.middleName} onChange={(value) => updateDraft("middleName", value)} placeholder="Иванович" />
            </div>
            <Field label="Должность" value={draft.position} onChange={(value) => updateDraft("position", value)} placeholder="Менеджер отдела продаж" />

            <div className="form-section-label">Контакты</div>
            <div className="form-grid form-grid--2">
              <PhoneField value={draft.phone} onChange={(value) => updateDraft("phone", value)} />
              <Field label="Email" value={draft.email} onChange={(value) => updateDraft("email", value)} placeholder="employee@example.ru" type="email" />
            </div>
            <Field label="Дата приёма" value={draft.hireDate} onChange={(value) => updateDraft("hireDate", value)} type="date" />

            <div className="form-section-label">Доступ в систему</div>
            <div className="form-grid form-grid--2">
              <Field label="Логин" value={draft.username} onChange={(value) => updateDraft("username", value)} placeholder="ivanov" required />
              <Field label="Пароль" value={draft.password} onChange={(value) => updateDraft("password", value)} placeholder={editingId ? "Оставьте пустым, чтобы не менять" : "Минимум 12 символов"} required={!editingId} />
            </div>
            <div className="form-field">
              <span>Роль</span>
              <SelectMenu
                value={draft.role}
                ariaLabel="Роль сотрудника"
                options={accessRoles.map((role) => ({ value: role.key, label: role.title }))}
                onChange={(nextRole) => {
                updateDraft("role", nextRole);
                if (nextRole !== "manager") updateDraft("managerId", "");
                }}
              />
            </div>
            {draft.role === "manager" && <fieldset className="employee-training-method">
              <legend>Метод обучения</legend>
              <label><input type="radio" name="training-method" checked={draft.trainingAccess.method === "EXPRESS_TRAINING"} onChange={() => updateTrainingMethod("EXPRESS_TRAINING")} /><span><b>Экспресс-обучение</b><small>Сначала модуль 1, затем подтверждение итога руководителем.</small></span></label>
              <label><input type="radio" name="training-method" checked={draft.trainingAccess.method === "MAIN_PROGRAM"} onChange={() => updateTrainingMethod("MAIN_PROGRAM")} /><span><b>Основная программа</b><small>Сотрудник сразу начинает с модуля 2.</small></span></label>
            </fieldset>}
            {draft.role === "manager" && <div className="form-field">
              <span>Руководитель <b>*</b></span>
              <SelectMenu
                value={draft.managerId}
                ariaLabel="Руководитель менеджера"
                options={[
                  { value: "", label: "Выберите руководителя", disabled: true },
                  ...employees
                  .filter((employee) => employee.id !== draft.id && employee.isActive && employee.role === "rop")
                  .map((employee) => ({ value: employee.id, label: employeeDisplayName(employee) })),
                ]}
                onChange={(managerId) => updateDraft("managerId", managerId)}
              />
            </div>}
            <label className="employee-checkbox">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => updateDraft("isActive", event.target.checked)}
              />
              <span>Сотрудник активен и может входить в систему</span>
            </label>

            <div className="employee-form-actions">
              <button type="submit" className="btn-save" disabled={isSavingEmployee}>{isSavingEmployee ? "Сохраняем…" : editingId ? "Сохранить изменения" : "Создать сотрудника"}</button>
              <button type="button" className="btn-cancel" onClick={editingId ? closeEmployeeEditor : startCreate} disabled={isSavingEmployee}>{editingId ? "Отмена" : "Очистить"}</button>
            </div>
          </form>
          </section>
          </dialog>
        )}

        <section className="employees-list data-grid data-grid--directory">
          <div className="employees-toolbar data-grid__toolbar" aria-label="Поиск, фильтрация и сортировка сотрудников">
            <label className="employees-search">
              <Icons.Search aria-hidden="true" />
              <span className="sr-only">Поиск по имени или логину</span>
              <input className="control-field control-field--rail" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Найти по имени или логину" type="search" />
            </label>
            <div className="employees-sort"><span className="sr-only">Сортировка</span><SelectMenu className="select-menu--rail" value={sortBy} onChange={setSortBy} ariaLabel="Сортировка сотрудников" icon={<Icons.ArrowDownUp />} options={[{ value: "name", label: "По имени" }, { value: "behind", label: "Сначала отстающие" }, { value: "recent", label: "Недавно активные" }, { value: "inactive", label: "Без активности" }]} /></div>
            <button type="button" className={`control-button control-button--secondary control-button--rail employees-filter-toggle ${isFiltersOpen ? "is-open" : ""}`} onClick={() => setIsFiltersOpen((current) => !current)} aria-label={activeFilterCount ? `Фильтры сотрудников: активно ${activeFilterCount}` : "Фильтры сотрудников"} aria-expanded={isFiltersOpen} aria-controls="employee-filters">
              <Icons.SlidersHorizontal aria-hidden="true" />Фильтры{activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
          </div>
          {isFiltersOpen && <div className="employees-filters data-grid__filters" id="employee-filters" role="group" aria-label="Фильтры сотрудников">
            <div className="employees-filter"><span>Роль</span><SelectMenu value={roleFilter} onChange={setRoleFilter} ariaLabel="Фильтр по роли" options={[{ value: "all", label: "Все роли" }, ...accessRoles.map((role) => ({ value: role.key, label: role.title }))]} /></div>
            <div className="employees-filter"><span>Доступ</span><SelectMenu value={accountFilter} onChange={setAccountFilter} ariaLabel="Фильтр по доступу" options={[{ value: "all", label: "Все" }, { value: "active", label: "Активные" }, { value: "inactive", label: "Отключённые" }]} /></div>
            <div className="employees-filter"><span>Учебная активность</span><SelectMenu value={activityFilter} onChange={setActivityFilter} ariaLabel="Фильтр по учебной активности" options={[{ value: "all", label: "Любая" }, { value: "recent", label: "За последние 14 дней" }, { value: "none", label: "Нет за 14 дней" }]} /></div>
            <div className="employees-filter"><span>Прогресс</span><SelectMenu value={progressFilter} onChange={setProgressFilter} ariaLabel="Фильтр по прогрессу" options={[{ value: "all", label: "Любой" }, { value: "not_started", label: "Не начал" }, { value: "behind", label: "Отстаёт: 1–49%" }, { value: "in_progress", label: "В процессе: 50–99%" }, { value: "completed", label: "Завершил: 100%" }]} /></div>
            {activeFilterCount > 0 && <button type="button" className="employees-reset" onClick={() => { setRoleFilter("all"); setAccountFilter("all"); setActivityFilter("all"); setProgressFilter("all"); }}>Сбросить фильтры</button>}
          </div>}
          <div className="staff-grid data-grid__surface" role="list" aria-label="Список сотрудников">
            <div className="staff-grid-head" aria-hidden="true"><span>Сотрудник</span><span>Роль</span><span>Доступ</span><span>Обучение</span><span /></div>
            {filteredEmployees.map((employee) => (
              <article className={`staff-card data-grid__row ${editingId === employee.id ? "is-editing" : ""}`} key={employee.id} role="listitem">
                <div className="staff-card-top">
                  <div className={`staff-avatar staff-avatar--${employee.role}`}>{employeeInitials(employee)}</div>
                  <div className="staff-main">
                    <div className="staff-name" title={employeeDisplayName(employee)}>{employeeDisplayName(employee)}</div>
                    {employee.position && <div className="staff-pos" title={employee.position}>{employee.position}</div>}
                  </div>
                </div>

                <div className="staff-role"><span className="staff-cell-label">Роль</span><span className={`role-badge role-${employee.role}`}>{roleTitle(employee.role)}</span></div>

                <div className="staff-info">
                  <span className="staff-cell-label">Доступ</span>
                  <span className={`staff-status ${employee.isActive ? "staff-status--on" : "staff-status--off"}`}>
                    {employee.isActive ? "Активен" : "Отключён"}
                  </span>
                </div>

                <div className="staff-learning">
                  <span className="staff-cell-label">Обучение</span>
                  <div className="staff-learning-head"><span className="sr-only">Прогресс обучения</span><strong>{employee.learningProgress}%</strong></div>
                  <div className="staff-learning-track" role="progressbar" aria-label={`Прогресс обучения: ${employee.learningProgress}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={employee.learningProgress}><span style={{ width: `${employee.learningProgress}%` }} /></div>
                  {employee.lastLearningActivityAt && <div className="staff-learning-activity"><Icons.Activity aria-hidden="true" />{activityLabel(employee)}</div>}
                </div>

                <div className="staff-actions">
                  {canManage && <div className="staff-action-menu data-grid__action-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpenActionMenuId(""); }} onKeyDown={(event) => { if (event.key === "Escape") { setOpenActionMenuId(""); event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus(); } }}>
                    <button type="button" className="control-button control-button--secondary control-button--icon staff-action-icon" onClick={() => setOpenActionMenuId((current) => current === employee.id ? "" : employee.id)} aria-label={`Действия: ${employeeDisplayName(employee)}`} aria-haspopup="menu" aria-controls={`employee-actions-${employee.id}`} aria-expanded={openActionMenuId === employee.id}><Icons.MoreHorizontal /></button>
                    {openActionMenuId === employee.id && <div className="staff-action-popover data-grid__action-popover" id={`employee-actions-${employee.id}`} role="menu">
                      <button type="button" role="menuitem" onClick={() => { setOpenActionMenuId(""); startEdit(employee); }}><Icons.Pencil aria-hidden="true" />Редактировать</button>
                      <button type="button" role="menuitem" onClick={() => { setOpenActionMenuId(""); void toggleEmployee(employee); }}><Icons.Power aria-hidden="true" />{employee.isActive ? "Отключить" : "Включить"}</button>
                      <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenActionMenuId(""); requestEmployeeDelete(employee); }}><Icons.Trash2 aria-hidden="true" />Удалить</button>
                    </div>}
                  </div>}
                </div>
              </article>
            ))}
            {!filteredEmployees.length && <DataEmptyState title="Никого не нашли" description="Измените запрос или снимите часть фильтров." />}
          </div>
        </section>
      </div>}
      <dialog
        className="delete-employee-dialog"
        ref={deleteDialogRef}
        aria-labelledby="delete-employee-title"
        onCancel={(event) => { event.preventDefault(); closeDeleteDialog(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeDeleteDialog(); }}
      >
        <div className="delete-employee-dialog__icon"><Icons.TriangleAlert aria-hidden="true" /></div>
        <h2 id="delete-employee-title">Удалить сотрудника?</h2>
        {employeeToDelete && (
          <p>
            Будет удалена учётная запись <strong>{employeeDisplayName(employeeToDelete)}</strong> ({employeeToDelete.username}).
          </p>
        )}
        <p className="delete-employee-dialog__warning">Действие необратимо: будут удалены доступ в систему, активные сессии и история обучения сотрудника.</p>
        {deleteError && <div className="form-error" role="alert">{deleteError}</div>}
        <div className="delete-employee-dialog__actions">
          <button type="button" className="btn-cancel" onClick={closeDeleteDialog} disabled={isDeleting}>Отмена</button>
          <button type="button" className="danger-btn" onClick={() => void deleteEmployee()} disabled={isDeleting}>
            {isDeleting ? "Удаляем…" : "Удалить сотрудника"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="form-field">
      <span>{label}{required && <b> *</b>}</span>
      <input
        className="control-field"
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PhoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="form-field">
      <span>Телефон</span>
      <input
        className="control-field"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={formatRussianPhone(value)}
        placeholder="+7 (999) 123-45-67"
        onChange={(event) => onChange(normalizeRussianPhone(event.target.value))}
      />
    </label>
  );
}

type SelectMenuOption<T extends string | number> = {
  value: T;
  label: string;
  disabled?: boolean;
};

function SelectMenu<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  icon,
}: {
  value: T;
  options: readonly SelectMenuOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) || options[0];
  const enabledOptions = options.filter((option) => !option.disabled);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const focusFrame = window.requestAnimationFrame(() => {
      const selectedButton = listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${String(value)}"]`);
      const firstButton = listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      (selectedButton || firstButton)?.focus();
    });
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, value]);

  function closeAndFocusTrigger() {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function focusOption(fromValue: T, step: number) {
    const index = Math.max(0, enabledOptions.findIndex((option) => option.value === fromValue));
    const nextIndex = (index + step + enabledOptions.length) % enabledOptions.length;
    const next = enabledOptions[nextIndex];
    listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${String(next.value)}"]`)?.focus();
  }

  return (
    <div
      className={`select-menu ${className}`.trim()}
      ref={rootRef}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false); }}
    >
      <button
        type="button"
        className="select-menu__trigger"
        ref={triggerRef}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        {icon && <span className="select-menu__leading-icon" aria-hidden="true">{icon}</span>}
        <span className="select-menu__value">{selected?.label}</span>
        <Icons.ChevronDown className="select-menu__chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="select-menu__popover" id={listId} ref={listRef} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                role="option"
                key={String(option.value)}
                data-value={String(option.value)}
                className={`select-menu__option ${isSelected ? "is-selected" : ""}`.trim()}
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => { onChange(option.value); closeAndFocusTrigger(); }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); focusOption(option.value, 1); }
                  if (event.key === "ArrowUp") { event.preventDefault(); focusOption(option.value, -1); }
                  if (event.key === "Home") { event.preventDefault(); focusOption(enabledOptions[0]?.value ?? option.value, 0); }
                  if (event.key === "End") { event.preventDefault(); focusOption(enabledOptions[enabledOptions.length - 1]?.value ?? option.value, 0); }
                  if (event.key === "Escape") { event.preventDefault(); closeAndFocusTrigger(); }
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Icons.Check aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccessRightsPage() {
  const [settings, setSettings] = useState<AccessSettings>(copyDefaultAccessSettings);
  const [savedSettings, setSavedSettings] = useState<AccessSettings>(copyDefaultAccessSettings);
  const [savedAt, setSavedAt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedRoleKey, setSelectedRoleKey] = useState<AccessRole["key"]>("manager");
  const selectedRole = accessRoles.find((role) => role.key === selectedRoleKey) || accessRoles[0];
  const isDirty = !accessSettingsEqual(settings, savedSettings);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/permissions", { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить матрицу прав.");
      const records = await response.json() as Array<{ role: CurrentUser["role"]; permission: string; allowed: boolean }>;
      const next = copyDefaultAccessSettings();
      for (const record of records) {
        const role = accessRoleByDatabaseRole[record.role];
        if (role && record.permission in next[role]) next[role][record.permission] = record.allowed;
      }
      accessGroups.forEach((group) => group.permissions.forEach((permission) => {
        next.admin[permission.key] = true;
      }));
      setSettings(next);
      setSavedSettings(next);
      setSavedAt("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить матрицу прав.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadSettings]);

  useEffect(() => {
    if (!isDirty) return;

    const warning = "Есть несохранённые изменения прав. Уйти со страницы без сохранения?";
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleNavigationClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (!window.confirm(warning)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleNavigationClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleNavigationClick, true);
    };
  }, [isDirty]);

  function togglePermission(role: AccessRole, permission: AccessPermission) {
    if (role.key === "admin") return;
    setSavedAt("");
    setError("");
    setSettings((current) => ({
      ...current,
      [role.key]: {
        ...current[role.key],
        [permission.key]: !current[role.key]?.[permission.key],
      },
    }));
  }

  async function saveSettings() {
    setIsSaving(true);
    setError("");
    try {
      const databaseSettings = Object.fromEntries(
        accessRoles.map((role) => [databaseRoleByAccessRole[role.key], settings[role.key]]),
      );
      const response = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: databaseSettings }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Не удалось сохранить права.");
      setSavedSettings(settings);
      setSavedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить права.");
    } finally {
      setIsSaving(false);
    }
  }

  function loadCurrentSettings() {
    if (isDirty && !window.confirm("Несохранённые изменения будут заменены текущими правами с сервера. Продолжить?")) return;
    setIsLoading(true);
    setError("");
    void loadSettings();
  }

  return (
    <div className="settings-wrap access-settings-wrap">
      <PageHeader
        className="access-toolbar"
        title="Права пользователей"
        actionClassName="access-toolbar-actions"
        action={<>
          {(savedAt || isLoading || isDirty) && (
            <SaveFeedback state={isLoading ? "saving" : isDirty ? "dirty" : "success"}>
              {isLoading ? "Загружаем права…" : isDirty ? "Есть несохранённые изменения" : `Сохранено · ${savedAt}`}
            </SaveFeedback>
          )}
          <button type="button" className="control-button control-button--primary control-button--header" onClick={() => void saveSettings()} disabled={isSaving || isLoading || !isDirty}>{isSaving ? "Сохраняем…" : "Сохранить"}</button>
        </>}
      />
      <section className="settings-card access-settings-card">
        <div className="card-body access-card-body">
          {isLoading ? <DataSkeleton rows={7} label="Загружаем права пользователей" /> : error ? <DataLoadError message={error} onRetry={loadCurrentSettings} /> : <>
          <div className="access-mobile-editor">
            <div className="access-mobile-role-select">
              <span>Роль</span>
              <SelectMenu value={selectedRole.key} onChange={setSelectedRoleKey} ariaLabel="Роль для редактирования прав" options={accessRoles.map((role) => ({ value: role.key, label: role.title }))} />
            </div>
            <p className="access-mobile-role-note">{selectedRole.key === "admin" ? "Права администратора включены постоянно." : `Настройте права для роли «${selectedRole.title}».`}</p>
            {accessGroups.map((group) => (
              <section className="access-mobile-group" key={group.title}>
                <h2>{group.title}</h2>
                <div className="access-mobile-permissions">
                  {group.permissions.map((permission) => {
                    const enabled = Boolean(settings[selectedRole.key]?.[permission.key]);
                    const isAdmin = selectedRole.key === "admin";
                    return (
                      <div className="access-mobile-permission" key={permission.key}>
                        <span>{permission.title}</span>
                        <label className={`switch-control control-switch-touch ${isAdmin ? "is-disabled" : ""}`}>
              <input
                            type="checkbox"
                            checked={enabled || isAdmin}
                            disabled={isAdmin}
                            aria-label={`Разрешение «${permission.title}» для роли «${selectedRole.title}»`}
                            onChange={() => togglePermission(selectedRole, permission)}
                          />
                          <span className="switch" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="access-desktop-matrix data-grid data-grid--matrix data-grid__surface">
            <table className="access-desktop-table">
              <colgroup>
                <col className="access-desktop-table__permission-column" />
                {accessRoles.map((role) => <col className="access-desktop-table__role-column" key={role.key} />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Право</th>
                  {accessRoles.map((role) => <th scope="col" key={role.key}>{role.title}</th>)}
                </tr>
              </thead>
              {accessGroups.map((group) => (
                <tbody key={group.title}>
                  <tr className="access-desktop-table__group-row">
                    <th scope="colgroup" colSpan={accessRoles.length + 1}>{group.title}</th>
                  </tr>
                  {group.permissions.map((permission) => (
                    <tr key={permission.key}>
                      <th scope="row" className="access-desktop-table__permission">{permission.title}</th>
                      {accessRoles.map((role) => {
                        const enabled = Boolean(settings[role.key]?.[permission.key]);
                        const isAdmin = role.key === "admin";
                        return (
                          <td className="access-desktop-table__toggle" key={role.key}>
                            <label className={`switch-control control-switch-touch ${isAdmin ? "is-disabled" : ""}`}>
                              <input
                                type="checkbox"
                                checked={enabled || isAdmin}
                                disabled={isAdmin}
                                aria-label={`Разрешение «${permission.title}» для роли «${role.title}»`}
                                onChange={() => togglePermission(role, permission)}
                              />
                              <span className="switch" />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          </>}
        </div>
        {!isLoading && !error && <div className="access-mobile-save-bar" aria-live="polite">
          <span className={`access-mobile-save-state ${isDirty ? "is-dirty" : ""}`}>
            {isSaving ? "Сохраняем изменения…" : isDirty ? "Есть несохранённые изменения" : savedAt ? `Сохранено · ${savedAt}` : "Изменений нет"}
          </span>
          <button type="button" className="control-button control-button--primary" onClick={() => void saveSettings()} disabled={isSaving || isLoading || !isDirty}>
            {isSaving ? "Сохраняем…" : "Сохранить изменения"}
          </button>
        </div>}
      </section>
    </div>
  );
}

function Breadcrumb({ items }: { items: Array<[string, string?]> }) {
  return (
    <nav className="breadcrumb" aria-label="Навигация по разделам">
      {items.map(([label, href], index) => (
        <span className={`breadcrumb-item ${index === items.length - 1 ? "is-current" : ""}`} key={`${label}-${index}`}>
          {href ? <Link href={href}>{label}</Link> : <span>{label}</span>}
          {index < items.length - 1 && <Icons.ChevronRight aria-hidden="true" />}
        </span>
      ))}
    </nav>
  );
}

function mobilePreviewDocument(content: string) {
  return `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    * { box-sizing: border-box; } body { margin: 0; padding: 18px; color: #37475a; font: 16px/1.7 Arial, sans-serif; overflow-wrap: anywhere; }
    h2 { margin: 22px 0 10px; color: #142638; font-size: 20px; line-height: 1.3; } h3 { color: #142638; } p { margin: 0 0 14px; }
    img, svg { display: block; max-width: 100% !important; height: auto !important; } .lesson-image { margin: 18px 0; } .lesson-image img { width: 100%; border-radius: 10px; } figcaption { margin-top: 6px; color: #687b8e; font-size: 12px; }
    .lesson-callout { margin: 18px 0; padding: 14px; border-left: 3px solid #b45309; border-radius: 8px; background: #fff7ed; } .lesson-callout p { margin: 5px 0 0; }
    .lesson-table { margin: 18px 0; overflow-x: auto; } table { width: 100%; min-width: 480px; border-collapse: collapse; font-size: 13px; } th, td { border: 1px solid #d8e1e8; padding: 9px; text-align: left; vertical-align: top; } th { background: #f4f7f9; }
    .lesson-steps { display: grid; gap: 9px; margin: 18px 0; padding: 0; list-style-position: inside; } .lesson-steps li { padding: 10px; border: 1px solid #d8e1e8; border-radius: 8px; }
    .lesson-question { margin: 18px 0; padding: 14px; border: 1px solid #bcd3e4; border-radius: 10px; background: #f4f9fd; } .lesson-question p { margin: 5px 0 0; }
    .lesson-scheme { display: grid; gap: 9px; margin: 18px 0; } .lesson-scheme-card { display: grid; gap: 3px; padding: 12px; border: 1px solid #d8e1e8; border-radius: 9px; background: #f9fbfc; } .lesson-scheme-card span { color: #64748b; font-size: 13px; }
  </style></head><body>${content}</body></html>`;
}

const emptyLessonHtml = `
  <div style="text-align:center;padding:48px 24px;color:var(--i4);">
    <div style="font-size:15px;font-weight:700;color:var(--i3);margin-bottom:4px;">Контент скоро появится</div>
    <div style="font-size:13px;">Урок в процессе подготовки</div>
  </div>
`;
