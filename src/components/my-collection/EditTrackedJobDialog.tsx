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
import { Trash2 } from "lucide-react";

export interface EditableTrackedJob {
  id: string;
  job_title: string;
  company: string;
  location: string | null;
  apply_url: string | null;
  jd_md: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  job: EditableTrackedJob | null;
  onSaved: (updated: EditableTrackedJob) => void;
  onDeleted: (jobId: string) => void;
}

/**
 * Lets the user edit a job card's details after it's been added to the board.
 * Also offers a delete button (with a confirmation) so they can remove
 * cards added by mistake.
 */
export default function EditTrackedJobDialog({ open, onClose, job, onSaved, onDeleted }: Props) {
  const { toast } = useToast();
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [jdMd, setJdMd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync local form state with whichever job was opened.
  useEffect(() => {
    if (!job) return;
    setCompany(job.company ?? "");
    setJobTitle(job.job_title ?? "");
    setLocation(job.location ?? "");
    setApplyUrl(job.apply_url ?? "");
    setJdMd(job.jd_md ?? "");
    setNotes(job.notes ?? "");
  }, [job]);

  async function save() {
    if (!job) return;
    if (!company.trim() || !jobTitle.trim()) {
      toast({
        title: "Need company + title",
        description: "These two are required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const updates = {
      company: company.trim(),
      job_title: jobTitle.trim(),
      location: location.trim() || null,
      apply_url: applyUrl.trim() || null,
      jd_md: jdMd.trim() || null,
      notes: notes.trim() || null,
    };
    const { error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .update(updates)
      .eq("id", job.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    onSaved({ ...job, ...updates });
  }

  async function deleteJob() {
    if (!job) return;
    if (!confirm(`Move this card to trash?\n\n${job.company} · ${job.job_title}\n\nYou can restore it from Trash if needed.`)) {
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", job.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Moved to trash", description: "Restore it from the Trash button if needed." });
    onDeleted(job.id);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit job</DialogTitle>
          <DialogDescription>
            Update any detail. The job description is what the AI tailor uses, so keep it accurate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mc-edit-company">Company *</Label>
              <Input
                id="mc-edit-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <Label htmlFor="mc-edit-title">Job title *</Label>
              <Input
                id="mc-edit-title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mc-edit-location">Location</Label>
              <Input
                id="mc-edit-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <Label htmlFor="mc-edit-url">Apply URL</Label>
              <Input
                id="mc-edit-url"
                value={applyUrl}
                onChange={(e) => setApplyUrl(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="mc-edit-jd">Job description</Label>
            <Textarea
              id="mc-edit-jd"
              value={jdMd}
              onChange={(e) => setJdMd(e.target.value)}
              rows={9}
              className="font-mono text-[12px]"
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mc-edit-notes">Notes</Label>
            <Textarea
              id="mc-edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Recruiter name, referral, your thoughts after a call, etc."
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={deleteJob} disabled={saving} className="text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Move to trash
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !company.trim() || !jobTitle.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
