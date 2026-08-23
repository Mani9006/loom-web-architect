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
    <div className="space-y-10">
      <PageHeader
        kicker="Team"
        title="People who run the company"
        subtitle={`${team.data?.seats.used ?? session.org.used_seats} of ${team.data?.seats.limit ?? session.org.seat_limit} seats. Owner seeds from OWNER_EMAIL, then invites the rest.`}
      />

      {(actor === "owner" || actor === "admin") && (
        <form
          className="flex flex-wrap items-end gap-3 border-t border-border pt-6"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <label className="text-caption text-muted-foreground">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 block h-10 w-64 border border-border bg-background px-3 text-body"
            />
          </label>
          <label className="text-caption text-muted-foreground">
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as OperatorRole)}
              className="mt-2 block h-10 border border-border bg-background px-3 text-body"
            >
              {OPERATOR_ROLES.filter((item) => canInviteRole(actor, item)).map((item) => (
                <option key={item} value={item}>{ROLE_LABELS[item]}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 bg-primary px-4 text-caption text-primary-foreground" disabled={invite.isPending}>
            Invite
          </button>
        </form>
      )}

      <section>
        <h2 className="font-display text-2xl">Members</h2>
        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="text-caption text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(team.data?.members || []).map((member) => (
              <tr key={member.id} className="border-t border-border">
                <td className="py-3">{member.email || member.user_id}</td>
                <td className="py-3">
                  <select
                    value={member.role}
                    disabled={!canChangeRole(actor, member.role, member.role)}
                    className="h-9 border border-border bg-background px-2"
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
                <td className="py-3 text-right">
                  {canRevoke(actor, member.role) && member.user_id !== session.member.user_id && (
                    <button
                      type="button"
                      className="text-caption text-destructive"
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
      </section>

      <section>
        <h2 className="font-display text-2xl">Open invites</h2>
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
                    className="text-caption text-primary"
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
                    className="text-caption text-destructive"
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
        <h2 className="font-display text-2xl">Permission matrix</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-caption text-muted-foreground">
                <th className="py-2 pr-4">Capability</th>
                {OPERATOR_ROLES.map((item) => (
                  <th key={item} className="py-2 pr-4">{ROLE_LABELS[item]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OPERATOR_PERMISSIONS.map((perm) => (
                <tr key={perm} className="border-t border-border">
                  <td className="py-2 pr-4">{PERMISSION_LABELS[perm]}</td>
                  {OPERATOR_ROLES.map((item) => (
                    <td key={item} className="py-2 pr-4 text-muted-foreground">{can(item, perm) ? "Yes" : "—"}</td>
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
