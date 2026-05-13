/**
 * Single source of truth for the resume builder rebuild (v2).
 *
 * Old ResumeBuilder.tsx uses local useState + prop drilling and is 1700+ lines.
 * This store replaces that with a flat Zustand state. Components subscribe to
 * the slices they care about — no parent relay, no prop drilling.
 *
 * Lives alongside the old builder until v2 reaches parity, then we cut over
 * and delete the old code.
 */
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  ResumeJSON,
  ResumeSectionId,
  ExperienceEntry,
  EducationEntry,
  CertificationEntry,
  ProjectEntry,
  LanguageEntry,
  VolunteerEntry,
  AwardEntry,
} from "@/types/resume";
import { createEmptyResumeJSON } from "@/types/resume";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

interface ResumeStore {
  resume: ResumeJSON;
  resumeId: string | null;
  status: Status;
  error: string | null;
  /** Job description currently being tailored against (optional). */
  jobDescription: string;
  /** Set of section IDs the user has toggled off (still in JSON, just hidden). */
  hiddenSections: Set<ResumeSectionId>;

  // ---- coarse setters
  setResume: (r: ResumeJSON) => void;
  setResumeId: (id: string | null) => void;
  setStatus: (s: Status, error?: string | null) => void;
  setJobDescription: (jd: string) => void;
  toggleSection: (id: ResumeSectionId) => void;

  // ---- section updates (fine-grained, no full replace)
  updateHeader: (patch: Partial<ResumeJSON["header"]>) => void;
  updateSummary: (summary: string) => void;
  upsertExperience: (entry: ExperienceEntry) => void;
  removeExperience: (id: string) => void;
  upsertEducation: (entry: EducationEntry) => void;
  removeEducation: (id: string) => void;
  upsertCertification: (entry: CertificationEntry) => void;
  removeCertification: (id: string) => void;
  upsertProject: (entry: ProjectEntry) => void;
  removeProject: (id: string) => void;
  upsertLanguage: (entry: LanguageEntry) => void;
  removeLanguage: (id: string) => void;
  upsertVolunteer: (entry: VolunteerEntry) => void;
  removeVolunteer: (id: string) => void;
  upsertAward: (entry: AwardEntry) => void;
  removeAward: (id: string) => void;
  setSkills: (skills: ResumeJSON["skills"]) => void;
  setSectionOrder: (order: ResumeSectionId[]) => void;

  reset: () => void;
}

const upsertBy = <T extends { id: string }>(list: T[], entry: T): T[] => {
  const i = list.findIndex((e) => e.id === entry.id);
  if (i === -1) return [...list, entry];
  const next = list.slice();
  next[i] = entry;
  return next;
};

const removeById = <T extends { id: string }>(list: T[], id: string): T[] =>
  list.filter((e) => e.id !== id);

export const useResumeStore = create<ResumeStore>()(
  subscribeWithSelector((set) => ({
    resume: createEmptyResumeJSON(),
    resumeId: null,
    status: "idle",
    error: null,
    jobDescription: "",
    hiddenSections: new Set(),

    setResume: (r) => set({ resume: r }),
    setResumeId: (id) => set({ resumeId: id }),
    setStatus: (s, error = null) => set({ status: s, error }),
    setJobDescription: (jd) => set({ jobDescription: jd }),
    toggleSection: (id) =>
      set((state) => {
        const next = new Set(state.hiddenSections);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { hiddenSections: next };
      }),

    updateHeader: (patch) =>
      set((state) => ({ resume: { ...state.resume, header: { ...state.resume.header, ...patch } } })),
    updateSummary: (summary) =>
      set((state) => ({ resume: { ...state.resume, summary } })),

    upsertExperience: (entry) =>
      set((state) => ({ resume: { ...state.resume, experience: upsertBy(state.resume.experience, entry) } })),
    removeExperience: (id) =>
      set((state) => ({ resume: { ...state.resume, experience: removeById(state.resume.experience, id) } })),

    upsertEducation: (entry) =>
      set((state) => ({ resume: { ...state.resume, education: upsertBy(state.resume.education, entry) } })),
    removeEducation: (id) =>
      set((state) => ({ resume: { ...state.resume, education: removeById(state.resume.education, id) } })),

    upsertCertification: (entry) =>
      set((state) => ({ resume: { ...state.resume, certifications: upsertBy(state.resume.certifications, entry) } })),
    removeCertification: (id) =>
      set((state) => ({ resume: { ...state.resume, certifications: removeById(state.resume.certifications, id) } })),

    upsertProject: (entry) =>
      set((state) => ({ resume: { ...state.resume, projects: upsertBy(state.resume.projects, entry) } })),
    removeProject: (id) =>
      set((state) => ({ resume: { ...state.resume, projects: removeById(state.resume.projects, id) } })),

    upsertLanguage: (entry) =>
      set((state) => ({
        resume: { ...state.resume, languages: upsertBy(state.resume.languages ?? [], entry) },
      })),
    removeLanguage: (id) =>
      set((state) => ({
        resume: { ...state.resume, languages: removeById(state.resume.languages ?? [], id) },
      })),

    upsertVolunteer: (entry) =>
      set((state) => ({
        resume: { ...state.resume, volunteer: upsertBy(state.resume.volunteer ?? [], entry) },
      })),
    removeVolunteer: (id) =>
      set((state) => ({
        resume: { ...state.resume, volunteer: removeById(state.resume.volunteer ?? [], id) },
      })),

    upsertAward: (entry) =>
      set((state) => ({
        resume: { ...state.resume, awards: upsertBy(state.resume.awards ?? [], entry) },
      })),
    removeAward: (id) =>
      set((state) => ({
        resume: { ...state.resume, awards: removeById(state.resume.awards ?? [], id) },
      })),

    setSkills: (skills) => set((state) => ({ resume: { ...state.resume, skills } })),

    setSectionOrder: (section_order) => set((state) => ({ resume: { ...state.resume, section_order } })),

    reset: () =>
      set({
        resume: createEmptyResumeJSON(),
        resumeId: null,
        status: "idle",
        error: null,
        jobDescription: "",
        hiddenSections: new Set(),
      }),
  })),
);
