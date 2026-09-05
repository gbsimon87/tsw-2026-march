import { useEffect, useMemo, useRef, useState } from 'react';
import { feedApi } from '../../feed/api/feedApi';
import { buildGameCardLabel } from '../../feed/components/posts/cardUtils';
import { GameCardPost } from '../../feed/components/posts/GameCardPost';
import { instagramApi } from '../api/instagramApi';
import { takePendingInstagramDraft } from '../instagramDraftHandoff';

const STATUS_LABELS = {
  draft: 'Draft',
  ready_for_review: 'Ready for review',
  approved: 'Approved',
  queued: 'Queued',
  creating_container: 'Creating container',
  processing: 'Processing',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Delivery failed',
  reconciliation_required: 'Reconciliation required',
  cancelled: 'Cancelled',
};

const CANCELLABLE_STATUSES = new Set(['draft', 'ready_for_review', 'approved', 'queued', 'failed']);

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

export function InstagramSocialPostPanel({ publishingEnabled = false }) {
  const [posts, setPosts] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [sourcePostId, setSourcePostId] = useState('');
  const [caption, setCaption] = useState('');
  const [attributionUrl, setAttributionUrl] = useState('');
  const [file, setFile] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [preparedDraft, setPreparedDraft] = useState(null);
  const fileInputRef = useRef(null);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === sourcePostId) || null,
    [candidates, sourcePostId]
  );
  // The picker lists the 50 most recent feed posts. A card handed over from The
  // Pulse can be older than that, so it contributes its own option rather than
  // leaving the required select with a value no <option> carries.
  const sourceOptions = useMemo(() => {
    const options = candidates.map((candidate) => ({
      id: candidate.id,
      label: buildGameCardLabel(candidate.gameCard),
    }));
    if (preparedDraft && !options.some((option) => option.id === preparedDraft.sourcePostId)) {
      options.unshift({
        id: preparedDraft.sourcePostId,
        label: preparedDraft.sourceLabel || 'Game card from The Pulse',
      });
    }
    return options;
  }, [candidates, preparedDraft]);
  const filePreviewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(
    () => () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    },
    [filePreviewUrl]
  );

  useEffect(() => {
    let active = true;
    Promise.all([instagramApi.listPosts(), feedApi.listFeed({ limit: 50 })])
      .then(([socialResult, feedResult]) => {
        if (!active) return;
        setPosts(socialResult.posts || []);
        const gameCards = (feedResult.posts || []).filter(
          (post) => post.type === 'game_card' && post.gameCard
        );
        setCandidates(gameCards);
        setSourcePostId((current) => current || gameCards[0]?.id || '');
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load Instagram post drafts');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Claims the image The Pulse rendered on the way here. Consuming it means a
  // StrictMode re-run, or a later visit, starts from an empty form.
  useEffect(() => {
    const draft = takePendingInstagramDraft();
    if (!draft?.file || !draft?.sourcePostId) return;
    setPreparedDraft(draft);
    setSourcePostId(draft.sourcePostId);
    setFile(draft.file);
    setCaption(draft.caption || '');
    if (draft.attributionUrl) setAttributionUrl(draft.attributionUrl);
  }, []);

  function replacePost(updated) {
    setPosts((current) => current.map((post) => (post.id === updated.id ? updated : post)));
  }

  async function createDraft(event) {
    event.preventDefault();
    setAction('create');
    setError('');
    try {
      const formData = new FormData();
      formData.set('sourcePostId', sourcePostId);
      formData.set('caption', caption);
      formData.set('attributionUrl', attributionUrl);
      formData.set('contentDeclaration', isDemo ? 'demo' : '');
      formData.set('rightsConfirmed', String(rightsConfirmed));
      if (file) formData.set('file', file);
      const result = await instagramApi.createPost(formData);
      setPosts((current) => [result.post, ...current]);
      setCaption('');
      setAttributionUrl('');
      setFile(null);
      setPreparedDraft(null);
      // The input keeps its own FileList, so clearing only the state would leave
      // a filename on screen next to a submit button disabled for having none.
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsDemo(false);
      setRightsConfirmed(false);
    } catch (createError) {
      setError(createError.message || 'Could not create Instagram post draft');
    } finally {
      setAction('');
    }
  }

  async function transition(postId, nextAction) {
    if (
      nextAction === 'approve' &&
      !window.confirm('Approve this exact image and caption for future Instagram publishing?')
    ) {
      return;
    }
    if (
      nextAction === 'queue' &&
      !window.confirm(
        'Queue this approved demo post for delivery to the connected Instagram account?'
      )
    ) {
      return;
    }
    setAction(`${nextAction}:${postId}`);
    setError('');
    try {
      const result =
        nextAction === 'ready'
          ? await instagramApi.markPostReady(postId)
          : nextAction === 'approve'
            ? await instagramApi.approvePost(postId)
            : nextAction === 'queue'
              ? await instagramApi.queuePost(postId)
              : await instagramApi.cancelPost(postId);
      replacePost(result.post);
    } catch (transitionError) {
      setError(transitionError.message || 'Could not update Instagram post');
    } finally {
      setAction('');
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6500]">
          Approval workflow
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">Instagram post drafts</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Start with a labelled demo game card. Use the Instagram button on a card in The Pulse to
          send its exact 4:5 render here, or upload the PNG yourself. Approval does not publish it;
          delivery must be enabled and queued separately.
        </p>
        {!publishingEnabled ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Instagram delivery is disabled in this environment. Drafting and approval remain safe;
            approved posts cannot be queued.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {preparedDraft ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          The exact game card you shared from The Pulse is attached below. Review the caption and
          both declarations, then create the draft — nothing is published yet.
        </p>
      ) : null}

      <form className="grid gap-5 lg:grid-cols-2" onSubmit={createDraft}>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-800">
            Source game card
            <select
              value={sourcePostId}
              onChange={(event) => setSourcePostId(event.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Select a recent game card</option>
              {sourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Exported 4:5 image
            {/* A prepared image lives in state, never in the input's own FileList,
                so `required` here would block submission on a form that already
                has its image. Emptiness is checked against state instead. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setPreparedDraft(null);
              }}
              required={!file}
              className="mt-1 block w-full text-sm text-slate-600"
            />
          </label>
          {preparedDraft ? (
            <p className="-mt-2 text-xs text-slate-600">
              Using <span className="font-medium">{preparedDraft.file.name}</span>, rendered from
              The Pulse. Choose a file above to replace it.
            </p>
          ) : null}

          <label className="block text-sm font-medium text-slate-800">
            Instagram caption
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={2200}
              required
              rows={6}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">{caption.length}/2200</span>
          </label>

          <label className="block text-sm font-medium text-slate-800">
            Attribution link (optional)
            <input
              type="url"
              value={attributionUrl}
              onChange={(event) => setAttributionUrl(event.target.value)}
              placeholder="https://dev.thesportyway.com/games/..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isDemo}
              onChange={(event) => setIsDemo(event.target.checked)}
              required
              className="mt-1"
            />
            This image contains labelled demo content, not an identifiable real participant.
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              required
              className="mt-1"
            />
            I confirm TSW has the right to publish every visible element in this image.
          </label>

          <button
            type="submit"
            disabled={Boolean(action) || !sourceOptions.length || !file}
            className="rounded-lg bg-[#141414] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {action === 'create' ? 'Creating draft…' : 'Create review draft'}
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800">Preview</p>
          {filePreviewUrl ? (
            <img
              src={filePreviewUrl}
              alt="Exact Instagram upload preview"
              className="mx-auto aspect-[4/5] max-h-[34rem] w-full max-w-md rounded-xl bg-slate-100 object-contain"
            />
          ) : selectedCandidate?.gameCard ? (
            <GameCardPost gameCard={selectedCandidate.gameCard} interactive={false} />
          ) : (
            <div className="grid aspect-[4/5] place-items-center rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-500">
              Open The Pulse, then use the Instagram button on a game card to send its render here.
              Uploading an exported 4:5 PNG by hand still works.
            </div>
          )}
        </div>
      </form>

      <div className="space-y-4 border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-900">Review queue</h3>
        {isLoading ? <p className="text-sm text-slate-500">Loading drafts…</p> : null}
        {!isLoading && posts.length === 0 ? (
          <p className="text-sm text-slate-500">No Instagram post drafts yet.</p>
        ) : null}
        {posts.map((post) => (
          <article
            key={post.id}
            className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-[12rem_1fr]"
          >
            <img
              src={post.asset.url}
              alt="Instagram post awaiting review"
              className="aspect-[4/5] w-full rounded-lg bg-slate-100 object-contain"
            />
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {STATUS_LABELS[post.status] || post.status}
                </span>
                <span className="text-xs text-slate-500">Created {formatDate(post.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{post.caption}</p>
              {post.attributionUrl ? (
                <a
                  href={post.attributionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm text-blue-700 underline"
                >
                  {post.attributionUrl}
                </a>
              ) : null}
              <p className="text-xs text-slate-500">
                Demo declaration recorded · {post.asset.width}×{post.asset.height}
                {post.mediaId ? ` · Media ID ${post.mediaId}` : ''}
              </p>
              {post.lastDeliveryError ? (
                <p className="text-xs text-red-700">
                  {post.lastDeliveryError.code} at {post.lastDeliveryError.stage}
                  {post.lastDeliveryError.retryable && post.nextAttemptAt
                    ? ` · retry after ${formatDate(post.nextAttemptAt)}`
                    : ''}
                </p>
              ) : null}
              {post.permalink ? (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-blue-700 underline"
                >
                  View published Instagram post
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {post.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={() => transition(post.id, 'ready')}
                    disabled={Boolean(action)}
                    className="rounded-lg bg-[#141414] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Mark ready for review
                  </button>
                ) : null}
                {post.status === 'ready_for_review' ? (
                  <button
                    type="button"
                    onClick={() => transition(post.id, 'approve')}
                    disabled={Boolean(action)}
                    className="rounded-lg bg-[#F4A300] px-3 py-2 text-sm font-semibold text-[#141414] disabled:opacity-50"
                  >
                    Approve exact image and caption
                  </button>
                ) : null}
                {post.status === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => transition(post.id, 'queue')}
                    disabled={Boolean(action) || !publishingEnabled}
                    title={publishingEnabled ? undefined : 'Instagram delivery is disabled'}
                    className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Queue guarded test publish
                  </button>
                ) : null}
                {CANCELLABLE_STATUSES.has(post.status) ? (
                  <button
                    type="button"
                    onClick={() => transition(post.id, 'cancel')}
                    disabled={Boolean(action)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
