/* The page the service worker serves when a navigation cannot reach the
   network. Static, so it is cacheable — a dynamic offline page is a page that
   cannot be shown offline. */

export const metadata = {
  title: "Offline · PaperPath",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
        No internet connection
      </h1>

      <p className="mt-3 text-[15px] leading-relaxed opacity-75">
        This page will open as soon as the connection is back. Everything you
        have studied is safe — nothing has been lost.
      </p>

      <p className="mt-6 text-[14px] opacity-55">
        The tutor needs the internet, but your fix sheet and older notes will be
        right where you left them once you are back online.
      </p>
    </main>
  );
}
