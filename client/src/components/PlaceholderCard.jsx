export function PlaceholderCard({ title, children }) {
  return (
    <article className="rounded border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <div className="text-sm text-slate-600">{children}</div>
    </article>
  );
}
