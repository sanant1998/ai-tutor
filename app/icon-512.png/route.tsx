import { ImageResponse } from "next/og";

/* The maskable home-screen icon, rendered to a real PNG at request time and
 * cached indefinitely.
 *
 * A route handler rather than Next's `app/icon.tsx` convention: `app/icon.svg`
 * already occupies that slot, and the convention would have produced a URL
 * shaped by the framework rather than the one the manifest asks for. Here the
 * path is exactly `/icon-512.png`, which is what public/README.md has been
 * asking someone to create since before this feature existed.
 *
 * It is not a brand asset and should be replaced by one. It is a great deal
 * better than a manifest pointing at a file that does not exist, which on
 * Android means the launcher draws the SVG inside a white circle.
 *
 * 512 because Android downsamples and never upsamples. The padding is the
 * important part: a maskable icon is cropped to whatever shape the launcher
 * uses — circle, squircle, teardrop — and a mark drawn to the edges loses its
 * corners on most devices. */

export const runtime = "edge";

const SIZE = 512;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          /* The Notebook theme's paper, so the icon sits on the same ground
             the app opens on rather than flashing white against it. */
          background: "#f7f4ed",
        }}
      >
        <div
          style={{
            width: 340,
            height: 340,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 76,
            background: "#1a1a1a",
            color: "#f7f4ed",
            fontSize: 210,
            fontWeight: 800,
            letterSpacing: -10,
          }}
        >
          P
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      headers: {
        /* Immutable: the icon changes only when this file does, and a
           home-screen icon re-fetched on every launch is bytes spent on a
           connection this audience has least of. */
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
