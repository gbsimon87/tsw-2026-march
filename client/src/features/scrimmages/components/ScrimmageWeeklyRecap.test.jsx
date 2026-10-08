import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ScrimmageWeeklyRecap } from './ScrimmageWeeklyRecap';
import { recapData } from './weeklyRecapFixture';
import { scrimmagesApi } from '../api/scrimmagesApi';
import { trackEvent } from '../../analytics/trackEvent';
vi.mock('../api/scrimmagesApi', () => ({ scrimmagesApi: { session: vi.fn() } }));
vi.mock('../../analytics/trackEvent', () => ({ trackEvent: vi.fn() }));
function show(data = recapData, props = {}) {
  return render(
    <MemoryRouter>
      <ScrimmageWeeklyRecap data={data} {...props} />
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('navigator', {
    share: vi.fn().mockResolvedValue(undefined),
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  scrimmagesApi.session.mockResolvedValue(recapData);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test('reuses weekly standings and links to video plays filtered to this week', () => {
  show();
  expect(screen.getByRole('heading', { name: 'We-ball Wednesdays · Week 1' })).toBeInTheDocument();
  expect(screen.getByText('John · 3.50')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Watch John’s plays' })).toHaveAttribute(
    'href',
    '/scrimmage/series-1/players/john?seasonId=season-1&sessionId=week-1'
  );
  expect(screen.getAllByText(/MVP = \(Points/).length).toBeGreaterThan(0);
});
test('copies the canonical public recap link from an admin page', async () => {
  show(recapData, { adminMode: true });
  fireEvent.click(screen.getByRole('button', { name: 'Copy recap link' }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/scrimmage/series-1/sessions/week-1?tab=recap`
    )
  );
  expect(screen.getByRole('link', { name: 'Watch John’s plays' })).toHaveAttribute(
    'href',
    '/admin/scrimmage/series-1/players/john?seasonId=season-1&sessionId=week-1'
  );
});
test('rechecks access and shares fresh corrected stats through the native share sheet', async () => {
  const latest = { ...recapData, standings: [{ ...recapData.standings[0], points: 19 }] };
  scrimmagesApi.session.mockResolvedValue(latest);
  const onRefresh = vi.fn();
  show(recapData, { onRefresh });
  fireEvent.click(screen.getByRole('button', { name: 'Share weekly recap' }));
  await waitFor(() => expect(navigator.share).toHaveBeenCalled());
  expect(scrimmagesApi.session).toHaveBeenCalledWith('series-1', 'week-1');
  expect(navigator.share.mock.calls[0][0]).toMatchObject({
    url: `${window.location.origin}/scrimmage/series-1/sessions/week-1?tab=recap`,
    text: expect.stringContaining('John: 19 points'),
  });
  expect(onRefresh).toHaveBeenCalledWith(latest);
  expect(trackEvent).toHaveBeenCalledWith('share_completed', {
    target_type: 'scrimmage_recap',
    source: 'scrimmage_session',
    method: 'native',
    result: 'succeeded',
  });
});
test('private recaps share only an access-protected link, even if privacy just changed', async () => {
  scrimmagesApi.session.mockResolvedValue({
    ...recapData,
    scrimmage: { ...recapData.scrimmage, isPublic: false },
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Share weekly recap' }));
  await waitFor(() => expect(navigator.share).toHaveBeenCalled());
  expect(navigator.share.mock.calls[0][0]).not.toHaveProperty('text');
  cleanup();
  show({ ...recapData, scrimmage: { ...recapData.scrimmage, isPublic: false } });
  expect(screen.queryByRole('button', { name: 'Copy recap text' })).not.toBeInTheDocument();
  expect(screen.getByText(/only be opened by admins and approved members/)).toBeInTheDocument();
});
test.each(['unpublished', 'inaccessible'])(
  'does not share a week that has become %s',
  async (state) => {
    if (state === 'unpublished')
      scrimmagesApi.session.mockResolvedValue({
        ...recapData,
        session: { ...recapData.session, publishedAt: null },
      });
    else scrimmagesApi.session.mockRejectedValue(new Error('Scrimmage not found'));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Share weekly recap' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(navigator.share).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  }
);
test('cancelling the share sheet does not report success or show an error', async () => {
  navigator.share.mockRejectedValue(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Share weekly recap' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Share weekly recap' })).toBeEnabled()
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(trackEvent).not.toHaveBeenCalledWith('share_completed', expect.anything());
});
test('desktop and missing clipboard support retain selectable link and recap text', () => {
  vi.stubGlobal('navigator', {});
  show();
  expect(screen.queryByRole('button', { name: 'Share weekly recap' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Recap link')).toHaveValue(
    `${window.location.origin}/scrimmage/series-1/sessions/week-1?tab=recap`
  );
  expect(screen.getByLabelText('Recap text').value).toContain('John: 12 points');
});
test('does not expose any sharing controls for unpublished admin previews', () => {
  show({ ...recapData, session: { ...recapData.session, publishedAt: null } }, { adminMode: true });
  expect(screen.queryByLabelText('Weekly recap')).not.toBeInTheDocument();
});
test('clipboard text is refreshed and never copies stats after a visibility change', async () => {
  scrimmagesApi.session.mockResolvedValue({
    ...recapData,
    scrimmage: { ...recapData.scrimmage, isPublic: false },
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Copy recap text' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('now private');
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});
test('clipboard text uses corrected weekly stats and reports successful copies', async () => {
  scrimmagesApi.session.mockResolvedValue({
    ...recapData,
    standings: [{ ...recapData.standings[0], points: 19 }],
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Copy recap text' }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('John: 19 points')
    )
  );
  expect(trackEvent).toHaveBeenCalledWith('share_completed', {
    target_type: 'scrimmage_recap',
    source: 'scrimmage_session',
    method: 'clipboard',
    result: 'succeeded',
  });
});
