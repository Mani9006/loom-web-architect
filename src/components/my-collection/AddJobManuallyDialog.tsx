import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  /** Called with the new tracked_job id after a successful save. */
  onCreated: (trackedJobId: string) => void;
}

interface Draft {
  company: string;
  jobTitle: string;
  location: string;
  applyUrl: string;
  jdMd: string;
}

const EMPTY_DRAFT: Draft = {
  company: "",
  jobTitle: "",
  location: "",
  applyUrl: "",
  jdMd: "",
};

const draftKey = (sessionId: string) => `mc:add-job-draft:${sessionId}:v1`;

function readDraft(sessionId: string): Draft {
  try {
    const raw = sessionStorage.getItem(draftKey(sessionId));
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(sessionId: string, d: Draft) {
  try {
    sessionStorage.setItem(draftKey(sessionId), JSON.stringify(d));
  } catch {
    // sessionStorage can throw in private mode — non-fatal
  }
}

function clearDraft(sessionId: string) {
  try {
    sessionStorage.removeItem(draftKey(sessionId));
  } catch {
    // non-fatal
  }
}

/**
 * Lets the user paste a job they found anywhere (LinkedIn, an email, etc.)
 * onto the Board with status='saved'. Form values are persisted to
 * sessionStorage so switching tabs to grab the JD doesn't wipe what was
 * already typed.
 */
export default function AddJobManuallyDialog({ open, onClose, sessionId, onCreated }: Props) {
  const { toast } = useToast();
  const [initialDraft] = useState<Draft>(() => readDraft(sessionId));
  const [company, setCompany] = useState<string>(initialDraft.company);
  const [jobTitle, setJobTitle] = useState<string>(initialDraft.jobTitle);
  const [location, setLocation] = useState<string>(initialDraft.location);
  const [applyUrl, setApplyUrl] = useState<string>(initialDraft.applyUrl);
  const [jdMd, setJdMd] = useState<string>(initialDraft.jdMd);
  const [saving, setSaving] = useState(false);

  // Persist draft on every change. sessionStorage is sync and tiny — no cost.
  useEffect(() => {
    writeDraft(sessionId, { company, jobTitle, location, applyUrl, jdMd });
  }, [sessionId, company, jobTitle, location, applyUrl, jdMd]);

  // If the dialog is opened for a different session, rehydrate from that
  // session's saved draft (in case user has multiple sessions).
  useEffect(() => {
    if (!open) return;
    const d = readDraft(sessionId);
    setCompany(d.company);
    setJobTitle(d.jobTitle);
    setLocation(d.location);
    setApplyUrl(d.applyUrl);
    setJdMd(d.jdMd);
  }, [open, sessionId]);

  function resetForm() {
    setCompany("");
    setJobTitle("");
    setLocation("");
    setApplyUrl("");
    setJdMd("");
    clearDraft(sessionId);
  }

  async function save() {
    if (!company.trim() || !jobTitle.trim()) {
      toast({
        title: "Need company + title",
        description: "These two are required so the card has something to display.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      setSaving(false);
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }

    const { data, error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .insert({
        user_id: userData.user.id,
        session_id: sessionId,
        scanned_job_id: null,
        job_title: jobTitle.trim(),
        company: company.trim(),
        location: location.trim() || null,
        apply_url: applyUrl.trim() || null,
        jd_md: jdMd.trim() || null,
        status: "saved",
      })
      .select("id")
      .single();

    setSaving(false);
    if (error || !data) {
      toast({
        title: "Couldn't save",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Saved to board",
      description: `${company.trim()} · ${jobTitle.trim()}`,
    });
    resetForm();
    onCreated(data.id);
  }

  function handleClose() {
    if (saving) return;
    // Don't auto-clear on close — user might be intentionally stepping out
    // to grab the JD. They can hit Cancel explicitly to wipe.
    onClose();
  }

  function handleCancel() {
    if (saving) return;
    resetForm();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add job manually</DialogTitle>
          <DialogDescription>
            Drop a job onto the board. Your input is auto-saved while you're typing — switch to another
            tab to grab the JD and your work will still be here when you come back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mc-add-company">Company *</Label>
              <Input
                id="mc-add-company"
                placeholder="Stripe"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="mc-add-title">Job title *</Label>
              <Input
                id="mc-add-title"
                placeholder="Senior ML Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mc-add-location">Location</Label>
              <Input
                id="mc-add-location"
                placeholder="Remote · US"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mc-add-url">Apply URL</Label>
              <Input
                id="mc-add-url"
                placeholder="https://stripe.com/jobs/..."
                value={applyUrl}
                onChange={(e) => setApplyUrl(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="mc-add-jd">Job description</Label>
            <Textarea
              id="mc-add-jd"
              placeholder="Paste the full JD here. Plain text is fine. Used by the AI tailor."
              value={jdMd}
              onChange={(e) => setJdMd(e.target.value)}
              rows={9}
              className="font-mono text-[12px]"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Required if you want to use the "Tailor with AI" button on this card.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleCancel} disabled={saving}>
            Cancel & clear
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Close (keep draft)
          </Button>
          <Button onClick={save} disabled={saving || !company.trim() || !jobTitle.trim()}>
            {saving ? "Saving…" : "Save to board"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
