import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ApplicationProfileCard } from "@/components/settings/ApplicationProfileCard";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { db, invokeFunction } from "@/product/lib/table";
import { PageHeader } from "@/product/components/PageHeader";

type Tab = "profiles" | "editor" | "cover" | "details";

interface ResumeRow {
  id: string;
  title: string | null;
  template: string | null;
  updated_at: string;
}

const TEMPLATES = ["Nocturne", "Ledger", "Studio", "Harbor"];
const FONTS = ["Instrument Sans", "DM Mono", "Source Serif 4"];
const AUTH = ["US Citizen", "Green Card", "F-1", "H-1B", "EAD", "Need sponsorship"];

export default function ResumePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("profiles");
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editor, setEditor] = useState({
    title: "Primary resume",
    summary: "",
    template: "Atlas",
    font: "Instrument Sans",
    size: "10",
    align: "left",
    fitOnePage: true,
    sections: ["summary", "experience", "education", "skills"],
    cover: "",
    auth: "US Citizen",
    sponsorship: "no",
  });

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db().from("resumes").select("id,title,template,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
    setRows((data || []) as ResumeRow[]);
    setActive((data || [])[0]?.id ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    if (!user) return;
    setUploading(true);
    const { data, error } = await invokeFunction<{ resume?: { id: string } }>("parse-document", {
      filename: file.name,
    });
    if (error) {
      const text = await file.text().catch(() => "");
      const { data: created } = await db().from("resumes").insert({
        user_id: user.id,
        title: file.name.replace(/\.[^.]+$/, ""),
        summary: text.slice(0, 2000),
      }).select("id").maybeSingle();
      if (created) {
        await db().from("profiles").upsert({ user_id: user.id, primary_resume_id: (created as { id: string }).id });
        toast.success("Resume stored. Parser will enrich when available.");
      } else toast.error("Upload failed");
    } else if (data?.resume?.id) {
      await db().from("profiles").upsert({ user_id: user.id, primary_resume_id: data.resume.id });
      toast.success("Resume parsed");
    }
    setUploading(false);
    await load();
    setTab("editor");
  }

  async function saveEditor() {
    if (!user) return;
    const payload = {
      user_id: user.id,
      title: editor.title,
      template: editor.template,
      summary: editor.summary,
    };
    if (active) await db().from("resumes").update(payload).eq("id", active);
    else {
      const { data } = await db().from("resumes").insert(payload).select("id").maybeSingle();
      setActive((data as { id?: string } | null)?.id ?? null);
    }
    const { data: profile } = await db().from("profiles").select("job_preferences").eq("user_id", user.id).maybeSingle();
    const current = ((profile as { job_preferences?: Record<string, unknown> } | null)?.job_preferences || {}) as Record<string, unknown>;
    await db().from("profiles").upsert({
      user_id: user.id,
      job_preferences: {
        ...current,
        resume_chrome: { font: editor.font, size: editor.size, align: editor.align, fitOnePage: editor.fitOnePage, sections: editor.sections },
        cover_letter: editor.cover,
        work_auth: { status: editor.auth, sponsorship: editor.sponsorship },
      },
    });
    toast.success("Resume profile saved");
    await load();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader kicker="My resume" title="Profiles, templates, and US work auth" />

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {([
          ["profiles", "Profiles"],
          ["editor", "Editor"],
          ["cover", "Cover letter"],
          ["details", "Profile details"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`h-8 flex-1 rounded-md text-[12px] ${tab === id ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{label}</button>
        ))}
      </div>

      {tab === "profiles" && (
        <div className="space-y-3">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-3 text-[13px] text-primary-foreground">
            {uploading ? "Uploading…" : "Upload resume"}
            <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </label>
          {rows.length === 0 ? <EmptyState title="No resume profiles" body="Upload a PDF or DOCX. Parsing uses the existing document pipeline." /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((row) => (
                <button key={row.id} type="button" onClick={() => { setActive(row.id); setTab("editor"); }} className={`border p-4 text-left ${active === row.id ? "border-primary" : "border-border bg-background"}`}>
                  <p className="text-[14px] font-semibold">{row.title || "Untitled"}</p>
                  <p className="text-[12px] text-muted-foreground">{row.template || "Atlas"}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "editor" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <input className="h-10 w-full rounded-md border border-input px-3 text-[13px]" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} />
            <textarea className="min-h-[200px] w-full rounded-md border border-input p-3 text-[13px]" value={editor.summary} onChange={(e) => setEditor({ ...editor, summary: e.target.value })} placeholder="Summary. Tailoring may rephrase this but will not invent employers or metrics." />
            <div>
              <p className="text-[12px] text-muted-foreground mb-2">Reorder sections</p>
              {editor.sections.map((section, i) => (
                <div key={section} className="mb-1 flex items-center gap-2">
                  <span className="flex-1 rounded-md border border-border px-3 py-2 text-[13px] capitalize">{section}</span>
                  <button type="button" className="text-[12px]" disabled={i === 0} onClick={() => move(i, -1)}>Up</button>
                  <button type="button" className="text-[12px]" disabled={i === editor.sections.length - 1} onClick={() => move(i, 1)}>Down</button>
                </div>
              ))}
            </div>
            <button type="button" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => void saveEditor()}>Save profile</button>
          </div>
          <aside className="space-y-3 border border-border p-4">
            <label className="block text-[12px]">Template
              <select className="mt-1 h-10 w-full rounded-md border border-input px-2" value={editor.template} onChange={(e) => setEditor({ ...editor, template: e.target.value })}>
                {TEMPLATES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-[12px]">Font
              <select className="mt-1 h-10 w-full rounded-md border border-input px-2" value={editor.font} onChange={(e) => setEditor({ ...editor, font: e.target.value })}>
                {FONTS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-[12px]">Size
              <select className="mt-1 h-10 w-full rounded-md border border-input px-2" value={editor.size} onChange={(e) => setEditor({ ...editor, size: e.target.value })}>
                {["9", "10", "11", "12"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-[12px]">Align
              <select className="mt-1 h-10 w-full rounded-md border border-input px-2" value={editor.align} onChange={(e) => setEditor({ ...editor, align: e.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={editor.fitOnePage} onChange={(e) => setEditor({ ...editor, fitOnePage: e.target.checked })} />
              Fit one page
            </label>
          </aside>
        </div>
      )}

      {tab === "cover" && (
        <div className="space-y-3">
          <textarea className="min-h-[280px] w-full rounded-md border border-input p-3 text-[13px]" value={editor.cover} onChange={(e) => setEditor({ ...editor, cover: e.target.value })} placeholder="Optional standing cover letter. Leave empty for packets that should ship without one." />
          <button type="button" className="h-9 rounded-md bg-primary px-3 text-[13px] text-primary-foreground" onClick={() => void saveEditor()}>Save cover</button>
        </div>
      )}

      {tab === "details" && (
        <div className="space-y-5">
          <section className="border border-border p-4">
            <h2 className="text-[15px] font-semibold">US work authorization defaults</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select className="h-10 rounded-md border border-input px-3 text-[13px]" value={editor.auth} onChange={(e) => setEditor({ ...editor, auth: e.target.value })}>
                {AUTH.map((opt) => <option key={opt}>{opt}</option>)}
              </select>
              <select className="h-10 rounded-md border border-input px-3 text-[13px]" value={editor.sponsorship} onChange={(e) => setEditor({ ...editor, sponsorship: e.target.value })}>
                <option value="no">No sponsorship needed</option>
                <option value="yes">Need sponsorship</option>
              </select>
            </div>
            <button type="button" className="mt-3 h-9 rounded-md border border-border px-3 text-[13px]" onClick={() => void saveEditor()}>Save auth defaults</button>
          </section>
          <ApplicationProfileCard />
        </div>
      )}
    </div>
  );

  function move(index: number, dir: number) {
    const next = [...editor.sections];
    const swap = index + dir;
    [next[index], next[swap]] = [next[swap], next[index]];
    setEditor({ ...editor, sections: next });
  }
}
