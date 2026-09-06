# Voice Tracking

## Status

Voice tracking is implemented for basketball on `GameTrackPage`. Code and automated regression
work are complete. Production-like testing on physical Chrome Android and Safari iOS devices, plus
the release decision based on those results, is still pending.

Voice tracking is optional, session-only, and progressively enhanced. The existing buttons remain
the complete fallback and behave as before when voice is off or unavailable. No server changes or
new dependencies were required.

## What is implemented

### Primary court interaction

- The scorekeeper enables **Voice Tracking** in More.
- More includes an in-app help modal covering the tracking process, the phrase format required for
  the current game type, complete tables for shots, non-shot stats, dual-team commands, follow-ups,
  controls, and expected refusals, plus the requirement that attributed players are currently on
  court.
- The Court surface shows a lightweight instruction to select a court position. It does not show an
  idle microphone button or separate voice card.
- A court tap captures the exact location and starts one short listening turn automatically. The
  event picker stays closed while recognition is active.
- A valid, unambiguous command records through the same handler as the equivalent button action.
- A parsing, participant, permission, timeout, no-speech, or service failure opens the normal event
  picker with the tapped location retained. The scorekeeper can finish with buttons without tapping
  the court again.
- The voice turn can be cancelled before a final transcript is accepted. Cancellation also falls
  back to the retained-location picker; a claimed command is allowed to finish exactly once.
- A failed or uncertain write is never automatically retried.

### Supported primary events

Every player-attributed action in the Court event picker has a voice path:

| Event                         | Stored stat type        |
| ----------------------------- | ----------------------- |
| 2PT field goal made / missed  | `FG2_MADE` / `FG2_MISS` |
| 3PT field goal made / missed  | `FG3_MADE` / `FG3_MISS` |
| Free throw made / missed      | `FT_MADE` / `FT_MISS`   |
| Offensive / defensive rebound | `OREB` / `DREB`         |
| Steal                         | `STL`                   |
| Block                         | `BLK`                   |
| Turnover                      | `TOV`                   |
| Foul                          | `FOUL`                  |

The tapped location remains authoritative for a field goal. If the command explicitly says two or
three, it must agree with the inferred court location or nothing is written.

### Follow-ups and controls

The picker contains a microphone only for a real follow-up question. A follow-up uses a separate
voice turn, so the transcript that records a primary event cannot answer its follow-up too.

- A made field goal can be followed by the assister, `unassisted`, or `skip`.
- A missed field goal or free throw can be followed by the rebounder. A one-sided game also accepts
  `opponent`; a dual-team game resolves the rebounder across both current lineups.
- In dual-team tracking, steal, block, and turnover questions accept a player from the required
  opposing lineup.
- The current data model does not store the victim of a foul, so that question can only be skipped.
- `undo` removes only the event that was last when listening began. It is refused if a follow-up is
  open or if the event log changes during the voice turn.

### Participant matching

- Voice resolves players against the current on-court lineup, never the bench.
- A unique exact jersey number wins first. Jersey `0` is supported.
- Otherwise, an exact normalized full name or unique exact first/last name is accepted.
- Duplicate, inactive, off-court, unknown, wrong-side, or question-ineligible players are rejected
  without a write.
- Dual-team primary commands require `home` or `away`. One-sided primary commands reject a side.

## General approach

The data flow is:

1. A court tap or follow-up microphone starts `useSpeechRecognition`.
2. One final transcript is passed to the adapter registered for `game.sport`.
3. `basketballVoiceAdapter` returns an allow-listed intent.
4. `resolveParticipant` matches against the captured current lineup.
5. The existing `GameTrackPage` event handler builds the same event as the equivalent button.
6. `submitEvent` decorates the payload once and sends it through `gamesApi`.

The speech lifecycle is sport-neutral. Basketball vocabulary belongs to the basketball adapter, and
the adapter registry is the extension point for another sport. Raw transcript text never becomes a
stat type and is never sent to the TSW API.

Voice reuses existing event handlers instead of maintaining a parallel write workflow. They receive
explicit player, team side, location, clock snapshot, video timestamp, and court-layout context.

Recognition captures immutable game, sport, tracking mode, lineup, participant, location, prompt,
and timing context when listening starts. Stale context is rejected. Recognition is final-result
only, limited to one command per turn, and guarded against result/error/end/timeout races.

Browser behavior:

