import { useState } from "react";
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

/**
 * Lets the user paste a job they found anywhere (LinkedIn, a friend's email,
 * etc.) and drop it onto the Board with status='saved'. Useful when the
 * scanner hasn't found anything yet but the user wants to exercise the
 * Tailor-with-AI flow.
 */
export default function AddJobManuallyDialog({ open, onClose, sessionId, onCreated }: Props) {
  const { toast } = useToast();
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [jdMd, setJdMd] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setCompany("");
    setJobTitle("");
    setLocation("");
    setApplyUrl("");
    setJdMd("");
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
    reset();
    onCreated(data.id);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add job manually</DialogTitle>
          <DialogDescription>
            Drop a job onto the board. Paste the job description and you can immediately tailor a
            resume for it.
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

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !company.trim() || !jobTitle.trim()}>
            {saving ? "Saving…" : "Save to board"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
