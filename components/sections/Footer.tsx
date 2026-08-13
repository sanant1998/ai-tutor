"use client";

import Link from "next/link";

import { scrollToSection } from "@/components/SmoothScroll";
import { FOOTER } from "@/lib/content";
import { text } from "@/lib/theme";

export function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p
              className="font-display text-[1.4rem] font-extrabold tracking-[-0.02em]"
              style={{ color: text() }}
            >
              {FOOTER.brand}
            </p>
            <p
              className="mt-3 max-w-xs text-[14.5px] leading-[1.6]"
              style={{ color: text(0.55) }}
            >
              {FOOTER.tagline}
            </p>
          </div>

          {FOOTER.columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: text(0.4) }}
              >
                {column.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.target}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(link.target)}
                      className="text-[14.5px] font-medium transition-colors hover:text-[var(--acc)]"
                      style={{ color: text(0.68) }}
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--line)" }}
        >
          <p className="text-[13px]" style={{ color: text(0.45) }}>
            {FOOTER.copyright}
          </p>

          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER.legal.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] font-medium transition-colors hover:text-[var(--acc)]"
                style={{ color: text(0.55) }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
