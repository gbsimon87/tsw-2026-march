import { useAuth } from '../../app/store/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-slate-700">Authenticated route example.</p>
      <pre className="rounded bg-slate-900 p-4 text-sm text-emerald-300">
        {JSON.stringify(user, null, 2)}
      </pre>
    </section>
  );
}
