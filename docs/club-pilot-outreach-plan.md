# Club Pilot Outreach Plan

## Summary

Use the current product as a white-glove pilot for a small set of youth basketball clubs reached through warm introductions first. The objective is not broad customer acquisition yet; it is to prove that one coach/manager can successfully use TSW during real games, get useful post-game outputs, and want to keep using it after the first trial window.

This plan assumes the product is already functional enough for a controlled pilot, but not yet ready for a high-volume self-serve launch. The outreach motion should therefore optimize for learning speed, close support, and clear evidence of value.

## What The App Currently Does

TSW is a basketball team stat-tracking app with a clear end-to-end flow already present in the repo:

- Team and roster setup
- Game creation
- Live event tracking during games on a full-court interface
- Starting five and substitution tracking
- Post-game recap, box score, and replay
- Public team/player/game surfaces for sharing
- Feed/share card layer
- Team-level Pro billing for replay and public shot-map access

The most pilot-relevant value proposition today is:

- fast live stat capture during games
- immediate usable box scores and recaps after games
- public sharing for players, families, and club visibility

The current limitations that matter for outreach positioning:

- one tracked team at a time
- opponent support is mostly score totals, not opponent roster/player tracking
- UX polish is still in progress in tracking and team management
- some server integration tests fail in the current sandbox due to `listen EPERM`, so "tested" should not be oversold without environment-specific verification

## Pilot Goal

Primary goal:

- Prove real-world repeated usage by 2 to 4 youth clubs over a short pilot period

Success criteria:

- At least 2 clubs complete onboarding and track at least 2 real games each
- At least 1 club continues using the app after the guided pilot period
- At least 80% of pilot games reach a completed box score without support-intensive recovery
- At least 3 concrete workflow pains and 3 concrete "must keep" strengths are captured from real users
- At least 1 testimonial, quote, or case-study style artifact is collected from a satisfied pilot club

## Target User And Buyer

Primary user:

- team manager, assistant coach, or stat-keeper responsible for live tracking

Economic buyer for now:

- head coach or club director

Secondary beneficiaries to mention in outreach:

- players
- parents/families
- club social/media staff

Do not position the app first as advanced analytics software. Position it as a practical game-day workflow tool that produces credible outputs immediately.

## Outreach Positioning

Core message:

- "TSW helps your team capture live game stats quickly and turn them into usable box scores, recaps, and shareable updates right after the game."

Message pillars:

- simple game-day workflow
- useful immediately after the buzzer
- better communication with players and families
- low-risk pilot with close support

Avoid leading with:

- billing
- feed/social features as the main product
- future roadmap items like season reporting, video, or advanced analytics

## Pilot Offer Structure

Offer a founder-led pilot to a small number of clubs.

Recommended pilot package:

- 30-day pilot
- 1 team per club for the first phase
- free during pilot
- white-glove onboarding
- direct support during first live game
- short post-game feedback call after first and second uses

What to ask from each club in return:

- willingness to use the app in real games
- permission to gather workflow feedback
- one short testimonial if the pilot is successful
- permission to anonymize basic pilot outcomes for future outreach

## Club Selection Criteria

Prioritize clubs that meet most of these conditions:

- youth club with active schedule over the next 2 to 6 weeks
- one clear operator for stats during games
- openness to trying tools without long procurement
- at least moderate parent/player communication needs
- accessible via warm intro
- local enough for direct support if needed

Avoid first-round pilot targets that require:

- district procurement
- formal IT/security review
- opponent roster tracking as a hard requirement
- advanced season analytics before adoption

## Outreach Funnel

### Stage 1: Build a short target list

Create a list of 15 to 25 warm or warm-adjacent clubs.

For each club capture:

- club name
- contact name
- role
- relationship source
- age group / level
- season status
- likely pain point
- likely next game date
- warm intro path
- status

### Stage 2: Initial contact

Use warm intros first with a short message asking for a 15-minute conversation.

Warm intro message structure:

- one-line context from mutual contact
- one-sentence problem statement
- one-sentence product summary
- explicit low-friction pilot ask
- clear CTA for a short call

### Stage 3: Discovery call

Goal of the first call:

- confirm they actually have the problem
- identify who would track stats live
- understand current workflow
- judge whether they are a fit for a pilot now

Discovery questions:

- How do you currently track game stats?
- Who does it during the game?
- What is frustrating about the current process?
- What do you need immediately after a game?
- Do players/parents expect stats or summaries?
- How many games in the next month could we test on?

Qualification rules:

- proceed only if they have a real upcoming usage opportunity and a named operator

### Stage 4: Demo and pilot setup

Run a short demo focused on one realistic game flow:

- create team
- set roster
- create game
- track a few possessions
- finish game
- show box score, recap, and public output

Do not demo edge-case breadth. Demo speed and clarity.

### Stage 5: Live game support

For the first tracked game per club:

- be available in real time
- observe where users hesitate
- log every support question
- capture time-to-first-event and time-to-complete-game
- note any manual recovery steps needed

### Stage 6: Post-game review

Within 24 hours of each pilot game, collect:

- what worked
- what was confusing
- what they expected but did not find
- whether they would use it again next game
- what output they actually shared with others

## Required Assets Before Outreach

Prepare these before contacting clubs:

