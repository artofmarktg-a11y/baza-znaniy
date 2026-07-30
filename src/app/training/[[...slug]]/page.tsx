import TrainingSite from "../TrainingSite";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserPermissions, hasPermission, type Permission } from "@/lib/permissions";
import { getPublicTrainingCatalog, getTrainingCatalog, getTrainingLesson, getTrainingQuiz } from "@/lib/training";

const requiredPermissionBySection: Record<string, Permission> = {
  employees: "employees_view",
  access: "access_manage",
  progress: "team_progress_view",
};

export default async function TrainingPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const section = slug[0] || "";
  const user = await getCurrentUser();
  const isPublicBasicPage = !user && section === "basic" && slug.length === 1;
  if (isPublicBasicPage) {
    const publicUser = {
      id: "public-guest",
      username: "guest",
      firstName: "Гость",
      lastName: "",
      middleName: "",
      hasAvatar: false,
      role: "MANAGER" as const,
    };

    return (
      <TrainingSite
        currentUser={publicUser}
        initialData={await getPublicTrainingCatalog()}
        permissions={["training"]}
        isPublicView
      />
    );
  }
  if (!user) redirect("/login");
  const requiredPermission = section === "profile" ? null : requiredPermissionBySection[section] || "training";
  if (requiredPermission && !await hasPermission(user, requiredPermission)) redirect("/forbidden");

  const userPermissions = await getUserPermissions(user);
  const sectionId = Number(slug[1]);
  const canReadTraining = userPermissions.includes("training");
  const shouldLoadLesson = canReadTraining && section === "lesson" && Number.isInteger(sectionId) && sectionId > 0;
  const shouldLoadQuiz = canReadTraining && section === "module" && slug[2] === "quiz" && Number.isInteger(sectionId) && sectionId > 0;
  const [initialData, initialLesson, initialQuiz] = await Promise.all([
    getTrainingCatalog(user.id),
    shouldLoadLesson ? getTrainingLesson(sectionId, user.id) : Promise.resolve(null),
    shouldLoadQuiz ? getTrainingQuiz(sectionId, user.id) : Promise.resolve(null),
  ]);

  return (
    <TrainingSite
      currentUser={user}
      initialData={initialData}
      initialLesson={initialLesson || undefined}
      initialQuiz={initialQuiz || undefined}
      permissions={userPermissions}
    />
  );
}
