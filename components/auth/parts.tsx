"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acc, acc2, text } from "@/lib/theme";

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function AuthHeading({
  title,
  sub,
}: {
  title: string;
  sub: string;
}) {
  return (
    <div>
      <h1
        className="font-display text-[2.1rem] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[2.5rem]"
        style={{ color: text() }}
      >
        {title}
      </h1>
      <p className="mt-3 text-[15px] leading-[1.6]" style={{ color: text(0.6) }}>
        {sub}
      </p>
    </div>
  );
}

export function EmailDivider() {
  return (
    <div className="my-7 flex items-center gap-4">
      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      <span
        className="text-[11px] font-bold uppercase tracking-[0.16em]"
        style={{ color: text(0.42) }}
      >
        Or with email
      </span>
      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
    </div>
  );
}

export function Field({
  id,
  label,
  className,
  ...props
}: React.ComponentProps<"input"> & { id: string; label: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="mt-2" {...props} />
    </div>
  );
}

export function PasswordField({
  id = "password",
  label = "Password",
  hint,
  ...props
}: React.ComponentProps<"input"> & {
  id?: string;
  label?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          className="pr-12"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center transition-colors"
          style={{ color: text(0.5) }}
        >
          {visible ? (
            <EyeOff className="h-[17px] w-[17px]" />
          ) : (
            <Eye className="h-[17px] w-[17px]" />
          )}
        </button>
      </div>
      {hint && (
        <p className="mt-2 text-[12.5px]" style={{ color: text(0.45) }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-5 rounded-2xl px-4 py-3 text-[13.5px] font-medium leading-relaxed"
      style={{
        background: acc2(0.12),
        border: `1px solid ${acc2(0.3)}`,
        color: text(0.9),
      }}
    >
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="mt-5 rounded-2xl px-4 py-3 text-[13.5px] font-medium leading-relaxed"
      style={{
        background: acc(0.12),
        border: `1px solid ${acc(0.3)}`,
        color: text(0.9),
      }}
    >
      {message}
    </p>
  );
}

export function AuthFootLink({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <p className="mt-7 text-center text-[14.5px]" style={{ color: text(0.55) }}>
      {prompt}{" "}
      <a
        href={href}
        className="font-semibold transition-opacity hover:opacity-80"
        style={{ color: acc() }}
      >
        {label}
      </a>
    </p>
  );
}
