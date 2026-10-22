import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { invokeFunction } from "@/product/lib/table";
import { atsSupported, detectAts } from "@/product/lib/format";

export function useApply() {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const applyEvaluation = useCallback(async (evaluationId: string, applyUrl?: string) => {
    const portal = detectAts(applyUrl);
    setBusyId(evaluationId);
    try {
      const tailor = await invokeFunction<{ draft?: { id: string; status: string } }>("career-ops-tailor", {
        evaluation_id: evaluationId,
      });
      if (tailor.error || !tailor.data?.draft?.id) {
        throw tailor.error || new Error("Could not tailor this packet");
      }
      const draftId = tailor.data.draft.id;
      await invokeFunction("career-ops-ats", { evaluation_id: evaluationId });

      if (!atsSupported(portal) && applyUrl) {
        toast.message("Needs you", {
          description: `${portal === "unknown" ? "This ATS" : portal} is not auto-submitted. Complete the packet, we will not mark it submitted.`,
        });
        navigate(`/applications/${draftId}`);
        return draftId;
      }

      const submit = await invokeFunction<{ draft_status?: string; task?: { id: string } }>("career-ops-submit", {
        draft_application_id: draftId,
      });
      if (submit.error) throw submit.error;
      navigate(`/applications/${draftId}`);
      return draftId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Apply failed");
      return null;
    } finally {
      setBusyId(null);
    }
  }, [navigate]);

  const applyUrl = useCallback(async (payload: {
    title: string;
    company: string;
    apply_url: string;
    description?: string;
    location?: string;
  }) => {
    setBusyId("url");
    try {
      const result = await invokeFunction<{ draft?: { id: string } }>("career-ops-one-click", {
        ...payload,
        queue_if_supported: true,
      });
      if (result.error || !result.data?.draft?.id) {
        throw result.error || new Error("Could not fetch that posting");
      }
      navigate(`/applications/${result.data.draft.id}`);
      return result.data.draft.id;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add URL");
      return null;
    } finally {
      setBusyId(null);
    }
  }, [navigate]);

  const submitDraft = useCallback(async (draftId: string) => {
    setBusyId(draftId);
    try {
      const result = await invokeFunction("career-ops-submit", { draft_application_id: draftId });
      if (result.error) throw result.error;
      toast.message("Queued", { description: "Cloud queue accepted this packet. Submitted only after a receipt." });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue");
      return false;
    } finally {
      setBusyId(null);
    }
  }, []);

  return { applyEvaluation, applyUrl, submitDraft, busyId };
}
