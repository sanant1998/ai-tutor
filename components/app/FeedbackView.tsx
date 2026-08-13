"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Plus, Send } from "lucide-react";

import { Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  appendTicketMessage,
  createTicket,
  loadTickets,
  type Ticket,
} from "@/lib/repository";
import { acc, onacc, text } from "@/lib/theme";

const KINDS = ["Bug", "Missing feature", "Idea", "Wrong content"] as const;
type Kind = (typeof KINDS)[number];

export function FeedbackView() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [kind, setKind] = useState<Kind>("Bug");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");

  useEffect(() => {
    setMounted(true);
    void loadTickets().then(setTickets);
  }, []);

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !body.trim()) return;

    const kindValue = kind;
    const subjectValue = subject.trim();
    const bodyValue = body.trim();

    setComposing(false);
    setSubject("");
    setBody("");

    /* The id comes back from the insert, so selection waits for the write. */
    void createTicket(kindValue, subjectValue, bodyValue).then((ticket) => {
      setTickets((current) => [ticket, ...current]);
      setSelected(ticket.id);
    });
  };

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;

    const bodyValue = reply.trim();
    const at = new Date().toISOString();
    setReply("");

    /* Paint the message straight away; the write settles behind it. */
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === selected
          ? {
              ...ticket,
              messages: [...ticket.messages, { from: "you", body: bodyValue, at }],
            }
          : ticket,
      ),
    );

    void appendTicketMessage(selected, bodyValue);
  };

  const open = tickets.find((ticket) => ticket.id === selected);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="font-display flex items-center gap-3 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[2.3rem]"
            style={{ color: text() }}
          >
            <MessageSquare className="h-7 w-7" style={{ color: acc() }} />
            Send Feedback
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: text(0.6) }}>
            Found a bug, missing feature, or have an idea? Let us know — we read
            every message.
          </p>
        </div>

        <Button
          onClick={() => {
            setComposing(true);
            setSelected(null);
          }}
        >
          <Plus className="h-[18px] w-[18px]" />
          New
        </Button>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[300px_1fr]">
        <div>
          {!mounted || tickets.length === 0 ? (
            <p className="text-[14.5px]" style={{ color: text(0.55) }}>
              No tickets yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {tickets.map((ticket) => {
                const active = ticket.id === selected;
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(ticket.id);
                        setComposing(false);
                      }}
                      className="w-full rounded-xl px-4 py-3 text-left transition-colors"
                      style={{
                        background: active ? acc(0.12) : text(0.03),
                        border: `1px solid ${active ? acc(0.35) : text(0.07)}`,
                      }}
                    >
                      <p
                        className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: acc() }}
                      >
                        {ticket.kind}
                      </p>
                      <p
                        className="mt-1.5 truncate text-[14px] font-bold"
                        style={{ color: text() }}
                      >
                        {ticket.subject}
                      </p>
                      <p className="mt-1 text-[12px]" style={{ color: text(0.45) }}>
                        {ticket.messages.length} message
                        {ticket.messages.length === 1 ? "" : "s"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Panel className="p-5 sm:p-6">
          {composing ? (
            <form onSubmit={create}>
              <p
                className="font-display text-[1.15rem] font-extrabold tracking-[-0.015em]"
                style={{ color: text() }}
              >
                New ticket
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {KINDS.map((option) => {
                  const active = kind === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setKind(option)}
                      className="rounded-lg px-3.5 py-2 text-[13px] font-bold transition-colors"
                      style={{
                        background: active ? acc() : text(0.06),
                        color: active ? onacc() : text(0.65),
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <Input
                className="mt-4"
                placeholder="One-line summary"
                required
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />

              <textarea
                rows={7}
                required
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What happened, and what did you expect instead?"
                className="mt-3 w-full rounded-xl p-4 text-[15px] outline-none"
                style={{
                  background: text(0.04),
                  border: `1px solid ${text(0.12)}`,
                  color: text(0.9),
                }}
              />

              <div className="mt-4 flex items-center gap-3">
                <Button type="submit">
                  <Send className="h-[18px] w-[18px]" />
                  Send
                </Button>
                <Button
                  type="button"
                  variant="glass"
                  onClick={() => setComposing(false)}
                >
                  Cancel
                </Button>
              </div>

              <p className="mt-4 text-[12.5px]" style={{ color: text(0.45) }}>
                Signed in, this goes to your tickets table. Signed out, it stays
                on this device.
              </p>
            </form>
          ) : open ? (
            <div>
              <p
                className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]"
                style={{ color: acc() }}
              >
                {open.kind}
              </p>
              <p
                className="font-display mt-2 text-[1.2rem] font-extrabold tracking-[-0.015em]"
                style={{ color: text() }}
              >
                {open.subject}
              </p>

              <ul className="mt-5 space-y-3">
                {open.messages.map((message, index) => (
                  <li
                    key={index}
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: message.from === "you" ? acc(0.1) : text(0.04),
                      border: `1px solid ${message.from === "you" ? acc(0.25) : text(0.08)}`,
                    }}
                  >
                    <p
                      className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: text(0.45) }}
                    >
                      {message.from === "you" ? "You" : "Team"}
                    </p>
                    <p
                      className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.6]"
                      style={{ color: text(0.85) }}
                    >
                      {message.body}
                    </p>
                  </li>
                ))}
              </ul>

              <form onSubmit={send} className="mt-5 flex gap-2">
                <Input
                  placeholder="Add to this ticket…"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
                <Button type="submit" size="icon" aria-label="Send reply">
                  <Send className="h-4 w-4" />
                </Button>
              </form>

              <p className="mt-3 text-[12.5px]" style={{ color: text(0.45) }}>
                Replies from the team land here — there is no inbox tooling yet,
                so expect a slow answer rather than none.
              </p>
            </div>
          ) : (
            <p
              className="py-10 text-center text-[14.5px]"
              style={{ color: text(0.55) }}
            >
              Select a ticket to view conversation.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
