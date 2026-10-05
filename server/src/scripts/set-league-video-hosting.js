// Grant, change or revoke a League's hosted game-video allowance (Mux game
// video, rulings P1/P4). Uploads also need MUX_UPLOADS_ENABLED=true; public
// Mux clips also need MUX_PUBLIC_CLIPS_ENABLED=true. Defaults are closed.
//
// Idempotent: re-running with the same values changes nothing. With no change
// flags it prints the league's current grant.
//
// Usage (a `--` separator before the id is accepted too):
//   pnpm --filter server video:hosting <leagueId>
//   pnpm --filter server video:hosting <leagueId> --enable \
//     --max-stored-minutes 600 --max-concurrent-uploads 1 --max-creates-per-day 3
//   pnpm --filter server video:hosting <leagueId> --disable
//   pnpm --filter server video:hosting <leagueId> \
//     --public-clips granted|withdrawn|unrecorded --by operator@example.com
//   add --dry-run to print the change without writing it. The target database
//   is printed first; check it before applying.

const mongoose = require('mongoose');

const VIDEO_HOSTING_DEFAULTS = Object.freeze({
  enabled: false,
  maxStoredMinutes: 0,
  maxConcurrentUploads: 1,
  maxCreatesPerDay: 3,
});
const PUBLIC_CLIP_STATUSES = ['unrecorded', 'granted', 'withdrawn'];
const LIMIT_FLAGS = {
  '--max-stored-minutes': 'maxStoredMinutes',
  '--max-concurrent-uploads': 'maxConcurrentUploads',
  '--max-creates-per-day': 'maxCreatesPerDay',
};
const VALUE_FLAGS = [...Object.keys(LIMIT_FLAGS), '--public-clips', '--by'];
// Every upload reserves this many minutes up front (video.service
// UPLOAD_RESERVATION_MINUTES); an enabled grant below it blocks every upload.
const MIN_ENABLED_STORED_MINUTES = 180;

