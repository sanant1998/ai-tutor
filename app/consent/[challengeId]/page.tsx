import { ConsentForm } from "@/components/consent/ConsentForm";

/* The page a parent opens from the link in their WhatsApp message.
 *
 * Outside the (dashboard) group and outside the auth guard on purpose: the
 * parent has no account here and is not going to make one to tick four boxes.
 * The challenge id in the path is the credential, and it is single-use, five
 * minutes old and was delivered to a phone number the student typed. */

export const metadata = {
  title: "Parent ki anumati · PaperPath",
  /* This URL is a credential. It must not reach a search index, and it must
     not be sent as a referrer to anything the page links to. */
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ challengeId: string }>;
}) {
  const { challengeId } = await params;
  return <ConsentForm challengeId={challengeId} />;
}
