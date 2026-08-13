import type { ReactNode } from "react";

import { AdminBar } from "@/components/admin/AdminBar";
import { requireContentAccess } from "@/lib/admin/access";

/* Every admin console, on a light ground, with a way out.
 *
 * The light surface is argued in globals.css next to `.admin-light`: these are
 * internal tools read in an office, the nine student themes were never checked
 * against them, and on a machine set to dark the page's own tokens and
 * Tailwind's OS-driven `dark:` variants disagreed — dark text on a dark ground,
 * and native select menus with unreadable options.
 *
 * The bar is here for a plainer reason. These screens do not use the app shell,
 * and the sign-out lives in the shell's sidebar — so an admin could open the
 * consoles and have no way back to the app and no way to end the session.
 *
 * A layout rather than a component each page remembers to render, so a console
 * added later gets both without anyone thinking about it.
 *
 * The email is read here and passed down: the bar is a client component, and a
 * client component cannot ask who is signed in without another round trip. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireContentAccess();

  return (
    <div className="admin-light">
      {/* Only when there is somebody to sign out. An unauthenticated visitor
          gets redirected by the page itself, and a sign-out button on the way
          past would be furniture. */}
      {admin.ok && <AdminBar email={admin.email} />}
      {children}
    </div>
  );
}
