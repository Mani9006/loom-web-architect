/**
 * Pure helpers for the Settings "Application answers" card.
 *
 * Storage contract: profiles.job_preferences.applypass — `profile` keys mirror
 * exactly what supabase/functions/career-ops-submit reads (~L174-196):
 * fullName/email/phone/location/currentTitle/currentCompany/yearsExperience/
 * linkedinUrl/portfolioUrl/expectedSalary/workAuthorization/requiresSponsorship/
 * noticePeriod/discoverySource. eeo, privacyConsent, consent and screening live
 * alongside profile for the enqueue payload and future adapter support.
 */

type UnknownRecord = Record<string, unknown>;

export interface EeoAnswers {
  gender: string;
  transgenderExperience: string;
  sexualOrientation: string;
  disability: string;
  veteranStatus: string;
  ethnicity: string;
}

export interface ApplicationProfileForm {
  phone: string;
  country: string;
  city: string;
  linkedinUrl: string;
  currentCompany: string;
  currentTitle: string;
  yearsExperience: string;
  workAuthorization: string;
  requiresSponsorship: "" | "yes" | "no";
  expectedSalary: string;
  discoverySource: string;
  privacyConsent: boolean;
  eeo: EeoAnswers;
}

const DECLINE = "Decline to self identify";

export const COUNTRIES = [
  "United States", "Canada", "United Kingdom", "India", "Germany", "Australia", "Singapore",
  "Ireland", "Netherlands", "France", "United Arab Emirates", "Mexico", "Brazil", "Japan",
  "Spain", "Italy", "Sweden", "Switzerland", "New Zealand", "Israel", "Poland", "Portugal",
  "South Korea", "China", "Philippines", "Nigeria", "South Africa", "Pakistan", "Bangladesh",
  "Vietnam", "Indonesia", "Malaysia", "Thailand", "Argentina", "Colombia", "Chile", "Egypt",
  "Turkey", "Saudi Arabia", "Other",
];

export const YEARS_EXPERIENCE_OPTIONS = ["0-1", "1-3", "3-5", "5-8", "8+"];
export const WORK_AUTHORIZATION_OPTIONS = ["US Citizen", "Green Card", "EAD", "Need sponsorship"];

export const EEO_OPTIONS: Record<keyof EeoAnswers, string[]> = {
  gender: ["Male", "Female", "Non-binary", DECLINE],
  transgenderExperience: ["Yes", "No", DECLINE],
  sexualOrientation: ["Heterosexual or straight", "Gay or lesbian", "Bisexual", "Asexual", "Queer", DECLINE],
  disability: ["Yes, I have a disability (or previously had one)", "No, I don't have a disability", DECLINE],
  veteranStatus: ["I am a protected veteran", "I am not a protected veteran", DECLINE],
  ethnicity: [
    "Hispanic or Latino",
    "White (Not Hispanic or Latino)",
    "Black or African American (Not Hispanic or Latino)",
    "Asian (Not Hispanic or Latino)",
    "Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)",
    "American Indian or Alaska Native (Not Hispanic or Latino)",
    "Two or More Races (Not Hispanic or Latino)",
    DECLINE,
  ],
};

export const EEO_LABELS: Record<keyof EeoAnswers, string> = {
  gender: "Gender",
  transgenderExperience: "Transgender experience",
  sexualOrientation: "Sexual orientation",
  disability: "Disability status",
  veteranStatus: "Veteran status",
  ethnicity: "Race / ethnicity",
};

export const emptyEeo = (): EeoAnswers => ({
  gender: DECLINE,
  transgenderExperience: DECLINE,
  sexualOrientation: DECLINE,
  disability: DECLINE,
  veteranStatus: DECLINE,
  ethnicity: DECLINE,
});

export const emptyForm = (): ApplicationProfileForm => ({
  phone: "",
  country: "United States",
  city: "",
  linkedinUrl: "",
  currentCompany: "",
  currentTitle: "",
  yearsExperience: "",
  workAuthorization: "",
  requiresSponsorship: "",
  expectedSalary: "",
  discoverySource: "Job board",
  privacyConsent: false,
  eeo: emptyEeo(),
});

/** Fields the browser worker actually needs to submit without a human. */
export const COMPLETENESS_FIELDS = [
  "phone",
  "country",
  "city",
  "linkedinUrl",
  "currentCompany",
  "workAuthorization",
  "requiresSponsorship",
  "privacyConsent",
] as const;

