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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Archive } from "lucide-react";
import GmailConnectCard from "./GmailConnectCard";

interface Resume {
  id: string;
  title: string | null;
  updated_at: string;
}

interface MCSession {
  id: string;
  name: string;
  master_resume_id: string | null;
  target_profile: Record<string, unknown>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  session: MCSession;
  /** Called whenever any field is saved so the parent page can refresh. */
  onSaved: (updated: MCSession) => void;
  /** Called after the session is archived. */
  onArchived: () => void;
}

/**
 * Lets the user edit a session's name + targeting profile + master resume,
 * connect Gmail per-session, and archive the session.
 */
export default function SessionSettingsDialog({ open, onClose, session, onSaved, onArchived }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [resumeId, setResumeId] = useState<string>("");
  const [targetRolesText, setTargetRolesText] = useState("");
  const [locationsText, setLocationsText] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [compTarget, setCompTarget] = useState<string>("");
  const [visa, setVisa] = useState<string>("us_citizen");
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [saving, setSaving] = useState(false);

  // Hydrate form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const tp = (session.target_profile ?? {}) as Record<string, unknown>;
    setName(session.name ?? "");
    setResumeId(session.master_resume_id ?? "");
    setTargetRolesText(((tp.target_roles as string[]) ?? []).join(", "));
    setLocationsText(((tp.target_locations as string[]) ?? []).join(", "));
    setRemoteOnly(!!tp.remote_only);
    setCompTarget(tp.comp_target != null ? String(tp.comp_target) : "");
    setVisa((tp.visa_status as string) ?? "us_citizen");
    (async () => {
      const { data } = await supabase
        .from("resumes")
        .select("id,title,updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);
      setResumes((data as Resume[]) ?? []);
    })();
  }, [open, session]);

  async function save() {
    if (!name.trim()) {
      toast({ title: "Session needs a name", variant: "destructive" });
      return;
    }
    setSaving(true);
    const targetProfile = {
      ...(session.target_profile ?? {}),
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
    const updates = {
      name: name.trim(),
      master_resume_id: resumeId || null,
      target_profile: targetProfile,
    };
    const { error } = await supabase
      .from("mc_sessions")
      .update(updates)
      .eq("id", session.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Settings saved" });
    onSaved({ ...session, ...updates });
  }

  async function archive() {
    if (!confirm(`Archive "${session.name}"?\n\nIt will disappear from your active sessions but the data is kept.`)) {
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("mc_sessions")
      .update({ status: "archived" })
      .eq("id", session.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't archive", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Session archived" });
    onArchived();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session settings</DialogTitle>
          <DialogDescription>
            Edit who this session is targeting. Changes apply right away — Discover and the AI tailor
            both pull from these values.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label htmlFor="mc-set-name">Session name</Label>
            <Input
              id="mc-set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mc-set-resume">Master resume</Label>
            <Select value={resumeId || ""} onValueChange={setResumeId} disabled={saving}>
              <SelectTrigger id="mc-set-resume">
                <SelectValue placeholder="None — pick a resume" />
              </SelectTrigger>
              <SelectContent>
                {resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title || "(untitled)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              The AI tailor uses this as the source of truth for the candidate's experience.
            </p>
          </div>

          <Separator />

          <div>
            <Label htmlFor="mc-set-roles">Target roles (comma-separated)</Label>
            <Textarea
              id="mc-set-roles"
              value={targetRolesText}
              onChange={(e) => setTargetRolesText(e.target.value)}
              rows={2}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mc-set-locations">Locations (comma-separated, blank = any)</Label>
            <Input
              id="mc-set-locations"
              value={locationsText}
              onChange={(e) => setLocationsText(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="mc-set-remote">Remote only</Label>
            <Switch
              id="mc-set-remote"
              checked={remoteOnly}
              onCheckedChange={setRemoteOnly}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mc-set-comp">Target total comp ($, optional)</Label>
            <Input
              id="mc-set-comp"
              type="number"
              value={compTarget}
              onChange={(e) => setCompTarget(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="mc-set-visa">Work authorization</Label>
            <Select value={visa} onValueChange={setVisa} disabled={saving}>
              <SelectTrigger id="mc-set-visa">
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

          <Separator />

          {/* Per-session Gmail connection. The mc_gmail_connections table has a
              UNIQUE(session_id) constraint so each session gets exactly one
              Gmail account, independent of any other sessions on the user's
              account. */}
          <div>
            <h3 className="text-sm font-medium mb-2">Gmail integration (this session only)</h3>
            <GmailConnectCard sessionId={session.id} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={archive} disabled={saving} className="text-destructive">
            <Archive className="w-3.5 h-3.5 mr-1" /> Archive session
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
