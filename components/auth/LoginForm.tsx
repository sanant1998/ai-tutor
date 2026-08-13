"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AuthFootLink,
  AuthHeading,
  EmailDivider,
  Field,
  FormError,
  GoogleIcon,
  PasswordField,
} from "@/components/auth/parts";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { text } from "@/lib/theme";

const NOT_CONFIGURED =
  "Sign-in is not connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  /* The middleware puts the page they were headed for in ?next. */
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  const signInWithEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError(NOT_CONFIGURED);
      return;
    }

    setPending("email");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(null);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push(next);
    router.refresh();
  };

  const signInWithGoogle = async () => {
    setError(null);

    if (!isSupabaseConfigured) {
      setError(NOT_CONFIGURED);
      return;
    }

    setPending("google");
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (oauthError) {
      setPending(null);
      setError(oauthError.message);
    }
  };

  return (
    <div>
      <AuthHeading
        title="Pick up where you left off"
        sub="Your roadmap has already worked out what tonight should look like."
      />

      <Button
        type="button"
        variant="glass"
        size="lg"
        className="mt-8 w-full"
        onClick={signInWithGoogle}
        disabled={pending !== null}
      >
        <GoogleIcon className="h-[18px] w-[18px]" />
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </Button>

      <EmailDivider />

      <form onSubmit={signInWithEmail} className="space-y-5">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <PasswordField
          autoComplete="current-password"
          placeholder="••••••••"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button type="submit" size="lg" className="w-full" disabled={pending !== null}>
          {pending === "email" ? "Signing in…" : "Sign in"}
          <ArrowRight className="h-[18px] w-[18px]" />
        </Button>
      </form>

      <FormError message={error} />

      <AuthFootLink
        prompt="New here?"
        href="/signup"
        label="Create a free account"
      />

      <p className="mt-3 text-center text-[12.5px]" style={{ color: text(0.4) }}>
        Free plan needs no card.
      </p>
    </div>
  );
}
