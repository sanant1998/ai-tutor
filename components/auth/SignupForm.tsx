"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AuthFootLink,
  AuthHeading,
  EmailDivider,
  Field,
  FormError,
  FormNotice,
  GoogleIcon,
  PasswordField,
} from "@/components/auth/parts";
import { claimLocalFor } from "@/lib/repository";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { text } from "@/lib/theme";

const NOT_CONFIGURED =
  "Sign-up is not connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.";

export function SignupForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  const signUpWithEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured) {
      setError(NOT_CONFIGURED);
      return;
    }

    setPending("email");
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setPending(null);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    /* A brand-new account never inherits the cache sitting on this device.
       See claimLocalFor in lib/repository.ts. */
    await claimLocalFor(data.user?.id ?? null);

    /* With email confirmation switched on, Supabase returns a user but no
       session — the account is not usable until the link is clicked. */
    if (data.session) {
      /* The age gate decides where this account goes next. */
      router.push("/parent-consent");
      router.refresh();
      return;
    }

    setNotice("Check your inbox to confirm your email, then sign in.");
  };

  const signUpWithGoogle = async () => {
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured) {
      setError(NOT_CONFIGURED);
      return;
    }

    setPending("google");
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (oauthError) {
      setPending(null);
      setError(oauthError.message);
    }
  };

  return (
    <div>
      <AuthHeading
        title="Your first roadmap is a minute away"
        sub="Pick your board and exam date. We will work out tonight."
      />

      <Button
        type="button"
        variant="glass"
        size="lg"
        className="mt-8 w-full"
        onClick={signUpWithGoogle}
        disabled={pending !== null}
      >
        <GoogleIcon className="h-[18px] w-[18px]" />
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </Button>

      <EmailDivider />

      <form onSubmit={signUpWithEmail} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field
            id="first-name"
            label="First name"
            autoComplete="given-name"
            placeholder="Alex"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <Field
            id="last-name"
            label="Last name"
            autoComplete="family-name"
            placeholder="Patel"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

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
          autoComplete="new-password"
          placeholder="••••••••"
          required
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button type="submit" size="lg" className="w-full" disabled={pending !== null}>
          {pending === "email" ? "Creating account…" : "Create free account"}
          <ArrowRight className="h-[18px] w-[18px]" />
        </Button>
      </form>

      <FormError message={error} />
      <FormNotice message={notice} />

      <AuthFootLink
        prompt="Already have an account?"
        href="/login"
        label="Sign in"
      />

      <p className="mt-3 text-center text-[12.5px]" style={{ color: text(0.4) }}>
        No card needed. Upgrade only if it earns it.
      </p>
    </div>
  );
}
