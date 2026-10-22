import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ApplicationProfileCard } from "@/components/settings/ApplicationProfileCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    setName(data?.full_name || "");
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").upsert({ user_id: user.id, full_name: name.trim(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaving(false);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Profile"
        status="you"
        description="Name, US work authorization, and the resume the desk uses to match."
      />
      <section className="mb-6 border-[1.5px] border-rp-ink/15 bg-rp-paper p-5">
        <label className="block text-[13px]">
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full border-[1.5px] border-rp-ink/20 bg-rp-canvas px-3" />
        </label>
        <p className="mt-3 text-[13px] text-rp-ink-2">{user?.email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground">
            {saving ? "Saving…" : "Save name"}
          </button>
          <button type="button" onClick={() => navigate("/resume-builder")} className="border-[1.5px] border-rp-ink/20 px-4 py-2 text-[13px]">
            Resume profiles
          </button>
          <button type="button" onClick={() => navigate("/settings")} className="border-[1.5px] border-rp-ink/20 px-4 py-2 text-[13px]">
            Settings
          </button>
          <button
            type="button"
            onClick={async () => { await signOut(); navigate("/auth"); }}
            className="px-4 py-2 text-[13px] text-destructive"
          >
            Sign out
          </button>
        </div>
      </section>
      <ApplicationProfileCard />
    </div>
  );
}
