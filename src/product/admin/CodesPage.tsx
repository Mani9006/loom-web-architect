import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps } from "@/product/lib/company-ops";
import { EmptyState } from "@/product/components/EmptyState";
import { Field } from "@/product/ui/Field";
import { Panel } from "@/product/ui/Panel";

type Code = {
  id: string;
  code: string;
  kind: string;
  percent_off: number | null;
  credits_grant: number | null;
  active: boolean;
};

export default function CodesPage() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("promo");
  const list = useQuery({
    queryKey: ["ops-codes"],
    queryFn: async () => {
      const { data, error } = await companyOps<{ codes: Code[] }>("list_codes");
      if (error) throw error;
      return data?.codes || [];
    },
  });

  async function create(event: FormEvent) {
    event.preventDefault();
    const { error } = await companyOps("create_code", { code, kind, percent_off: kind === "promo" ? 20 : null, credits_grant: kind === "referral" ? 25 : null });
    if (error) toast.error(error.message);
    else {
      toast.success("Code saved. Stripe checkout also accepts Stripe promo codes.");
      setCode("");
      void client.invalidateQueries({ queryKey: ["ops-codes"] });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader kicker="Billing" title="Promo and referral" subtitle="These are first-party records. Stripe Checkout also has allow_promotion_codes enabled. Promo codes create invoices, never receipts." />
      <form onSubmit={create} className="rp-panel flex flex-wrap items-end gap-3 p-4">
        <Field label="Code">
          <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="LAUNCH20" className="rp-input w-48 uppercase" />
        </Field>
        <Field label="Kind">
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="rp-select w-40">
            <option value="promo">Promo</option>
            <option value="referral">Referral</option>
          </select>
        </Field>
        <button type="submit" className="rp-btn rp-btn-primary">Create</button>
      </form>
      <Panel flush>
        {(list.data || []).length === 0 ? (
          <div className="p-4"><EmptyState title="No codes yet" body="Create a promo or referral code. Stripe still owns checkout." /></div>
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(list.data || []).map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono">{row.code}</td>
                    <td>{row.kind}</td>
                    <td>{row.active ? "active" : "off"}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="rp-btn rp-btn-ghost rp-btn-sm"
                        onClick={() => {
                          void companyOps("toggle_code", { codeId: row.id, active: !row.active }).then(() => client.invalidateQueries({ queryKey: ["ops-team"] }));
                          void client.invalidateQueries({ queryKey: ["ops-codes"] });
                        }}
                      >
                        Toggle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
