import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Resume {
  id: string;
  title: string | null;
  updated_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const DRAFT_KEY = "mc:new-session-wizard-draft:v1";

interface Draft {
  step: number;
  name: string;
  resumeId: string;
  targetRolesText: string;
  locationsText: string;
  remoteOnly: boolean;
  compTarget: string;
  visa: string;
}

const EMPTY_DRAFT: Draft = {
  step: 1,
  name: "",
  resumeId: "",
  targetRolesText: "",
  locationsText: "",
  remoteOnly: false,
  compTarget: "",
  visa: "us_citizen",
};

function readDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // sessionStorage can throw in private mode — non-fatal
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // non-fatal
  }
}

export default function NewSessionWizard({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [initial] = useState<Draft>(() => readDraft());
  const [step, setStep] = useState<number>(initial.step);
  const [name, setName] = useState<string>(initial.name);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>(initial.resumeId);
  const [targetRolesText, setTargetRolesText] = useState<string>(initial.targetRolesText);
  const [locationsText, setLocationsText] = useState<string>(initial.locationsText);
  const [remoteOnly, setRemoteOnly] = useState<boolean>(initial.remoteOnly);
  const [compTarget, setCompTarget] = useState<string>(initial.compTarget);
  const [visa, setVisa] = useState<string>(initial.visa);
  const [submitting, setSubmitting] = useState(false);

  // Load resumes whenever the dialog opens. We do NOT reset form state here —
  // the whole point of the persisted draft is that values survive tab-switches
  // and dialog re-mounts. The draft is cleared explicitly on successful create
  // or explicit cancel.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("resumes")
        .select("id,title,updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);
      setResumes(data ?? []);
    })();
  }, [open]);

  // Persist draft on every change. sessionStorage is sync and the payload is
  // tiny so this has no perceptible cost.
  useEffect(() => {
    writeDraft({
      step,
      name,
      resumeId,
      targetRolesText,
      locationsText,
      remoteOnly,
      compTarget,
      visa,
    });
  }, [step, name, resumeId, targetRolesText, locationsText, remoteOnly, compTarget, visa]);

  function resetForm() {
    setStep(1);
    setName("");
    setResumeId("");
    setTargetRolesText("");
    setLocationsText("");
    setRemoteOnly(false);
    setCompTarget("");
    setVisa("us_citizen");
    clearDraft();
  }

  function handleCancel() {
    // User explicitly cancelling — clear so they get a fresh form next time.
    resetForm();
    onClose();
  }

  async function createSession() {
    if (!name.trim()) {
      toast({ title: "Session needs a name" });
      return;
    }
    setSubmitting(true);

    // Always include user_id explicitly. The RLS policy on mc_sessions is
    //   WITH CHECK (auth.uid() = user_id)
    // and the column has no DB-side default, so without this the insert
    // is rejected with "new row violates row-level security policy".
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      setSubmitting(false);
      toast({
        title: "Couldn't create",
        description: "You're not signed in. Refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    const targetProfile = {
      target_roles: targetRolesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      target_locations: locationsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      remote_only: remoteOnly,
      comp_target: compTarget ? Number(compTarget) : null,
      visa_status: visa,
    };

    const { data, error } = await supabase
      .from("mc_sessions")
      .insert({
        user_id: userData.user.id,
        name: name.trim(),
        master_resume_id: resumeId || null,
        target_profile: targetProfile,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error || !data) {
      toast({ title: "Couldn't create", description: error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Session created" });
    resetForm();
    onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
          <DialogDescription>
            {step === 1 && "Name your session and pick a master resume."}
            {step === 2 && "Define what you're targeting."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="mc-name">Session name</Label>
              <Input
                id="mc-name"
                placeholder="e.g. ML Engineer — financial services"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="mc-resume">Master resume (optional, can pick later)</Label>
              <Select value={resumeId || ""} onValueChange={setResumeId}>
                <SelectTrigger id="mc-resume">
                  <SelectValue placeholder="Choose a resume" />
                </SelectTrigger>
                <SelectContent>
                  {resumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title || "(untitled)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {resumes.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  You don't have any resumes yet. You can create one from the Resume Builder, or add it later.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="mc-roles">Target roles (comma-separated)</Label>
              <Textarea
                id="mc-roles"
                placeholder="ML Engineer, Senior ML Engineer, Applied AI Engineer"
                value={targetRolesText}
                onChange={(e) => setTargetRolesText(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="mc-locations">Locations (comma-separated, leave blank for any)</Label>
              <Input
                id="mc-locations"
                placeholder="Charlotte NC, Remote, New York NY"
                value={locationsText}
                onChange={(e) => setLocationsText(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="mc-remote-only">Remote only</Label>
              <Switch id="mc-remote-only" checked={remoteOnly} onCheckedChange={setRemoteOnly} />
            </div>
            <div>
              <Label htmlFor="mc-comp">Target total comp ($, optional)</Label>
              <Input
                id="mc-comp"
                placeholder="120000"
                type="number"
                value={compTarget}
                onChange={(e) => setCompTarget(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mc-visa">Work authorization</Label>
              <Select value={visa} onValueChange={setVisa}>
                <SelectTrigger id="mc-visa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us_citizen">US Citizen</SelectItem>
                  <SelectItem value="green_card">Green Card</SelectItem>
                  <SelectItem value="h1b">H1B</SelectItem>
                  <SelectItem value="stem_opt_over_12">STEM-OPT (12+ months remaining)</SelectItem>
                  <SelectItem value="stem_opt_under_12">STEM-OPT (under 12 months)</SelectItem>
                  <SelectItem value="standard_opt">Standard OPT</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="text-[10px] font-normal">
              You can edit any of this later from session settings.
            </Badge>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 2 && (
            <Button variant="ghost" onClick={() => setStep(1)} disabled={submitting}>
              Back
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!name.trim()}>
              Next
            </Button>
          ) : (
            <Button onClick={createSession} disabled={submitting}>
              {submitting ? "Creating..." : "Create session"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
