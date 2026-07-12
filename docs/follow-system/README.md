# Follow System

> **Status:** Planned — implementation in progress on `feature/follow-system`.
> Living trackers: [`implementation-tracker.md`](./implementation-tracker.md),
> [`status-dashboard.md`](./status-dashboard.md). Decisions & open questions:
> [`decisions.md`](./decisions.md). Full design: [`architecture.md`](./architecture.md).

## Feature overview

The Follow System lets a signed-in user **follow and unfollow other user
accounts** and view everyone they follow in a dedicated, private **"Following"**
area. It is the first social-graph primitive in TSW — the #2 opportunity on the
product ideas board (Parents/Fans/Community segment: _"Follow teams/players/
leagues; personalized feed, notifications, recent results."_).

**v1 is deliberately narrow: users only.** Following teams and leagues, a
personalized feed, and notifications are documented future enhancements, not
part of v1.

## Why follow at the user-account level

A "player profile" in TSW is a `LeaguePlayer` document, and **one person can own
many** — one per league/team they're claimed in (via `LeaguePlayer.claimedByUserId`).
The app already collapses these into a single public identity at
`GET /public/players/:userId` (see the unified player profile feature in
`PROJECT-KNOWLEDGE.md` §1).

Following the **account** (keyed by `User._id`) means you follow the _person_
once and automatically track all of their profiles — no duplicate follows, no
fan-out when they join a new league. Following individual `LeaguePlayer` docs
would fragment identity and multiply relationships. So follows are **account-level**.

## Goals

- Logged-in users can follow / unfollow other users. **(Only logged-in users can follow.)**
- A private "Following" page lists everyone the current user follows.
- **Quick access:** a persistent nav link + one-click links from each card to
  the followed user's public profile (`/players/:userId`).
- A data model that extends to teams/leagues later **without a migration**.
- Correctly handle a user owning multiple player profiles (solved by
  account-level follows).

## Non-goals (v1)

- Following teams or leagues.
- Public follower/following counts or public follower lists (v1 follows are private).
- A personalized "Following" feed on The Pulse.
- Notifications (email/in-app) about followed users.
- Following standalone (non-league) team players (they have no user link yet).

## User stories

- As a fan, I can follow a player I discovered so I can find them again quickly.
- As a fan, I can open my Following page and jump straight to any followed
  player's profile in one click.
- As a fan, I can unfollow someone from their profile or from my Following list.
- As a logged-out visitor, I see a "Log in to follow" prompt instead of a broken
  button.
- As a user, following a person automatically covers all their teams/leagues —
  I never have to follow the same person twice.

## Where things live

| Layer                  | Location                                             |
| ---------------------- | ---------------------------------------------------- |
| Backend module         | `server/src/modules/follows/`                        |
| API base path          | `/api/v1/follows`                                    |
| Frontend feature       | `client/src/features/follows/`                       |
| Following page route   | `/following` (protected)                             |
| Follow button surfaces | `/players/:userId` header, homepage player discovery |

See [`architecture.md`](./architecture.md) for the full design.
