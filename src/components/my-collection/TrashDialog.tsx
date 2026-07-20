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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, MapPin, RotateCcw, Trash2, AlertCircle } from "lucide-react";

interface DeletedJob {
  id: string;
  job_title: string;
  company: string;
  location: string | null;
  status: string;
  deleted_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  /** Called when something is restored — parent should reload its board. */
  onRestored: () => void;
}

/**
 * Lists soft-deleted cards for this session. Each row has Restore (sets
 * deleted_at = null, card returns to the board) and Delete forever (hard
 * delete from the DB).
 */
export default function TrashDialog({ open, onClose, sessionId, onRestored }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<DeletedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .select("id,job_title,company,location,status,deleted_at")
      .eq("session_id", sessionId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load trash", description: error.message, variant: "destructive" });
      setItems([]);
    } else {
      setItems((data as DeletedJob[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open) load().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  async function restore(id: string) {
    setBusyId(id);
    const { error } = await (supabase as any)
      .from("mc_tracked_jobs")
      .update({ deleted_at: null })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast({ title: "Restore failed", description: error.message, variant: "destructive" });
      return;
    }
    setItems((arr) => arr.filter((j) => j.id !== id));
    toast({ title: "Card restored" });
    onRestored();
  }

  async function deleteForever(id: string, label: string) {
    if (!confirm(`Permanently delete "${label}"?\n\nThis cannot be undone.`)) return;
    setBusyId(id);
    const { error } = await (supabase as any).from("mc_tracked_jobs").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    setItems((arr) => arr.filter((j) => j.id !== id));
    toast({ title: "Deleted forever" });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busyId && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Cards you deleted from the board. Restore brings them back. Delete forever removes them
            from the database completely.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
              <AlertCircle className="w-6 h-6 opacity-40" />
              <span>Trash is empty.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between gap-3 border rounded-md p-3 text-[12px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{job.job_title}</div>
                    <div className="text-muted-foreground text-[11px] mt-0.5 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {job.company}
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {job.location}
                        </span>
                      )}
                      <span className="opacity-60">
                        deleted {new Date(job.deleted_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore(job.id)}
                      disabled={busyId === job.id}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => deleteForever(job.id, `${job.company} · ${job.job_title}`)}
                      disabled={busyId === job.id}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={!!busyId}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
