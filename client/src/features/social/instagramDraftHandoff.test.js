import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildInstagramDraft,
  setPendingInstagramDraft,
  takePendingInstagramDraft,
} from './instagramDraftHandoff';

const file = new File(['png'], 'tsw-blue-tsw.png', { type: 'image/png' });

const post = {
  id: '507f1f77bcf86cd799439011',
  caption: 'What a finish.',
  gameCard: {
    teamName: 'TSW Blue',
    opponent: 'Falcons',
    recap: { team: { points: 70 }, opponent: { points: 61 } },
  },
};

beforeEach(() => {
  takePendingInstagramDraft();
});

describe('buildInstagramDraft', () => {
  it('carries the file, source id, a human label, and the Pulse caption', () => {
    expect(buildInstagramDraft(post, file)).toEqual({
      file,
      sourcePostId: '507f1f77bcf86cd799439011',
      sourceLabel: 'TSW Blue vs Falcons',
      caption: 'What a finish.',
    });
  });

  it('normalises a missing caption to an empty string for the form', () => {
    expect(buildInstagramDraft({ ...post, caption: null }, file).caption).toBe('');
  });
});

describe('pending draft hand-off', () => {
  it('returns nothing when no card has been shared', () => {
    expect(takePendingInstagramDraft()).toBeNull();
  });

  it('hands the draft over exactly once', () => {
    const draft = buildInstagramDraft(post, file);
    setPendingInstagramDraft(draft);

    expect(takePendingInstagramDraft()).toBe(draft);
    // A second read must be empty: returning to the admin page later should
    // start from a clean form, not re-attach a stale image.
    expect(takePendingInstagramDraft()).toBeNull();
  });

  it('replaces an unclaimed draft rather than queueing both', () => {
    setPendingInstagramDraft(buildInstagramDraft(post, file));
    const second = buildInstagramDraft({ ...post, id: '507f1f77bcf86cd799439012' }, file);
    setPendingInstagramDraft(second);

    expect(takePendingInstagramDraft()).toBe(second);
  });

  it('clears the draft when handed a nullish value', () => {
    setPendingInstagramDraft(buildInstagramDraft(post, file));
    setPendingInstagramDraft(null);

    expect(takePendingInstagramDraft()).toBeNull();
  });
});
