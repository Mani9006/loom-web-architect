import { FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";
import { can } from "@/lib/operator-roles";
import { EmptyState } from "@/product/components/EmptyState";
import { Panel } from "@/product/ui/Panel";

type FoundUser = {
  id: string;
  email: string | null;
  created_at: string;
  balance: number;
  access: { purchase_state?: string; subscription_plan?: string; account_status?: string } | null;
};

export default function UsersPage() {
  const session = useOutletContext<OperatorSession>();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<FoundUser[]>([]);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    const { data, error } = await companyOps<{ users: FoundUser[] }>("search_users", { query });
    if (error) {
      toast.error(error.message);
      return;
    }
    setUsers(data?.users || []);
    setSearched(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader kicker="Users" title="Look up an account" subtitle="Support can search, reset, and open a read-only snapshot. Billing grants credits." />
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Email or user id"
          className="rp-input flex-1"
        />
        <button type="submit" className="rp-btn rp-btn-primary">Search</button>
      </form>
      <Panel flush>
        {searched && users.length === 0 ? (
          <div className="p-4"><EmptyState title="No accounts" body="Nothing matched that email or user id." /></div>
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Credits</th>
                  <th>Plan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email}</td>
                    <td className="font-mono tabular-nums">{row.balance}</td>
                    <td>{row.access?.subscription_plan || "free"} · {row.access?.account_status || "active"}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {can(session.member.role, "billing") && (
                          <button
                            type="button"
                            className="rp-btn rp-btn-outline rp-btn-sm"
                            onClick={() => {
                              const delta = Number(window.prompt("Credit delta (negative refunds)", "25"));
                              if (!delta) return;
                              void companyOps("grant_credits", { userId: row.id, delta, note: "admin desk" }).then(({ error }) => {
                                if (error) toast.error(error.message);
                                else toast.success("Credits updated");
                              });
                            }}
                          >
                            Credits
                          </button>
                        )}
                        {can(session.member.role, "user_support") && (
                          <>
                            <button
                              type="button"
                              className="rp-btn rp-btn-outline rp-btn-sm"
                              onClick={() => {
                                void companyOps("set_access", { userId: row.id, account_status: "suspended" }).then(({ error }) => {
                                  if (error) toast.error(error.message);
                                  else toast.success("Account paused");
                                });
                              }}
                            >
                              Pause
                            </button>
                            <button
                              type="button"
                              className="rp-btn rp-btn-outline rp-btn-sm"
                              onClick={() => {
                                void companyOps("reset_password", { email: row.email }).then(({ data, error }) => {
                                  if (error) toast.error(error.message);
                                  else {
                                    toast.success("Reset link created");
                                    if ((data as { link?: string } | null)?.link) void navigator.clipboard.writeText((data as { link: string }).link);
                                  }
                                });
                              }}
                            >
                              Reset
                            </button>
                          </>
                        )}
                        {can(session.member.role, "impersonate") && (
                          <button
                            type="button"
                            className="rp-btn rp-btn-outline rp-btn-sm"
                            onClick={() => {
                              void companyOps<{ snapshot: Record<string, unknown> }>("impersonate", { userId: row.id }).then(({ data, error }) => {
                                if (error) toast.error(error.message);
                                else setSnapshot(data?.snapshot || null);
                              });
                            }}
                          >
                            View as
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {snapshot && (
        <pre className="overflow-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-[12px] leading-relaxed">{JSON.stringify(snapshot, null, 2)}</pre>
      )}
    </div>
  );
}
