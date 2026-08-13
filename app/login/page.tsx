import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in | PaperPath",
  description:
    "Sign in to your revision roadmap, marked mocks and AI tutor.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell
      quote={{
        text: "Your comeback starts where your last session ended.",
        attribution: "PaperPath",
      }}
      proof={[
        { value: "~30s", label: "to mark a full mock" },
        { value: "3", label: "exam boards" },
        { value: "24/7", label: "AI tutor" },
      ]}
    >
      {/* LoginForm reads ?next, which needs a boundary for prerendering. */}
      <Suspense fallback={<div className="h-[420px]" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