- 1 concise landing/demo deck
- 1 founder outreach email
- 1 warm intro blurb
- 1 15-minute demo script
- 1 pilot one-pager
- 1 onboarding checklist
- 1 feedback form/interview script
- 1 pilot tracking sheet/CRM

Recommended content for the pilot one-pager:

- what TSW does today
- who it is for
- what the pilot includes
- what is expected from the club
- pilot duration
- support model
- known current boundaries

## Product Readiness Work To Support Outreach

Before active outreach, verify these flows in a real deployed environment:

- sign up / login
- team creation and roster editing
- game creation
- live event tracking on mobile
- finishing a game
- viewing recap and box score
- public game/team/player links
- feed posting if it will be shown in the pilot
- Pro upgrade path only if monetization will be discussed

Because the current repo shows tracking UX polish and deployment readiness still in progress, define a pilot-safe product subset:

- core team setup
- game creation
- live tracking
- post-game recap and box score
- public sharing links

Treat these as optional/nonessential during pilot:

- Pro billing
- replay as a paid conversion lever
- feed as a primary adoption driver

## Metrics And Data To Capture

For each pilot club and game capture:

- club
- team
- operator role
- date
- whether onboarding completed
- whether live game was tracked fully
- time spent onboarding
- time spent supporting first game
- number of support interruptions during game
- game completion success or failure
- outputs viewed after game
- outputs shared after game
- willingness to use again
- top complaints
- top praised features

Primary pilot dashboard metrics:

- outreach to call conversion
- call to demo conversion
- demo to pilot conversion
- pilot activation rate
- first-game completion rate
- second-game retention rate
- qualitative NPS-style sentiment
- testimonial count

## Messaging Variants To Test

Test only 3 message angles at first:

1. Game-day efficiency
   Focus: "track stats live without a messy manual workflow"

2. Immediate post-game clarity
   Focus: "box scores and recap ready right after the game"

3. Family/player visibility
   Focus: "share results and progress more easily"

Keep the rest of the pitch constant so response differences are meaningful.

## Risks And Mitigations

Risk:

- Live tracking is too demanding during real games
  Mitigation:
- require a dedicated stat-keeper and support the first game live

Risk:

- Clubs ask for opponent player tracking
  Mitigation:
- state clearly that current pilot scope focuses on one team's stats plus opponent scoring totals

Risk:

- Pilot clubs like the idea but do not actually use it
  Mitigation:
- only enroll clubs with a scheduled game inside the next 14 days

Risk:

- Product polish issues create false-negative feedback
  Mitigation:
- keep pilot cohort small and support closely rather than running wide outbound

Risk:

- Outreach drifts into "sell everything"
  Mitigation:
- use one narrow pilot promise and one narrow user persona

## Public APIs / Interfaces / Types To Add Or Define

No code changes are being made in this plan, but the implementation phase should define these operational interfaces:

- Pilot CRM schema
  - `club_name`
  - `contact_name`
  - `role`
  - `segment`
  - `intro_source`
  - `stage`
  - `next_step_date`
  - `pilot_status`
  - `notes`

- Pilot feedback schema
  - `club_id`
  - `team_id`
  - `game_id`
  - `operator_role`
  - `onboarding_duration_minutes`
  - `game_completion_status`
  - `support_incidents_count`
  - `would_use_again`
  - `top_value`
  - `top_pain`
  - `requested_features`

- Success case template
  - club profile
  - prior workflow
  - pilot usage summary
  - measurable outcome
  - quote
  - permission status

## Test Cases And Scenarios

Business/process scenarios to validate:

- Warm intro leads to a discovery call within 7 days
- Discovery call identifies a named stat-keeper and upcoming game
- Demo results in an explicit pilot commitment
- First live game is completed without blocking failure
- Club returns for a second real game
- Club can articulate one concrete reason to keep using TSW
- At least one pilot club is willing to be referenced publicly or privately

Product validation scenarios during pilot:

- New user can create a team and add roster without intervention
- Operator can start a game and set starting five
- Operator can record common game events quickly enough during live play
- Finished game produces a box score that the club considers credible
- Public sharing link works on a phone for players/families
- Optional replay/shot-map value is understandable, even if not central to the first pilot

## Recommended Timeline

Week 1:

- prepare outreach assets
- define pilot-safe demo flow
- build target list
- request warm intros

Week 2:

- run discovery calls
- run demos
- select 2 to 4 clubs
- schedule first pilot games

Week 3 to 4:

- onboard clubs
- support first live games
- collect structured feedback
- fix only the highest-friction issues affecting repeated use

Week 5:

- assess retention and outcomes
- capture testimonial/case-study material
- decide whether to expand outreach or tighten product first

## Assumptions And Defaults

Assumptions used in this plan:

- first target segment is youth clubs
- first motion is white-glove pilot
- first channel is warm network / warm introductions
- pilot objective is concept proof and workflow validation, not revenue
- billing is not a required part of the first pilot close
- the current deployable product can support a small controlled cohort
- historical docs like status snapshots are not the source of truth; README, roadmap, architecture, API, onboarding, billing, and deployment docs were treated as current

Defaults chosen for implementation unless changed:

- target 15 to 25 clubs for outreach list
- enroll 2 to 4 clubs in pilot
- run 30-day pilot
- support first live game directly
- judge success primarily by repeat usage, not feature requests or verbal enthusiasm
