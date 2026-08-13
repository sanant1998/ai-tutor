"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  Link2,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Sparkles,
  School,
  Shield,
  Target,
  Users,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StudyTools } from "@/components/app/StudyTools";
import { Tour, type TourStep } from "@/components/app/Tour";
import { BRAND } from "@/lib/brand";
import { APP_NAV, type NavItem } from "@/lib/nav";
import { boardName } from "@/lib/study";
import { useAppData } from "@/lib/useAppData";
import { SUBJECTS } from "@/lib/onboarding";
import { acc, text } from "@/lib/theme";

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  home: Home,
  calendar: Calendar,
  graduation: GraduationCap,
  trending: TrendingUp,
  zap: Zap,
  file: FileText,
  book: BookOpen,
  link: Link2,
  help: HelpCircle,
  message: MessageSquare,
  sparkles: Sparkles,
  target: Target,
  shield: Shield,
  users: Users,
  school: School,
  settings: Settings,
};

const TOUR_STEPS: TourStep[] = [
  {
    target: "countdown",
    title: "Your exam countdown",
    body: "This always shows your nearest exam and how many days you have left. It updates in real time. When it turns red — no more rest days.",
  },
  {
    target: "plan",
    title: "Your daily plan",
    body: "We've built your entire revision schedule. Every session tells you what to study, why, and for how long. You never have to decide — just click Begin.",
  },
  {
    target: "begin",
    title: "One click starts everything",
    body: "Click Begin and we handle the rest. Notes load automatically. Questions follow. Timer starts. You just focus.",
  },
  {
    target: "roadmap",
    title: "Your full revision path",
    body: "The Roadmap shows every topic from today to your exam — in the order you should study them, with science-backed timing. Topics unlock as you complete them.",
  },
  {
    target: "tools",
    title: "All your study tools",
    body: "Tap this button to reveal your tools: Pomodoro timer, Break Arcade, AI tutor, focus music, and reading options. Finish a 25-minute focus block and the Break Arcade unlocks as your reward.",
  },
  {
    target: "notes",
    title: "AI notes for every topic",
    body: "Click any topic in Notes to generate detailed revision notes instantly. Definitions, worked examples, examiner tips — scoped exactly to your board's syllabus. If you ever spot a mistake, tell us via Feedback.",
  },
  {
    target: "mocks",
    title: "Full mock papers, AI-marked",
    body: "Generate timed mock papers built to your board's spec. Sit them under exam conditions — our AI marks every answer with examiner-style feedback.",
  },
  {
    target: "questions",
    title: "Topic wise practice questions",
    body: "Drill any topic with exam-style questions. Get a mark, a model answer, and a breakdown of exactly why you lost marks.",
  },
  {
    target: "feedback",
    title: "Tell us what's broken",
    body: "Bug, idea, feature request? Drop it in Feedback — it goes straight to the team and we reply in-app.",
  },
  {
    target: undefined,
    title: "You're ready.",
    body: "Your revision path is built. Your plan is waiting. Let's get to work.",
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { state } = useAppData();

  const profile = {
    name: state.name || "Student",
    board: boardName(state),
    subjects: SUBJECTS.filter((subject) => state.subjectIds.includes(subject.id))
      .map((subject) => subject.name)
      .join(", "),
  };

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Toggle navigation"
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl lg:hidden"
        style={{ background: text(0.08), color: text(0.8) }}
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: text(0.03),
          borderRight: `1px solid ${text(0.08)}`,
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="px-6 pb-4 pt-6">
          <Link
            href="/dashboard"
            className="font-display text-[1.35rem] font-extrabold tracking-[-0.02em]"
            style={{ color: text() }}
          >
            {BRAND.wordmark.lead}
            <span style={{ color: acc() }}>{BRAND.wordmark.accent}</span>
          </Link>
          <p
            className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: text(0.4) }}
          >
            Study smarter ✦
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" data-lenis-prevent>
          <ul className="space-y-0.5">
            {APP_NAV.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-tour={item.tourId}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] transition-colors"
                    style={{
                      background: active ? text(0.07) : "transparent",
                      color: active ? text() : text(0.62),
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className="px-5 py-5"
          style={{ borderTop: `1px solid ${text(0.08)}` }}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
              style={{ background: acc(0.2), color: acc() }}
            >
              {(profile.name[0] ?? "S").toUpperCase()}
            </span>
            <div className="min-w-0">
              <p
                className="truncate text-[14px] font-bold"
                style={{ color: text() }}
              >
                {profile.name}
              </p>
              <p
                className="truncate font-mono text-[10px] uppercase tracking-[0.12em]"
                style={{ color: text(0.4) }}
              >
                {profile.board}
              </p>
            </div>
          </div>

          {profile.subjects && (
            <p className="mt-2 truncate text-[12px]" style={{ color: text(0.45) }}>
              {profile.subjects}
            </p>
          )}

          <Link
            href="/"
            className="mt-4 flex items-center gap-2 text-[13.5px] font-medium transition-colors"
            style={{ color: text(0.55) }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: "rgb(0 0 0 / 0.5)" }}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="min-w-0 flex-1 px-5 pb-24 pt-20 sm:px-8 lg:pt-10">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>

      <StudyTools />
      <Tour steps={TOUR_STEPS} />
    </div>
  );
}
