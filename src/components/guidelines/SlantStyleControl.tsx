import type { SlantStyle } from "@/lib/guides/slant-paths";
const explanation =
  "Classic joins offset positions with straight lines. Flowing follows the changing curve while maintaining the local slant angle.";
export default function SlantStyleControl({
  value,
  onChange,
}: {
  value: SlantStyle;
  onChange: (style: SlantStyle) => void;
}) {
  return (
    <label className="block space-y-1 text-sm text-slate-700">
      <span>
        Slant style{" "}
        <span
          title={explanation}
          aria-label={explanation}
          className="cursor-help text-xs text-slate-400"
        >
          ⓘ
        </span>
      </span>
      <select
        aria-label="Slant style"
        title={explanation}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        value={value}
        onChange={(e) => onChange(e.target.value as SlantStyle)}
      >
        <option value="classic">Classic (straight)</option>
        <option value="flowing">Flowing (curvature-aware)</option>
      </select>
    </label>
  );
}
