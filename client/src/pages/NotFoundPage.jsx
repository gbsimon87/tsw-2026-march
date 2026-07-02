import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="404"
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
      >
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Back to homepage
        </Link>
      </PageHeader>
    </main>
  );
}
