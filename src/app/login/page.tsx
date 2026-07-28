import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/training");
  return <LoginForm />;
}
