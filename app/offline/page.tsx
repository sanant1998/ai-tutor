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
        Internet nahi hai
      </h1>

      <p className="mt-3 text-[15px] leading-relaxed opacity-75">
        Connection wapas aate hi ye page khul jaayega. Jo padha hai wo saara
        safe hai — kuch gaya nahi.
      </p>

      <p className="mt-6 text-[14px] opacity-55">
        Tutor ko internet chahiye, par tumhara fix sheet aur purane notes wapas
        aate hi wahin milenge.
      </p>
    </main>
  );
}
