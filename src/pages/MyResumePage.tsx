import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ApplicationProfileCard } from "@/components/settings/ApplicationProfileCard";
import { EmptyState, GhostButton, Panel, PrimaryButton } from "@/components/brand/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ResumeRow {
  id: string;
  title: string;
  updated_at: string;
}

export default function MyResumePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("resumes").select("id,title,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
    setRows((data || []) as ResumeRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("resumes").insert({
      user_id: user.id,
      title: "US resume",
      personal_info: {},
      experience: [],
      education: [],
      skills: [],
    } as never).select("id").single();
    if (error || !data) {
      toast.error("Could not create a profile.");
      return;
    }
    navigate(`/resume-builder/${data.id}`);
  };

  return (
    <div>
      <PageHeader
        title="My resume"
        status="profiles · us work auth"
        description="Multiple profiles, live editor, Fit to page, and templates stay in the editor. Per-job tailored copies live on each application."
        action={<PrimaryButton onClick={() => void create()}><Plus className="h-4 w-4" /> New profile</PrimaryButton>}
      />

      <Panel className="mb-6">
        {loading ? (
          <div className="h-48 animate-pulse bg-rp-paper-2" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Add a United States resume"
            body="Upload or start blank. Matching and cloud apply both need a source profile."
            action={<PrimaryButton onClick={() => void create()}>Create profile</PrimaryButton>}
          />
        ) : (
          <ul className="divide-y divide-rp-ink/10">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-rp-accent-2" />
                  <div>
                    <p className="font-medium">{row.title || "Untitled"}</p>
                    <p className="text-[12px] text-rp-ink-3">Updated {new Date(row.updated_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <GhostButton onClick={() => navigate(`/resume-builder/${row.id}`)}>Open editor</GhostButton>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ApplicationProfileCard />
    </div>
  );
}
