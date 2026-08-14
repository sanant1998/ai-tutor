"use client";

/* Who is signed in, and how to stop being signed in.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS AT ALL
 *
 * The consoles do not use the app shell — they are their own screens, on their
 * own light surface — and the sidebar is where the student app's sign-out
 * lives. So an admin who opened /admin could reach every console and had no way
 * to end the session except clearing cookies. On a shared office machine that
 * is the whole of account security, and it is exactly the argument
 * components/app/SignOutButton.tsx makes for itself.
 *
 * It used to carry a "Back to the app" link as well. The module rail is the way
 * around the admin area now, and a link out of it sat at the top of every
 * console competing with the thing the console was for.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT USE text() OR acc()
 *
 * Every other component in this codebase takes its colours from the theme
 * tokens. This one cannot: the consoles are pinned light (see .admin-light in
 * globals.css) while the tokens follow whichever of the nine themes the person
 * has chosen, so an admin on Midnight would get near-white text on the light
 * surface — invisible, which is the bug that put the whole admin area on a
 * light ground in the first place.
 *
 * So the colours here are literal. It is the one place in the app where that
 * is the correct choice rather than a shortcut. */

import { useState } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/repository";

export function AdminBar({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);

    try {
      await signOut();
    } finally {
      /* A full document load, not a router push: Server Components cache per
         request, and a client transition can paint a signed-in shell from that
         cache after the cookie is gone. Same reasoning as the student's
         sign-out, and the same reason it navigates even when revoking failed —
         the local cache is cleared either way and the middleware will bounce
         them at the next guarded page. */
      window.location.assign("/");
    }
  }

  /* A bar, not a centred row.
   *
   * It used to centre itself on `max-w-5xl` while every console centres on its
   * own width — so "Back to the app" and the sign-out sat at two positions that
   * matched neither each other nor the page title underneath them. The padding
   * here is the same as the content column's in app/admin/layout.tsx, which is
   * what actually makes them line up: one gutter, declared twice, rather than
   * two different centrings fighting. */
  return (
    <div className="flex items-center justify-end gap-4 border-b border-[#e9eaee] bg-white px-5 py-3 text-[13px] sm:px-8">
      <span className="flex items-center gap-3">
        <span className="hidden text-[13px] text-[#4b5565] sm:inline">{email}</span>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfe2e7] bg-white px-3 py-1.5 font-semibold text-[#14171c] transition-colors hover:bg-[#f5f6f8] disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </span>
    </div>
  );
}
