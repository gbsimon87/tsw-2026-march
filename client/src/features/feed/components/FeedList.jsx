import { FeedPostCard } from './FeedPostCard';

export function FeedList({ posts, onDelete }) {
  if (!posts.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-600">
        No posts yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <FeedPostCard key={post.id} post={post} onDelete={onDelete} />
      ))}
    </div>
  );
}
