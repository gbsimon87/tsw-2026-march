import { controlClass, labelClass } from '../../../components/ui/formStyles';

export function GameFormatFields({ value, onChange, legend = 'Game format', disabled = false }) {
  function set(field, next) {
    onChange({ ...value, [field]: next });
  }

  return (
    // A bordered fieldset with an inset legend was the only control of its kind
    // in the app; this now matches every other grouped set of fields.
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Regulation format</span>
          <select
            value={value.regulationSegmentType}
            onChange={(event) => set('regulationSegmentType', event.target.value)}
            className={controlClass}
          >
            <option value="quarter">Four quarters</option>
            <option value="half">Two halves</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Minutes per {value.regulationSegmentType}</span>
          <input
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min="1"
            max="60"
            value={value.regulationSegmentDurationSeconds / 60}
            onChange={(event) =>
              set('regulationSegmentDurationSeconds', Number(event.target.value) * 60)
            }
            className={controlClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Overtime minutes</span>
          <input
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min="1"
            max="60"
            value={value.overtimeDurationSeconds / 60}
            onChange={(event) => set('overtimeDurationSeconds', Number(event.target.value) * 60)}
            className={controlClass}
          />
        </label>
      </div>
    </fieldset>
  );
}
