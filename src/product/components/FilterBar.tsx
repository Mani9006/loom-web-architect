import { EMPTY_FILTERS, type MatchFilters } from "@/product/lib/filters";
import { Field } from "@/product/ui/Field";

export function FilterBar({
  value,
  onChange,
}: {
  value: MatchFilters;
  onChange: (next: MatchFilters) => void;
}) {
  const set = <K extends keyof MatchFilters>(key: K, next: MatchFilters[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="rp-panel p-2.5">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <Field label="Posted">
          <select className="rp-select" value={value.date} onChange={(e) => set("date", e.target.value as MatchFilters["date"])}>
            <option value="any">Any time</option>
            <option value="24h">Last 24h</option>
            <option value="3d">Last 3 days</option>
            <option value="7d">Last 7 days</option>
            <option value="14d">Last 14 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </Field>
        <Field label="Location">
          <input className="rp-input" placeholder="United States" value={value.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Workplace">
          <select className="rp-select" value={value.workplace} onChange={(e) => set("workplace", e.target.value as MatchFilters["workplace"])}>
            <option value="any">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </Field>
        <Field label="Companies">
          <input className="rp-input" placeholder="Filter companies" value={value.companies} onChange={(e) => set("companies", e.target.value)} />
        </Field>
        <Field label="Degree">
          <select className="rp-select" value={value.degree} onChange={(e) => set("degree", e.target.value as MatchFilters["degree"])}>
            <option value="any">Any</option>
            <option value="none">No degree required</option>
            <option value="bachelors">Bachelor's</option>
            <option value="masters">Master's</option>
            <option value="phd">PhD</option>
          </select>
        </Field>
        <Field label="Max experience">
          <input className="rp-input" placeholder="Years" value={value.maxExp} onChange={(e) => set("maxExp", e.target.value)} />
        </Field>
        <Field label="Visa">
          <select className="rp-select" value={value.visaSponsor} onChange={(e) => set("visaSponsor", e.target.value as MatchFilters["visaSponsor"])}>
            <option value="any">Any</option>
            <option value="yes">Sponsors</option>
            <option value="no">No sponsor needed</option>
          </select>
        </Field>
        <Field label="Role">
          <input className="rp-input" placeholder="Title keywords" value={value.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <Field label="Job type">
          <select className="rp-select" value={value.jobType} onChange={(e) => set("jobType", e.target.value as MatchFilters["jobType"])}>
            <option value="any">Any</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </Field>
        <Field label="Employment">
          <select className="rp-select" value={value.employment} onChange={(e) => set("employment", e.target.value as MatchFilters["employment"])}>
            <option value="any">Any</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
          </select>
        </Field>
        <div className="flex items-end">
          <button type="button" className="rp-btn rp-btn-ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );
}
