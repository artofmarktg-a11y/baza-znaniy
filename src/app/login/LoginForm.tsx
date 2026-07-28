"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error || "Не удалось выполнить вход.");
        return;
      }
      router.replace("/training");
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <span className="login-kicker">База знаний</span>
        <h1>Вход в обучение</h1>
        <label>
          <span>Логин</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          <span>Пароль</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button type="submit" disabled={pending}>{pending ? "Входим…" : "Войти"}</button>
      </form>
    </main>
  );
}
