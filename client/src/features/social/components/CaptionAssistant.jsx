import { useMemo, useState } from 'react';

import { SHAREABLE_SOURCES, buildTaggedUrl } from '../../analytics/attribution';
import {
  buildCaptionKit,
  buildCardAttributionUrl,
  resolveCaptionSource,
} from '../captionAssistant';
import { guardCard } from '../exportGuard';
import { CopyButton } from './CopyButton';

// Social backlog rank 5. The link in a caption is the only part of an exported
// asset that can be measured, and it can only be measured if it says where it
// was posted. Labels are the platform names an operator recognises; the values
// are the campaign vocabulary in attribution.js.
const DESTINATION_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};

// resolveCaptionSource answers {type, card}; buildCaptionKit reads the card off
// a type-named field, so a guarded card has to be put back where it came from.
const CARD_FIELD = {
  game_card: 'gameCard',
  player_card: 'playerCard',
  player_game_card: 'playerGameCard',
  team_card: 'teamCard',
  milestone: 'milestoneCard',
  leaderboard_card: 'leaderboardCard',
};

function Field({ title, children, copyValue, copyLabel, hint }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{title}</p>
        <CopyButton value={copyValue} label={copyLabel || title.toLowerCase()} />
      </div>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * Editable copy for one exportable card: caption, tags, and alt text, each with
 * a copy button.
 *
 * `source` is a feed post or the same `{ type, gameCard | playerCard | ... }`
 * props the exporter takes, so a call site passes what it already holds. `lead`
 * is the operator's own caption when the post carries one; it replaces the
 * generated hook rather than being thrown away.
 */
export function CaptionAssistant({
  source,
  lead = '',
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  defaultOpen = false,
  destination: initialDestination = 'instagram',
  // The social kit owns the destination for a whole pack of assets, so it
  // passes false: two identical pickers on one screen is a choice the operator
  // has to make twice, and only one of them would take effect.
  showDestinationPicker = true,
  // Social backlog rank 9. Optional because most call sites hand over a card
  // the guard has already been through (ShareImageButton); the kit passes it
  // so the caption can tag a handle the guard cleared. Absent means no handle
  // is added — never that one is invented.
  marketing,
  className = '',
}) {
  const [destination, setDestination] = useState(initialDestination);
  // A controlled destination has to win over the local one, or the caption
  // keeps the tag from whichever value happened to be first.
  const activeDestination = showDestinationPicker ? destination : initialDestination;

  const kit = useMemo(() => {
    const resolved = resolveCaptionSource(source);
    if (!resolved) return null;
    // A handle is a real account: which one gets tagged has to follow where
    // this is being posted, not a default the operator cannot see.
    const network = activeDestination === 'tiktok' ? 'tiktok' : 'instagram';
    const { card, restrictedCount = 0 } = marketing
      ? guardCard(resolved.type, resolved.card, marketing, { network })
      : { card: resolved.card };

    return buildCaptionKit(
      { type: resolved.type, [CARD_FIELD[resolved.type]]: card },
      {
        // Tagged here rather than inside captionAssistant.js: the caption builder
        // composes copy from a card and has no business knowing about campaigns.
        attributionUrl: buildTaggedUrl(buildCardAttributionUrl(card, origin), {
          source: activeDestination,
        }),
        // A pre-existing Pulse caption can name a player who has since opted
        // out. Rebuild from the guarded card instead of copying that stale lead.
        lead: restrictedCount ? '' : lead,
      }
    );
  }, [source, lead, origin, activeDestination, marketing]);

  // The caption is editable, and a new card (or a different format) must reseed
  // it — but an edit the operator has already made must survive a re-render.
  const [seed, setSeed] = useState(kit?.caption ?? '');
  const [draft, setDraft] = useState(kit?.caption ?? '');
  if (kit && kit.caption !== seed) {
    setSeed(kit.caption);
    setDraft(kit.caption);
  }

  if (!kit) return null;

  const hashtagLine = kit.hashtags.join(' ');
  const handleLine = kit.handles.join(' ');

  return (
    <details
      open={defaultOpen}
      className={`group w-full rounded-xl border border-slate-200 text-left ${className}`}
    >
      {/* list-none alone still leaves Safari's own marker, so that one is
          suppressed explicitly and a chevron supplies the affordance. */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        Caption, tags and alt text
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </summary>

      <div className="space-y-4 border-t border-slate-200 px-4 py-4">
        {showDestinationPicker ? (
          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            Posting to
            <select
              aria-label="Posting destination"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            >
              {SHAREABLE_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {DESTINATION_LABELS[value] || value}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-slate-500">
              Tags the link in the caption so this platform&apos;s visits can be told apart from the
              others&apos;.
            </span>
          </label>
        ) : null}

        <Field
          title="Caption"
          copyValue={draft}
          copyLabel="caption"
          hint={`${draft.length}/2200 · hook, context, one question and one call to action, then the link and tags.`}
        >
          <textarea
            aria-label="Generated caption"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2200}
            rows={9}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          {draft !== kit.caption ? (
            <button
              type="button"
              onClick={() => setDraft(kit.caption)}
              className="text-xs font-semibold text-slate-600 underline"
            >
              Reset to generated caption
            </button>
          ) : null}
        </Field>

        <Field
          title="Hashtags"
          copyValue={hashtagLine}
          copyLabel="hashtags"
          hint="Already included at the end of the caption above. Copy on its own for a first comment."
        >
          <p className="break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {hashtagLine}
          </p>
        </Field>

        <Field
          title="Alt text"
          copyValue={kit.altText}
          copyLabel="alt text"
          hint="Paste into the platform's accessibility field. It is not part of the caption."
        >
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{kit.altText}</p>
        </Field>

        <Field title="Handles" copyValue={handleLine} copyLabel="handles">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{handleLine}</p>
          {/* Rank 9 (social identity and consent fields) is what would put a
              player's or team's handle here. Until it ships, saying so is more
              useful than silently tagging nobody — and guessing a handle from a
              name would tag a stranger. */}
          <p className="text-xs text-slate-500">
            Player and team handles are not recorded in TSW yet, so only the TSW account is tagged.
            Add any others by hand.
          </p>
        </Field>

        <p className="text-xs text-slate-500">
          Every stat above comes from this card&apos;s own recorded data. Check names and permission
          before posting anything featuring an identifiable participant.
        </p>
      </div>
    </details>
  );
}
