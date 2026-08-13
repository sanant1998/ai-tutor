import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create your account | PaperPath",
  description:
    "Build a personalised revision roadmap for Edexcel, Cambridge or CBSE in under a minute.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthShell
      quote={{
        text: "Build the revision engine your future self will thank you for.",
        attribution: "PaperPath",
      }}
      proof={[
        { value: "Free", label: "no card needed" },
        { value: "1 min", label: "to your first plan" },
        { value: "3-day", label: "Pro trial" },
      ]}
    >
      <SignupForm />
    </AuthShell>
  );
}