function parseVideoHostingArgs(argv) {
  const values = {};
  const switches = new Set();
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    // V20: `pnpm … video:hosting -- <id>` forwards the separator itself.
    if (argument === '--') continue;
    const [flag, inlineValue] = argument.split(/=(.*)/s);
    if (VALUE_FLAGS.includes(flag)) {
      const value = inlineValue ?? argv[index + 1];
      if (inlineValue === undefined) index += 1;
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${flag} needs a value`);
      }
      values[flag] = value;
    } else if (['--enable', '--disable', '--dry-run'].includes(argument)) {
      switches.add(argument);
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown argument ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  const [leagueId] = positional;
  if (positional.length !== 1 || !/^[0-9a-f]{24}$/i.test(leagueId)) {
    throw new Error('Provide exactly one league id (24-hex ObjectId)');
  }
  if (switches.has('--enable') && switches.has('--disable')) {
    throw new Error('Choose --enable or --disable, not both');
  }

  const changes = {};
  if (switches.has('--enable')) changes.enabled = true;
  if (switches.has('--disable')) changes.enabled = false;
  for (const [flag, field] of Object.entries(LIMIT_FLAGS)) {
    if (values[flag] === undefined) continue;
    if (!/^\d+$/.test(values[flag])) throw new Error(`${flag} must be a non-negative integer`);
    changes[field] = Number(values[flag]);
  }
  if (values['--public-clips'] !== undefined) {
    if (!PUBLIC_CLIP_STATUSES.includes(values['--public-clips'])) {
      throw new Error(`--public-clips must be one of ${PUBLIC_CLIP_STATUSES.join(', ')}`);
    }
    if (!values['--by']?.includes('@')) {
      throw new Error('--public-clips needs --by <operator email> (who recorded the grant)');
    }
    changes.publicClipsStatus = values['--public-clips'];
  }

  return {
    leagueId,
    dryRun: switches.has('--dry-run'),
    by: values['--by'] ? values['--by'].trim().toLowerCase() : null,
    changes,
  };
}

function toPlain(value) {
  return value?.toObject ? value.toObject() : value;
}

// → { next: full videoHosting subdoc, changed: field names }
function planVideoHostingUpdate(
  current,
  changes,
  { operatorUserId = null, now = new Date() } = {}
) {
  const stored = toPlain(current) || {};
  const storedClips = toPlain(stored.publicClips) || {};
  const next = {
    enabled: stored.enabled ?? VIDEO_HOSTING_DEFAULTS.enabled,
    maxStoredMinutes: stored.maxStoredMinutes ?? VIDEO_HOSTING_DEFAULTS.maxStoredMinutes,
    maxConcurrentUploads:
      stored.maxConcurrentUploads ?? VIDEO_HOSTING_DEFAULTS.maxConcurrentUploads,
    maxCreatesPerDay: stored.maxCreatesPerDay ?? VIDEO_HOSTING_DEFAULTS.maxCreatesPerDay,
    publicClips: {
      status: storedClips.status ?? 'unrecorded',
      updatedAt: storedClips.updatedAt ?? null,
      updatedBy: storedClips.updatedBy ?? null,
    },
  };
  const changed = [];

  for (const field of Object.keys(VIDEO_HOSTING_DEFAULTS)) {
    if (changes[field] !== undefined && changes[field] !== next[field]) {
      next[field] = changes[field];
      changed.push(field);
    }
  }

  if (
    changes.publicClipsStatus !== undefined &&
    changes.publicClipsStatus !== next.publicClips.status
  ) {
    if (!operatorUserId) throw new Error('A footage-grant change must record its operator');
    next.publicClips = {
      status: changes.publicClipsStatus,
      updatedAt: now,
      updatedBy: operatorUserId,
    };
    changed.push('publicClips');
  }

  if (next.enabled && next.maxStoredMinutes < MIN_ENABLED_STORED_MINUTES) {
    throw new Error(
      `--max-stored-minutes must be at least ${MIN_ENABLED_STORED_MINUTES} while hosting is enabled (each upload reserves ${MIN_ENABLED_STORED_MINUTES})`
    );
  }

  return { next, changed };
}

// V20: name the target so a run against the wrong environment is visible.
// Never prints the connection string (it carries credentials).
function describeTarget(connection) {
  return `database ${connection?.name || 'unknown'} on ${connection?.host || 'unknown host'}`;
}

async function main() {
  const { leagueId, dryRun, by, changes } = parseVideoHostingArgs(process.argv.slice(2));

  // Required lazily so the pure helpers above load without env/DB config.
  const { connectDb } = require('../config/db');
  const { League } = require('../modules/leagues/leagues.repository');
  const { findUserByEmail } = require('../modules/auth/auth.repository');

  await connectDb();
  console.log(`Target: ${describeTarget(mongoose.connection)}`);
  const league = await League.findById(leagueId);
  if (!league) throw new Error(`No league found for ${leagueId}`);

  let operatorUserId = null;
  if (changes.publicClipsStatus !== undefined) {
    const operator = await findUserByEmail(by);
    if (!operator) throw new Error(`No user found for ${by}`);
    operatorUserId = operator._id;
  }

  const { next, changed } = planVideoHostingUpdate(league.videoHosting, changes, {
    operatorUserId,
  });

  console.log(`League ${league.name} (${leagueId})`);
  if (changed.length === 0) {
    console.log('No change. Current videoHosting:', JSON.stringify(next));
  } else if (dryRun) {
    console.log(`[dry-run] Would change ${changed.join(', ')} →`, JSON.stringify(next));
  } else {
    // Whole subdoc so a league stored without videoHosting never ends up with
    // a partial one; validators enforce the integer/enum rules.
    const updated = await League.findOneAndUpdate(
      { _id: leagueId },
      { $set: { videoHosting: next } },
      { new: true, runValidators: true, lean: true }
    );
    console.log(`Changed ${changed.join(', ')} →`, JSON.stringify(updated.videoHosting));
  }

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('League video hosting update failed:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = {
  parseVideoHostingArgs,
  planVideoHostingUpdate,
  describeTarget,
};
