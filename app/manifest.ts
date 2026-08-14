import type { MetadataRoute } from "next";

import { BRAND } from "@/lib/brand";

/* Installable from day one, because of who this is for.
 *
 * The audience is on a mid-range Android with limited storage, and the choice
 * they make is not "app or website" — it is "is this worth the 80 MB". A PWA
 * costs them nothing, gets a home-screen icon, and opens without the browser
 * chrome that makes a web app feel like homework.
 *
 * `display: standalone` matters more than it looks: a student who opens this
 * from a home-screen icon and sees a URL bar has been told, without words,
 * that it is a website they are visiting rather than a thing they own. */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — one-to-one tutoring`,
    short_name: BRAND.name,
    description:
      "One concept, one short session. Understand it, check it, and if you get stuck, try it a different way.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    /* Matches the default Notebook theme's paper background, so the splash and
       the status bar do not flash white against it on launch. */
    background_color: "#f7f4ed",
    theme_color: "#f7f4ed",
    categories: ["education"],
    lang: "en-IN",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      /* Rendered by app/icon-512.png/route.tsx, so the manifest points at a
         URL that resolves. Android downsamples and never upsamples, so one
         512 is enough — and `maskable` is what stops the launcher drawing our
         icon inside a white circle. Replace with a designed asset when there
         is one. */
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Aaj ka plan", url: "/dashboard" },
      { name: "Start studying", url: "/tutor" },
      { name: "Fix sheet", url: "/fix-sheet/tutor" },
    ],
  };
}
