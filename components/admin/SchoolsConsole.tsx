"use client";

/* Setting up a school: org, sections, teacher, roster.
 *
 * Internal tooling, so it is a form and a list rather than a designed
 * experience. The one thing it does take seriously is the seat count — an org
 * whose seats have run out, or whose contract has expired, silently loses
 * every student's access through can_access_chapter, and "the whole school
 * stopped working this morning" is the call this screen exists to prevent. */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type Section = { id: string; name: string; classLevel: number | null; hasTeacher: boolean };

type Org = {
  id: string;
  name: string;
  kind: string;
  seats: number;
  seatsUsed: number;
  expiresOn: string | null;
  expired: boolean;
  startsOn: string | null;
  notStartedYet: boolean;
  licenceInr: number | null;
  canAuthor: boolean;
  sections: Section[];
};

/* Creating an organisation is the vendor's act, not the customer's — it sets
   the seat count and the licence expiry, both of which came from a contract.
   The server refuses it either way; hiding the form is so an institute admin
   is not shown a control that will only ever fail. */
export function SchoolsConsole({ canCreateOrg }: { canCreateOrg: boolean }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [newOrg, setNewOrg] = useState({
    name: "",
    kind: "school",
    seats: "40",
    startsOn: "",
    expiresOn: "",
    licenceInr: "",
    billingEmail: "",
    canAuthor: false,
  });
  const [newSection, setNewSection] = useState({ orgId: "", name: "", classLevel: "8" });
  const [roster, setRoster] = useState({ sectionId: "", emails: "" });
  const [teacher, setTeacher] = useState({ sectionId: "", email: "" });
  const [orgAdmin, setOrgAdmin] = useState({ orgId: "", email: "" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/schools");
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Could not load.");
        return;
      }

      setOrgs(payload.orgs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json();

      setMessage(
        response.ok
          ? (payload.note ??
            (payload.enrolled !== undefined
              ? `${payload.enrolled} enrolled${payload.pending?.length ? `, ${payload.pending.length} not signed up yet` : ""}`
              : "Done."))
          : (payload.error ?? "Failed."),
      );

      if (response.ok) await load();
      return response.ok;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-20">
        <Loader2 className="h-4 w-4 animate-spin opacity-60" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <header>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] opacity-50">
          Admin
        </p>
        <h1 className="font-display mt-1 text-[1.8rem] font-extrabold tracking-[-0.03em]">
          Schools &amp; coaching
        </h1>
      </header>

      {message && (
        <p className="rounded-xl bg-black/5 px-4 py-3 text-[14px] dark:bg-white/10">{message}</p>
      )}

      {/* --- Existing ------------------------------------------------------ */}
      <section className="space-y-3">
        {orgs.length === 0 && <p className="text-[14px] opacity-55">No organisations yet.</p>}

        {orgs.map((org) => (
          <div key={org.id} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-bold">{org.name}</h2>
              <span className="text-[13px] opacity-60">
                {org.kind} · {org.seatsUsed}/{org.seats} seats
                {org.licenceInr !== null
                  ? ` · ₹${org.licenceInr.toLocaleString("en-IN")}`
                  : ""}
                {org.startsOn ? ` · from ${org.startsOn}` : ""}
                {org.expiresOn ? ` · until ${org.expiresOn}` : ""}
                {org.canAuthor ? " · authors own content" : ""}
              </span>
            </div>

            {(org.expired ||
              org.notStartedYet ||
              (org.seats > 0 && org.seatsUsed >= org.seats)) && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {org.expired
                  ? "Contract expired — every student in this org has lost access."
                  : org.notStartedYet
                    ? /* Not a fault. Said out loud because "we signed in March
                         and it does not work" is otherwise indistinguishable
                         from a broken deployment. */
                      `Licence starts ${org.startsOn}. Until then students here have no access.`
                    : "Seats full. The next import will be refused."}
              </p>
            )}

            <div className="mt-3 space-y-1">
              {org.sections.map((section) => (
                <p key={section.id} className="font-mono text-[12px] opacity-65">
                  {section.name}
                  {section.classLevel ? ` · class ${section.classLevel}` : ""}
                  {section.hasTeacher ? "" : " · no teacher"} — {section.id}
                </p>
              ))}
              {org.sections.length === 0 && (
                <p className="text-[13px] opacity-50">No sections.</p>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* --- New org ------------------------------------------------------- */}
      {canCreateOrg && (
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">New organisation</h2>

        <div className="grid gap-2 sm:grid-cols-4">
          <input
            value={newOrg.name}
            onChange={(event) => setNewOrg({ ...newOrg, name: event.target.value })}
            placeholder="Name"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
          <select
            value={newOrg.kind}
            onChange={(event) => setNewOrg({ ...newOrg, kind: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="school">School</option>
            <option value="coaching">Coaching</option>
          </select>
          <input
            value={newOrg.seats}
            onChange={(event) => setNewOrg({ ...newOrg, seats: event.target.value })}
            inputMode="numeric"
            placeholder="Seats"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
          <input
            type="date"
            value={newOrg.expiresOn}
            onChange={(event) => setNewOrg({ ...newOrg, expiresOn: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
        </div>

        {/* The commercial half of the same form. Two dates rather than one:
            a school signs in March for a session that starts in June, and a
            licence with only an end date is live from the day it is typed. */}
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            type="date"
            value={newOrg.startsOn}
            onChange={(event) => setNewOrg({ ...newOrg, startsOn: event.target.value })}
            title="Licence starts"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
          <input
            value={newOrg.licenceInr}
            onChange={(event) => setNewOrg({ ...newOrg, licenceInr: event.target.value })}
            inputMode="decimal"
            placeholder="Licence ₹"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
          <input
            value={newOrg.billingEmail}
            onChange={(event) => setNewOrg({ ...newOrg, billingEmail: event.target.value })}
            type="email"
            placeholder="Billing email"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
        </div>

        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={newOrg.canAuthor}
            onChange={(event) => setNewOrg({ ...newOrg, canAuthor: event.target.checked })}
            className="h-4 w-4"
          />
          Can upload and publish its own content
        </label>

        <Button
          type="button"
          disabled={busy || !newOrg.name}
          onClick={() =>
            void post({
              action: "create_org",
              name: newOrg.name,
              kind: newOrg.kind,
              seats: Number(newOrg.seats) || 0,
              expiresOn: newOrg.expiresOn || null,
              licenceStartsOn: newOrg.startsOn || null,
              licenceInr: newOrg.licenceInr ? Number(newOrg.licenceInr) : null,
              billingEmail: newOrg.billingEmail || null,
              canAuthor: newOrg.canAuthor,
            })
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create
        </Button>
      </section>
      )}

      {/* --- New section --------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">New section</h2>

        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={newSection.orgId}
            onChange={(event) => setNewSection({ ...newSection, orgId: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Organisation…</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input
            value={newSection.name}
            onChange={(event) => setNewSection({ ...newSection, name: event.target.value })}
            placeholder="Class 8-A"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
          <input
            value={newSection.classLevel}
            onChange={(event) => setNewSection({ ...newSection, classLevel: event.target.value })}
            inputMode="numeric"
            placeholder="Class level"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
        </div>

        <Button
          type="button"
          disabled={busy || !newSection.orgId || !newSection.name}
          onClick={() =>
            void post({
              action: "create_section",
              orgId: newSection.orgId,
              name: newSection.name,
              classLevel: Number(newSection.classLevel) || null,
            })
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create
        </Button>
      </section>

      {/* --- The institute's own administrator ----------------------------- */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">Assign an org admin</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={orgAdmin.orgId}
            onChange={(event) => setOrgAdmin({ ...orgAdmin, orgId: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Organisation…</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input
            value={orgAdmin.email}
            onChange={(event) => setOrgAdmin({ ...orgAdmin, email: event.target.value })}
            placeholder="principal@school.edu"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
        </div>

        <Button
          type="button"
          disabled={busy || !orgAdmin.orgId || !orgAdmin.email}
          onClick={() =>
            void post({
              action: "assign_admin",
              orgId: orgAdmin.orgId,
              teacherEmail: orgAdmin.email,
            })
          }
        >
          Make admin
        </Button>

        <p className="text-[12px] opacity-50">
          Until an organisation has one of these, nobody at the institute can
          open a console at all — creating the org does not create its admin.
          They see their own students, sections and content, and nothing of any
          other customer.
        </p>
      </section>

      {/* --- Teacher ------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">Assign a teacher</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={teacher.sectionId}
            onChange={(event) => setTeacher({ ...teacher, sectionId: event.target.value })}
            placeholder="Section id (copy from above)"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 font-mono text-[13px] dark:border-white/15"
          />
          <input
            value={teacher.email}
            onChange={(event) => setTeacher({ ...teacher, email: event.target.value })}
            placeholder="teacher@school.edu"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
        </div>

        <Button
          type="button"
          disabled={busy || !teacher.sectionId || !teacher.email}
          onClick={() =>
            void post({
              action: "assign_teacher",
              sectionId: teacher.sectionId,
              teacherEmail: teacher.email,
            })
          }
        >
          Assign
        </Button>

        <p className="text-[12px] opacity-50">
          The teacher must have signed up first. Assigning also adds them to the
          org — teaches_section checks both.
        </p>
      </section>

      {/* --- Roster -------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">Import a roster</h2>

        <input
          value={roster.sectionId}
          onChange={(event) => setRoster({ ...roster, sectionId: event.target.value })}
          placeholder="Section id"
          className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 font-mono text-[13px] dark:border-white/15"
        />

        <textarea
          value={roster.emails}
          onChange={(event) => setRoster({ ...roster, emails: event.target.value })}
          rows={6}
          placeholder="One email per line"
          className="w-full rounded-xl border border-black/10 bg-transparent p-3 font-mono text-[13px] dark:border-white/15"
        />

        <Button
          type="button"
          disabled={busy || !roster.sectionId || !roster.emails.trim()}
          onClick={() =>
            void post({
              action: "import_roster",
              sectionId: roster.sectionId,
              emails: roster.emails.split(/[\n,;]+/).map((email) => email.trim()),
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
        </Button>

        <p className="text-[12px] opacity-50">
          Students who have already signed up are enrolled now. The rest are
          reported back — no account is created for them, because every account
          needs its own parental consent and a school cannot give that.
        </p>
      </section>
    </main>
  );
}
