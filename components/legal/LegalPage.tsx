/* One renderer for all three legal pages.
 *
 * A server component: these are static documents, nothing here is interactive,
 * and shipping React state to a browser to display prose would be waste. It
 * also means the "not configured" banner is decided on the server, so a
 * deployment missing its company details cannot briefly look complete.
 *
 * Plain semantic HTML, generous line length, real headings. These pages are
 * read under duress — by a parent deciding whether to trust the app, or by
 * someone about to complain — and both of those readers are scanning for one
 * paragraph. */

import Link from "next/link";

import { companyConfigured, COMPANY, POLICY_VERSION, type Section } from "@/lib/legal";

export function LegalPage({
  title,
  intro,
  sections,
  updated = POLICY_VERSION,
}: {
  title: string;
  intro?: string;
  sections: Section[];
  updated?: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <nav className="mb-8">
        <Link href="/" className="text-[14px] underline opacity-60">
          ← PaperPath
        </Link>
      </nav>

      <h1 className="font-display text-[2rem] font-extrabold tracking-[-0.035em]">
        {title}
      </h1>

      <p className="mt-2 text-[13px] opacity-55">
        Version {updated}
      </p>

      {/* Loud, and on the page rather than in a comment. A policy that names no
          controller is not a policy, and this is the kind of gap that survives
          to launch precisely because nothing breaks. */}
      {!companyConfigured() && (
        <p className="mt-6 rounded-xl bg-amber-500/10 px-4 py-3 text-[14px] text-amber-800 dark:text-amber-300">
          <strong>Not ready to publish.</strong> Set{" "}
          <code>NEXT_PUBLIC_LEGAL_NAME</code>, <code>NEXT_PUBLIC_LEGAL_ADDRESS</code>{" "}
          and <code>NEXT_PUBLIC_SUPPORT_EMAIL</code>, and have a lawyer read this
          before it goes live.
        </p>
      )}

      {intro && (
        <p className="mt-6 text-[16px] leading-relaxed opacity-80">{intro}</p>
      )}

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-[19px] font-extrabold tracking-[-0.02em]">
              {section.heading}
            </h2>

            <div className="mt-3 space-y-3">
              {section.body.map((paragraph, index) => (
                <p key={index} className="text-[15px] leading-relaxed opacity-80">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-black/10 pt-6 text-[13px] opacity-55 dark:border-white/10">
        <div className="flex flex-wrap gap-4">
          <Link href="/privacy-policy" className="underline">
            Privacy
          </Link>
          <Link href="/terms" className="underline">
            Terms
          </Link>
          <Link href="/refunds" className="underline">
            Refunds
          </Link>
        </div>

        {COMPANY.legalName && (
          <p className="mt-3">
            {COMPANY.legalName}
            {COMPANY.gstin ? ` · GSTIN ${COMPANY.gstin}` : ""}
          </p>
        )}
      </footer>
    </main>
  );
}
