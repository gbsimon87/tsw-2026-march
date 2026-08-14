export function GameFormatFields({ value, onChange, legend = 'Game format', disabled = false }) {
  function set(field, next) {
    onChange({ ...value, [field]: next });
  }

  return (
    <fieldset disabled={disabled} className="rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm text-slate-700">
          Regulation format
          <select
            value={value.regulationSegmentType}
            onChange={(event) => set('regulationSegmentType', event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="quarter">Four quarters</option>
            <option value="half">Two halves</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Minutes per {value.regulationSegmentType}
          <input
            type="number"
            min="1"
            max="60"
            value={value.regulationSegmentDurationSeconds / 60}
            onChange={(event) =>
              set('regulationSegmentDurationSeconds', Number(event.target.value) * 60)
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-slate-700">
          Overtime minutes
          <input
            type="number"
            min="1"
            max="60"
            value={value.overtimeDurationSeconds / 60}
            onChange={(event) => set('overtimeDurationSeconds', Number(event.target.value) * 60)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
    </fieldset>
  );
}
