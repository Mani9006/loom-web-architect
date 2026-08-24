import { useNavigate } from "react-router-dom";
import { StatusChip } from "@/product/components/StatusChip";
import { EmptyState } from "@/product/components/EmptyState";
import { useApplications } from "@/product/hooks/useApplications";
import { PRODUCT_APP_TABS } from "@/product/lib/application-tabs";
import { relativeTime } from "@/product/lib/format";
import { PageHeader } from "@/product/components/PageHeader";
import { DataTable, Pagination } from "@/product/ui/DataTable";
import { Segmented } from "@/product/ui/Segmented";
import { Panel } from "@/product/ui/Panel";

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { counts, tab, setTab, paged, page, setPage, pageCount, loading } = useApplications();

  return (
    <div className="space-y-5">
      <PageHeader kicker="Applications" title="Every packet, with a status you can trust" />
      <Segmented
        value={tab}
        onChange={setTab}
        options={PRODUCT_APP_TABS.map((item) => ({ id: item.id, label: item.label, count: counts[item.id] }))}
      />
      <Panel flush>
        <DataTable
          columns={[
            { key: "role", header: "Role", cell: (row) => <span className="font-medium">{row.title}</span> },
            { key: "company", header: "Company", cell: (row) => <span className="text-muted-foreground">{row.company}</span> },
            { key: "status", header: "Status", cell: (row) => <StatusChip status={row.status.key} label={row.status.label} /> },
            { key: "resume", header: "Resume", cell: (row) => <span className="capitalize text-muted-foreground">{row.resumeState}</span>, hideOnMobile: true },
            { key: "cover", header: "Cover", cell: (row) => <span className="text-muted-foreground">{row.hasCoverLetter ? "Yes" : "—"}</span>, hideOnMobile: true },
            { key: "updated", header: "Updated", cell: (row) => <span className="text-muted-foreground">{relativeTime(row.activityAt)}</span> },
          ]}
          rows={paged}
          rowKey={(row) => row.draft.id}
          onRowClick={(row) => navigate(`/applications/${row.draft.id}`)}
          loading={loading}
          empty={<div className="p-4"><EmptyState title="No applications in this tab" body="Apply from Home or Job matches. Submitted never appears without a worker receipt." /></div>}
        />
        <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      </Panel>
    </div>
  );
}
