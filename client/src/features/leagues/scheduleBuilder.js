// Schedule Builder — pure fixture-generation helpers.
//
// Deliberately dependency-free and side-effect-free: the admin adjusts teams,
// days and slots repeatedly while building a draft, so every regeneration is a
// local recompute rather than a server round trip. Nothing here persists.

const BYE = Symbol('bye');

const MS_PER_DAY = 86_400_000;

/**
 * Single round-robin via the circle method: hold the first entrant fixed,
 * rotate the rest, and pair across the two halves. An odd team count gets a BYE
 * sentinel so exactly one team sits out each round.
 *
 * Sides flip on alternate rounds so no team accumulates home games — see D8.
 *
 * @param {string[]} teamIds
 * @returns {Array<{ round: number, games: Array<{ homeLeagueTeamId: string, awayLeagueTeamId: string }>, byeTeamId: string | null }>}
 */
export function buildRoundRobin(teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length < 2) {
    return [];
  }

  const entrants = [...teamIds];
  if (entrants.length % 2 === 1) {
    entrants.push(BYE);
  }

  const half = entrants.length / 2;
  const [anchor, ...rotating] = entrants;
  const rounds = [];

  // Running home-minus-away balance per team. Positional parity tricks don't
  // work here — the anchor and the team opposite it keep the same slot every
  // round and end up stuck on one side — so assign each pairing's sides to
  // whichever orientation evens the two teams' balances out (D8).
  const balance = new Map(teamIds.map((teamId) => [teamId, 0]));

  for (let round = 0; round < entrants.length - 1; round += 1) {
    const lineup = [anchor, ...rotating];
    const games = [];
    let byeTeamId = null;

    for (let i = 0; i < half; i += 1) {
      const first = lineup[i];
      const second = lineup[lineup.length - 1 - i];

      if (first === BYE || second === BYE) {
        byeTeamId = first === BYE ? second : first;
        continue;
      }

      // Whoever is further "behind" on home games takes home. Ties fall back to
      // alternating on round and position, so a schedule that starts all-square
      // still spreads sides instead of giving every pairing one orientation.
      const firstBalance = balance.get(first);
      const secondBalance = balance.get(second);
      const flip =
        firstBalance === secondBalance ? (round + i) % 2 === 1 : firstBalance > secondBalance;

      const [home, away] = flip ? [second, first] : [first, second];
      balance.set(home, balance.get(home) + 1);
      balance.set(away, balance.get(away) - 1);

      games.push({ homeLeagueTeamId: home, awayLeagueTeamId: away });
    }

    rounds.push({ round: round + 1, games, byeTeamId });
    rotating.unshift(rotating.pop());
  }

  return rounds;
}

function parseLocalDate(startDate) {
  const [year, month, day] = String(startDate).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function atSlot(date, slot) {
  const [hours, minutes] = String(slot).split(':').map(Number);
  const stamped = new Date(date);
  stamped.setHours(hours, minutes, 0, 0);
  return stamped;
}

// Walk forward from `from` (inclusive) to the next date landing on one of the
// configured weekdays. Bounded so a bad weekday list can never spin forever.
function nextGameDay(from, weekdays) {
  const cursor = new Date(from);

  for (let i = 0; i < 366; i += 1) {
    if (weekdays.includes(cursor.getDay())) {
      return cursor;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return cursor;
}

/**
 * Lay rounds onto real calendar dates.
 *
 * Each round opens on a fresh game-day and fills that day's slots in order. If a
 * round needs more slots than the day offers, the remainder spills onto the next
 * game-day and every spilled row is flagged `overflowed` — the UI makes the
 * admin acknowledge that before committing, rather than silently moving fixtures
 * players are already expecting (D7).
 *
 * Dates are built in the browser's local timezone; the caller converts to ISO at
 * submit time, matching the existing single-game create form.
 *
 * @param {ReturnType<typeof buildRoundRobin>} rounds
 * @param {{ startDate: string, weekdays: number[], slots: string[], venue?: string }} options
 * @returns {{ rows: object[], overflowCount: number }}
 */
export function assignDates(rounds, { startDate, weekdays, slots, venue = '' } = {}) {
  if (!rounds?.length || !weekdays?.length || !slots?.length || !startDate) {
    return { rows: [], overflowCount: 0 };
  }

  const rows = [];
  let overflowCount = 0;
  let day = nextGameDay(parseLocalDate(startDate), weekdays);
  let slotIndex = 0;
  let rowId = 0;

  const advanceDay = () => {
    day = nextGameDay(new Date(day.getTime() + MS_PER_DAY), weekdays);
    slotIndex = 0;
  };

  for (const round of rounds) {
    // Every round opens on its own game-day.
    if (slotIndex > 0) {
      advanceDay();
    }

    for (const game of round.games) {
      let overflowed = false;

      if (slotIndex >= slots.length) {
        advanceDay();
        overflowed = true;
        overflowCount += 1;
      }

      rowId += 1;
      rows.push({
        id: `row-${rowId}`,
        round: round.round,
        isBye: false,
        homeLeagueTeamId: game.homeLeagueTeamId,
        awayLeagueTeamId: game.awayLeagueTeamId,
        scheduledAt: atSlot(day, slots[slotIndex]),
        venue,
        overflowed,
      });

      slotIndex += 1;
    }

    if (round.byeTeamId) {
      rowId += 1;
      rows.push({
        id: `row-${rowId}`,
        round: round.round,
        isBye: true,
        byeTeamId: round.byeTeamId,
      });
    }
  }

  return { rows, overflowCount };
}
