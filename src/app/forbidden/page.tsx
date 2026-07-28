import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="forbidden-title">
        <div className="login-kicker">Доступ ограничен</div>
        <h1 id="forbidden-title">У вас нет прав для этого раздела</h1>
        <Link href="/training" className="login-link">Вернуться в доступный раздел</Link>
      </section>
    </main>
  );
}
