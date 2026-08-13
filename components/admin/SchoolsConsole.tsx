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

type Section = {
  id: string;
  name: string;
  classLevel: number | null;
  hasTeacher: boolean;
  hasYear: boolean;
};

type Licence = {
  id: string;
  plan: string;
  seatsPurchased: number;
  seatsUsed: number;
  startsOn: string;
  expiresOn: string;
  status: string;
};

type Plan = {
  code: string;
  name: string;
  pricePerSeatInr: number;
  aiCreditsPerDay: number;
  canAuthor: boolean;
};

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
  board: string | null;
  currentYear: string | null;
  years: { id: string; label: string; isCurrent: boolean }[];
  imports: {
    id: string;
    kind: string;
    at: string;
    total: number;
    enrolled: number;
    failed: number;
    errors: { row: number; reason: string }[];
  }[];
  invoices: {
    id: string;
    number: string;
    totalInr: number;
    status: string;
    issuedOn: string;
    dueOn: string | null;
    poNumber: string | null;
    overdue: boolean;
  }[];
  licences: Licence[];
  sections: Section[];
};

/* Creating an organisation is the vendor's act, not the customer's — it sets
   the seat count and the licence expiry, both of which came from a contract.
   The server refuses it either way; hiding the form is so an institute admin
   is not shown a control that will only ever fail. */
