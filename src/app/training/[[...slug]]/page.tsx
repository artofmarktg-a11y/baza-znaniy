import TrainingSite from "../TrainingSite";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserPermissions, hasPermission, type Permission } from "@/lib/permissions";
import { getTrainingData } from "@/lib/training";

const requiredPermissionBySection: Record<string, Permission> = {
  employees: "employees_view",
  access: "access_manage",
  progress: "team_progress_view",
};

export default async function TrainingPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { slug = [] } = await params;
  const section = slug[0] || "";
  const requiredPermission = section === "profile" ? null : requiredPermissionBySection[section] || "training";
  if (requiredPermission && !await hasPermission(user, requiredPermission)) redirect("/forbidden");

  const userPermissions = await getUserPermissions(user);
  const trainingData = await getTrainingData();
  const initialData = userPermissions.includes("training")
    ? trainingData
    : {
        ...trainingData,
        lessons: trainingData.lessons.map((lesson) => ({ ...lesson, content: "" })),
        quizzes: trainingData.quizzes.map((quiz) => ({ ...quiz, questions: [] })),
      };

  return (
    <TrainingSite
      currentUser={user}
      initialData={initialData}
      permissions={userPermissions}
    />
  );
}
