import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps } from "@/product/lib/company-ops";

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
    <div className="space-y-8">
      <PageHeader kicker="Codes" title="Promo and referral" subtitle="These are first-party records. Stripe Checkout also has allow_promotion_codes enabled." />
      <form onSubmit={create} className="flex flex-wrap gap-3">
        <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="LAUNCH20" className="h-10 border border-border px-3 text-body uppercase" />
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 border border-border px-3">
          <option value="promo">Promo</option>
          <option value="referral">Referral</option>
        </select>
        <button type="submit" className="h-10 bg-primary px-4 text-caption text-primary-foreground">Create</button>
      </form>
      <ul className="divide-y divide-border border-y border-border">
        {(list.data || []).map((row) => (
          <li key={row.id} className="flex items-center justify-between py-3 text-[13px]">
            <span className="font-mono">{row.code}</span>
            <span>{row.kind} · {row.active ? "active" : "off"}</span>
            <button
              type="button"
              className="text-caption"
              onClick={() => {
                void companyOps("toggle_code", { codeId: row.id, active: !row.active }).then(() => client.invalidateQueries({ queryKey: ["ops-team"] }));
                void client.invalidateQueries({ queryKey: ["ops-codes"] });
              }}
            >
              Toggle
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
