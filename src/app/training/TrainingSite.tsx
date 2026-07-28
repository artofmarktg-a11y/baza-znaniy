"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { formatRussianPhone, isRussianPhone, normalizeRussianPhone } from "@/lib/phone";

type TrainingModule = {
  id: number;
  order_num: number;
  title: string;
  description: string | null;
  icon: string | null;
  gradient: string | null;
  is_active: boolean;
  parent_id: number | null;
};

type TrainingLesson = {
  id: number;
  module_id: number;
  order_num: number;
  title: string;
  content: string;
  lesson_type: string;
  duration_min: number;
};

type QuizQuestion = {
  question: string;
  options: string[];
};

type ModuleQuiz = {
  id: number;
  module_id: number;
  questions: QuizQuestion[];
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

type TrainingData = {
  title: string;
  modules: TrainingModule[];
  lessons: TrainingLesson[];
  quizzes: ModuleQuiz[];
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
  lessons: TrainingLesson[];
  quizzes: ModuleQuiz[];
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
  lesson?: TrainingLesson;
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

const IconBag = Icons as unknown as Record<string, Icons.LucideIcon>;
const expressTrainingTitle = "Экспресс-обучение: старт в продажах";

const accessRoles: AccessRole[] = [
  { key: "admin", title: "Администратор" },
  { key: "rop", title: "РОП" },
  { key: "knowledge_editor", title: "Редактор базы знаний" },
  { key: "manager", title: "Менеджер" },
];

const accessRoleCompactTitles: Record<AccessRole["key"], string> = {
  admin: "Админ",
  rop: "РОП",
  knowledge_editor: "Редактор",
  manager: "Менеджер",
};

const accessGroups: AccessGroup[] = [
  {
    title: "База знаний и обучение",
    permissions: [
      { key: "training", title: "База знаний и личный прогресс" },
      { key: "knowledge_manage", title: "Редактирование материалов" },
      { key: "team_progress_view", title: "Прогресс своей команды" },
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
    training: true, knowledge_manage: true, team_progress_view: true,
    employees_view: true, employees_manage: true, access_manage: true,
  },
  rop: {
    training: true, knowledge_manage: false, team_progress_view: true,
    employees_view: false, employees_manage: false, access_manage: false,
  },
  knowledge_editor: {
    training: true, knowledge_manage: true, team_progress_view: false,
    employees_view: true, employees_manage: false, access_manage: false,
  },
  manager: {
    training: true, knowledge_manage: false, team_progress_view: false,
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

function iconName(name?: string | null) {
  return (name || "book-open")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function TrainingIcon({ name }: { name?: string | null }) {
  const Icon = IconBag[iconName(name)] || Icons.BookOpen;
  return <Icon aria-hidden="true" />;
}

function gradient(value?: string | null) {
  return `linear-gradient(${value || "135deg,#1e3a5f,#c93232"})`;
}

function pluralLessons(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "урок";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "урока";
  return "уроков";
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

function roleTitle(roleKey: AccessRole["key"]) {
  return accessRoles.find((role) => role.key === roleKey)?.title || "Менеджер";
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
  };
}

function employeeFromApi(user: Omit<CurrentUser, "role"> & { role: CurrentUser["role"]; position: string; phone: string; email: string | null; managerId?: string; managerName?: string; isActive: boolean; hireDate: string; createdAt: string }): Employee {
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
  };
}

export default function TrainingSite({ currentUser, initialData, permissions }: { currentUser: CurrentUser; initialData: TrainingData; permissions: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const data = initialData;
  const [employees, setEmployees] = useState<Employee[]>(() => [employeeFromCurrentUser(currentUser)]);
  const [progressStore, setProgressStore] = useState<ProgressStore>(() => ({
    activeEmployeeId: currentUser.id,
    byEmployee: { [currentUser.id]: emptyProgress() },
  }));
  const canViewUsers = permissions.includes("employees_view");
  const canManageUsers = permissions.includes("employees_manage");
  const canViewTrainingProgress = permissions.includes("team_progress_view");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/progress")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load progress.");
        return response.json() as Promise<{ completedLessons: number[]; quizAttempts: Array<QuizAttempt & { moduleId: number }> }>;
      })
      .then((result) => {
        if (cancelled) return;
        const quizAttempts = result.quizAttempts.reduce<Record<string, QuizAttempt[]>>((store, attempt) => {
          const { moduleId, ...quizAttempt } = attempt;
          const attempts = store[String(moduleId)] || [];
          attempts.push(quizAttempt);
          store[String(moduleId)] = attempts;
          return store;
        }, {});
        setProgressStore({
          activeEmployeeId: currentUser.id,
          byEmployee: { [currentUser.id]: { completedLessons: result.completedLessons, quizAttempts } },
        });
      })
      .catch((error) => console.warn("Could not load server progress.", error));
    return () => { cancelled = true; };
  }, [currentUser.id]);

  useEffect(() => {
    if (!canViewUsers) return;
    void fetch("/api/admin/users")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load users.");
        return response.json() as Promise<Array<Parameters<typeof employeeFromApi>[0]>>;
      })
      .then((users) => setEmployees(users.map(employeeFromApi)))
      .catch((error) => console.warn("Could not load users.", error));
  }, [canViewUsers]);

  useEffect(() => {
    if (!canViewTrainingProgress) return;
    void fetch("/api/admin/progress")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load team progress.");
        return response.json() as Promise<{ users: Array<{
          userId: string; username: string; lastName: string; firstName: string; middleName: string; position: string; phone: string; email: string | null;
          role: CurrentUser["role"]; managerId: string; managerName: string; isActive: boolean; hireDate: string; createdAt: string;
          completedLessons: number[]; quizAttempts: Array<QuizAttempt & { moduleId: number }>;
        }> }>;
      })
      .then(({ users }) => {
        setEmployees(users.map((user) => employeeFromApi({ ...user, id: user.userId, hasAvatar: false })));
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
      })
      .catch((error) => console.warn("Could not load team progress.", error));
  }, [canViewTrainingProgress]);

  const model = useMemo(() => {
    const modules = [...data.modules].sort((a, b) => a.order_num - b.order_num || a.id - b.id);
    const lessons = [...data.lessons].sort((a, b) => a.order_num - b.order_num || a.id - b.id);
    const topModules = modules.filter((module) => module.parent_id === null);
    const byId = new Map(modules.map((module) => [module.id, module]));
    const childrenByParent = new Map<number, TrainingModule[]>();
    const lessonsByModule = new Map<number, TrainingLesson[]>();
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

  function lessonsForModule(module: TrainingModule, deep = true): TrainingLesson[] {
    const own = model.lessonsByModule.get(module.id) || [];
    if (!deep) return own;
    const children = model.childrenByParent.get(module.id) || [];
    return children.flatMap((child) => lessonsForModule(child, true)).concat(own);
  }

  function quizzesForModule(module: TrainingModule, deep = true): ModuleQuiz[] {
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

  function markLessonComplete(lesson: TrainingLesson) {
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
    void fetch("/api/progress/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId: lesson.id }),
    }).catch((error) => console.warn("Could not save lesson progress.", error));
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

  function topModuleFor(module: TrainingModule) {
    let current = module;
    while (current.parent_id !== null) {
      const parent = model.byId.get(current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return current;
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

  function visibleHomeRoute(nextStep: HomeNextStep | null) {
    const currentTopModule = nextStep ? topModuleFor(nextStep.module) : model.topModules.at(-1);
    const currentIndex = currentTopModule ? model.topModules.findIndex((module) => module.id === currentTopModule.id) : 0;
    const start = Math.max(0, currentIndex - 2);
    return model.topModules.slice(start, start + 5);
  }

  function nextAfterLesson(lesson: TrainingLesson) {
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
    if (!quiz) return;
    const response = await fetch("/api/progress/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: quiz.id, answers }),
    });
    const result = (await response.json().catch(() => null)) as QuizAttempt & { error?: string } | null;
    if (!response.ok || !result) {
      console.warn("Could not save quiz attempt.", result?.error || response.statusText);
      return;
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
    const quiz = model.quizByModule.get(id);
    if (quizModule && quiz) {
      return (
        <TrainingShell permissions={permissions} currentUser={currentUser}>
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
    if (routeModule) {
      return (
        <TrainingShell permissions={permissions} currentUser={currentUser}>
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
    const lesson = data.lessons.find((item) => item.id === id);
    const lessonModule = lesson ? model.byId.get(lesson.module_id) : undefined;
    if (lesson && lessonModule) {
      const lessonList = model.lessonsByModule.get(lessonModule.id) || [];
      const moduleStat = statFor(lessonModule, false);
      const lessonIndex = lessonList.findIndex((item) => item.id === lesson.id);
      return (
        <TrainingShell permissions={permissions} currentUser={currentUser}>
          <LessonPage
            lesson={lesson}
            module={lessonModule}
            parent={lessonModule.parent_id ? model.byId.get(lessonModule.parent_id) : undefined}
            lessonList={lessonList}
            completed={completed}
            stat={moduleStat}
            prevLesson={lessonList[lessonIndex - 1]}
            nextLesson={lessonList[lessonIndex + 1]}
            canManageContent={permissions.includes("knowledge_manage")}
            onComplete={() => {
              markLessonComplete(lesson);
              router.push(nextAfterLesson(lesson));
            }}
          />
        </TrainingShell>
      );
    }
  }

  if (pathname === "/training" || pathname === "/training/") {
    const nextStep = nextLearningStep();
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser}>
        <ManagerHome
          currentUser={currentUser}
          topModules={model.topModules}
          routeModules={visibleHomeRoute(nextStep)}
          nextStep={nextStep}
          currentRouteModuleId={nextStep ? topModuleFor(nextStep.module).id : undefined}
          statFor={statFor}
          firstLearningUrl={firstLearningUrl}
        />
      </TrainingShell>
    );
  }

  if (view === "progress") {
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser}>
        <LocalProgress
          topModules={model.topModules}
          employees={employees}
          progressStore={progressStore}
          lessonsForModule={lessonsForModule}
          quizzesForModule={quizzesForModule}
        />
      </TrainingShell>
    );
  }

  if (view === "access") {
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser}>
        <AccessRightsPage />
      </TrainingShell>
    );
  }

  if (view === "profile") {
    const ownProgress = progressStore.byEmployee[currentUser.id] || emptyProgress();
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser}>
        <ProfilePage
          currentUser={currentUser}
          trainingEnabled={permissions.includes("training")}
          completedLessons={ownProgress.completedLessons.length}
          totalLessons={data.lessons.length}
          passedQuizzes={Object.values(ownProgress.quizAttempts).flat().filter((attempt) => attempt.passed).length}
          totalQuizzes={data.quizzes.length}
        />
      </TrainingShell>
    );
  }

  if (view === "employees") {
    return (
      <TrainingShell permissions={permissions} currentUser={currentUser}>
        <EmployeesPage
          employees={employees}
          setEmployees={setEmployees}
          canManage={canManageUsers}
          onEmployeeDeleted={(employeeId, nextEmployeeId) => setProgressStore((current) => {
            const byEmployee = { ...current.byEmployee };
            delete byEmployee[employeeId];
            if (!byEmployee[nextEmployeeId]) byEmployee[nextEmployeeId] = emptyProgress();
            return {
              activeEmployeeId: current.activeEmployeeId === employeeId ? nextEmployeeId : current.activeEmployeeId,
              byEmployee,
            };
          })}
        />
      </TrainingShell>
    );
  }

  return (
    <TrainingShell permissions={permissions} currentUser={currentUser}>
      <Dashboard topModules={model.topModules} statFor={statFor} firstLearningUrl={firstLearningUrl} />
    </TrainingShell>
  );
}

type AppNotification = {
  id: string;
  kind: "MODULE_COMPLETED";
  read: boolean;
  createdAt: string;
  employeeName: string;
  moduleTitle: string;
};

function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/notifications", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить уведомления.");
        return response.json() as Promise<{ unread: number; notifications: AppNotification[] }>;
      })
      .then((result) => {
        if (!cancelled) {
          setUnread(result.unread);
          setNotifications(result.notifications);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function markRead() {
    if (!unread) return;
    setUnread(0);
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    await fetch("/api/notifications", { method: "PATCH" }).catch(() => undefined);
  }

  return (
    <details className="notification-menu" onToggle={(event) => { if (event.currentTarget.open) void markRead(); }}>
      <summary className="notification-trigger" aria-label={unread ? `Уведомления: ${unread} непрочитанных` : "Уведомления"} title="Уведомления">
        <Icons.Bell aria-hidden="true" />
        {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
      </summary>
      <div className="notification-popover">
        <strong>Уведомления</strong>
        {notifications.length ? (
          <div className="notification-list">
            {notifications.map((notification) => (
              <div className={`notification-item ${notification.read ? "" : "is-unread"}`} key={notification.id}>
                <Icons.GraduationCap aria-hidden="true" />
                <div>
                  <span><b>{notification.employeeName}</b> завершил(а) модуль «{notification.moduleTitle}».</span>
                  <time dateTime={notification.createdAt}>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(notification.createdAt))}</time>
                </div>
              </div>
            ))}
          </div>
        ) : <span className="notification-empty">Новых уведомлений нет</span>}
      </div>
    </details>
  );
}

function TrainingShell({
  children,
  permissions,
  currentUser,
}: {
  children: React.ReactNode;
  permissions: string[];
  currentUser: CurrentUser;
}) {
  const pathname = usePathname();
  const can = (permission: string) => permissions.includes(permission);
  const userName = [currentUser.lastName, currentUser.firstName, currentUser.middleName].filter(Boolean).join(" ") || currentUser.username;
  const userInitials = [currentUser.lastName, currentUser.firstName].filter(Boolean).map((part) => part[0]).join("").toUpperCase() || currentUser.username.slice(0, 2).toUpperCase();

  return (
    <>
      <header className="site-header">
        <nav className="tab-nav">
          {can("training") && (
            <Link href="/training" className={`tab-link ${pathname === "/training" || pathname === "/training/" ? "active" : ""}`}>
              <Icons.Home aria-hidden="true" />
              <span>Главная</span>
            </Link>
          )}
          {can("training") && (
            <Link href="/training/basic" className={`tab-link ${pathname === "/training/basic" || pathname.includes("/training/module") || pathname.includes("/training/lesson") ? "active" : ""}`}>
              <Icons.GraduationCap aria-hidden="true" />
              <span>База знаний</span>
            </Link>
          )}
          {can("team_progress_view") && (
            <Link href="/training/progress" className={`tab-link ${pathname === "/training/progress" ? "active" : ""}`}>
              <Icons.BarChart2 aria-hidden="true" />
              <span>Прогресс команды</span>
            </Link>
          )}
          {can("access_manage") && (
            <Link href="/training/access" className={`tab-link ${pathname === "/training/access" ? "active" : ""}`}>
              <Icons.ShieldCheck aria-hidden="true" />
              <span>Права пользователей</span>
            </Link>
          )}
          {can("employees_view") && (
            <Link href="/training/employees" className={`tab-link ${pathname === "/training/employees" ? "active" : ""}`}>
              <Icons.UsersRound aria-hidden="true" />
              <span>Сотрудники</span>
            </Link>
          )}
          <span className="tab-nav-spacer" aria-hidden="true" />
          <NotificationBell />
          <Link href="/training/profile" className="profile-trigger" aria-label={`Открыть профиль: ${userName}`} title="Мой профиль">
            {currentUser.hasAvatar
              // eslint-disable-next-line @next/next/no-img-element -- The image is a private, cookie-protected profile resource.
              ? <img className="profile-avatar profile-avatar--image" src="/api/me/avatar" alt="" />
              : <span className="profile-avatar" aria-hidden="true">{userInitials}</span>}
            <span className="sr-only">Мой профиль</span>
          </Link>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}

function ManagerHome({
  currentUser,
  topModules,
  routeModules,
  nextStep,
  currentRouteModuleId,
  statFor,
  firstLearningUrl,
}: {
  currentUser: CurrentUser;
  topModules: TrainingModule[];
  routeModules: TrainingModule[];
  nextStep: HomeNextStep | null;
  currentRouteModuleId?: number;
  statFor: (module: TrainingModule) => ModuleStat;
  firstLearningUrl: (module: TrainingModule) => string;
}) {
  const totalLessons = topModules.reduce((sum, module) => sum + statFor(module).lessons.length, 0);
  const totalDone = topModules.reduce((sum, module) => sum + statFor(module).doneLessons, 0);
  const totalItems = topModules.reduce((sum, module) => sum + statFor(module).totalItems, 0);
  const doneItems = topModules.reduce((sum, module) => sum + statFor(module).doneItems, 0);
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const passedQuizzes = topModules.reduce((sum, module) => sum + statFor(module).passedQuizzes, 0);
  const name = [currentUser.lastName, currentUser.firstName, currentUser.middleName].filter(Boolean).join(" ") || currentUser.username;
  const initials = [currentUser.lastName, currentUser.firstName].filter(Boolean).map((part) => part[0]).join("").toUpperCase() || currentUser.username.slice(0, 2).toUpperCase();
  const role = roleTitle(accessRoleByDatabaseRole[currentUser.role]);

  return (
    <div className="manager-home">
      <aside className="manager-home-sidebar" aria-label="Мой профиль и обучение">
        <Link href="/training/profile" className="manager-home-person">
          {currentUser.hasAvatar
            // eslint-disable-next-line @next/next/no-img-element -- The image is a private, cookie-protected profile resource.
            ? <img src="/api/me/avatar" alt="" className="manager-home-avatar" />
            : <span className="manager-home-avatar manager-home-avatar--initials" aria-hidden="true">{initials}</span>}
          <span className="manager-home-person-name">{name}</span>
          <span className="manager-home-person-role">{role}</span>
        </Link>

        <div className="manager-home-progress">
          <span>Ваш прогресс</span>
          <strong>{pct}%</strong>
          <div className="manager-home-progress-figures"><span>{totalDone} / {totalLessons} уроков</span></div>
          <div className="progress-track"><span style={{ width: `${pct}%` }} /></div>
        </div>

        <nav className="manager-home-side-nav" aria-label="Навигация по обучению">
          <a href="#my-route"><Icons.Route aria-hidden="true" />Мой маршрут</a>
          <Link href="/training/basic"><Icons.BookOpen aria-hidden="true" />База знаний</Link>
        </nav>
      </aside>

      <section className="manager-home-content">
        <div className="manager-home-heading">
          <h1>Ваше обучение</h1>
          <div className="manager-home-compact-stats" aria-label="Статистика обучения">
            <span><Icons.BookOpen aria-hidden="true" /><b>{totalDone}</b> уроков</span>
            <span><Icons.FileCheck2 aria-hidden="true" /><b>{passedQuizzes}</b> теста</span>
            <span><Icons.PieChart aria-hidden="true" /><b>{pct}%</b> прогресс</span>
          </div>
        </div>

        <section className="manager-home-route" id="my-route" aria-labelledby="manager-home-route-title">
          <h2 id="manager-home-route-title" className="sr-only">Мой маршрут обучения</h2>
          {routeModules.map((module) => {
            const stat = statFor(module);
            const isCurrent = module.id === currentRouteModuleId;
            const isDone = stat.totalItems > 0 && stat.doneItems === stat.totalItems;
            return isCurrent && nextStep ? (
              <article className="manager-home-current" key={module.id}>
                <div className="manager-home-step-marker" aria-hidden="true">{String(module.order_num).padStart(2, "0")}</div>
                <div className="manager-home-current-copy">
                  <span>Сейчас</span>
                  <h2>{module.title}</h2>
                  <p>{nextStep.kind === "lesson" ? nextStep.lesson?.title : "Итоговый тест модуля"}</p>
                </div>
                <Link href={nextStep.href} className="manager-home-continue">
                  {nextStep.kind === "lesson" ? "Открыть урок" : "Пройти тест"}<Icons.ArrowRight aria-hidden="true" />
                </Link>
              </article>
            ) : (
              <Link className={`manager-home-route-row ${isDone ? "is-done" : ""}`} href={firstLearningUrl(module)} key={module.id}>
                <span className="manager-home-route-mark" aria-hidden="true">{isDone ? <Icons.Check /> : String(module.order_num).padStart(2, "0")}</span>
                <span><small>Модуль {String(module.order_num).padStart(2, "0")}</small><b>{module.title}</b></span>
                <Icons.ChevronDown aria-hidden="true" />
              </Link>
            );
          })}
          {!nextStep && (
            <div className="manager-home-finished">
              <Icons.CheckCircle2 aria-hidden="true" />
              <div><b>Обучение завершено</b><span>Все модули и тесты пройдены.</span></div>
              <Link href="/training/basic">Открыть программу</Link>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function Dashboard({
  topModules,
  statFor,
  firstLearningUrl,
}: {
  topModules: TrainingModule[];
  statFor: (module: TrainingModule) => ModuleStat;
  firstLearningUrl: (module: TrainingModule) => string;
}) {
  const stats = topModules.map((module) => ({ module, stat: statFor(module) }));
  const totalItems = stats.reduce((sum, item) => sum + item.stat.totalItems, 0);
  const doneItems = stats.reduce((sum, item) => sum + item.stat.doneItems, 0);
  const totalLessons = stats.reduce((sum, item) => sum + item.stat.lessons.length, 0);
  const doneLessons = stats.reduce((sum, item) => sum + item.stat.doneLessons, 0);
  const modulesDone = stats.filter((item) => item.stat.totalItems > 0 && item.stat.doneItems === item.stat.totalItems).length;
  const overallPct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div className="tr-wrap">
      <div className="tr-hero">
        <div>
          <div className="tr-hero-badge"><Icons.GraduationCap aria-hidden="true" />Курс продаж металлопроката</div>
          <div className="tr-hero-title">Базовое обучение</div>
          <div className="tr-hero-sub">{topModules.length} модулей · {totalLessons} {pluralLessons(totalLessons)}</div>
        </div>
      </div>

      <div className="tr-stats">
        <StatCard icon={<Icons.Layers />} value={`${modulesDone} / ${topModules.length}`} label="Модулей завершено" tone="red" />
        <StatCard icon={<Icons.CheckCircle2 />} value={`${doneLessons} / ${totalLessons}`} label="Уроков пройдено" tone="green" />
        <StatCard icon={<Icons.TrendingUp />} value={`${overallPct}%`} label="Общий прогресс" tone="blue" />
        <StatCard icon={<Icons.FileQuestion />} value={`${stats.reduce((sum, item) => sum + item.stat.passedQuizzes, 0)} / ${stats.reduce((sum, item) => sum + item.stat.quizzes.length, 0)}`} label="Тестов зачтено" tone="gray" />
      </div>

      <div className="tr-progress-bar">
        <div className="tr-progress-label">Прогресс базового обучения</div>
        <div className="progress-track"><span style={{ width: `${overallPct}%` }} /></div>
        <div className="tr-progress-pct">{overallPct}%</div>
      </div>

      <div className="tr-section-head">
        <div className="tr-section-title">Программа курса</div>
      </div>

      <div className="tr-grid">
        {stats.map(({ module, stat }) => (
          <Link
            href={firstLearningUrl(module)}
            className={`tr-card ${stat.totalItems > 0 && stat.doneItems === stat.totalItems ? "tr-card--done" : stat.doneItems > 0 ? "tr-card--active" : ""}`}
            key={module.id}
          >
            <div className="tr-card-cover" style={{ background: gradient(module.gradient) }}>
              <TrainingIcon name={module.icon} />
              {stat.totalItems > 0 && stat.doneItems === stat.totalItems && (
                <div className="tr-card-done-badge"><Icons.Check aria-hidden="true" /></div>
              )}
            </div>
            <div className="tr-card-body">
              <div className="tr-card-num">Модуль {String(module.order_num).padStart(2, "0")}</div>
              <div className="tr-card-title">{module.title}</div>
              <div className="tr-card-desc">{module.description}</div>
            </div>
            <div className="tr-card-prog">
              <div className="tr-card-prog-row">
                <span>{stat.doneItems} из {stat.totalItems}</span>
                <span>{stat.pct}%</span>
              </div>
              <div className="progress-track progress-track--mini"><span style={{ width: `${stat.pct}%` }} /></div>
            </div>
            <div className="tr-card-foot">
              <span><Icons.BookOpen aria-hidden="true" />{stat.lessons.length} {pluralLessons(stat.lessons.length)}</span>
              {module.title !== expressTrainingTitle && <span><Icons.Clock aria-hidden="true" />~{stat.duration} мин</span>}
              <Status stat={stat} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone: string }) {
  return (
    <div className="tr-stat">
      <div className={`tr-stat-icon tr-stat-icon--${tone}`}>{icon}</div>
      <div>
        <div className="tr-stat-val">{value}</div>
        <div className="tr-stat-label">{label}</div>
      </div>
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
  lessons: TrainingLesson[];
  quiz?: ModuleQuiz;
  statFor: (module: TrainingModule, deep?: boolean) => ModuleStat;
  firstLearningUrl: (module: TrainingModule) => string;
  bestQuizAttempt: (moduleId: number) => QuizAttempt | null;
  quizPassed: (moduleId: number) => boolean;
}) {
  const parentHref = module.parent_id ? `/training/module/${module.parent_id}` : "/training/basic";
  const rows = childModules.length
    ? childModules.map((child) => ({ module: child, href: firstLearningUrl(child), stat: statFor(child, false), quiz: undefined as ModuleQuiz | undefined }))
    : lessons.map((lesson) => ({ lesson, href: `/training/lesson/${lesson.id}` }));

  return (
    <div className="trs-wrap">
      <Breadcrumb items={[["База знаний", "/training/basic"], ["Базовое обучение", "/training/basic"], [module.title]]} />
      <div className="trs-hero" style={{ background: gradient(module.gradient) }}>
        <div className="trs-hero-icon"><TrainingIcon name={module.icon} /></div>
        <div>
          <div className="trs-hero-label">Модуль {String(module.order_num).padStart(2, "0")}</div>
          <div className="trs-hero-title">{module.title}</div>
          {module.description && <div className="trs-hero-desc">{module.description}</div>}
        </div>
      </div>

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
                <span><Icons.ListChecks />{quiz.questions.length} вопросов</span>
                <span>проходной балл {quiz.pass_score} из {quiz.questions.length}</span>
                {bestQuizAttempt(module.id) && <span><Icons.ClipboardCheck />{bestQuizAttempt(module.id)?.score} / {quiz.questions.length}</span>}
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

function LessonPage({
  lesson,
  module,
  parent,
  lessonList,
  completed,
  stat,
  prevLesson,
  nextLesson,
  onComplete,
  canManageContent,
}: {
  lesson: TrainingLesson;
  module: TrainingModule;
  parent?: TrainingModule;
  lessonList: TrainingLesson[];
  completed: Set<number>;
  stat: ModuleStat;
  prevLesson?: TrainingLesson;
  nextLesson?: TrainingLesson;
  onComplete: () => void;
  canManageContent: boolean;
}) {
  const isCompleted = completed.has(lesson.id);
  const hideTime = parent?.title === expressTrainingTitle;
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(lesson.title);
  const [draftContent, setDraftContent] = useState(lesson.content);
  const [editorError, setEditorError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveLesson() {
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

  return (
    <div className="trl-wrap">
      <Breadcrumb items={[["База знаний", "/training/basic"], ["Базовое обучение", "/training/basic"], parent ? [parent.title, `/training/module/${parent.id}`] : [module.title, `/training/module/${module.id}`], [lesson.title]]} />
      <div className="trl-layout">
        <aside className="trl-sidebar">
          <div className="trl-sidebar-head">
            <div className="trl-sidebar-mod">Модуль {String(module.order_num).padStart(2, "0")}</div>
            <div className="trl-sidebar-title">{module.title}</div>
          </div>
          <div className="trl-sidebar-prog">
            <div className="trl-sidebar-prog-row">
              <span>{stat.doneLessons} из {stat.lessons.length} уроков</span>
              <span>{stat.pct}%</span>
            </div>
            {!hideTime && (
              <div className="trl-sidebar-prog-row">
                <span>Всего в разделе</span>
                <span>~{stat.duration} мин</span>
              </div>
            )}
            <div className="progress-track progress-track--mini"><span style={{ width: `${stat.pct}%` }} /></div>
          </div>
          <ul className="trl-lesson-list">
            {lessonList.map((item) => (
              <li key={item.id}>
                <Link href={`/training/lesson/${item.id}`} className={`trl-lesson-item ${item.id === lesson.id ? "current" : completed.has(item.id) ? "done" : ""}`}>
                  <span>{item.order_num}</span>
                  {completed.has(item.id) ? <Icons.CheckCircle2 /> : item.id === lesson.id ? <Icons.PlayCircle /> : <Icons.Circle />}
                  <span>{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <article className="trl-content">
          <div className="trl-content-header">
            <div className="trl-content-tag">Модуль {String(module.order_num).padStart(2, "0")} · Урок {lesson.order_num}</div>
            <h1 className="trl-content-title">{draftTitle}</h1>
            <div className="trl-content-meta">
              {!hideTime && <span><Icons.Clock />~{lesson.duration_min} мин</span>}
              <span><Icons.BookOpen />Читать</span>
              <span className="trl-badge trl-badge--theory"><Icons.FileText />Теория</span>
              {isCompleted && <span className="trl-badge trl-badge--done"><Icons.CheckCircle2 />Пройден</span>}
            </div>
          </div>
          {canManageContent && !isEditing && <button type="button" className="lesson-edit-trigger" onClick={() => setIsEditing(true)}><Icons.PencilLine />Редактировать</button>}
          {isEditing ? (
            <div className="lesson-editor">
              <label><span>Заголовок</span><input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></label>
              <label><span>Содержание урока (HTML)</span><textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={22} /></label>
              {editorError && <div className="form-error" role="alert">{editorError}</div>}
              <div className="lesson-editor-actions">
                <button type="button" className="btn-cancel" onClick={() => { setDraftTitle(lesson.title); setDraftContent(lesson.content); setEditorError(""); setIsEditing(false); }}>Отмена</button>
                <button type="button" className="btn-save" onClick={saveLesson} disabled={isSaving}>{isSaving ? "Сохраняем…" : "Сохранить"}</button>
              </div>
            </div>
          ) : <div className="trl-body" dangerouslySetInnerHTML={{ __html: draftContent || emptyLessonHtml }} />}
          <div className="trl-footer">
            <div>
              {prevLesson ? (
                <Link href={`/training/lesson/${prevLesson.id}`} className="btn-nav"><Icons.ArrowLeft />Назад</Link>
              ) : (
                <Link href={parent ? `/training/module/${parent.id}` : "/training/basic"} className="btn-nav btn-nav--ghost"><Icons.LayoutGrid />К курсу</Link>
              )}
            </div>
            <div className="trl-footer-actions">
              <button type="button" className={`btn-complete ${isCompleted ? "btn-complete--done" : ""}`} onClick={isCompleted ? undefined : onComplete}>
                {isCompleted ? <Icons.CheckCircle2 /> : <Icons.Check />}
                {isCompleted ? "Урок пройден" : "Отметить как пройденный"}
              </button>
              {nextLesson ? (
                <Link href={`/training/lesson/${nextLesson.id}`} className="btn-nav">Следующий урок<Icons.ArrowRight /></Link>
              ) : (
                <button type="button" className="btn-nav" onClick={onComplete}>Продолжить<Icons.ArrowRight /></button>
              )}
            </div>
          </div>
        </article>
      </div>
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
  onSubmit: (answers: number[]) => void;
}) {
  const [answers, setAnswers] = useState<number[]>(Array(quiz.questions.length).fill(-1));
  const [resultIndex, setResultIndex] = useState<number | null>(null);
  const lastAttempt = attempts[attempts.length - 1] || null;
  const hasPassed = attempts.some((attempt) => attempt.passed);
  const attemptsLeft = quiz.max_attempts ? Math.max(quiz.max_attempts - attempts.length, 0) : null;
  const locked = Boolean(quiz.max_attempts && (hasPassed || attempts.length >= quiz.max_attempts));
  const visibleResult = resultIndex !== null ? attempts[resultIndex] : null;
  const answered = answers.filter((answer) => answer >= 0).length;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (answered !== quiz.questions.length || locked) return;
    setResultIndex(attempts.length);
    onSubmit(answers);
  }

  const result = visibleResult;

  return (
    <div className="qz-wrap">
      <Breadcrumb items={[["База знаний", "/training/basic"], ["Базовое обучение", "/training/basic"], [module.title, `/training/module/${module.id}`], ["Тест"]]} />
      <div className="qz-header">
        <h1 className="qz-title">{quiz.rules.title || `Тест: ${module.title}`}</h1>
        <div className="qz-subtitle">
          {module.title} · {quiz.questions.length} вопросов · проходной балл {quiz.pass_score} из {quiz.questions.length}
          {quiz.max_attempts ? ` · попыток ${attempts.length} / ${quiz.max_attempts}` : ""}
        </div>
        {quiz.rules.description && <div className="qz-description">{quiz.rules.description}</div>}
      </div>

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
            <button type="submit" className="qz-btn qz-btn--primary" disabled={answered !== quiz.questions.length}>Сдать тест</button>
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
}: {
  topModules: TrainingModule[];
  employees: Employee[];
  progressStore: ProgressStore;
  lessonsForModule: (module: TrainingModule, deep?: boolean) => TrainingLesson[];
  quizzesForModule: (module: TrainingModule, deep?: boolean) => ModuleQuiz[];
}) {
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

  return (
    <div className="trp-wrap">
      <Breadcrumb items={[["База знаний", "/training"], ["Прогресс команды"]]} />
      <div className="trp-header">
        <div className="trp-title">Прогресс команды</div>
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
}: {
  currentUser: CurrentUser;
  trainingEnabled: boolean;
  completedLessons: number;
  totalLessons: number;
  passedQuizzes: number;
  totalQuizzes: number;
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
  }, []);

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

  return (
    <div className="profile-wrap profile-wrap--deck">
      <header className="profile-deck-hero">
        <div className="profile-deck-person">
          <div className="profile-deck-avatar-wrap">
            {avatarSource
              // eslint-disable-next-line @next/next/no-img-element -- The image can be a local preview before it is uploaded.
              ? <img className="profile-deck-avatar" src={avatarSource} alt="Фотография профиля" />
              : <span className="profile-deck-avatar" aria-hidden="true">{initials}</span>}
            <label className="profile-deck-avatar-edit" aria-label="Изменить фотографию" title="Изменить фотографию">
              <Icons.Camera aria-hidden="true" />
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectAvatar} />
            </label>
          </div>
          <div>
            <h1 className="profile-deck-title">{displayName}</h1>
            <span className="profile-deck-role"><Icons.BadgeCheck aria-hidden="true" />{roleTitle(accessRoleByDatabaseRole[profile.role])}</span>
          </div>
        </div>
        <div className="profile-deck-hero-actions">
          {profileNotice && <span className="profile-deck-status"><Icons.CheckCircle2 aria-hidden="true" />{profileNotice}</span>}
          <button type="button" className="profile-deck-edit-link" onClick={() => setIsEditingProfile(true)}><Icons.PencilLine aria-hidden="true" />Редактировать данные</button>
        </div>
      </header>

      <div className="profile-deck-notices" aria-live="polite">
        {profileError && <div className="form-error" role="alert">{profileError}</div>}
      </div>

      <div className="profile-deck-grid">
        <section className="profile-deck-card profile-deck-card--details" id="profile-details">
          <div className="profile-deck-card-head"><h2>Личные данные</h2><Icons.UserRound aria-hidden="true" /></div>
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
          {passwordNotice && <div className="alert alert-success"><Icons.CheckCircle2 aria-hidden="true" />{passwordNotice}</div>}
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
          {trainingEnabled ? (
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
  };
}

function EmployeesPage({
  employees,
  setEmployees,
  canManage,
  onEmployeeDeleted,
}: {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  canManage: boolean;
  onEmployeeDeleted: (employeeId: string, nextEmployeeId: string) => void;
}) {
  const [draft, setDraft] = useState<Employee>(() => emptyEmployee());
  const [editingId, setEditingId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  const activeCount = employees.filter((employee) => employee.isActive).length;

  function updateDraft(field: keyof Employee, value: string | boolean) {
    setError("");
    setNotice("");
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startCreate() {
    setEditingId("");
    setDraft(emptyEmployee());
    setError("");
    setNotice("");
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setDraft(employee);
    setError("");
    setNotice("");
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault();
    const normalizedUsername = draft.username.trim();
    const normalizedEmail = draft.email.trim().toLowerCase();
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
    const payload = { ...prepared, role: role[prepared.role] };
    const response = await fetch(editingId ? `/api/admin/users/${editingId}` : "/api/admin/users", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => null)) as { error?: string; id?: string } | null;
    if (!response.ok) {
      setError(result?.error || "Не удалось сохранить сотрудника.");
      return;
    }
    if (editingId) {
      setEmployees((current) => current.map((employee) => employee.id === editingId ? { ...prepared, password: "" } : employee));
    } else {
      const created = result as { id: string };
      setEmployees((current) => [{ ...prepared, id: created.id, password: "" }, ...current]);
    }
    setNotice(editingId ? "Данные сотрудника обновлены." : "Сотрудник добавлен.");
    setEditingId("");
    setDraft(emptyEmployee());
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

  async function deleteEmployee(employee: Employee) {
    const activeAdmins = employees.filter((item) => item.isActive && item.role === "admin").length;
    if (employee.role === "admin" && activeAdmins <= 1) {
      setError("Нельзя удалить последнего активного администратора.");
      return;
    }
    const response = await fetch(`/api/admin/users/${employee.id}`, { method: "DELETE" });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) { setError(result?.error || "Не удалось удалить сотрудника."); return; }
    const nextEmployees = employees.filter((item) => item.id !== employee.id);
    const nextEmployeeId = nextEmployees[0]?.id || "";
    setEmployees(nextEmployees);
    if (nextEmployeeId) onEmployeeDeleted(employee.id, nextEmployeeId);
    if (editingId === employee.id) startCreate();
    setNotice("Сотрудник удалён.");
  }

  return (
    <div className="employees-wrap">
      <Breadcrumb items={[["База знаний", "/training"], ["Сотрудники"]]} />
      <div className="employees-head">
        <div>
          <div className="tr-hero-badge"><Icons.UsersRound aria-hidden="true" />Администрирование</div>
          <h1 className="employees-title">Сотрудники</h1>
        </div>
        <div className="employees-counter">
          <strong>{employees.length}</strong>
          <span>всего · {activeCount} активных</span>
        </div>
      </div>

      {error && <div className="alert alert-error"><Icons.CircleAlert />{error}</div>}
      {notice && <div className="alert alert-success"><Icons.CheckCircle2 />{notice}</div>}

      <div className="employees-layout">
        {canManage && (
          <section className="employee-form-card">
          <div className="employee-form-head">
            <div>
              <h2>{editingId ? "Редактировать сотрудника" : "Добавить сотрудника"}</h2>
            </div>
            {editingId && (
              <button type="button" className="icon-btn" onClick={startCreate} title="Новый сотрудник">
                <Icons.Plus />
              </button>
            )}
          </div>

          <form className="employee-form" onSubmit={saveEmployee}>
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
            <label className="form-field">
              <span>Роль</span>
              <select value={draft.role} onChange={(event) => updateDraft("role", event.target.value as AccessRole["key"])}>
                {accessRoles.map((role) => (
                  <option value={role.key} key={role.key}>{role.title}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Руководитель</span>
              <select value={draft.managerId} onChange={(event) => updateDraft("managerId", event.target.value)}>
                <option value="">Не назначен</option>
                {employees
                  .filter((employee) => employee.id !== draft.id && employee.isActive && employee.role === "rop")
                  .map((employee) => <option value={employee.id} key={employee.id}>{employeeDisplayName(employee)}</option>)}
              </select>
            </label>
            <label className="employee-checkbox">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => updateDraft("isActive", event.target.checked)}
              />
              <span>Сотрудник активен и может входить в систему</span>
            </label>

            <div className="employee-form-actions">
              <button type="submit" className="btn-save">{editingId ? "Сохранить изменения" : "Создать сотрудника"}</button>
              <button type="button" className="btn-cancel" onClick={startCreate}>Очистить</button>
            </div>
          </form>
          </section>
        )}

        <section className="employees-list">
          <div className="employees-list-head">
            <h2>Список сотрудников</h2>
            {canManage && <button type="button" className="btn-save" onClick={startCreate}><Icons.Plus />Добавить</button>}
          </div>
          <div className="staff-grid">
            {employees.map((employee) => (
              <article className={`staff-card ${editingId === employee.id ? "is-editing" : ""}`} key={employee.id}>
                <div className="staff-card-top">
                  <div className={`staff-avatar staff-avatar--${employee.role}`}>{employeeInitials(employee)}</div>
                  <div className="staff-main">
                    <div className="staff-name">{employeeDisplayName(employee)}</div>
                    <div className="staff-pos">{employee.position || "Должность не указана"}</div>
                    <span className={`role-badge role-${employee.role}`}>{roleTitle(employee.role)}</span>
                  </div>
                </div>

                <div className="staff-info">
                  <div className="staff-info-row"><Icons.User />{employee.username}</div>
                  {employee.email && <div className="staff-info-row"><Icons.Mail />{employee.email}</div>}
                  {employee.phone && <div className="staff-info-row"><Icons.Phone />{employee.phone}</div>}
                  {employee.managerName && <div className="staff-info-row"><Icons.UsersRound />{employee.managerName}</div>}
                  {employee.hireDate && <div className="staff-info-row"><Icons.CalendarDays />В компании с {employee.hireDate}</div>}
                </div>

                <div className="staff-actions">
                  {canManage && (
                    <>
                      <button type="button" className="btn-cancel btn-compact" onClick={() => startEdit(employee)}>Редактировать</button>
                      <button type="button" className="btn-cancel btn-compact" onClick={() => toggleEmployee(employee)}>
                        {employee.isActive ? "Отключить" : "Включить"}
                      </button>
                      <button type="button" className="danger-btn btn-compact" onClick={() => deleteEmployee(employee)}>Удалить</button>
                    </>
                  )}
                  <span className={`staff-status ${employee.isActive ? "staff-status--on" : "staff-status--off"}`}>
                    {employee.isActive ? "Активен" : "Отключён"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
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

function AccessRightsPage() {
  const [settings, setSettings] = useState<AccessSettings>(copyDefaultAccessSettings);
  const [savedAt, setSavedAt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/permissions", { cache: "no-store" });
        if (!response.ok) throw new Error("Не удалось загрузить матрицу прав.");
        const records = await response.json() as Array<{ role: CurrentUser["role"]; permission: string; allowed: boolean }>;
        if (cancelled) return;
        const next = copyDefaultAccessSettings();
        for (const record of records) {
          const role = accessRoleByDatabaseRole[record.role];
          if (role && record.permission in next[role]) next[role][record.permission] = record.allowed;
        }
        accessGroups.forEach((group) => group.permissions.forEach((permission) => {
          next.admin[permission.key] = true;
        }));
        setSettings(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить матрицу прав.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadSettings();
    return () => { cancelled = true; };
  }, []);

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
      setSavedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить права.");
    } finally {
      setIsSaving(false);
    }
  }

  function resetSettings() {
    setSettings(copyDefaultAccessSettings());
    setSavedAt("");
    setError("");
  }

  return (
    <div className="settings-wrap access-settings-wrap">
      <section className="settings-card access-settings-card">
        <header className="access-toolbar">
          <div className="access-toolbar-title">
            <Icons.ShieldCheck aria-hidden="true" />
            <h1>Права пользователей</h1>
          </div>
          <div className="access-toolbar-actions">
            {(savedAt || isLoading) && (
              <div className="access-save-note" aria-live="polite">
                {savedAt ? `Сохранено · ${savedAt}` : "Загрузка…"}
              </div>
            )}
            <button type="button" className="access-action access-action--secondary" onClick={resetSettings} disabled={isSaving || isLoading}>Сбросить</button>
            <button type="button" className="access-action access-action--primary" onClick={saveSettings} disabled={isSaving || isLoading}>{isSaving ? "Сохраняем…" : "Сохранить"}</button>
          </div>
        </header>

        <div className="card-body access-card-body">
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="access-matrix">
            {accessGroups.map((group) => (
              <div className="access-group" key={group.title}>
                <div className="access-group-title">{group.title}</div>
                <div className="access-row access-head">
                  <div className="access-cell">Право</div>
                  {accessRoles.map((role) => (
                    <div className="access-cell" key={role.key}>{accessRoleCompactTitles[role.key]}</div>
                  ))}
                </div>
                {group.permissions.map((permission) => (
                  <div className="access-row" key={permission.key}>
                    <div className="access-cell">
                      <div>
                        <div className="access-perm-title">{permission.title}</div>
                      </div>
                    </div>
                    {accessRoles.map((role) => {
                      const enabled = Boolean(settings[role.key]?.[permission.key]);
                      return (
                        <div className="access-cell access-toggle" key={role.key}>
                          <label className={`switch-control ${role.key === "admin" ? "is-disabled" : ""}`}>
                            <input
                              type="checkbox"
                              checked={enabled || role.key === "admin"}
                              disabled={role.key === "admin"}
                              onChange={() => togglePermission(role, permission)}
                            />
                            <span className="switch" />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Breadcrumb({ items }: { items: Array<[string, string?]> }) {
  return (
    <div className="breadcrumb">
      {items.map(([label, href], index) => (
        <span className="breadcrumb-item" key={`${label}-${index}`}>
          {href ? <Link href={href}>{label}</Link> : <span>{label}</span>}
          {index < items.length - 1 && <Icons.ChevronRight aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}

const emptyLessonHtml = `
  <div style="text-align:center;padding:48px 24px;color:var(--i4);">
    <div style="font-size:15px;font-weight:700;color:var(--i3);margin-bottom:4px;">Контент скоро появится</div>
    <div style="font-size:13px;">Урок в процессе подготовки</div>
  </div>
`;
