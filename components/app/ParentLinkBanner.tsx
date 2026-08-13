"use client";

/* "Your father has asked to see your progress. Yes / No."
 *
 * On the student's dashboard, because that is where they will see it, and
 * phrased as a question with a real "no" — a banner that only offers agreement
 * is not a confirmation, it is a notification wearing a button.
 *
 * The refusal is genuine: it deletes the link row. A student who says no keeps
 * a parent from receiving the weekly report. That is uncomfortable and it is
 * correct — the alternative is a confirmation step that cannot be failed,
 * which is the same as not having one.
 *
 * It does not affect consent, and it does not affect the parent's statutory
 * right to the data. Those are separate and are not the student's to withhold. */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/theme";

type Pending = { parentId: string; name: string; relation: string };

export function ParentLinkBanner() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let live = true;

    void fetch("/api/parent/link")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (live && payload) setPending(payload.pendingForMe ?? []);
      })
      .catch(() => {
        /* The dashboard works without this. A failed fetch here should show
           nothing rather than an error the student cannot act on. */
      });

    return () => {
      live = false;
    };
  }, []);

  const answer = async (parentId: string, confirm: boolean) => {
    setBusy(parentId);

    try {
      await fetch("/api/parent/link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, confirm }),
      });

      setPending((current) => current.filter((entry) => entry.parentId !== parentId));
    } finally {
      setBusy("");
    }
  };

  if (pending.length === 0) return null;

  return (
    <>
      {pending.map((entry) => (
        <Panel key={entry.parentId} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[15px]" style={{ color: text(0.88) }}>
              {entry.name ? `${entry.name} ne` : "Ek parent account ne"} tumhari
              padhai ka weekly progress dekhne ke liye request bheji hai.
            </p>
            <p className="mt-1 text-[13px]" style={{ color: text(0.55) }}>
              Unhe har hafte ek chhota summary milega — kitni padhai hui, kya
              theek chal raha hai. Tumhari tutor se hui baat-cheet unhe kabhi
              nahi dikhegi.
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              onClick={() => void answer(entry.parentId, true)}
              disabled={busy !== ""}
              className="px-3 py-1.5 text-[13px]"
            >
              {busy === entry.parentId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Haan, theek hai"
              )}
            </Button>

            <Button
              type="button"
              onClick={() => void answer(entry.parentId, false)}
              disabled={busy !== ""}
              className="px-3 py-1.5 text-[13px]"
            >
              Nahi
            </Button>
          </div>
        </Panel>
      ))}
    </>
  );
}
