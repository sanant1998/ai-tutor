import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronRight, FileText } from "lucide-react";

import { OrgPicker, ViewTabs } from "@/components/admin/ReviewFilters";
import { Info } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

/* One list of everything waiting on a person.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT THE SAFETY QUEUE AGAIN
 *
 * Safety queue actions a flag. Content publishes a draft. Both are specialist
 * screens and both are the right place to do the work — but neither answers
 * "is anything waiting on me", and the honest answer to that lived in two
 * places that a reviewer had to remember to open. The one that gets forgotten
 * is always the safety queue, because an empty one is the normal case.
 *
 * So this is an inbox, not a third tool: it lists what is outstanding, says
 * which kind it is, and hands you to the screen that resolves it. Nothing is
 * actioned here, which is also why it can safely show both kinds together.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT PRINT WHAT THE CHILD WROTE
 *
 * A safety flag carries an excerpt of the message that triggered it. The queue
 * that acts on it needs that; a routing list does not, and every screen that
 * repeats it is another screen where a child's words can be read over someone's
 * shoulder. Category and severity are enough to decide what to open first.
 *
 * ---------------------------------------------------------------------------
 * VENDOR ONLY, ORG IS A FILTER
 *
 * Safety flags cover every organisation's children, so this stays behind
 * requireAdmin — the environment allowlist, not a role column. The org picker
 * narrows the list; it does not grant anybody new sight of it. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review queue · PaperPath",
  robots: { index: false, follow: false },
};

/* What "unreviewed" means in each table, in that table's own words. */
const OPEN_FLAG = "open";
const OPEN_DRAFT = ["draft", "in_review"];

type Item = {
  id: string;
  kind: "flag" | "draft";
  title: string;
  detail: string;
  orgId: string | null;
  at: string;
  unreviewed: boolean;
  urgent: boolean;
  href: string;
};

