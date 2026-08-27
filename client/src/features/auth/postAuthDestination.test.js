import { describe, expect, test } from 'vitest';
import { getPostAuthDestination, needsOnboarding } from './postAuthDestination';

describe('post-authentication destination', () => {
  test('sends a new or unfinished user to onboarding', () => {
    expect(needsOnboarding({ onboarding: { status: 'not_started' } })).toBe(true);
    expect(getPostAuthDestination({ onboarding: { status: 'in_progress' } })).toBe('/onboarding');
  });

  test('keeps explicit gated destinations ahead of onboarding', () => {
    expect(getPostAuthDestination({ onboarding: { status: 'not_started' } }, '/league/city')).toBe(
      '/league/city'
    );
  });

  test('keeps existing and completed users on the Pulse', () => {
    expect(getPostAuthDestination({})).toBe('/pulse');
    expect(getPostAuthDestination({ onboarding: { status: 'completed' } })).toBe('/pulse');
    expect(getPostAuthDestination({ onboarding: { status: 'skipped' } })).toBe('/pulse');
  });
});
