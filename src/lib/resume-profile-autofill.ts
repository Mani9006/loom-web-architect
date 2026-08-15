import { supabase } from "@/integrations/supabase/client";

type UnknownRecord = Record<string, unknown>;

export interface InferredApplicationProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  currentTitle: string;
  yearsExperience: string;
  linkedinUrl: string;
  portfolioUrl: string;
  targetRoles: string[];
  targetCountries: string[];
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item) => Object.keys(item).length > 0) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function first(...values: unknown[]): string {
  return values.map(text).find(Boolean) || "";
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function monthIndex(value: unknown, end: boolean, now: Date): number | null {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (/present|current|now|ongoing/.test(raw)) return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const year = Number(raw.match(/\b(?:19|20)\d{2}\b/)?.[0]);
  if (!year) return null;
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const matchedMonth = monthNames.findIndex((month) => raw.includes(month));
  const numericMonth = raw.match(/(?:^|\D)(0?[1-9]|1[0-2])[/-](?:19|20)\d{2}/)?.[1];
  const month = matchedMonth >= 0 ? matchedMonth : numericMonth ? Number(numericMonth) - 1 : end ? 11 : 0;
  return year * 12 + month;
}

export function calculateResumeExperienceYears(experience: unknown, now = new Date()): number {
  const covered = new Set<number>();
  for (const item of records(experience)) {
    const start = monthIndex(item.start_date ?? item.startDate, false, now);
    const end = monthIndex(item.end_date ?? item.endDate, true, now);
    if (start === null || end === null || end < start) continue;
    const boundedEnd = Math.min(end, now.getUTCFullYear() * 12 + now.getUTCMonth());
    for (let month = start; month <= boundedEnd && covered.size < 720; month += 1) covered.add(month);
  }
  return Math.round((covered.size / 12) * 10) / 10;
}

function inferCountries(location: string): string[] {
  const value = location.toLowerCase();
  if (/\b(united states|u\.?s\.?a?|usa|california|texas|new york|illinois|florida|washington|dallas|austin|chicago|seattle|boston|san francisco)\b/.test(value)) return ["United States"];
  if (/\b(canada|toronto|vancouver|montreal)\b/.test(value)) return ["Canada"];
  if (/\b(united kingdom|uk|london|england|scotland)\b/.test(value)) return ["United Kingdom"];
  if (/\b(india|hyderabad|bengaluru|bangalore|chennai|mumbai|delhi|pune)\b/.test(value)) return ["India"];
  return [];
}

export function inferApplicationProfileFromResume(
  resume: UnknownRecord,
  accountEmail = "",
  now = new Date(),
): InferredApplicationProfile {
  const personal = record(resume.personal_info ?? resume.header);
  const experience = records(resume.experience);
  const current = experience.find((item) => /present|current|now/i.test(first(item.end_date, item.endDate))) || experience[0] || {};
  const currentTitle = first(current.role, current.title, personal.title);
  const roles = unique([currentTitle, ...experience.map((item) => first(item.role, item.title))]).slice(0, 6);
  const location = first(personal.location, current.location);
  const years = calculateResumeExperienceYears(experience, now);
  return {
    fullName: first(personal.name, personal.fullName),
    email: first(personal.email, accountEmail),
    phone: text(personal.phone),
    location,
    currentTitle,
    yearsExperience: years > 0 ? String(years) : "",
    linkedinUrl: first(personal.linkedin, personal.linkedinUrl),
    portfolioUrl: first(personal.portfolio, personal.website, personal.github),
    targetRoles: roles,
    targetCountries: inferCountries(location),
  };
}

function preserve(current: UnknownRecord, key: string, fallback: string): string {
  return text(current[key]) || fallback;
}

export async function hydrateApplicationProfileFromResume(args: {
  userId: string;
  resumeId: string;
  resume: UnknownRecord;
  accountEmail?: string;
}): Promise<InferredApplicationProfile> {
  const inferred = inferApplicationProfileFromResume(args.resume, args.accountEmail);
  const { data: existing } = await (supabase as any).from("profiles")
    .select("full_name,email,phone,location,target_role,years_of_experience,linkedin_url,job_preferences")
    .eq("user_id", args.userId)
    .maybeSingle();
  const preferences = record(existing?.job_preferences);
  const applypass = record(preferences.applypass);
  const storedProfile = record(applypass.profile);
  const mergedProfile = {
    ...storedProfile,
    fullName: preserve(storedProfile, "fullName", inferred.fullName),
    email: preserve(storedProfile, "email", inferred.email),
    phone: preserve(storedProfile, "phone", inferred.phone),
    location: preserve(storedProfile, "location", inferred.location),
    currentTitle: preserve(storedProfile, "currentTitle", inferred.currentTitle),
    yearsExperience: preserve(storedProfile, "yearsExperience", inferred.yearsExperience),
    linkedinUrl: preserve(storedProfile, "linkedinUrl", inferred.linkedinUrl),
    portfolioUrl: preserve(storedProfile, "portfolioUrl", inferred.portfolioUrl),
  };

  const { error } = await supabase.from("profiles").upsert({
    user_id: args.userId,
    full_name: existing?.full_name || inferred.fullName || null,
    email: existing?.email || inferred.email || args.accountEmail || null,
    phone: existing?.phone || inferred.phone || null,
    location: existing?.location || inferred.location || null,
    target_role: existing?.target_role || inferred.currentTitle || null,
    years_of_experience: existing?.years_of_experience ?? (Number(inferred.yearsExperience) || null),
    linkedin_url: existing?.linkedin_url || inferred.linkedinUrl || null,
    job_preferences: {
      ...preferences,
      applypass: { ...applypass, profile: mergedProfile },
      resume_inference: {
        target_roles: inferred.targetRoles,
        target_countries: inferred.targetCountries,
        resume_id: args.resumeId,
        updated_at: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;

  const { data: currentPrefs, error: prefsLoadError } = await (supabase as any).from("user_job_prefs")
    .select("target_roles,target_countries,min_years_experience,max_years_experience")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (!prefsLoadError) {
    const years = Number(inferred.yearsExperience) || 0;
    await (supabase as any).from("user_job_prefs").upsert({
      user_id: args.userId,
      target_roles: currentPrefs?.target_roles?.length ? currentPrefs.target_roles : inferred.targetRoles,
      target_countries: currentPrefs?.target_countries?.length ? currentPrefs.target_countries : inferred.targetCountries,
      min_years_experience: currentPrefs?.min_years_experience ?? (years ? Math.max(0, Math.floor(years - 4)) : null),
      max_years_experience: currentPrefs?.max_years_experience ?? (years ? Math.ceil(years + 1.5) : null),
    }, { onConflict: "user_id" });
  }

  return inferred;
}
