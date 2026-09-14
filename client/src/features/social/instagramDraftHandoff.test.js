import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildAttributionUrl,
  buildCaptionWithAttribution,
  buildInstagramDraft,
  setPendingInstagramDraft,
  takePendingInstagramDraft,
} from './instagramDraftHandoff';

const file = new File(['png'], 'tsw-blue-tsw.png', { type: 'image/png' });

const post = {
  id: '507f1f77bcf86cd799439011',
  caption: 'What a finish.',
  gameCard: {
    gameUrl: '/games/g1',
    teamName: 'TSW Blue',
    opponent: 'Falcons',
    recap: { team: { points: 70 }, opponent: { points: 61 } },
  },
};

const ORIGIN = 'https://dev.thesportyway.com';

beforeEach(() => {
  takePendingInstagramDraft();
});

describe('buildAttributionUrl', () => {
  it('resolves the game page against the deployed origin', () => {
    expect(buildAttributionUrl(post.gameCard, ORIGIN)).toBe(
      'https://dev.thesportyway.com/games/g1'
    );
  });

  it('contributes nothing from a local http origin', () => {
    // The server rejects a non-HTTPS attribution URL outright, so prefilling one
    // would turn every local hand-off into a 400 on submit.
    expect(buildAttributionUrl(post.gameCard, 'http://localhost:5173')).toBe('');
  });

  it('contributes nothing when the card has no game page', () => {
    expect(buildAttributionUrl({ ...post.gameCard, gameUrl: null }, ORIGIN)).toBe('');
    expect(buildAttributionUrl(null, ORIGIN)).toBe('');
  });
});

describe('buildCaptionWithAttribution', () => {
  const url = 'https://dev.thesportyway.com/games/g1';

  const link = `Full box score → ${url}`;

  it('appends the link below the caption, behind a lead-in', () => {
    expect(buildCaptionWithAttribution('What a finish.', url)).toBe(`What a finish.\n\n${link}`);
  });

  it('uses the link alone when the post had no caption', () => {
    expect(buildCaptionWithAttribution('', url)).toBe(link);
    expect(buildCaptionWithAttribution(null, url)).toBe(link);
  });

  it('leaves the caption alone when there is no link to add', () => {
    expect(buildCaptionWithAttribution('What a finish.', '')).toBe('What a finish.');
  });

  it('does not repeat a link the caption already carries', () => {
    const caption = `Recap: ${url}`;
    expect(buildCaptionWithAttribution(caption, url)).toBe(caption);
  });

  it('drops the link rather than truncating a caption at the 2200 limit', () => {
    // The URL stays on the record in attributionUrl either way; silently cutting
    // the operator's words to make room would be the worse trade.
    const long = 'x'.repeat(2199);
    expect(buildCaptionWithAttribution(long, url)).toBe(long);
  });
});

describe('buildInstagramDraft', () => {
  it('carries the file, source id, a human label, the caption and attribution', () => {
    expect(buildInstagramDraft(post, file, ORIGIN)).toEqual({
      file,
      sourcePostId: '507f1f77bcf86cd799439011',
      sourceLabel: 'TSW Blue vs Falcons',
      caption: 'What a finish.\n\nFull box score → https://dev.thesportyway.com/games/g1',
      attributionUrl: 'https://dev.thesportyway.com/games/g1',
    });
  });

  it('falls back to the bare link when the post had no caption', () => {
    expect(buildInstagramDraft({ ...post, caption: null }, file, ORIGIN).caption).toBe(
      'Full box score → https://dev.thesportyway.com/games/g1'
    );
  });

  it('leaves the caption empty when neither a caption nor a link exists', () => {
    expect(
      buildInstagramDraft({ ...post, caption: null }, file, 'http://localhost:5173').caption
    ).toBe('');
  });
});

describe('pending draft hand-off', () => {
  it('returns nothing when no card has been shared', () => {
    expect(takePendingInstagramDraft()).toBeNull();
  });

  it('hands the draft over exactly once', () => {
    const draft = buildInstagramDraft(post, file, ORIGIN);
    setPendingInstagramDraft(draft);

    expect(takePendingInstagramDraft()).toBe(draft);
    // A second read must be empty: returning to the admin page later should
    // start from a clean form, not re-attach a stale image.
    expect(takePendingInstagramDraft()).toBeNull();
  });

  it('replaces an unclaimed draft rather than queueing both', () => {
    setPendingInstagramDraft(buildInstagramDraft(post, file, ORIGIN));
    const second = buildInstagramDraft({ ...post, id: '507f1f77bcf86cd799439012' }, file, ORIGIN);
    setPendingInstagramDraft(second);

    expect(takePendingInstagramDraft()).toBe(second);
  });

  it('clears the draft when handed a nullish value', () => {
    setPendingInstagramDraft(buildInstagramDraft(post, file, ORIGIN));
    setPendingInstagramDraft(null);

    expect(takePendingInstagramDraft()).toBeNull();
  });
});

// Social backlog rank 3: the hand-off used to reach straight into post.gameCard.
// Milestones carry their provenance on milestoneCard instead.
describe('buildInstagramDraft — milestone posts', () => {
  const milestonePost = {
    id: '507f1f77bcf86cd799439013',
    caption: null,
    milestoneCard: {
      label: '1,000 career points',
      playerName: 'Jordan Miles',
      teamName: 'TSW Blue',
      gameUrl: '/games/g9',
    },
  };

  it('attributes a milestone to the game it was earned in', () => {
    expect(buildInstagramDraft(milestonePost, file, ORIGIN).attributionUrl).toBe(
      'https://dev.thesportyway.com/games/g9'
    );
  });

  it('labels the draft with the player and the achievement', () => {
    expect(buildInstagramDraft(milestonePost, file, ORIGIN).sourceLabel).toBe(
      'Jordan Miles · 1,000 career points'
    );
  });

  it('still refuses a non-HTTPS origin', () => {
    expect(buildInstagramDraft(milestonePost, file, 'http://localhost:5173').attributionUrl).toBe(
      ''
    );
  });

  it('falls back to the achievement alone when the player is unknown', () => {
    expect(
      buildInstagramDraft(
        { ...milestonePost, milestoneCard: { ...milestonePost.milestoneCard, playerName: null } },
        file,
        ORIGIN
      ).sourceLabel
    ).toBe('1,000 career points');
  });

  it('names a post type it cannot describe rather than throwing', () => {
    expect(buildInstagramDraft({ id: 'p1', caption: 'Hi', type: 'image' }, file, ORIGIN)).toEqual({
      file,
      sourcePostId: 'p1',
      sourceLabel: 'TSW post',
      caption: 'Hi',
      attributionUrl: '',
    });
  });
});
