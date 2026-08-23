import { PageHeader } from "@/components/PageHeader";
import { EmptyState, Panel, PrimaryButton } from "@/components/brand/ui";
import { useNavigate } from "react-router-dom";

export default function ResearchPage() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader
        title="Research"
        status="lighter chrome"
        description="Company research sits beside the apply engine. It does not invent culture write-ups or mark a job submitted."
      />
      <Panel>
        <EmptyState
          title="Research opens from a match"
          body="Pick a United States match first. Notes you write stay on that application. This page is chrome, not a second product."
          action={<PrimaryButton onClick={() => navigate("/matches")}>Open job matches</PrimaryButton>}
        />
      </Panel>
    </div>
  );
}