export function computeCompleteness(form: ApplicationProfileForm): { filled: number; total: number; percent: number } {
  const filled = COMPLETENESS_FIELDS.filter((field) => {
    const value = form[field as keyof ApplicationProfileForm];
    return typeof value === "boolean" ? value : Boolean(String(value || "").trim());
  }).length;
  return {
    filled,
    total: COMPLETENESS_FIELDS.length,
    percent: Math.round((filled / COMPLETENESS_FIELDS.length) * 100),
  };
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Split a free-form resume location ("Austin, TX" / "Toronto, Canada") into city + country. */
export function splitLocation(location: string): { city: string; country: string } {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  const matchedCountry = COUNTRIES.find((country) => country !== "Other" && location.toLowerCase().includes(country.toLowerCase()));
  if (matchedCountry) {
    return { city: parts.find((part) => part !== matchedCountry) || "", country: matchedCountry };
  }
  // US-style locations ("City, ST") default to United States.
  return { city: parts[0] || "", country: "United States" };
}

/** Merge resume hints into the form; only empty fields are prefilled. */
export function prefillFromResume(
  resume: UnknownRecord | null | undefined,
  current: ApplicationProfileForm,
): ApplicationProfileForm {
  if (!resume) return current;
  const personal = record(resume.personal_info);
  const experience = Array.isArray(resume.experience) ? resume.experience.map(record) : [];
  const latest = experience[0] || {};
  const next = { ...current, eeo: { ...current.eeo } };
  if (!next.phone) next.phone = text(personal.phone);
  if (!next.linkedinUrl) next.linkedinUrl = text(personal.linkedin) || text(personal.linkedinUrl);
  if (!next.currentCompany) next.currentCompany = text(latest.company_or_client) || text(latest.company);
  if (!next.currentTitle) next.currentTitle = text(latest.role) || text(personal.title);
  if (!next.city) {
    const location = text(personal.location);
    if (location) {
      const { city, country } = splitLocation(location);
      next.city = city;
      if (!next.country || next.country === "United States") next.country = country;
    }
  }
  return next;
}

/**
 * Build the applypass slice persisted to profiles.job_preferences.applypass.
 * Unknown stored profile keys (fullName, email, portfolioUrl, noticePeriod, …)
 * are preserved; requiresSponsorship is only overwritten once the user chooses.
 */
export function buildApplypassPayload(
  form: ApplicationProfileForm,
  storedProfile: UnknownRecord,
  now = new Date(),
): UnknownRecord {
  const city = form.city.trim();
  const country = form.country.trim() || "United States";
  const location = [city, country].filter(Boolean).join(", ");
  const requiresSponsorship = form.requiresSponsorship === ""
    ? (typeof storedProfile.requiresSponsorship === "boolean" ? storedProfile.requiresSponsorship : undefined)
    : form.requiresSponsorship === "yes";

  const profile: UnknownRecord = {
    ...storedProfile,
    phone: form.phone.trim(),
    location,
    country,
    city,
    linkedinUrl: form.linkedinUrl.trim(),
    currentCompany: form.currentCompany.trim(),
    currentTitle: form.currentTitle.trim(),
    yearsExperience: form.yearsExperience,
    workAuthorization: form.workAuthorization,
    expectedSalary: form.expectedSalary.trim(),
    discoverySource: form.discoverySource.trim() || "Job board",
  };
  if (requiresSponsorship !== undefined) profile.requiresSponsorship = requiresSponsorship;
  else delete profile.requiresSponsorship;

  const updatedAt = now.toISOString();
  return {
    profile,
    eeo: { ...form.eeo, updatedAt },
    privacyConsent: form.privacyConsent,
    consent: { privacyConsent: form.privacyConsent, updatedAt },
    screening: {
      workAuthorization: form.workAuthorization,
      requiresSponsorship: requiresSponsorship ?? null,
      expectedSalary: form.expectedSalary.trim(),
      yearsExperience: form.yearsExperience,
      discoverySource: form.discoverySource.trim() || "Job board",
      updatedAt,
    },
  };
}

/** Hydrate form state from the stored applypass slice. */
export function formFromApplypass(applypass: UnknownRecord): ApplicationProfileForm {
  const stored = record(applypass.profile);
  const base = emptyForm();
  const storedLocation = text(stored.location);
  const derived = splitLocation(storedLocation);
  base.phone = text(stored.phone);
  base.country = text(stored.country) || (storedLocation ? derived.country : base.country);
  base.city = text(stored.city) || (storedLocation ? derived.city : "");
  base.linkedinUrl = text(stored.linkedinUrl);
  base.currentCompany = text(stored.currentCompany);
  base.currentTitle = text(stored.currentTitle);
  base.yearsExperience = YEARS_EXPERIENCE_OPTIONS.includes(text(stored.yearsExperience)) ? text(stored.yearsExperience) : "";
  base.workAuthorization = WORK_AUTHORIZATION_OPTIONS.includes(text(stored.workAuthorization)) ? text(stored.workAuthorization) : "";
  if (typeof stored.requiresSponsorship === "boolean") base.requiresSponsorship = stored.requiresSponsorship ? "yes" : "no";
  base.expectedSalary = text(stored.expectedSalary);
  base.discoverySource = text(stored.discoverySource) || "Job board";
  const consent = record(applypass.consent);
  base.privacyConsent = applypass.privacyConsent === true || consent.privacyConsent === true;
  const storedEeo = record(applypass.eeo);
  for (const key of Object.keys(EEO_LABELS) as (keyof EeoAnswers)[]) {
    const value = text(storedEeo[key]);
    if (value && EEO_OPTIONS[key].includes(value)) base.eeo[key] = value;
  }
  return base;
}
