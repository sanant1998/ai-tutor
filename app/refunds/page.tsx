import { LegalPage } from "@/components/legal/LegalPage";
import { REFUNDS } from "@/lib/legal";

/* Razorpay asks for a published refund policy during onboarding, so this page
   is a launch blocker for payments as much as it is a promise to a parent. */

export const metadata = {
  title: "Cancellation & Refunds · PaperPath",
  description:
    "Cancel any time. Full refund within seven days of a charge. The first chapter is free so nobody has to buy the product to test it.",
};

export default function RefundsPage() {
  return <LegalPage title="Cancellation & Refunds" sections={REFUNDS} />;
}
