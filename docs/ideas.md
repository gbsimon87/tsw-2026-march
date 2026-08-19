# Product Backlog

Ideas only; nothing here is committed work. Remove shipped items instead of
turning this file into a release log.

## Highest Value

| Idea                                | Primary user      | Implemented | Notes                                                                                                                                         |
| ----------------------------------- | ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Post-game coach report              | Coaches           | No          | Derive runs, droughts, foul trouble, and key performers from game events.                                                                     |
| [Season trends](./season-trends.md) | Coaches, players  | Yes         | Last-five and season time series for shooting, turnovers, and rebounding.                                                                     |
| Stat-correction workflow            | Players, managers | No          | Request, review, approve, and audit event corrections; use video timestamps.                                                                  |
| Personalized Pulse                  | Fans, players     | No          | Filter feed posts through existing user, league, and league-team follows.                                                                     |
| Milestones and awards               | Players, leagues  | Partial     | Player milestones live in production and backfilled; see [project knowledge](./PROJECT-KNOWLEDGE.md#player-milestones). Season awards remain. |

## League Administration

| Idea                            | Size | Implemented | Main dependency                                            |
| ------------------------------- | ---- | ----------- | ---------------------------------------------------------- |
| Reschedule history              | XS   | No          | Append-only history on `Game`; notifications optional.     |
| Custom standings rules          | S    | No          | League config consumed by aggregate recomputation.         |
| Bulk roster import              | S    | No          | CSV preview and conflict resolution.                       |
| League audit log                | S    | No          | New append-only model and write-path instrumentation.      |
| Announcements                   | M    | No          | New model plus admin and public surfaces.                  |
| Venue and time-slot management  | M    | No          | Structured venues replacing free-text game venue.          |
| Season setup wizard             | M    | No          | Orchestrate existing season, roster, and schedule actions. |
| Duplicate player merge          | M    | No          | Referential updates across stats, members, and games.      |
| Delegated admin scopes          | M    | No          | New permissions beneath league manager.                    |
| Notifications and weekly digest | L    | No          | Preferences, templates, retries, and scheduled jobs.       |
| Registration and fees           | L    | No          | New Stripe flows distinct from subscriptions.              |
| Divisions and conferences       | L    | No          | Changes schedules, standings, and public navigation.       |
| Playoffs and brackets           | L    | No          | New competition model and progression rules.               |
| Stat-correction queue           | XL   | No          | Crosses immutable game history, aggregates, and audit.     |
| Multi-league organization view  | XL   | No          | New organization and cross-league authorization model.     |

## Other Opportunities

- lineup and stint analytics;
- opponent scouting and private coaching notes;
- advanced shot-chart filters and video-linked events;
- recruiting fields and media galleries on player profiles;
- PDF reports and scouting packs;
- officials assignments, eligibility, suspensions, and roster locks;
- sponsor placements on public league pages;
- standalone-player account claiming and unified-profile support;
- email or SMS game reminders and results.

## Social Media And Marketing

Product work that makes the low-friction campaign in
[`marketing-social.md`](./marketing-social.md) possible. The target operating
loop is: **a game finishes, TSW prepares a social kit, and the operator chooses
what to publish**. The backlog does not assume that a live league supplies the
content; every asset must also render from the demo dataset.

### Current Baseline

- Game, player, and team feed cards can be shared as PNGs. The off-screen target
  is 1080x1350, but `html2canvas` captures it at `scale: 2`; add a pixel-dimension
  test and resize step before promising a 1080x1350 file.
- The player card shows season averages, not the player's line from a particular
  game. The latter is the more socially compelling asset.
- Milestones and YouTube-backed highlight clips are generated in the Pulse, but
  neither has the same social export flow as game, player, and team cards.
- There is no 9:16 preset, carousel pack, generated caption, tagged-handle data,
  safe-area preview, batch export, or templated social video.
- The current export has a wordmark but no short CTA, account handle, public URL,
  or accessible alt-text suggestion.

### Prioritised Social Asset Backlog

Impact is the expected reduction in weekly work plus the likely share value.
Effort is relative to the current React/html2canvas and feed architecture.

|   Rank | Idea                                | Impact      | Effort | Size | Definition of done                                                                                                                                                                                                                                                                                     |
| -----: | ----------------------------------- | ----------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|  **1** | Deterministic social export presets | High        | Medium | M    | One renderer exports an exact **1080x1350 feed/card image**, **1080x1920 Story/Reel/TikTok image or cover**, and **1200x630 link-preview image**. Each preset has a visible safe-area overlay in preview, no clipped long names, and automated pixel-dimension tests.                                  |
|  **2** | Per-game player stat card           | High        | Low    | S    | From a completed game's frozen box score, export a card with player photo, name, team, opponent, result/date, and a legible PTS/REB/AST line plus one context stat. Do not reuse the season-average player spotlight for this job.                                                                     |
|  **3** | Milestone social export             | High        | Low    | S    | Add the existing milestone type to `ShareableCardExport`; use the already-snapshotted player avatar, make the achievement the headline, and include team, source game, date, TSW handle, and one CTA.                                                                                                  |
|  **4** | Completed-game social kit           | High        | Medium | M    | A single button prepares a final-score card, top-performer card, box-score carousel, 9:16 Story result, suggested caption, alt text, and tagged public link. The operator can preview and download individually or as a ZIP.                                                                           |
|  **5** | Caption, keyword, and tag assistant | High        | Low    | S    | Generate editable copy from verified data: hook, one-sentence context, question/CTA, 3-5 relevant hashtags, player/team handles when recorded, alt text, and an attributed permalink. Include one-click copy buttons; never invent a stat or handle.                                                   |
|  **6** | Social attribution and join landing | High        | Low    | XS   | Persist first-touch UTM/referrer values, distinguish Instagram and TikTok, create source-specific links, and send new visitors to a useful public page or registration rather than a login dead end. Track `social_asset_exported`, `social_share_opened`, landing, signup, and league-enquiry events. |
|  **7** | Box-score breakdown carousel        | High        | Medium | M    | Export 3-4 ordered 4:5 slides: result/hook, team comparison, top performers, and CTA. Slides share a template and can be removed or reordered without design work.                                                                                                                                     |
|  **8** | League leaders and rankings cards   | Medium-high | Medium | M    | Generate top-five scoring/rebounding/assists leaders and current table/form cards with season/date context. Provide feed and 9:16 versions and avoid publishing tables with fewer than three qualified players.                                                                                        |
|  **9** | Social identity and consent fields  | Medium-high | Medium | S    | Optional Instagram/TikTok handles for leagues, teams, and players; marketing-permission status and date; minor/adult status where appropriate; and an export guard that defaults to demo/anonymised output without recorded permission.                                                                |
| **10** | Highlight + stat receipt            | Medium-high | Medium | M    | Export a 9:16 8-12 second clip around an eligible timestamp with player/stat/result overlays, burned-in descriptive text, source-video credit, and end card. Start with user-selected clips; do not auto-publish.                                                                                      |
| **11** | Templated stat-video renderer       | Medium      | High   | L    | Turn any final score, player line, milestone, or leaderboard into a 6-10 second MP4 using only two or three transitions. No timeline editor. Export muted-safe text and an optional licensed/platform sound placeholder.                                                                               |
| **12** | Player progress card                | Medium      | Medium | M    | Compare the last five games with the prior five or a season baseline, label the sample clearly, and export a simple trend card. Suppress the asset when the sample is too small.                                                                                                                       |
| **13** | Per-page Open Graph images          | Medium      | Medium | M    | Public game, player, team, and league links render descriptive titles and 1200x630 previews from the same template system instead of the global square icon.                                                                                                                                           |
| **14** | Social content inbox                | Medium      | High   | L    | Rank newly generated assets by notability, show permission status, mark used/skipped, filter by league/date/type, and retain caption/export history. Build only after manual selection across the first 12 weeks identifies useful ranking rules.                                                      |

### Shared Design Requirements

These apply to every new asset, not just the first three items.

- Put the hook, player/team identity, and score or headline in that order. A
  viewer should understand the subject without reading the caption.
- Use tabular figures for scores and stats, support long names, and set minimum
  export-size typography rather than reusing small in-app labels.
- Prefer real player photos; fall back to team branding, then a deliberately
  styled initials treatment. Never silently present a team logo as a player
  photo.
- Treat team colours as accents, preserve TSW recognition with a stable layout,
  and check contrast automatically.
- Include `@TheSportyWay` (or the final account handle), a short CTA such as
  “Full box score in profile”, and the public entity URL in export metadata.
- Keep critical content inside platform-specific safe areas and make the safe
  area visible in the preview. Recheck presets when Instagram or TikTok UI
  changes.
- Static first, motion second. Animation is justified only when it adds a reveal,
  comparison, or real highlight; a looping static card is not a useful video.
- Generate alt text and retain a data provenance link for every stat claim.
- Never publish automatically. Generation can be automatic; selection, consent,
  tagging, and final posting remain human approvals.

### Recommended Build Sequence

1. **Foundation:** ranks 1, 5, and 6. Make every later asset correctly sized,
   quick to caption, and measurable.
2. **Weekly engine:** ranks 2, 3, 4, and 7. This supplies almost the entire
   12-week calendar with verified content.
3. **Repeatable depth:** ranks 8, 9, and 13. Add rankings, safer tagging, and
   better link sharing.
4. **Motion after evidence:** ranks 10 and 11 only for formats whose static or
   manually recorded versions already earn above-median shares or watch time.
5. **Optimisation:** ranks 12 and 14 after enough posting history exists to set
   meaningful thresholds and ranking rules.

### Commercial Readiness Items

These are not content formats, but they affect whether attention can convert.

| Idea                        | Size | Implemented | Notes                                                                                                                                                                                                                 |
| --------------------------- | ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GBP pricing for UK market   | S    | No          | Display copy is USD (`$9/mo`, `$79/yr`, `$29/mo`, `$199/season`). Verify the authoritative Stripe price currency before changing copy.                                                                                |
| Public launch of `/pricing` | M    | No          | Production currently redirects away. Until the launch decision is made, social CTAs should ask organisers to view the demo or enquire, not “buy now”. See [`pricing-manual-actions.md`](./pricing-manual-actions.md). |

## Constraints

- There is no job queue or scheduler; timed notifications need infrastructure.
- Standalone games intentionally track one roster; opponent-roster features
  change the product model.
- Billing is subscription-based and not publicly launched; registration fees
  require separate payment flows.
- Embedded game events and materialized league aggregates make stat corrections
  a data-integrity feature, not simple CRUD.
- Marketing screenshots and videos must come from the demo account unless a
  league has given explicit permission; featuring minors additionally requires
  parent or guardian consent.
- Social assets can be generated automatically, but external posting must remain
  an explicit human action until consent, attribution, failure recovery, and
  platform-policy handling are designed.
