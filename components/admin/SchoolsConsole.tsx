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

import { CountryToggle, useCountry } from "@/components/CountryToggle";
import {
  Action,
  Checkbox,
  Field,
  Info,
  Input,
  Panel,
  Quiet,
  Row,
  Select,
  Textarea,
  Warn,
} from "@/components/admin/ui";
import { countryOfBoard } from "@/lib/syllabus";

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

  /* The console follows the country chosen anywhere else in the app, and can
     change it — CountryToggle writes the shared store, so the header and this
     screen never disagree.

     It filters the BOARD pickers only. Organisations, sections, teachers and
     rosters are listed whole, whatever country they belong to: an admin who
     taps "US" should stop being offered CBSE when creating a school, not lose
     sight of the CBSE schools they already run. Hiding existing rows behind a
     toggle is how somebody concludes their data is gone. */
  const [country] = useCountry();
  const boardsHere = boards.filter((board) => countryOfBoard(board.code) === country);

  /* A board the current country does not have reads as unchosen.
   *
   * Normalised here rather than cleared in an effect. Picking CBSE and then
   * switching to US leaves "cbse" in state, and a <select> that finds no
   * matching option renders the FIRST one instead — so the screen would show
   * "Common Core" while the form still held "cbse". That is the worst kind of
   * form bug: silent, and visible only in the row it creates.
   *
   * Deriving it fixes the display and the submitted value in one place, with
   * no effect re-running on every render to keep two copies in step. */
  const orgBoard = boardsHere.some((b) => b.code === newOrg.board) ? newOrg.board : "";
  const accessBoard = boardsHere.some((b) => b.code === access.board) ? access.board : "";

  /* The heading paints before the data does.
   *
   * This used to be a lone spinner on an otherwise empty page, so opening
   * Schools showed a blank screen that gave no sign of which module you had
   * landed in — every other console renders its title immediately. The
   * skeleton is three grey blocks rather than a message, because the wait is
   * one fetch and a sentence about loading would still be on screen after it
   * had finished. */
  if (loading) {
    return (
      <main className="mx-auto max-w-[1180px]">
        <h1 className="text-[1.9rem] font-extrabold tracking-[-0.03em] text-[#0d1015]">
          Schools &amp; coaching
        </h1>
        <p className="mt-1.5 flex items-center gap-2 text-[14px] text-[#667085]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading organisations…
        </p>

        <div className="mt-7 space-y-4" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="h-24 animate-pulse rounded-2xl border border-[#e9eaee] bg-white"
            />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1180px] space-y-10">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-[1.9rem] font-extrabold tracking-[-0.03em] text-[#0d1015]">
            Schools &amp; coaching
          </h1>
          <CountryToggle full={false} />
        </div>
        <p className="mt-1.5 text-[14.5px] text-[#4b5565]">
          The board pickers below offer {country === "us" ? "US" : "Indian"} curricula. Schools
          already set up are listed whatever country they are in.
        </p>
      </header>

      {message && (
        <p className="rounded-xl border border-[#d6e4ff] bg-[#f4f8ff] px-4 py-3 text-[14px] text-[#1e40af]">
          {message}
        </p>
      )}

      {/* --- Existing ------------------------------------------------------ */}
      <section className="space-y-4">
        {orgs.length === 0 && (
          <p className="rounded-2xl border border-[#e9eaee] bg-white p-6 text-[14px] text-[#667085]">
            No organisations yet.
          </p>
        )}

        {orgs.map((org) => (
          <div key={org.id} className="rounded-2xl border border-[#e9eaee] bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[1.05rem] font-extrabold tracking-[-0.02em] text-[#0d1015]">
                {org.name}
              </h2>
              <span className="text-[13px] text-[#667085]">
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
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-[#fde3b8] bg-[#fffbf3] px-3.5 py-2.5 text-[13px] leading-[1.5] text-[#b45309]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-[#fde3b8] bg-[#fffbf3] px-3.5 py-2.5 text-[13px] leading-[1.5] text-[#b45309]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No current academic year. Without one, sections are not tied to a year and
                nothing can be promoted at the end of it.
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
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f5f6f8] px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-[#14171c]">
                      {licence.plan} · {licence.seatsUsed}/{licence.seatsPurchased} seats allotted
                      <span className="opacity-55">
                        {" "}
                        · {licence.startsOn} → {licence.expiresOn}
                        {licence.status === "active" ? "" : ` · ${licence.status}`}
                      </span>
                    </span>

                    <span className="flex gap-1">
                      {licence.seatsUsed < licence.seatsPurchased && (
                        <Quiet
                          disabled={busy}
                          onClick={() =>
                            void post({ action: "assign_seats", licenceId: licence.id })
                          }
                        >
                          Allot to enrolled students
                        </Quiet>
                      )}

                      {/* Loaded on demand. A five-hundred-seat school would
                          otherwise put five hundred names into every load of
                          this console for the one admin about to revoke one. */}
                      <Quiet
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
                      >
                        {seats[licence.id] ? "Hide" : "Who is seated"}
                      </Quiet>
                    </span>
                  </div>
                ))}

                {Object.entries(seats).map(([licenceId, holders]) => (
                  <div key={licenceId} className="space-y-1 pl-3">
                    {holders.length === 0 && (
                      <p className="text-[12.5px] text-[#667085]">No seats on this licence.</p>
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
                          <Quiet
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
                          >
                            Revoke seat
                          </Quiet>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {org.licences.length === 0 && (
              <p className="mt-3 text-[13px] text-[#667085]">
                No licence row — this org was created from the old console. Access is currently
                running off the expiry date.
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
                <p className="text-[13px] text-[#667085]">No sections.</p>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* --- New org ------------------------------------------------------- */}
      {canCreateOrg && (
      <Panel
        title="New organisation"
        sub="Create a new school or coaching organisation."
        note="One step: organisation, licence and academic year are created together, or none of them are. A half-created school looks exactly like a complete one, and that is the most expensive bug there is."
      >
        <Row cols={4}>
          <Field label="Name">
            <Input
              value={newOrg.name}
              onChange={(event) => setNewOrg({ ...newOrg, name: event.target.value })}
              placeholder="Enter organisation name"
            />
          </Field>

          <Field label="Type">
            <Select
              value={newOrg.kind}
              onChange={(event) => setNewOrg({ ...newOrg, kind: event.target.value })}
            >
              <option value="school">School</option>
              <option value="coaching">Coaching</option>
            </Select>
          </Field>

          <Field label="Seats">
            <Input
              value={newOrg.seats}
              onChange={(event) => setNewOrg({ ...newOrg, seats: event.target.value })}
              inputMode="numeric"
            />
          </Field>

          {/* Two dates rather than one: a school signs in March for a session
              that starts in June, and a licence with only an end date is live
              from the day it is typed. */}
          <Field label="Start date">
            <Input
              type="date"
              value={newOrg.startsOn}
              onChange={(event) => setNewOrg({ ...newOrg, startsOn: event.target.value })}
            />
          </Field>
        </Row>

        <Row cols={2}>
          {/* The plan, not a price. Authoring rights, AI credits and the
              per-seat rate all come from it, so three fields that could
              disagree with the licence row became one that cannot. */}
          <Field label="Plan">
            <Select
              value={newOrg.planCode}
              onChange={(event) => setNewOrg({ ...newOrg, planCode: event.target.value })}
            >
              <option value="">Select plan</option>
              {plans.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name} · ₹{plan.pricePerSeatInr.toLocaleString("en-IN")}/seat
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Board (optional)">
            <Select
              value={orgBoard}
              onChange={(event) => setNewOrg({ ...newOrg, board: event.target.value })}
            >
              <option value="">Select board</option>
              {boardsHere.map((board) => (
                <option key={board.code} value={board.code}>
                  {board.name}
                </option>
              ))}
            </Select>
          </Field>
        </Row>

        <Row cols={3}>
          <Field label="Licence (blank = plan price)">
            <Input
              value={newOrg.pricePerSeatInr}
              onChange={(event) => setNewOrg({ ...newOrg, pricePerSeatInr: event.target.value })}
              inputMode="decimal"
              placeholder="e.g. 2500"
            />
          </Field>

          <Field label="PO number">
            <Input
              value={newOrg.poNumber}
              onChange={(event) => setNewOrg({ ...newOrg, poNumber: event.target.value })}
              placeholder="Enter PO number"
            />
          </Field>

          <Field label="Billing email">
            <Input
              value={newOrg.billingEmail}
              onChange={(event) => setNewOrg({ ...newOrg, billingEmail: event.target.value })}
              type="email"
              placeholder="billing@school.edu"
            />
          </Field>
        </Row>

        {/* The expiry sits beside the invoice switch rather than in the date
            row above: it is the field the warning below is about, and a date
            the form refuses to submit without belongs next to its reason. */}
        <Row cols={2}>
          <Field label="Expiry date" hint="Required — it decides how long access lasts.">
            <Input
              type="date"
              value={newOrg.expiresOn}
              onChange={(event) => setNewOrg({ ...newOrg, expiresOn: event.target.value })}
            />
          </Field>

          {/* Off by default. A purchase order usually arrives after the account
              is set up, and an invoice raised against a PO number nobody has
              yet is one the school's accounts team rejects and somebody has to
              void. */}
          <div className="flex items-end pb-2.5">
            <Checkbox
              label="Raise the invoice now"
              checked={newOrg.raiseInvoice}
              onChange={(event) => setNewOrg({ ...newOrg, raiseInvoice: event.target.checked })}
            />
          </div>
        </Row>

        {/* Said before the button is pressed rather than after it fails. An org
            with no expiry used to be created happily and then granted permanent
            free access to everything; now the database refuses it, and the
            refusal arrives as prose about a licence rather than as this. */}
        {!newOrg.expiresOn && (
          <Warn>
            No licence is created without an expiry date — that date is what decides how long
            access lasts.
          </Warn>
        )}

        <Action
          disabled={busy || !newOrg.name || !newOrg.expiresOn || !newOrg.planCode}
          onClick={() =>
            void post({
              action: "create_org",
              name: newOrg.name,
              kind: newOrg.kind,
              board: orgBoard || null,
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
          <Plus className="h-4 w-4" />
          Onboard school
        </Action>
      </Panel>
      )}

      {/* --- New section --------------------------------------------------- */}
      <Panel title="New section" sub="Add a class section to an organisation.">
        <Row cols={3}>
          <Field label="Organisation">
            <Select
              value={newSection.orgId}
              onChange={(event) => setNewSection({ ...newSection, orgId: event.target.value })}
            >
              <option value="">Select organisation</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Section name">
            <Input
              value={newSection.name}
              onChange={(event) => setNewSection({ ...newSection, name: event.target.value })}
              placeholder="Class 8-A"
            />
          </Field>

          <Field label="Class level">
            <Input
              value={newSection.classLevel}
              onChange={(event) => setNewSection({ ...newSection, classLevel: event.target.value })}
              inputMode="numeric"
              placeholder="8"
            />
          </Field>
        </Row>

        <Action
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
          <Plus className="h-4 w-4" />
          Create section
        </Action>
      </Panel>

      {/* --- The institute own administrator ------------------------------- */}
      <Panel
        title="Assign an org admin"
        sub="Create the first admin who will set up the organisation."
        note="Until an organisation has one of these, nobody at the institute can open a console at all — creating the org does not create its admin. They see their own students, sections and content, and nothing of any other customer."
      >
        <Row cols={2}>
          <Field label="Organisation">
            <Select
              value={orgAdmin.orgId}
              onChange={(event) => setOrgAdmin({ ...orgAdmin, orgId: event.target.value })}
            >
              <option value="">Select organisation</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Email">
            <Input
              value={orgAdmin.email}
              onChange={(event) => setOrgAdmin({ ...orgAdmin, email: event.target.value })}
              placeholder="principal@school.edu"
            />
          </Field>
        </Row>

        <Action
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
        </Action>
      </Panel>

      {/* --- Teacher ------------------------------------------------------- */}
      <Panel
        title="Assign a teacher"
        note="The teacher must have signed up first. Assigning also adds them to the org — teaches_section checks both. Picking a subject limits the teacher to that one subject in that one section; subjects are not created here, they appear on their own once content is published, so the list is whatever the curriculum already contains."
      >
        <Row cols={3}>
          <Field label="Section ID (copy from above)">
            <Input
              mono
              value={teacher.sectionId}
              onChange={(event) => setTeacher({ ...teacher, sectionId: event.target.value })}
              placeholder="e.g. SEC-001"
            />
          </Field>

          <Field label="Email">
            <Input
              value={teacher.email}
              onChange={(event) => setTeacher({ ...teacher, email: event.target.value })}
              placeholder="teacher@school.edu"
            />
          </Field>

          <Field label="Subject access">
            <Select
              value={teacher.subjectRef}
              onChange={(event) => setTeacher({ ...teacher, subjectRef: event.target.value })}
            >
              <option value="">Class teacher only — no subject</option>
              {subjects.map((subject) => (
                <option key={subject.ref} value={subject.ref}>
                  {subject.label}
                </option>
              ))}
            </Select>
          </Field>
        </Row>

        <Action
          disabled={busy || !teacher.sectionId || !teacher.email}
          onClick={() =>
            void post({
              action: "assign_teacher",
              sectionId: teacher.sectionId,
              teacherEmail: teacher.email,
              subjectRef: teacher.subjectRef || null,
            })
          }
        >
          Assign
        </Action>
      </Panel>

      {/* --- Roster -------------------------------------------------------- */}
      <Panel
        title="Import a roster"
        sub="Paste students as lines of email, admission number, roll number."
      >
        <Field label="Section ID">
          <Input
            mono
            value={roster.sectionId}
            onChange={(event) => setRoster({ ...roster, sectionId: event.target.value })}
            placeholder="e.g. SEC-001"
          />
        </Field>

        <Field label="Students (one per line)">
          <Textarea
            mono
            value={roster.emails}
            onChange={(event) => setRoster({ ...roster, emails: event.target.value })}
            rows={6}
            placeholder={[
              "asha@school.test, ADM-001, 12",
              "rahul@school.test, ADM-002, 13",
              "meera@school.test",
            ].join("\n")}
          />
        </Field>

        <Action
          disabled={busy || !roster.sectionId || !roster.emails.trim()}
          onClick={() =>
            void post({
              action: "import_roster",
              sectionId: roster.sectionId,
              emails: roster.emails
                .split(/\r?\n/)
                .map((row) => row.trim())
                .filter(Boolean),
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
        </Action>

        <Info>
          <p>
            One student per line: email, admission number, roll number. The last two are optional
            — but without them the teacher&rsquo;s class list shows names only and will not
            reconcile with the school&rsquo;s own register. Importing again updates the numbers,
            so you can fix the bad rows and paste the same list back.
          </p>
          <p>
            Students who have already signed up are enrolled now. The rest are reported back
            — no account is created for them, because every account needs its own parental
            consent and a school cannot give that.
          </p>
        </Info>
      </Panel>

      {/* --- What a plan unlocks --------------------------------------------
          Vendor only, and it is the price list rather than a school setting.
          Empty means everything: the table's rule is that no rows is no
          restriction, so a plan nobody has configured sells the whole
          catalogue — which is what every plan was doing. */}
      {canCreateOrg && (
        <Panel
          title="Plan content access"
          note={'Left blank means "any" — so (CBSE, 8, blank) means "everything in CBSE class 8". Adding even one row narrows the plan to that row alone, so decide whether you want full coverage before you add the first one.'}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {plans.map((plan) => {
              const rows = planAccess.filter((row) => row.plan === plan.code);

              return (
                <div key={plan.code} className="rounded-xl border border-[#e9eaee] p-4">
                  <p className="text-[14px] font-bold text-[#0d1015]">{plan.name}</p>

                  {rows.length === 0 ? (
                    <p className="mt-1.5 text-[13px] text-[#b45309]">
                      No restrictions — this plan opens the entire catalogue.
                    </p>
                  ) : (
                    <div className="mt-2.5 space-y-1.5">
                      {rows.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-2 text-[13px] text-[#4b5565]"
                        >
                          <span>
                            {row.board ? row.board.toUpperCase() : "any board"} ·{" "}
                            {row.classLevel ? `class ${row.classLevel}` : "any class"} ·{" "}
                            {row.subjectId ?? "any subject"}
                          </span>

                          <Quiet
                            disabled={busy}
                            onClick={() =>
                              void post({ action: "remove_plan_access", accessId: row.id })
                            }
                          >
                            Remove
                          </Quiet>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Row cols={4}>
            <Field label="Plan">
              <Select
                value={access.plan}
                onChange={(event) => setAccess({ ...access, plan: event.target.value })}
              >
                <option value="">Select plan</option>
                {plans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Board">
              <Select
                value={accessBoard}
                onChange={(event) => setAccess({ ...access, board: event.target.value })}
              >
                <option value="">Any board</option>
                {boardsHere.map((board) => (
                  <option key={board.code} value={board.code}>
                    {board.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Class">
              <Input
                value={access.classLevel}
                onChange={(event) => setAccess({ ...access, classLevel: event.target.value })}
                inputMode="numeric"
                placeholder="Any class"
              />
            </Field>

            <Field label="Subject">
              <Input
                value={access.subjectId}
                onChange={(event) => setAccess({ ...access, subjectId: event.target.value })}
                placeholder="Any subject"
              />
            </Field>
          </Row>

          <Action
            disabled={busy || !access.plan}
            onClick={async () => {
              const ok = await post({
                action: "plan_access",
                planCodeForAccess: access.plan,
                accessBoard: accessBoard || null,
                accessClassLevel: access.classLevel ? Number(access.classLevel) : null,
                accessSubjectId: access.subjectId || null,
              });

              if (ok) setAccess({ ...access, board: "", classLevel: "", subjectId: "" });
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Action>
        </Panel>
      )}

      {/* --- Next academic year ---------------------------------------------
          Onboarding creates the first one and, until this existed, nothing
          created the second — so promotion worked once and then had nowhere to
          promote into, twelve months later. */}
      <Panel
        title="New academic year"
        note="New sections attach to this year, and end-of-year promotion runs against it. An org can have only one current year — the database enforces that, so the old one is cleared automatically."
      >
        <Row cols={4}>
          <Field label="Organisation">
            <Select
              value={year.orgId}
              onChange={(event) => setYear({ ...year, orgId: event.target.value })}
            >
              <option value="">Select organisation</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {org.currentYear ? ` · currently ${org.currentYear}` : " · no year set"}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Year">
            <Input
              value={year.label}
              onChange={(event) => setYear({ ...year, label: event.target.value })}
              placeholder="2027-28"
            />
          </Field>

          <Field label="Start date">
            <Input
              type="date"
              value={year.startsOn}
              onChange={(event) => setYear({ ...year, startsOn: event.target.value })}
            />
          </Field>

          <Field label="End date">
            <Input
              type="date"
              value={year.endsOn}
              onChange={(event) => setYear({ ...year, endsOn: event.target.value })}
            />
          </Field>
        </Row>

        <Checkbox
          label="Make this the current year"
          checked={year.makeCurrent}
          onChange={(event) => setYear({ ...year, makeCurrent: event.target.checked })}
        />

        <Action
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
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create year"}
        </Action>
      </Panel>

      {/* --- Year end -------------------------------------------------------
          The one operation with no undo. promote_section() moves the roster,
          writes the history row and follows the student records across, all in
          one transaction — but afterwards the children ARE in the new class,
          and putting them back is another promotion in the other direction. */}
      <Panel
        title="Year-end promotion"
        note="The whole class moves together, and last year's record is written to student_section_history — without it there is no way to tell which class last year's results belonged to. Running it again does no harm: students who have already moved are not moved twice."
      >
        <Row cols={4}>
          <Field label="Organisation">
            <Select
              value={promote.orgId}
              onChange={(event) =>
                setPromote({ ...promote, orgId: event.target.value, from: "", to: "", yearId: "" })
              }
            >
              <option value="">Select organisation</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Record under">
            <Select
              value={promote.yearId}
              onChange={(event) => setPromote({ ...promote, yearId: event.target.value })}
            >
              <option value="">Which year to record it under</option>
              {orgs
                .find((org) => org.id === promote.orgId)
                ?.years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                    {year.isCurrent ? " (current)" : ""}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="From this section">
            <Select
              value={promote.from}
              onChange={(event) => setPromote({ ...promote, from: event.target.value })}
            >
              <option value="">From this section</option>
              {orgs
                .find((org) => org.id === promote.orgId)
                ?.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Into this section">
            <Select
              value={promote.to}
              onChange={(event) => setPromote({ ...promote, to: event.target.value })}
            >
              <option value="">Into this section</option>
              {orgs
                .find((org) => org.id === promote.orgId)
                ?.sections.filter((section) => section.id !== promote.from)
                .map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
            </Select>
          </Field>
        </Row>

        <Action
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
        </Action>
      </Panel>

      {/* --- A notice ------------------------------------------------------
          Posts to /api/announcements rather than through this route's action
          list, because a teacher sends notices too and they never reach this
          console. One endpoint, one set of rules about who may address whom. */}
      <Panel
        title="Send a notice"
        note="Students see it on their dashboard, today. This is not WhatsApp — no message leaves the app, so it does not need parental consent."
      >
        <Row cols={2}>
          <Field label="Organisation">
            <Select
              value={notice.orgId}
              onChange={(event) =>
                setNotice({ ...notice, orgId: event.target.value, sectionId: "" })
              }
            >
              <option value="">Select organisation</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Where">
            <Select
              value={notice.sectionId}
              onChange={(event) => setNotice({ ...notice, sectionId: event.target.value })}
            >
              <option value="">Whole school</option>
              {orgs
                .find((org) => org.id === notice.orgId)
                ?.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
            </Select>
          </Field>
        </Row>

        <Field label="Title">
          <Input
            value={notice.title}
            onChange={(event) => setNotice({ ...notice, title: event.target.value })}
            placeholder="Read on a phone, so keep it short"
          />
        </Field>

        <Field label="Message">
          <Textarea
            value={notice.body}
            onChange={(event) => setNotice({ ...notice, body: event.target.value })}
            rows={3}
            placeholder="Type your message here"
          />
        </Field>

        <Action
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
        </Action>
      </Panel>
    </main>
  );
}
