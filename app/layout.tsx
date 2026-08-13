import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Caveat,
  DM_Sans,
  Lexend,
  Patrick_Hand,
} from "next/font/google";

import "./globals.css";
import { ThemeScript } from "@/components/ThemeScript";
import { FAQS } from "@/lib/content";
import { ServiceWorker } from "@/components/ServiceWorker";

/* Both families are loaded as variable fonts including their optical-size
   axis, matching the original build. Pinning static weights instead makes
   the display face measurably wider and rewraps the hero headline. */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-body",
  display: "swap",
});

const patrick = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-patrick",
  display: "swap",
});

/* The marker-pen voice: headline accent and the margin notes. */
const hand = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-hand",
  display: "swap",
});

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-lexend",
  display: "swap",
});

const SITE_URL = "https://paperpath.com";
const TITLE = "PaperPath: Revision for Edexcel, Cambridge and CBSE";
const DESCRIPTION =
  "A revision roadmap built around your exam date, mock papers marked in about 30 seconds against your board's mark scheme, and an AI tutor on call. Edexcel, Cambridge and CBSE.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
  },
  /* The Search Console token below was issued for the previous domain and
     will not verify a new one. Replace it when the domain is set up. */
  verification: {
    google: "drlRi93ku8OY-wwIbQ_5yZCzFJOVCqdAz4v-WKpMeBA",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1024,
        height: 1024,
        alt: TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
  other: {
    verification: "24597528",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  /* Matches the Notebook theme, which is what a first-time visitor sees. */
  themeColor: "#fbf7f1",
};

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PaperPath",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description:
    "AI-powered exam revision platform that builds personalised study roadmaps, instantly marks mock papers and topic questions, and generates exam-grade notes for Edexcel (IGCSE and International A Level), Cambridge (IGCSE and A Level), CBSE (Grades 10-12), NEET and JEE students.",
  /* sameAs intentionally omitted: the old social profiles belong to the
     previous brand. Add the new handles here once they exist. */
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "PaperPath",
  url: SITE_URL,
  description:
    "Score higher in A-Levels with a personalised AI revision roadmap, instant-marked mock papers, and AI-marked topic notes for Edexcel IAL & Cambridge.",
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${patrick.variable} ${hand.variable} ${lexend.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      </head>
      <body>
        {children}
        {/* Registers public/sw.js after load, and unregisters in development
            where a stale worker serving yesterday's chunks is a confusing
            failure that survives a hard refresh. */}
        <ServiceWorker />
      </body>
    </html>
  );
}