- `continuous = false`
- `interimResults = false`
- `maxAlternatives = 1`
- language is `en-GB`
- listening timeout is 8 seconds
- microphone-start timeout is 15 seconds, allowing time for a permission prompt
- recognition aborts on cancel, disable, relevant context change, page hide, or unmount
- processing cannot be cancelled after a final transcript has been claimed
- insecure and unsupported browsers keep the button workflow and explain why voice is unavailable

The More panel discloses that the browser speech service may process audio remotely. TSW does not
store audio or transcripts, and voice data is not included in analytics or production logs.

## Voice command schema

### Primary commands

`[side] <participant> <action>`

- `side`: `home` or `away`; required only in dual-team tracking.
- `participant`: jersey number or uniquely matching player name.
- `action`: one supported basketball action from the table below.

Input is normalized for case, punctuation, apostrophes, hyphens, and diacritics. It is limited to
160 characters and 20 tokens. Jersey digits `0`–`999`, number words zero through nineteen, and
compound tens-plus-units such as `twenty three` are supported. Exact multiples of ten such as jersey
20 should currently be spoken as digits. `number` and `jersey` may prefix a spoken number.

| Action            | Accepted form                                                                 |
| ----------------- | ----------------------------------------------------------------------------- |
| Field goal        | `make`, `made`, `miss`, or `missed`, optionally with a two/three point phrase |
| Free throw        | `free throw` plus `make`/`made`/`miss`/`missed`, in either order              |
| Defensive rebound | `defensive rebound`                                                           |
| Offensive rebound | `offensive rebound`                                                           |
| Steal             | `steal`                                                                       |
| Block             | `block`                                                                       |
| Turnover          | `turnover`                                                                    |
| Foul              | `foul`                                                                        |
| Undo              | `undo` by itself, with no follow-up open                                      |

Two-point forms are `two`, `2`, `2pt`, `two point`, `two points`, or `two pointer`. Equivalent
three-point forms are accepted. `to` and `too` mean two only in an expected number slot.

### Follow-up commands

A follow-up accepts `[side] <participant>` or one of the bare commands `unassisted`, `opponent`, and
`skip`. The prompt determines which answers are legal. `unassisted` applies only to an assist
question, and `opponent` applies only to a one-sided rebound question.

## Real voice examples

Tap the event location first; that tap starts listening.

### One-sided tracking

| Event             | Say                            | Result                                              |
| ----------------- | ------------------------------ | --------------------------------------------------- |
| 2PT make          | `13 two point field goal made` | `FG2_MADE` if the tap is inside the arc             |
| 2PT miss          | `13 2pt field goal missed`     | `FG2_MISS` if the tap is inside the arc             |
| 3PT make          | `13 3pt field goal made`       | `FG3_MADE` if the tap is outside the arc            |
| 3PT miss          | `13 3pt field goal missed`     | `FG3_MISS` if the tap is outside the arc            |
| Inferred make     | `13 made`                      | The court decides `FG2_MADE` or `FG3_MADE`          |
| Inferred miss     | `13 missed`                    | The court decides `FG2_MISS` or `FG3_MISS`          |
| Free throw make   | `13 free throw made`           | `FT_MADE`                                           |
| Free throw miss   | `13 missed free throw`         | `FT_MISS`                                           |
| Offensive rebound | `13 offensive rebound`         | `OREB`                                              |
| Defensive rebound | `13 defensive rebound`         | `DREB`                                              |
| Steal             | `13 steal`                     | `STL`                                               |
| Block             | `Alex block`                   | `BLK`                                               |
| Turnover          | `twenty three turnover`        | `TOV` for jersey 23                                 |
| Foul              | `Alex Morgan foul`             | `FOUL`                                              |
| Undo              | `undo`                         | Removes the captured last event if it is still last |

### Dual-team tracking

Prefix every primary command with a side:

- `home 13 3pt field goal made`
- `away 7 3pt field goal missed`
- `home Alex free throw made`
- `away Blake defensive rebound`
- `home number 13 steal`
- `away twenty three turnover`

### Follow-up answers

- Assist: `Blake`, `away 7`, `unassisted`, or `skip`.
- Rebound: `Blake`, `away 7`, `opponent` in a one-sided game, or `skip`.
- Turnover/steal or missed-shot counterpart: the requested on-court player, including the side in a
  dual-team game when needed.
- Foul victim: `skip` only, because that answer is not stored by the current model.

### Commands intentionally rejected

