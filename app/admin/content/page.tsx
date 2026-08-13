import { redirect } from "next/navigation";

import { ContentConsole } from "@/components/admin/ContentConsole";
import { requireContentAccess } from "@/lib/admin/access";
import { canAuthor } from "@/lib/tenancy";

/* The content console.
 *
 * Outside the (dashboard) group: it is not a student surface and should not
 * carry the student nav, the consent gate or the app shell. Its own guard runs
 * server-side before anything renders, and returns a 404 shape rather than a
 * "forbidden" — an admin console that announces itself to a signed-in student
 * is a console someone keeps poking at. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Content · PaperPath",
  robots: { index: false, follow: false },
};

export default async function AdminContentPage() {
  const admin = await requireContentAccess();

  if (!admin.ok) {
    if (admin.status === 401) redirect("/login?next=/admin/content");

    return (
      <main className="mx-auto max-w-lg px-5 py-20">
        <h1 className="font-display text-2xl font-extrabold">Not found</h1>
        {/* The configuration case is worth stating — a maintainer staring at a
            404 on their own deployment should not have to read the source to
            discover ADMIN_EMAILS exists. */}
        {admin.status === 503 && (
          <p className="mt-3 text-[14px] opacity-65">{admin.message}</p>
        )}
      </main>
    );
  }

  /* Whether the upload box appears at all.
   *
   * A super admin always may — they write the shared curriculum. An institute
   * may only if its licence includes authoring, which is a commercial line
   * rather than a technical one (orgs.can_author). Resolved here rather than
   * in the browser so the answer arrives with the page: the API enforces the
   * same rule, and offering a control that is going to be refused is worse
   * than not offering it. */
  const mayAuthor =
    admin.visibility.superAdmin ||
    (await Promise.all(admin.visibility.adminOf.map((org) => canAuthor(org)))).some(
      Boolean,
    );

  return (
    <ContentConsole
      reviewer={admin.email}
      superAdmin={admin.visibility.superAdmin}
      orgIds={admin.visibility.adminOf}
      canAuthor={mayAuthor}
    />
  );
}
