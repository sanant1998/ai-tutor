"use client";

/* Signing out, properly.
 *
 * This was a <Link href="/">. It navigated to the landing page and did nothing
 * else: the Supabase cookie stayed valid, the local cache stayed on the
 * device, and one tap on any in-app link put the previous student back inside
 * their own account. On the shared family phone this product is built for,
 * that is the whole of account security.
 *
 * So it is a button, not a link — it performs an action rather than going
 * somewhere — and it does not navigate until the session is actually gone.
 *
 * The navigation is a full document load rather than a router push. Server
 * Components cache per-request, and a client-side transition can paint a
 * signed-in shell from that cache after the cookie has been revoked. A real
 * load is the only way to be sure nothing signed-in survives the click. */

import { useState } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/repository";
import { text } from "@/lib/theme";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);

    try {
      await signOut();
    } finally {
      /* Even if revoking failed — offline, provider down — the local cache has
         been cleared and leaving is still the right end state. The middleware
         will bounce them to /login on the next guarded page. */
      window.location.assign("/");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="mt-4 flex items-center gap-2 text-[13.5px] font-medium transition-colors disabled:opacity-60"
      style={{ color: text(0.55) }}
    >
      <LogOut className="h-4 w-4" />
      {busy ? "Sign out ho raha hai…" : "Sign out"}
    </button>
  );
}