| Say                                | Why it is rejected                       |
| ---------------------------------- | ---------------------------------------- |
| `Nobody steal`                     | No current on-court player matches       |
| `21 jump shot made`                | `jump shot` is not current vocabulary    |
| `13 made four`                     | Four is not a supported field-goal value |
| `13 made miss`                     | Conflicting outcomes                     |
| `13 made two three`                | Conflicting point values                 |
| `13 travelled`                     | Unsupported action                       |
| `13`                               | Missing action                           |
| `home 13 made` in a one-sided game | A side is not allowed                    |
| `13 made` in a dual-team game      | A side is required                       |

Opponent +1/+2/+3 primary commands and spoken substitutions are not implemented. Use the existing
buttons for those events.

## Implementation progress

### Completed tasks

1. **Command adapter and participant resolver.** Added bounded normalization, deterministic primary
   and follow-up parsing, sport adapter lookup, and current-lineup matching with typed no-write
   failures.
2. **Existing handler preparation.** Made manual handlers accept explicit voice context,
   consolidated payload decoration, preserved timing/location data, made cleanup idempotent, and
   retained manual behavior and optimistic-concurrency safeguards.
3. **Speech lifecycle and primary commands.** Added the one-shot browser hook, optional More
   setting, court-tap push-to-talk, fallback picker, status/cancel feedback, and all player-attributed
   Court actions.
4. **Follow-ups and controls.** Connected assist, rebound, opposing-player answers, skip, and safe
   undo to the existing follow-up and removal workflows.

### Unfinished task: device verification and release record

Completed:

- Full repository suite passes: 93 client files with 763 tests and 91 server suites with 978 tests.
- Client and server lint pass.
- Production client build passes; only existing Browserslist-age and chunk-size notices remain.
- Environment validation and the repository secret scan pass.
- Files touched by voice tracking pass Prettier and `git diff --check`.

Pending:

- Test production-like HTTPS builds on physical Chrome Android and Safari iOS; record browser and OS
  versions.
- Verify permission grant/deny, microphone-start timeout, listening timeout, no speech,
  cancellation, disable, and unsupported-browser fallback.
- Run at least 20 representative accepted commands from the examples above in quiet and realistic
  gym noise. Record the exact transcript, acceptance, payload correctness, and first-attempt rate.
- Verify every rejected command makes zero writes and every accepted command makes exactly one.
- Compare voice and button payloads for player, side, stat, coordinates/zone, clock snapshot, video
  timestamp, and court layout.
- Verify follow-ups, undo, concurrent updates, HTTP 409, uncertain network responses, substitutions,
  insertion/editing, finish/exit, and teardown across portrait, landscape-compact, desktop,
  fullscreen, and video-first layouts.
- Have the product/privacy owner confirm whether the public privacy notice needs browser speech
  processing language. If the notice changes, update its date and `CONSENT_VERSION` as required by
  `PrivacyPage`.
- Record the supported device/browser matrix and decide whether results meet the release bar.

## Open questions

1. Should follow-up questions start listening automatically, or retain their microphone button?
   They currently retain the button.
2. Should `shot`, `jump shot`, `layup`, and `dunk` be added as vocabulary? They are currently
   rejected rather than guessed.
3. What minimum first-attempt success rate in realistic gym noise is required to ship voice as
   enabled rather than experimental?
4. Which physical browser/OS versions will be supported after device testing?

Freeze the grammar before collecting final gym-noise results so different runs remain comparable.

## Deferred work

Create separate plans for these rather than expanding this implementation:

1. Locationless shots and their downstream data-model/reporting changes.
2. Opponent aggregate commands for one-sided tracking.
3. Spoken zones stored distinctly from exact coordinates.
4. Confirmed off-court substitution/lineup reconciliation.
5. Temporary participants and post-game reconciliation.
6. A replacement speech provider if native recognition fails device/noise testing.
7. Additional sport adapters and locales.

## Main files

| File                                                                 | Responsibility                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `client/src/features/games/voice/useSpeechRecognition.js`            | One-shot browser speech lifecycle                                  |
| `client/src/features/games/voice/voiceText.js`                       | Text normalization and spoken numbers                              |
| `client/src/features/games/voice/resolveParticipant.js`              | Current-lineup participant matching                                |
| `client/src/features/games/voice/adapters/basketballVoiceAdapter.js` | Basketball grammar and actions                                     |
| `client/src/features/games/voice/voiceAdapters.js`                   | Sport adapter registry                                             |
| `client/src/features/games/components/VoiceTrackingControl.jsx`      | Instruction, status, follow-up microphone, and accessible feedback |
| `client/src/features/games/pages/GameTrackPage.jsx`                  | Voice orchestration and existing handler reuse                     |

## References

- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN: Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
