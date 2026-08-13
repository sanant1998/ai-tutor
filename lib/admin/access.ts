/* Two kinds of administrator, and they are not the same kind of thing.
 *
 * ---------------------------------------------------------------------------
 * SUPER ADMIN IS THE VENDOR. ORG ADMIN IS THE CUSTOMER.
 *
 * A super admin is a person in ADMIN_EMAILS — the environment file of the
 * deployment. Deliberately not a database row, because they can change what
 * every student in every organisation is taught, and a role column is one bad
 * UPDATE away from something granting itself that.
 *
 * An org admin is `org_members.role = 'org_admin'`: the coaching institute
 * that bought the platform. They publish into their own organisation and see
 * nothing outside it. They cannot be in the vendor's environment file, which
 * is exactly the point at which the flat allowlist stopped being enough.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE
 *
 * A super admin sees everything. An org admin sees their own org and the
 * shared base curriculum, and writes only into their own org — however the
 * request is shaped. `targetOrg` in lib/tenancy.ts enforces the write side;
 * this file decides who is asking. */

import "server-only";

import { requireAdmin } from "@/lib/admin/guard";
import { visibleTo, type Visibility } from "@/lib/tenancy";
import { createClient } from "@/lib/supabase/server";

export type ContentAccess =
  | { ok: true; userId: string; email: string; visibility: Visibility }
  | { ok: false; status: number; message: string };

/* Who may open the content console, and with what reach.
 *
 * Tries the vendor first because that check is free — an env lookup and a
 * session — and only asks the database when it fails. */
export async function requireContentAccess(): Promise<ContentAccess> {
  const vendor = await requireAdmin();

  if (vendor.ok) {
    return {
      ok: true,
      userId: vendor.userId,
      email: vendor.email,
      visibility: { orgIds: [], adminOf: [], superAdmin: true },
    };
  }

  /* Not in the allowlist, and not signed in at all — no point asking the
     database which orgs nobody administers. */
  if (vendor.status === 401) return vendor;

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, status: 503, message: "Accounts are not configured." };
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, status: 401, message: "Sign in first." };

  const visibility = await visibleTo(data.user.id);

  if (visibility.adminOf.length === 0) {
    /* 404, matching requireAdmin. A console that confirms its own existence to
       a signed-in student is a console someone keeps poking at. */
    return { ok: false, status: 404, message: "Not found." };
  }

  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email ?? "",
    visibility,
  };
}

/* Whether a specific org's plan lets it write curriculum at all.
 *
 * Some licences are "use the vendor's content with your students" and nothing
 * more — a commercial line rather than a technical one, so it is a column on
 * orgs rather than an assumption baked into the console. A super admin is not
 * subject to it. */
export async function canPublishInto(
  orgId: string | null,
  visibility: Visibility,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (visibility.superAdmin) return { ok: true };

  if (!orgId) {
    /* Only the vendor writes the shared base curriculum. An org admin posting
       org_id: null would otherwise publish into everyone's product. */
    return { ok: false, message: "Only the platform team can publish shared content." };
  }

  if (!visibility.adminOf.includes(orgId)) {
    return { ok: false, message: "That is not your organisation." };
  }

  const { canAuthor } = await import("@/lib/tenancy");

  if (!(await canAuthor(orgId))) {
    return {
      ok: false,
      message:
        "Your plan does not include publishing your own content. Please talk to the platform team.",
    };
  }

  return { ok: true };
}
