import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ApplicationProfileCard } from "@/components/settings/ApplicationProfileCard";
import { EmptyState } from "@/product/components/EmptyState";
import { PageSkeleton } from "@/product/components/Skeleton";
import { db, invokeFunction } from "@/product/lib/table";
import { PageHeader } from "@/product/components/PageHeader";
import { Field } from "@/product/ui/Field";
import { Segmented } from "@/product/ui/Segmented";
import { Panel } from "@/product/ui/Panel";

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

  function move(index: number, dir: number) {
    const next = [...editor.sections];
    const swap = index + dir;
    [next[index], next[swap]] = [next[swap], next[index]];
    setEditor({ ...editor, sections: next });
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader kicker="My resume" title="Profiles, templates, and US work auth" />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "profiles", label: "Profiles" },
          { id: "editor", label: "Editor" },
          { id: "cover", label: "Cover letter" },
          { id: "details", label: "Profile details" },
        ]}
      />

      {tab === "profiles" && (
        <div className="space-y-3">
          <label className="rp-btn rp-btn-primary cursor-pointer">
            {uploading ? "Uploading…" : "Upload resume"}
            <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </label>
          {rows.length === 0 ? <EmptyState title="No resume profiles" body="Upload a PDF or DOCX. Parsing uses the existing document pipeline." /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((row) => (
                <button key={row.id} type="button" onClick={() => { setActive(row.id); setTab("editor"); }} className={`rounded-lg border p-4 text-left hover:bg-muted/40 ${active === row.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <p className="text-[14px] font-semibold">{row.title || "Untitled"}</p>
                  <p className="text-[12px] text-muted-foreground">{row.template || "Atlas"}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "editor" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel title="Editor">
            <div className="space-y-3 p-4">
              <Field label="Title"><input className="rp-input" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></Field>
              <Field label="Summary"><textarea className="rp-textarea min-h-[200px]" value={editor.summary} onChange={(e) => setEditor({ ...editor, summary: e.target.value })} placeholder="Summary. Tailoring may rephrase this but will not invent employers or metrics." /></Field>
              <div>
                <p className="mb-2 text-[12px] text-muted-foreground">Reorder sections</p>
                {editor.sections.map((section, i) => (
                  <div key={section} className="mb-1 flex items-center gap-2">
                    <span className="flex-1 rounded-md border border-border px-3 py-2 text-[13px] capitalize">{section}</span>
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === 0} onClick={() => move(i, -1)}>Up</button>
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" disabled={i === editor.sections.length - 1} onClick={() => move(i, 1)}>Down</button>
                  </div>
                ))}
              </div>
              <button type="button" className="rp-btn rp-btn-primary" onClick={() => void saveEditor()}>Save profile</button>
            </div>
          </Panel>
          <Panel title="Chrome">
            <div className="space-y-3 p-4">
              <Field label="Template">
                <select className="rp-select" value={editor.template} onChange={(e) => setEditor({ ...editor, template: e.target.value })}>
                  {TEMPLATES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Font">
                <select className="rp-select" value={editor.font} onChange={(e) => setEditor({ ...editor, font: e.target.value })}>
                  {FONTS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Size">
                <select className="rp-select" value={editor.size} onChange={(e) => setEditor({ ...editor, size: e.target.value })}>
                  {["9", "10", "11", "12"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Align">
                <select className="rp-select" value={editor.align} onChange={(e) => setEditor({ ...editor, align: e.target.value })}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={editor.fitOnePage} onChange={(e) => setEditor({ ...editor, fitOnePage: e.target.checked })} />
                Fit one page
              </label>
            </div>
          </Panel>
        </div>
      )}

      {tab === "cover" && (
        <Panel title="Standing cover letter">
          <div className="space-y-3 p-4">
            <textarea className="rp-textarea min-h-[280px]" value={editor.cover} onChange={(e) => setEditor({ ...editor, cover: e.target.value })} placeholder="Optional standing cover letter. Leave empty for packets that should ship without one." />
            <button type="button" className="rp-btn rp-btn-primary" onClick={() => void saveEditor()}>Save cover</button>
          </div>
        </Panel>
      )}

      {tab === "details" && (
        <div className="space-y-5">
          <Panel title="US work authorization defaults">
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Field label="Authorization">
                <select className="rp-select" value={editor.auth} onChange={(e) => setEditor({ ...editor, auth: e.target.value })}>
                  {AUTH.map((opt) => <option key={opt}>{opt}</option>)}
                </select>
              </Field>
              <Field label="Sponsorship">
                <select className="rp-select" value={editor.sponsorship} onChange={(e) => setEditor({ ...editor, sponsorship: e.target.value })}>
                  <option value="no">No sponsorship needed</option>
                  <option value="yes">Need sponsorship</option>
                </select>
              </Field>
              <button type="button" className="rp-btn rp-btn-outline" onClick={() => void saveEditor()}>Save auth defaults</button>
            </div>
          </Panel>
          <ApplicationProfileCard />
        </div>
      )}
    </div>
  );
}
