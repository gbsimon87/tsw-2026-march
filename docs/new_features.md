Great. Let’s lock the foundation before implementation.

Answer these in order. Keep answers short where you want. I’ll use them to turn this into a finalized implementation plan.

## 1. Access and billing rules

1. Should **only active premium users** be allowed to create leagues, or should there also be an admin override?
   Only active premium users

2. If a premium subscription expires, should league owners:
   - keep limited management rights

3. Should one premium user be allowed to create **multiple leagues**, or just one?
   Just one league for now

4. Does the premium subscription cover:
   - just league creation
   - all management features too

5. Do you want a **free trial**, or no trial for MVP?
   No trial for MVP

6. Should billing be monthly only at **$8/month**, or do you want to plan for annual pricing later?
   Just 8 a month for now

## 2. User/account model

7. For signup, do you want only:
   - name
   - email
   - password
     for MVP?

     Yes

8. Do you want email verification in MVP, or can that wait?
   This can wait
9. Do you want password reset in MVP, or can that wait?
   This can wait

10. Should users have a public profile page, or only player pages for now?
    Just player pages for now

11. Can one user belong to:

- multiple leagues? yes
- multiple teams in the same league? yes
- multiple teams across different leagues? yes

## 3. Player identity model

12. Should a player be allowed to exist in the system **before they create an account**? Yes
13. When that real-life player later signs up, should they be able to **claim/link** their roster spot? Yes

14. Who should be allowed to create roster entries:

- owner and managers

15. Should a roster entry require:

- player name
- jersey number
- position
- photo
  or only some of these?

All of these should be optional except jersey number

16. Can a player appear on multiple teams in the same season, or should that be blocked? Yes

## 4. League roles and permissions

17. Which league-level roles do you want in MVP:

- owner
- manager
- player
- admin

League owner, team managers (essentially admins for a team), players

18. Is “manager” meant to be:

- team-specific
- league-wide

Team specific

19. Should managers be allowed to:

- edit rosters
- create games
- edit games
- enter stats
- mark games complete
- assign players

Yes, but only for the team(s) they manage

20. Should managers be allowed to assign other managers, or owner only?
    Owner only

21. Should there be only **one owner** per league in MVP?
    Yes

22. Do you want the ability to transfer league ownership later, or not in MVP?
    Not in the MVP

## 5. League and season structure

23. Should every league require at least **one season** before teams and games are created?
    In terms of user experience, a league shouldn't necessarily require a season to create teams, but games should be optionally part of a season.

24. Should teams belong to:

- the league only?
- a specific season?

A league may have multiple seasons, and each season there may be different teams in the league.

25. Can the same team name be reused across multiple seasons?
    Yes, and ID, to use for historical data.

26. Should player stats, standings, and schedules always be filtered by season by default?
    Yes

27. Do you want an archive for past seasons in MVP? Yes

28. Should there be exactly one **active season** per league? Yes

## 6. Scheduling and games

29. For MVP, should schedule creation be:

- fully manual only?
- manual now, generator later?

The league owner should be able to create the schedule by creating games consisting of two teams selected, the date, the venue, the time.

30. What fields should a scheduled game have at minimum:

- date/time
- home team
- away team
- location
- notes

31. Should games support statuses like:

- scheduled
- in progress
- completed
- canceled

Yes

32. Once a game is marked complete, should it still be editable?
    Yes.

33. If editable after completion, who can edit it?
    Only by league owner or team manager.

34. Should postponed/rescheduled games be part of MVP, or can that wait?
    If a game is scheduledd, and then postponed, there should be a way to pause the stats tracking and leave it as incomplete or something. These incomplete games that are not yet finished should not count towards the standings, and the stats from that game should be excluded from all stats aggregrations.

## 7. Stats scope

35. For MVP, should game completion require only the final score, or also stat entry?
    Also the stat entry

36. Which **team stats** do you definitely want in MVP?

- points (free throws, 2pt, and 3pt field goals)
- Makes and misses for free throws, 2pt, and 3pt field goals
- rebounds
- assists
- steals
- turnovers
- fouls
- shooting splits

37. Which **player stats** do you definitely want in MVP?

- minutes
- points
- rebounds
- assists
- steals
- blocks
- turnovers
- fouls
- shooting splits

38. Do you want to track:

- totals only
- per-game averages
- both

Both

39. Should standings be based only on:

- wins/losses
- plus point differential
- plus tie-breakers

All three options

40. Do tie-breakers matter in MVP, or can standings just sort by win percentage then point differential?
    Yes, use win percentage, point differential, and tie-breakers.

## 8. Public pages and visibility

41. Should all league pages be public by default?
    Yes

42. Do you want any option for a private league later, or not at all?
    Yes

43. On a public **league page**, what must appear:

- standings
- upcoming schedule
- completed results
- league stats leaders
- teams list

44. On a **team page**, what must appear:

- roster
- schedule/results
- team stats
- standings position

45. On a **player page**, what must appear:

- team
- games played
- season stats
- game log

46. Should public pages show only the active season by default with a season switcher?
    Yes

## 9. Admin workflows

47. How should users become players on teams in MVP:

- owner/manager assigns them directly
- invite by email
- self-request to join

I think the best approach will be self-request to join, but you let me know. Ideally users make an account and can click somewhere to join a team, and then they enter a passkey. Or they could request to join, and the admin can accept it.

48. How should managers be assigned in MVP:

- by selecting existing registered users only

49. Do you want invite flows in MVP, or can assignment be manual for now?
    Somewhat manual for now to keep it simple.

50. Should league owners/managers be able to bulk import schedules or rosters later, or not relevant yet?
    Not yet relevant, but ideally this will happen in the future.

## 10. URL and content structure

51. Do you want public URLs like:

- `/league/:slug`
- `/team/:slug`
- `/player/:id-or-slug`

Yes.

52. Should team slugs be unique:

- globally
- within a league

Within a league.

53. Should player pages be tied to:

- account user
- roster entry

A logged in user should have a place where they see their different player profiles, as they may play on multiple teams.

54. Do you care about SEO-friendly public pages in MVP, or is that later?

Preferably, but we can leave for later if need be.

## 11. Operational choices

55. Do you want a **single monorepo** with client and server together?
    Yes, separated client and server for easy Render deployment.

56. Do you want MongoDB Atlas, or are you open to another managed MongoDB-compatible option?
    Atlas

57. For Render, are you expecting:

- frontend static site
- backend web service
- database external

I want users to be able to access any page like /my-page and they go straight into that page. My frontend and backend will be separate services in Render, and the database will be in MongoDB.

58. Should `render.yaml` fully define the app setup for easy deploy from repo?
    Yes.

## 12. Non-MVP boundaries

59. Which of these should be explicitly **out of MVP**:

- playoffs
- brackets
- live scoring
- notifications
- chat
- file uploads
- player invites
- email verification

60. What is the one thing that would make you say, “this MVP is good enough to launch”?

League owners can create a league, create teams, and track stats for the teams.
Players can create an account, join a league, and see their stats and standings and league rosters.
