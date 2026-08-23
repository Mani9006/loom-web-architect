import { FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";
import { can } from "@/lib/operator-roles";

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

  async function search(event: FormEvent) {
    event.preventDefault();
    const { data, error } = await companyOps<{ users: FoundUser[] }>("search_users", { query });
    if (error) {
      toast.error(error.message);
      return;
    }
    setUsers(data?.users || []);
  }

  return (
    <div className="space-y-8">
      <PageHeader kicker="Users" title="Look up an account" subtitle="Support can search, reset, and open a read-only snapshot. Billing grants credits." />
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Email or user id"
          className="h-10 flex-1 border border-border bg-background px-3 text-body"
        />
        <button type="submit" className="h-10 bg-primary px-4 text-caption text-primary-foreground">Search</button>
      </form>
      <table className="w-full text-left text-[13px]">
        <thead className="text-caption text-muted-foreground">
          <tr>
            <th className="py-2">Email</th>
            <th className="py-2">Credits</th>
            <th className="py-2">Plan</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {users.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="py-3">{row.email}</td>
              <td className="py-3 font-mono">{row.balance}</td>
              <td className="py-3">{row.access?.subscription_plan || "free"} · {row.access?.account_status || "active"}</td>
              <td className="py-3 text-right">
                <div className="flex justify-end gap-2">
                  {can(session.member.role, "billing") && (
                    <button
                      type="button"
                      className="border border-border px-2 py-1 text-caption"
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
                        className="border border-border px-2 py-1 text-caption"
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
                        className="border border-border px-2 py-1 text-caption"
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
                      className="border border-border px-2 py-1 text-caption"
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
      {snapshot && (
        <pre className="overflow-auto border border-border p-4 text-[12px] leading-relaxed">{JSON.stringify(snapshot, null, 2)}</pre>
      )}
    </div>
  );
}
