# Product Roadmap: TSW 2026 March

## Vision

Provide a fast, reliable basketball stat tracking workflow for real games: create roster, track events live, and review accurate box scores immediately after the game.

## Future Milestones

- Opponent support:
  - dual-team tracking for standalone (non-league) games
- Reporting:
  - season rollups
  - trend summaries
  - richer recap/reporting synthesis
- Additional stat categories:
  - any categories beyond the current scoring/rebound/assist/steal/block/turnover/foul model (for reference, current stat types: FG2/FG3/FT made/miss, OREB, DREB, AST, STL, BLK, TOV, FOUL, OPP_FT_MADE, OPP_FG2_MADE, OPP_FG3_MADE, OPP_REB)
- Visual shot chart analytics and trends
- Export/share:
  - CSV export
- Team management improvements:
  - season-level views

## Status Notes

- Auth is considered baseline complete and reused for all new basketball features.
- V1 standalone games remain intentionally narrow for speed: one tracked team per game, event-sourced scoring, and minimal UI complexity.
- For standalone games, opponent support is limited to score totals. Full opponent roster tracking is available in league games via dual-team tracking mode (`trackingMode: 'dual_team'` in the game schema).
- Leagues are a shipped feature: users can create leagues, add teams and players to league rosters, schedule league games with dual-team tracking, view standings, and manage join requests. League team members hold roles of manager, helper, or player. Public league, team, and player pages are live. See `server/src/modules/leagues/` and `client/src/features/leagues/` for the implementation.

- Make it easier for anyone to find different profiles of a different player, for example if they play in more than one team/league.
- Consider players requesting a missed stat or incorrect stat, consider requiring a timestamp in the video. The request should go to the league/team managers to approve.
- Announcements