export function SchoolsConsole({ canCreateOrg }: { canCreateOrg: boolean }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [boards, setBoards] = useState<{ code: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ ref: string; label: string; classLevel: number }[]>(
    [],
  );
  const [planAccess, setPlanAccess] = useState<
    { id: string; plan: string; board: string | null; classLevel: number | null; subjectId: string | null }[]
  >([]);
  const [access, setAccess] = useState({ plan: "", board: "", classLevel: "", subjectId: "" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [newOrg, setNewOrg] = useState({
    name: "",
    kind: "school",
    board: "",
    planCode: "",
    seats: "40",
    startsOn: "",
    expiresOn: "",
    pricePerSeatInr: "",
    poNumber: "",
    billingEmail: "",
    raiseInvoice: false,
  });
  const [newSection, setNewSection] = useState({ orgId: "", name: "", classLevel: "8" });
  const [roster, setRoster] = useState({ sectionId: "", emails: "" });
  const [teacher, setTeacher] = useState({ sectionId: "", email: "", subjectRef: "" });
  const [orgAdmin, setOrgAdmin] = useState({ orgId: "", email: "" });
  const [notice, setNotice] = useState({ orgId: "", sectionId: "", title: "", body: "" });
  const [promote, setPromote] = useState({ orgId: "", from: "", to: "", yearId: "" });
  const [year, setYear] = useState({ orgId: "", label: "", startsOn: "", endsOn: "", makeCurrent: true });
  const [seats, setSeats] = useState<
    Record<string, { id: string; name: string; assignedAt: string; revokedAt: string | null }[]>
  >({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/schools");
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Could not load.");
        return;
      }

      setOrgs(payload.orgs ?? []);
      setPlans(payload.plans ?? []);
      setBoards(payload.boards ?? []);
      setSubjects(payload.subjects ?? []);
      setPlanAccess(payload.planAccess ?? []);
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
              ? `${payload.enrolled} enrolled${payload.withAdmissionNumbers !== undefined ? `, ${payload.withAdmissionNumbers} with admission numbers` : ""}${payload.pending?.length ? `, ${payload.pending.length} not signed up yet` : ""}`
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

            {/* No academic year means sections cannot be attached to one, and
                promotion at the end of the year has nothing to promote into.
                Named here because the symptom is twelve months away. */}
            {!org.currentYear && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Koi current academic year nahi. Iske bina sections year se nahi judte aur saal ke
                aakhir me promote nahi ho paayega.
              </p>
            )}

            {/* The licences, which answer a different question from the seat
                count above it: that one counts children enrolled, this one
                counts what the school is being billed for. Mid-term the two
                disagree, and that gap is exactly what needs allotting. */}
            {org.licences.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {org.licences.map((licence) => (
                  <div
                    key={licence.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/5 px-3 py-2 dark:bg-white/5"
                  >
                    <span className="text-[13px]">
                      {licence.plan} · {licence.seatsUsed}/{licence.seatsPurchased} seats allotted
                      <span className="opacity-55">
                        {" "}
                        · {licence.startsOn} → {licence.expiresOn}
                        {licence.status === "active" ? "" : ` · ${licence.status}`}
                      </span>
                    </span>

                    <span className="flex gap-1">
                      {licence.seatsUsed < licence.seatsPurchased && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void post({ action: "assign_seats", licenceId: licence.id })
                          }
                          className="h-7 px-2 text-[12px]"
                        >
                          Allot to enrolled students
                        </Button>
                      )}

                      {/* Loaded on demand. A five-hundred-seat school would
                          otherwise put five hundred names into every load of
                          this console for the one admin about to revoke one. */}
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={async () => {
                          if (seats[licence.id]) {
                            setSeats((current) => {
                              const next = { ...current };
                              delete next[licence.id];
                              return next;
                            });
                            return;
                          }

                          const response = await fetch(
                            `/api/admin/schools?seatsFor=${licence.id}`,
                          );

                          if (!response.ok) {
                            setMessage("Seats did not load.");
                            return;
                          }

                          const payload = await response.json();
                          setSeats((current) => ({ ...current, [licence.id]: payload.seats ?? [] }));
                        }}
                        className="h-7 px-2 text-[12px]"
                      >
                        {seats[licence.id] ? "Chhupayein" : "Who is seated"}
                      </Button>
                    </span>
                  </div>
                ))}

                {Object.entries(seats).map(([licenceId, holders]) => (
                  <div key={licenceId} className="space-y-1 pl-3">
                    {holders.length === 0 && (
                      <p className="text-[12.5px] opacity-55">No seats on this licence.</p>
                    )}

                    {holders.map((holder) => (
                      <div
                        key={holder.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                      >
                        <span className={holder.revokedAt ? "opacity-45 line-through" : ""}>
                          {holder.name}
                          <span className="opacity-55">
                            {" "}
                            · {holder.assignedAt.slice(0, 10)}
                          </span>
                        </span>

                        {!holder.revokedAt && (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={async () => {
                              const ok = await post({
                                action: "revoke_seat",
                                seatId: holder.id,
                              });

                              /* The list is reloaded rather than patched: the
                                 seat count above it moved too, and two numbers
                                 that disagree on the same screen is worse than
                                 a second request. */
                              if (ok) {
                                const response = await fetch(
                                  `/api/admin/schools?seatsFor=${licenceId}`,
                                );

                                if (response.ok) {
                                  const payload = await response.json();
                                  setSeats((current) => ({
                                    ...current,
                                    [licenceId]: payload.seats ?? [],
                                  }));
                                }
                              }
                            }}
                            className="h-6 px-2 text-[12px]"
                          >
                            Seat waapas lein
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {org.licences.length === 0 && (
              <p className="mt-2 text-[13px] opacity-55">
                Koi licence row nahi — ye org purane console se bana hai. Access abhi expiry date
                se chal raha hai.
              </p>
            )}

            {/* What the last imports did. The whole argument for import_jobs
                was that a response nobody kept is no answer — "which twelve
                did not go in" has to outlive the tab. Row numbers only: the
                route stores no addresses. */}
            {org.imports.length > 0 && (
              <div className="mt-3 space-y-1">
                {org.imports.slice(0, 3).map((job) => (
                  <p key={job.id} className="text-[12.5px] opacity-65">
                    {job.at.slice(0, 10)} · {job.kind} · {job.enrolled}/{job.total} enrolled
                    {job.failed > 0 && `, ${job.failed} failed`}
                    {job.errors.length > 0 && (
                      <span className="opacity-75">
                        {" "}
                        — rows {job.errors.slice(0, 6).map((error) => error.row).join(", ")}
                        {job.errors.length > 6 ? "…" : ""}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            )}

            {/* Raised at onboarding and, until now, visible to nobody — not
                the vendor and not the school being asked to pay it. */}
            {org.invoices.length > 0 && (
              <div className="mt-3 space-y-1">
                {org.invoices.slice(0, 3).map((invoice) => (
                  <p
                    key={invoice.id}
                    className={`text-[12.5px] ${invoice.overdue ? "text-amber-700 dark:text-amber-400" : "opacity-65"}`}
                  >
                    {invoice.number} · ₹{invoice.totalInr.toLocaleString("en-IN")} ·{" "}
                    {invoice.overdue ? `overdue since ${invoice.dueOn}` : invoice.status}
                    {invoice.poNumber ? ` · PO ${invoice.poNumber}` : ""}
                  </p>
                ))}
              </div>
            )}

            <div className="mt-3 space-y-1">
              {org.sections.map((section) => (
                <p key={section.id} className="font-mono text-[12px] opacity-65">
                  {section.name}
                  {section.classLevel ? ` · class ${section.classLevel}` : ""}
                  {section.hasTeacher ? "" : " · no teacher"}
                  {section.hasYear ? "" : " · no year"} — {section.id}
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
          {/* The plan, not a price. Authoring rights, AI credits and the per-seat
              rate all come from it, so three fields that could disagree with
              the licence row became one that cannot. */}
          <select
            value={newOrg.planCode}
            onChange={(event) => setNewOrg({ ...newOrg, planCode: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Plan…</option>
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name} · ₹{plan.pricePerSeatInr.toLocaleString("en-IN")}/seat
              </option>
            ))}
          </select>
          <select
            value={newOrg.board}
            onChange={(event) => setNewOrg({ ...newOrg, board: event.target.value })}
            title="Board this school teaches"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Board… (optional)</option>
            {boards.map((board) => (
              <option key={board.code} value={board.code}>
                {board.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <input
            value={newOrg.pricePerSeatInr}
            onChange={(event) => setNewOrg({ ...newOrg, pricePerSeatInr: event.target.value })}
            inputMode="decimal"
            placeholder="₹/seat (blank = plan price)"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
          <input
            value={newOrg.poNumber}
            onChange={(event) => setNewOrg({ ...newOrg, poNumber: event.target.value })}
            placeholder="PO number"
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

        {/* Off by default. A purchase order usually arrives after the account
            is set up, and an invoice raised against a PO number nobody has yet
            is one the school's accounts team rejects and somebody has to
            void. */}
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={newOrg.raiseInvoice}
            onChange={(event) => setNewOrg({ ...newOrg, raiseInvoice: event.target.checked })}
            className="h-4 w-4"
          />
          Raise the invoice now
        </label>

        {/* Said before the button is pressed rather than after it fails. An org
            with no expiry used to be created happily and then granted permanent
            free access to everything; now the database refuses it, and the
            refusal arrives as prose about a licence rather than as this. */}
        {!newOrg.expiresOn && (
          <p className="flex items-center gap-1.5 text-[13px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Expiry date ke bina licence nahi banta — wahi date decide karti hai ki access kab tak
            hai.
          </p>
        )}

        <Button
          type="button"
          disabled={busy || !newOrg.name || !newOrg.expiresOn || !newOrg.planCode}
          onClick={() =>
            void post({
              action: "create_org",
              name: newOrg.name,
              kind: newOrg.kind,
              board: newOrg.board || null,
              planCode: newOrg.planCode,
              seats: Number(newOrg.seats) || 0,
              expiresOn: newOrg.expiresOn || null,
              licenceStartsOn: newOrg.startsOn || null,
              pricePerSeatInr: newOrg.pricePerSeatInr ? Number(newOrg.pricePerSeatInr) : null,
              poNumber: newOrg.poNumber || null,
              billingEmail: newOrg.billingEmail || null,
              raiseInvoice: newOrg.raiseInvoice,
            })
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Onboard school
        </Button>

        <p className="text-[13px] opacity-55">
          Ek hi step me: organisation, licence, aur academic year — teeno ek saath bante hain, ya
          koi bhi nahi. Aadha bana hua school poore school jaisa hi dikhta hai, aur wahi sabse
          mehnga bug hai.
        </p>
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

        <select
          value={teacher.subjectRef}
          onChange={(event) => setTeacher({ ...teacher, subjectRef: event.target.value })}
          className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        >
          <option value="">Class teacher only — no subject</option>
          {subjects.map((subject) => (
            <option key={subject.ref} value={subject.ref}>
              {subject.label}
            </option>
          ))}
        </select>

        <p className="text-[12px] opacity-55">
          Subject chunne par teacher ko sirf usi section ka wahi subject dikhta hai. Subject yahan
          banta nahi — wo content publish hone par apne aap aata hai, isliye list wahi hai jo
          curriculum me maujood hai.
        </p>

        <Button
          type="button"
          disabled={busy || !teacher.sectionId || !teacher.email}
          onClick={() =>
            void post({
              action: "assign_teacher",
              sectionId: teacher.sectionId,
              teacherEmail: teacher.email,
              /* Optional, and it decides which of two jobs this is. Without a
                 subject the teacher becomes the section's CLASS teacher — the
                 one who takes attendance and talks to the parent. With one,
                 they also get a teacher_assignments row, which is where
                 teaches_section() derives subject-level scope from and the
                 only way to give somebody one class without making them an
                 admin of the whole school. */
              subjectRef: teacher.subjectRef || null,
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
          placeholder={[
            "asha@school.test, ADM-001, 12",
            "rahul@school.test, ADM-002, 13",
            "meera@school.test",
          ].join("\n")}
          className="w-full rounded-xl border border-black/10 bg-transparent p-3 font-mono text-[13px] dark:border-white/15"
        />

        <Button
          type="button"
          disabled={busy || !roster.sectionId || !roster.emails.trim()}
          onClick={() =>
            void post({
              action: "import_roster",
              sectionId: roster.sectionId,
              /* Newlines only. The comma used to separate addresses and now
                 separates the columns within one student's row. */
              emails: roster.emails
                .split(/\r?\n/)
                .map((row) => row.trim())
                .filter(Boolean),
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
        </Button>

        <p className="text-[12px] opacity-55">
          Ek line me ek student: <span className="font-mono">email, admission number, roll
          number</span>. Aakhri do optional hain — par unke bina teacher ki class list me sirf
          naam aayenge aur school ke apne register se milaan nahi hoga. Dobara import karne par
          numbers update ho jaate hain, isliye galat rows theek karke wahi list phir se daal
          sakte hain.
        </p>

        <p className="text-[12px] opacity-50">
          Students who have already signed up are enrolled now. The rest are
          reported back — no account is created for them, because every account
          needs its own parental consent and a school cannot give that.
        </p>
      </section>

      {/* --- What a plan unlocks --------------------------------------------
          Vendor only, and it is the price list rather than a school setting.
          Empty means everything: the table's rule is that no rows is no
          restriction, so a plan nobody has configured sells the whole
          catalogue — which is what every plan was doing. */}
      {canCreateOrg && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-bold">Plan content access</h2>

          {plans.map((plan) => {
            const rows = planAccess.filter((row) => row.plan === plan.code);

            return (
              <div
                key={plan.code}
                className="rounded-xl border border-black/10 p-3 dark:border-white/10"
              >
                <p className="text-[14px] font-semibold">{plan.name}</p>

                {rows.length === 0 ? (
                  <p className="mt-1 text-[13px] text-amber-700 dark:text-amber-400">
                    Koi restriction nahi — ye plan poora catalogue kholta hai.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span>
                          {row.board ? row.board.toUpperCase() : "any board"} ·{" "}
                          {row.classLevel ? `class ${row.classLevel}` : "any class"} ·{" "}
                          {row.subjectId ?? "any subject"}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void post({ action: "plan_access", removeAccessId: row.id })
                          }
                          className="h-6 px-2 text-[12px]"
                        >
                          Hatayein
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="grid gap-2 sm:grid-cols-4">
            <select
              value={access.plan}
              onChange={(event) => setAccess({ ...access, plan: event.target.value })}
              className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
            >
              <option value="">Plan…</option>
              {plans.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name}
                </option>
              ))}
            </select>

            <select
              value={access.board}
              onChange={(event) => setAccess({ ...access, board: event.target.value })}
              className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
            >
              <option value="">Any board</option>
              {boards.map((board) => (
                <option key={board.code} value={board.code}>
                  {board.name}
                </option>
              ))}
            </select>

            <input
              value={access.classLevel}
              onChange={(event) => setAccess({ ...access, classLevel: event.target.value })}
              inputMode="numeric"
              placeholder="Any class"
              className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
            />

            <input
              value={access.subjectId}
              onChange={(event) => setAccess({ ...access, subjectId: event.target.value })}
              placeholder="Any subject (maths)"
              className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
            />
          </div>

          <Button
            type="button"
            disabled={busy || !access.plan}
            onClick={async () => {
              const ok = await post({
                action: "plan_access",
                planCodeForAccess: access.plan,
                accessBoard: access.board || null,
                accessClassLevel: access.classLevel ? Number(access.classLevel) : null,
                accessSubjectId: access.subjectId || null,
              });

              if (ok) setAccess({ ...access, board: "", classLevel: "", subjectId: "" });
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add karein"}
          </Button>

          <p className="text-[12px] opacity-50">
            Khaali chhoda hua matlab &quot;koi bhi&quot; — to (CBSE, 8, khaali) ka matlab hai
            &quot;CBSE class 8 ka sab kuch&quot;. Ek bhi row jodte hi plan sirf usi tak seemit ho
            jaata hai, isliye pehli row jodne se pehle soch lein ki poora coverage chahiye ya nahi.
          </p>
        </section>
      )}

      {/* --- Next academic year ---------------------------------------------
          Onboarding creates the first one and, until this existed, nothing
          created the second — so promotion worked once and then had nowhere to
          promote into, twelve months later. */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">New academic year</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={year.orgId}
            onChange={(event) => setYear({ ...year, orgId: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Organisation…</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
                {org.currentYear ? ` · abhi ${org.currentYear}` : " · koi year nahi"}
              </option>
            ))}
          </select>

          <input
            value={year.label}
            onChange={(event) => setYear({ ...year, label: event.target.value })}
            placeholder="2027-28"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="date"
            value={year.startsOn}
            onChange={(event) => setYear({ ...year, startsOn: event.target.value })}
            title="Saal shuru"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
          <input
            type="date"
            value={year.endsOn}
            onChange={(event) => setYear({ ...year, endsOn: event.target.value })}
            title="Saal khatam"
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          />
        </div>

        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={year.makeCurrent}
            onChange={(event) => setYear({ ...year, makeCurrent: event.target.checked })}
            className="h-4 w-4"
          />
          Isse current year bana dein
        </label>

        <Button
          type="button"
          disabled={busy || !year.orgId || !year.label || !year.startsOn || !year.endsOn}
          onClick={async () => {
            const ok = await post({
              action: "create_year",
              orgId: year.orgId,
              label: year.label,
              startsOn: year.startsOn,
              endsOn: year.endsOn,
              makeCurrent: year.makeCurrent,
            });

            if (ok) setYear({ ...year, label: "", startsOn: "", endsOn: "" });
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Year banayein"}
        </Button>

        <p className="text-[12px] opacity-50">
          Naye sections isi year se judte hain, aur saal ke aakhir me promotion isi me hoti hai.
          Ek org ka ek hi current year ho sakta hai — database khud rokta hai, isliye purana apne
          aap hat jaata hai.
        </p>
      </section>

      {/* --- Year end -------------------------------------------------------
          The one operation with no undo. promote_section() moves the roster,
          writes the history row and follows the student records across, all in
          one transaction — but afterwards the children ARE in the new class,
          and putting them back is another promotion in the other direction. */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">Year-end promotion</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={promote.orgId}
            onChange={(event) =>
              setPromote({ orgId: event.target.value, from: "", to: "", yearId: "" })
            }
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Organisation…</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          <select
            value={promote.yearId}
            onChange={(event) => setPromote({ ...promote, yearId: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Kis saal ka record…</option>
            {orgs
              .find((org) => org.id === promote.orgId)
              ?.years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                  {year.isCurrent ? " (current)" : ""}
                </option>
              ))}
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={promote.from}
            onChange={(event) => setPromote({ ...promote, from: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Is section se…</option>
            {orgs
              .find((org) => org.id === promote.orgId)
              ?.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
          </select>

          <select
            value={promote.to}
            onChange={(event) => setPromote({ ...promote, to: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Is section me…</option>
            {orgs
              .find((org) => org.id === promote.orgId)
              ?.sections.filter((section) => section.id !== promote.from)
              .map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
          </select>
        </div>

        <Button
          type="button"
          disabled={busy || !promote.from || !promote.to || !promote.yearId}
          onClick={() =>
            void post({
              action: "promote",
              fromSectionId: promote.from,
              toSectionId: promote.to,
              academicYearId: promote.yearId,
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Promote"}
        </Button>

        <p className="text-[12px] opacity-50">
          Poori class ek saath jaati hai, aur pichhle saal ka record{" "}
          <span className="font-mono">student_section_history</span> me likha jaata hai — usi ke
          bina pichhle saal ka result kis class ka tha, ye pata nahi chalta. Dobara chalane se
          kuch nahi bigadta: jo ja chuke hain wo dubara nahi jaate.
        </p>
      </section>

      {/* --- A notice ------------------------------------------------------
          Posts to /api/announcements rather than through this route's action
          list, because a teacher sends notices too and they never reach this
          console. One endpoint, one set of rules about who may address whom. */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">Send a notice</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={notice.orgId}
            onChange={(event) => setNotice({ ...notice, orgId: event.target.value, sectionId: "" })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Organisation…</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          <select
            value={notice.sectionId}
            onChange={(event) => setNotice({ ...notice, sectionId: event.target.value })}
            className="rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
          >
            <option value="">Whole school</option>
            {orgs
              .find((org) => org.id === notice.orgId)
              ?.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
          </select>
        </div>

        <input
          value={notice.title}
          onChange={(event) => setNotice({ ...notice, title: event.target.value })}
          placeholder="Title — read on a phone, so keep it short"
          className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[14px] dark:border-white/15"
        />

        <textarea
          value={notice.body}
          onChange={(event) => setNotice({ ...notice, body: event.target.value })}
          rows={3}
          placeholder="Message"
          className="w-full rounded-xl border border-black/10 bg-transparent p-3 text-[14px] dark:border-white/15"
        />

        <Button
          type="button"
          disabled={busy || !notice.orgId || !notice.title.trim() || !notice.body.trim()}
          onClick={async () => {
            setBusy(true);
            setMessage("");

            try {
              const response = await fetch("/api/announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orgId: notice.orgId,
                  sectionId: notice.sectionId || null,
                  audience: notice.sectionId ? "section" : "all",
                  title: notice.title,
                  body: notice.body,
                }),
              });

              const payload = await response.json();

              setMessage(response.ok ? "Notice sent." : (payload.error ?? "Failed."));
              if (response.ok) setNotice({ ...notice, title: "", body: "" });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
        </Button>

        <p className="text-[12px] opacity-50">
          Students dekhenge apne dashboard par, aaj hi. Ye WhatsApp nahi hai — koi message
          bahar nahi jaata, isliye iske liye parent consent ki zaroorat nahi.
        </p>
      </section>
    </main>
  );
}
