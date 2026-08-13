import { cn } from "@/lib/utils";
import { acc, text } from "@/lib/theme";

/* The app's standard surface. Flatter than the marketing glass — this is a
   working tool, not a shop window. */
export function Panel({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl", className)}
      style={{ background: text(0.035), border: `1px solid ${text(0.08)}` }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* The small monospace kicker used above nearly every block in the app. */
export function Kicker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] font-bold uppercase tracking-[0.16em]",
        className,
      )}
      style={{ color: text(0.45) }}
    >
      {children}
    </p>
  );
}

export function PageHeader({
  kicker,
  title,
  sub,
  actions,
}: {
  kicker: string;
  title: React.ReactNode;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Kicker>{kicker}</Kicker>
        <h1
          className="font-display mt-3 text-[2rem] font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-[2.6rem]"
          style={{ color: text() }}
        >
          {title}
        </h1>
        {sub && (
          <p className="mt-3 max-w-2xl text-[15px]" style={{ color: text(0.6) }}>
            {sub}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel className="p-8 text-center">
      <p
        className="font-display text-[1.1rem] font-extrabold tracking-[-0.01em]"
        style={{ color: text() }}
      >
        {title}
      </p>
      <p
        className="mx-auto mt-2 max-w-sm text-[14px] leading-[1.6]"
        style={{ color: text(0.55) }}
      >
        {body}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </Panel>
  );
}

export function StatRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[14px]" style={{ color: text(0.6) }}>
        {label}
      </span>
      <span
        className="font-mono text-[13px] font-bold"
        style={{ color: text(0.9) }}
      >
        {value}
      </span>
    </div>
  );
}

/* Thin progress bar used across the app. */
export function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full", className)}
      style={{ background: text(0.1) }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: acc() }}
      />
    </div>
  );
}
