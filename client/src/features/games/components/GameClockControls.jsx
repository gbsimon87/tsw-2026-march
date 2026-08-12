import { useEffect, useState } from 'react';
import {
  effectiveRemainingMilliseconds,
  formatClock,
  regulationSegmentCount,
  segmentLabel,
} from '../gameClock';

export function GameClockControls({
  game,
  onCommand,
  disabled = false,
  serverOffsetMilliseconds = 0,
}) {
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const clock = game.clock;

  useEffect(() => {
    if (clock?.status !== 'running') return undefined;
    const id = window.setInterval(() => setTick((value) => value + 1), 100);
    return () => window.clearInterval(id);
  }, [clock?.status]);

  if (!clock || !game.gameFormat) return null;
  const remaining = effectiveRemainingMilliseconds(
    clock,
    Date.now() + serverOffsetMilliseconds + tick * 0
  );
  const atEndOfRegulation =
    clock.segmentKind === 'regulation' &&
    clock.segmentNumber === regulationSegmentCount(game.gameFormat);
  const canFinishSegment = clock.status === 'running' || clock.status === 'paused';
  const finishLabel =
    clock.segmentKind === 'overtime'
      ? 'Finish overtime'
      : `Finish ${game.gameFormat.regulationSegmentType}`;
  const statusLabel = {
    running: 'Live',
    paused: 'Paused',
    ready: 'Ready',
    segment_complete: 'Period complete',
  }[clock.status];

  function finishSegment() {
    const period = segmentLabel(game.gameFormat, clock.segmentKind, clock.segmentNumber);
    if (!window.confirm(`Finish ${period} now? The game clock will be set to 0.0.`)) return;
    onCommand({ action: 'finish_segment' });
  }

  function saveCorrection() {
    const remainingMilliseconds = (Number(minutes || 0) * 60 + Number(seconds || 0)) * 1000;
    onCommand({
      action: 'correct',
      segmentKind: clock.segmentKind,
      segmentNumber: clock.segmentNumber,
      remainingMilliseconds,
    });
    setEditing(false);
  }

  return (
    <section
      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-700 bg-gradient-to-b from-slate-800 to-slate-950 px-3 py-3 text-white shadow-lg sm:min-w-[15rem] sm:px-4"
      aria-label="Game clock controls"
    >
      <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
        <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-200">
          {segmentLabel(game.gameFormat, clock.segmentKind, clock.segmentNumber)}
        </span>
        <span
          className="justify-self-center font-mono text-3xl font-black leading-none tracking-tight tabular-nums sm:text-[2.75rem]"
          aria-label="Game clock"
        >
          {formatClock(remaining)}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
          <span
            className={`h-2 w-2 rounded-full ${clock.status === 'running' ? 'animate-pulse bg-emerald-400' : clock.status === 'segment_complete' ? 'bg-amber-400' : 'bg-slate-400'}`}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </div>
      <div className="flex w-full flex-wrap justify-center gap-2 border-t border-white/10 pt-2">
        {clock.status === 'running' ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCommand({ action: 'pause' })}
            className="min-h-9 flex-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            Pause
          </button>
        ) : clock.status === 'ready' || clock.status === 'paused' ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCommand({ action: 'start' })}
            className="min-h-9 flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {clock.segmentNumber === 1 &&
            clock.segmentKind === 'regulation' &&
            clock.status === 'ready'
              ? 'Start game'
              : 'Start'}
          </button>
        ) : clock.segmentKind === 'regulation' && !atEndOfRegulation ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCommand({ action: 'next_segment' })}
            className="min-h-9 flex-1 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-black text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            Next period
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCommand({ action: 'start_overtime' })}
            className="min-h-9 flex-1 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-black text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            Start overtime
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setMinutes(String(Math.floor(remaining / 60000)));
            setSeconds(String((remaining % 60000) / 1000));
            setEditing(true);
          }}
          className="min-h-9 rounded-lg border border-slate-500 bg-white/5 px-3 py-2 text-xs font-bold text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
        >
          Correct
        </button>
        {canFinishSegment ? (
          <button
            type="button"
            disabled={disabled}
            onClick={finishSegment}
            className="min-h-9 rounded-lg border border-red-400/60 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            {finishLabel}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 p-2 text-white shadow-inner">
          <input
            aria-label="Clock minutes"
            type="number"
            min="0"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className="h-9 w-14 rounded-md border border-slate-500 bg-white px-2 text-center font-mono text-sm font-bold text-slate-900"
          />
          <span className="font-black text-slate-400">:</span>
          <input
            aria-label="Clock seconds"
            type="number"
            min="0"
            max="59.9"
            step="0.1"
            value={seconds}
            onChange={(event) => setSeconds(event.target.value)}
            className="h-9 w-16 rounded-md border border-slate-500 bg-white px-2 text-center font-mono text-sm font-bold text-slate-900"
          />
          <button
            type="button"
            onClick={saveCorrection}
            className="h-9 rounded-md bg-emerald-500 px-3 text-xs font-black text-slate-950"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-9 rounded-md px-2 text-xs font-bold text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  );
}
