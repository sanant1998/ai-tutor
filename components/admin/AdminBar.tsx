"use client";

/* Getting out of the admin consoles.
 *
 * ---------------------------------------------------------------------------
 * THERE WAS NO WAY OUT
 *
 * The consoles do not use the app shell — they are their own screens, on their
 * own light surface — and the sidebar is where the sign-out lives. So an admin
 * who opened /admin could reach five consoles and nothing else: no way back to
 * the app, and no way to end the session except clearing cookies. On a shared
 * office machine that is the whole of account security, and it is exactly the
 * argument components/app/SignOutButton.tsx makes for itself.
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
import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";

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

  return (
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 pt-5 text-[13px]">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 font-medium text-[#4b5565] transition-colors hover:text-[#14171c]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the app
      </Link>

      <span className="flex items-center gap-3">
        <span className="hidden text-[#6b7280] sm:inline">{email}</span>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 px-2.5 py-1.5 font-medium text-[#14171c] transition-colors hover:bg-black/5 disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" />
          {busy ? "Sign out ho raha hai…" : "Sign out"}
        </button>
      </span>
    </div>
  );
}
