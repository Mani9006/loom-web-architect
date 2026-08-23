import { EMPTY_FILTERS, type MatchFilters } from "@/product/lib/filters";

const CHIP = "h-8 border border-border bg-background px-2 text-[12px] text-foreground";

export function FilterBar({
  value,
  onChange,
}: {
  value: MatchFilters;
  onChange: (next: MatchFilters) => void;
}) {
  const set = <K extends keyof MatchFilters>(key: K, next: MatchFilters[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={CHIP} value={value.date} onChange={(e) => set("date", e.target.value as MatchFilters["date"])} aria-label="Date posted">
        <option value="any">Date · any</option>
        <option value="24h">Last 24h</option>
        <option value="3d">Last 3 days</option>
        <option value="7d">Last 7 days</option>
        <option value="14d">Last 14 days</option>
        <option value="30d">Last 30 days</option>
      </select>
      <input className={`${CHIP} w-[140px]`} placeholder="Location · US" value={value.location} onChange={(e) => set("location", e.target.value)} aria-label="Location" />
      <select className={CHIP} value={value.workplace} onChange={(e) => set("workplace", e.target.value as MatchFilters["workplace"])} aria-label="Workplace">
        <option value="any">Workplace</option>
        <option value="remote">Remote</option>
        <option value="hybrid">Hybrid</option>
        <option value="onsite">On-site</option>
      </select>
      <input className={`${CHIP} w-[150px]`} placeholder="Companies" value={value.companies} onChange={(e) => set("companies", e.target.value)} aria-label="Companies" />
      <select className={CHIP} value={value.degree} onChange={(e) => set("degree", e.target.value as MatchFilters["degree"])} aria-label="Degree">
        <option value="any">Degree</option>
        <option value="none">No degree required</option>
        <option value="bachelors">Bachelor's</option>
        <option value="masters">Master's</option>
        <option value="phd">PhD</option>
      </select>
      <input className={`${CHIP} w-[88px]`} placeholder="Max exp" value={value.maxExp} onChange={(e) => set("maxExp", e.target.value)} aria-label="Max experience" />
      <select className={CHIP} value={value.visaSponsor} onChange={(e) => set("visaSponsor", e.target.value as MatchFilters["visaSponsor"])} aria-label="Visa sponsor">
        <option value="any">Visa sponsor</option>
        <option value="yes">Sponsors</option>
        <option value="no">No sponsor needed</option>
      </select>
      <input className={`${CHIP} w-[140px]`} placeholder="Role" value={value.role} onChange={(e) => set("role", e.target.value)} aria-label="Role" />
      <select className={CHIP} value={value.jobType} onChange={(e) => set("jobType", e.target.value as MatchFilters["jobType"])} aria-label="Job type">
        <option value="any">Job type</option>
        <option value="full_time">Full-time</option>
        <option value="part_time">Part-time</option>
        <option value="contract">Contract</option>
        <option value="internship">Internship</option>
      </select>
      <select className={CHIP} value={value.employment} onChange={(e) => set("employment", e.target.value as MatchFilters["employment"])} aria-label="Employment">
        <option value="any">Employment</option>
        <option value="full_time">Full-time</option>
        <option value="part_time">Part-time</option>
        <option value="contract">Contract</option>
      </select>
      <button type="button" className="h-8 px-2 text-[12px] text-muted-foreground hover:text-foreground" onClick={() => onChange(EMPTY_FILTERS)}>
        Reset
      </button>
    </div>
  );
}
