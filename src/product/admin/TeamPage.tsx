import { FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/product/components/PageHeader";
import { companyOps, type OperatorSession } from "@/product/lib/company-ops";
import {
  OPERATOR_PERMISSIONS,
  OPERATOR_ROLES,
  PERMISSION_LABELS,
  ROLE_LABELS,
  can,
  canChangeRole,
  canInviteRole,
  canRevoke,
  type OperatorRole,
} from "@/lib/operator-roles";

type Member = { id: string; user_id: string; role: OperatorRole; email: string };
type Invite = { id: string; email: string; role: OperatorRole; token: string; expires_at: string };

export default function TeamPage() {
  const session = useOutletContext<OperatorSession>();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OperatorRole>("support");

  const team = useQuery({
    queryKey: ["ops-team"],
    queryFn: async () => {
      const { data, error } = await companyOps<{
        members: Member[];
        invites: Invite[];
        seats: { used: number; limit: number };
      }>("list_team");
      if (error || !data) throw error || new Error("Team unavailable");
      return data;
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await companyOps<{ accept_url?: string }>("invite", { email, role });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Invite created");
      if (data?.accept_url) void navigator.clipboard.writeText(data.accept_url);
      setEmail("");
      void client.invalidateQueries({ queryKey: ["ops-team"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Invite failed"),
  });

  const actor = session.member.role;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <PageHeader
        kicker="Team"
        title="People who run the company"
        subtitle={`${team.data?.seats.used ?? session.org.used_seats} of ${team.data?.seats.limit ?? session.org.seat_limit} seats. Owner seeds from OWNER_EMAIL, then invites the rest.`}
      />

      {(actor === "owner" || actor === "admin") && (
        <form
          className="rp-panel flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <label className="rp-field">
            <span>Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rp-input w-64"
            />
          </label>
          <label className="rp-field">
            <span>Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as OperatorRole)}
              className="rp-select"
            >
              {OPERATOR_ROLES.filter((item) => canInviteRole(actor, item)).map((item) => (
                <option key={item} value={item}>{ROLE_LABELS[item]}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rp-btn rp-btn-primary" disabled={invite.isPending}>
            Invite
          </button>
        </form>
      )}

      <section>
        <h2 className="text-[15px] font-semibold tracking-tight">Members</h2>
        <div className="rp-panel-flush overflow-x-auto">
        <table className="rp-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(team.data?.members || []).map((member) => (
              <tr key={member.id}>
                <td>{member.email || member.user_id}</td>
                <td>
                  <select
                    value={member.role}
                    disabled={!canChangeRole(actor, member.role, member.role)}
                    className="rp-select h-8 w-auto"
                    onChange={(event) => {
                      const next = event.target.value as OperatorRole;
                      void companyOps("change_role", { memberId: member.id, role: next }).then(({ error }) => {
                        if (error) toast.error(error.message);
                        else {
                          toast.success("Role updated");
                          void client.invalidateQueries({ queryKey: ["ops-team"] });
                        }
                      });
                    }}
                  >
                    {OPERATOR_ROLES.map((item) => (
                      <option key={item} value={item}>{ROLE_LABELS[item]}</option>
                    ))}
                  </select>
                </td>
                <td className="text-right">
                  {canRevoke(actor, member.role) && member.user_id !== session.member.user_id && (
                    <button
                      type="button"
                      className="rp-btn rp-btn-destructive rp-btn-sm"
                      onClick={() => {
                        void companyOps("revoke", { memberId: member.id }).then(({ error }) => {
                          if (error) toast.error(error.message);
                          else {
                            toast.success("Access revoked");
                            void client.invalidateQueries({ queryKey: ["ops-team"] });
                          }
                        });
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold tracking-tight">Open invites</h2>
        {(team.data?.invites || []).length === 0 ? (
          <p className="mt-3 text-body text-muted-foreground">None pending.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {(team.data?.invites || []).map((inviteRow) => (
              <li key={inviteRow.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]">
                <span>{inviteRow.email} · {ROLE_LABELS[inviteRow.role]}</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="rp-btn rp-btn-ghost rp-btn-sm"
                    onClick={() => {
                      const url = `${window.location.origin}/invite/${inviteRow.token}`;
                      void navigator.clipboard.writeText(url);
                      toast.success("Invite link copied");
                    }}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className="rp-btn rp-btn-destructive rp-btn-sm"
                    onClick={() => {
                      void companyOps("revoke", { inviteId: inviteRow.id }).then(({ error }) => {
                        if (error) toast.error(error.message);
                        else void client.invalidateQueries({ queryKey: ["ops-team"] });
                      });
                    }}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold tracking-tight">Permission matrix</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Capability</th>
                {OPERATOR_ROLES.map((item) => (
                  <th key={item}>{ROLE_LABELS[item]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OPERATOR_PERMISSIONS.map((perm) => (
                <tr key={perm}>
                  <td>{PERMISSION_LABELS[perm]}</td>
                  {OPERATOR_ROLES.map((item) => (
                    <td key={item} className="text-muted-foreground">{can(item, perm) ? "Yes" : "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-body text-muted-foreground">
          Engineer is read-only ops: health, errors, and audit. Replay and flags stay with Owner and Admin.
        </p>
      </section>
    </div>
  );
}
