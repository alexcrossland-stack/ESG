import { useId } from "react";
import { ChevronDown } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = Array.from({ length: 100 }, (_, index) => String(2000 + index));

/** Explicit selectors work in browsers without a native input[type=month] picker. */
export function ReportingMonthPicker({ month, onChange, disabled = false }: { month: string; onChange: (month: string) => void; disabled?: boolean }) {
  const id = useId();
  const year = month.slice(0, 4);
  const monthNumber = month.slice(5, 7);
  const controlClass = "h-11 min-h-[44px] w-full min-w-0 appearance-none rounded-lg border border-input bg-card py-2 pl-3 pr-8 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:text-sm";
  return <fieldset className="w-full space-y-1.5 sm:w-auto" disabled={disabled}>
    <legend className="text-xs font-medium text-muted-foreground">Reporting month</legend>
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1 sm:w-36">
      <select id={`${id}-month`} aria-label="Overview reporting month" aria-describedby={`${id}-help`} className={controlClass} value={month} onChange={event => onChange(event.target.value)} data-testid="select-overview-month">
        {MONTHS.map((label, index) => <option key={label} value={`${year}-${String(index + 1).padStart(2, "0")}`}>{label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
      </div>
      <div className="relative w-24 shrink-0">
      <select id={`${id}-year`} aria-label="Overview reporting year" aria-describedby={`${id}-help`} className={controlClass} value={year} onChange={event => onChange(`${event.target.value}-${monthNumber}`)} data-testid="select-overview-year">
        {YEARS.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
    <p id={`${id}-help`} className="text-xs text-muted-foreground">Applies across your workspace</p>
  </fieldset>;
}