function ago(now: number, iso: string) {
  const hours = Math.floor((now - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; org?: string }>;
}) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin/review");
    return (
      <main className="max-w-lg py-16">
        <h1 className="text-2xl font-extrabold">Not found</h1>
      </main>
    );
  }

  const { view: rawView, org: rawOrg } = await searchParams;
  const view = ["all", "unreviewed", "reviewed"].includes(rawView ?? "")
    ? (rawView as string)
    : "unreviewed";
  const orgId = rawOrg ?? "";

  if (!isAdminConfigured()) {
    return (
      <main className="max-w-lg py-16">
        <p className="text-[15px] text-[#4b5565]">
          Set <code>SUPABASE_SERVICE_ROLE_KEY</code>.
        </p>
      </main>
    );
  }

  const db = createAdminClient();

  // eslint-disable-next-line react-hooks/purity -- force-dynamic: one render per request
  const now = Date.now();

  const [orgRows, flagRows, draftRows, memberRows] = await Promise.all([
    db.from("orgs").select("id, name").order("name"),
    db.from("safety_flags").select("id, category, severity, status, created_at, user_id"),
    db.from("content_drafts").select("id, entity_type, entity_id, status, org_id, created_at"),
    /* Flags belong to a student, not to an org — safety_flags has no org_id.
       The membership row is the only link, so it is read once and used as a
       lookup rather than joined per flag. */
    db.from("org_members").select("user_id, org_id"),
  ]);

  const orgs = (orgRows.data ?? []) as { id: string; name: string }[];
  const orgName = new Map(orgs.map((org) => [org.id, org.name]));
  const orgOfUser = new Map(
    ((memberRows.data ?? []) as { user_id: string; org_id: string }[]).map((row) => [
      row.user_id,
      row.org_id,
    ]),
  );

  const items: Item[] = [
    ...((flagRows.data ?? []) as {
      id: string;
      category: string;
      severity: string;
      status: string;
      created_at: string;
      user_id: string;
    }[]).map((flag) => ({
      id: `flag-${flag.id}`,
      kind: "flag" as const,
      title: flag.category,
      detail: flag.severity === "urgent" ? "Urgent · flagged message" : "Flagged message",
      orgId: orgOfUser.get(flag.user_id) ?? null,
      at: flag.created_at,
      unreviewed: flag.status === OPEN_FLAG,
      urgent: flag.severity === "urgent" && flag.status === OPEN_FLAG,
      href: "/admin/safety",
    })),

    ...((draftRows.data ?? []) as {
      id: string;
      entity_type: string;
      entity_id: string | null;
      status: string;
      org_id: string | null;
      created_at: string;
    }[]).map((draft) => ({
      id: `draft-${draft.id}`,
      kind: "draft" as const,
      title: draft.entity_id ?? `new ${draft.entity_type}`,
      detail: `${draft.entity_type} · ${draft.status}`,
      orgId: draft.org_id,
      at: draft.created_at,
      unreviewed: OPEN_DRAFT.includes(draft.status),
      urgent: false,
      href: "/admin/content",
    })),
  ];

  const inOrg = orgId ? items.filter((item) => item.orgId === orgId) : items;

  const shown = inOrg
    .filter((item) =>
      view === "all" ? true : view === "unreviewed" ? item.unreviewed : !item.unreviewed,
    )
    /* Urgent first, then oldest — an urgent flag raised on Tuesday outranks a
       draft uploaded this morning, and within a kind the thing that has waited
       longest is the thing most at risk of never being looked at. */
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.at.localeCompare(b.at));

  const unreviewed = inOrg.filter((item) => item.unreviewed).length;

  return (
    <main className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#667085]">
            Admin
          </p>
          <h1 className="mt-1 text-[1.9rem] font-extrabold tracking-[-0.03em] text-[#0d1015]">
            Review queue
          </h1>
        </div>

        <ViewTabs view={view} />
      </div>

      <div className="mt-6">
        <OrgPicker orgs={orgs} orgId={orgId} />
      </div>

      <p className="mt-7 flex flex-wrap items-center gap-2 text-[14px] text-[#4b5565]">
        Showing
        <span className="rounded-full bg-[#eff4ff] px-2.5 py-0.5 text-[13px] font-bold text-[#2563eb]">
          {shown.length}
        </span>
        {view === "all" ? "items" : view}
        {view !== "unreviewed" && unreviewed > 0 && (
          <span className="text-[#667085]">· {unreviewed} still unreviewed</span>
        )}
      </p>

      <div className="mt-4">
        <Info>
          <p>
            Review everything people report or flag. A model catches some of it; a person sees
            all of it. Start with what is not reviewed, and where the model was unsure, the call
            is yours.
          </p>
        </Info>
      </div>

      <div className="mt-5 space-y-2.5">
        {shown.length === 0 && (
          <p className="rounded-2xl border border-[#e9eaee] bg-white p-6 text-[14px] text-[#667085]">
            {view === "unreviewed"
              ? "Nothing waiting. No open flags and no drafts sitting unpublished."
              : "Nothing in this state."}
          </p>
        )}

        {shown.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-4 rounded-2xl border border-[#e9eaee] bg-white p-4 transition-colors hover:border-[#cfd4dc]"
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                item.kind === "flag"
                  ? item.urgent
                    ? "bg-[#fee2e2] text-[#dc2626]"
                    : "bg-[#fef0d8] text-[#d97706]"
                  : "bg-[#dbeafe] text-[#2563eb]"
              }`}
            >
              {item.kind === "flag" ? (
                <AlertTriangle className="h-[18px] w-[18px]" />
              ) : (
                <FileText className="h-[18px] w-[18px]" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-[#0d1015]">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-[#4b5565]">
                {item.detail}
                {item.orgId ? ` · ${orgName.get(item.orgId) ?? "unknown org"}` : " · shared base"}
                {` · ${ago(now, item.at)}`}
              </span>
            </span>

            {!item.unreviewed && (
              <span className="shrink-0 rounded-full bg-[#e6f7ec] px-2.5 py-1 text-[11.5px] font-bold text-[#15803d]">
                Reviewed
              </span>
            )}

            <ChevronRight className="h-4 w-4 shrink-0 text-[#667085]" />
          </Link>
        ))}
      </div>
    </main>
  );
}
