"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Search } from "lucide-react";

import { NotesCanvas } from "@/components/app/NotesCanvas";
import { Kicker, Panel } from "@/components/app/ui";
import { buildRoadmap, chosenSubjects, type Topic } from "@/lib/study";
import { useAppData } from "@/lib/useAppData";
import { acc, text } from "@/lib/theme";

export function NotesView() {
  const { state } = useAppData();
  const [query, setQuery] = useState("");
  const [openSubjects, setOpenSubjects] = useState<string[]>([]);
  const [openUnits, setOpenUnits] = useState<string[]>([]);
  const [selected, setSelected] = useState<Topic | null>(null);

  useEffect(() => {
    /* Open the first subject so the tree never starts fully closed. */
    setOpenSubjects((current) =>
      current.length ? current : state.subjectIds.slice(0, 1),
    );
  }, [state.subjectIds]);

  const roadmap = useMemo(() => buildRoadmap(state), [state]);
  const subjects = chosenSubjects(state);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return roadmap.filter((topic) => topic.name.toLowerCase().includes(needle));
  }, [roadmap, query]);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Panel className="max-h-[calc(100vh-8rem)] overflow-y-auto p-5" data-lenis-prevent>
        <Kicker>Topic picker</Kicker>
        <p className="mt-3 text-[13.5px] leading-[1.55]" style={{ color: text(0.6) }}>
          Choose a subject, unit and topic. The note panel opens into a
          full-width revision canvas.
        </p>

        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: text(0.4) }}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topics…"
            aria-label="Search topics"
            className="h-10 w-full rounded-xl pl-9 pr-3 text-[14px] outline-none"
            style={{
              background: text(0.04),
              border: `1px solid ${text(0.1)}`,
              color: text(0.9),
            }}
          />
        </div>

        <div
          className="mt-4 border-t pt-4"
          style={{ borderColor: text(0.08) }}
        >
          {matches ? (
            <ul className="space-y-1">
              {matches.length === 0 && (
                <li className="text-[13.5px]" style={{ color: text(0.5) }}>
                  Nothing matches “{query}”.
                </li>
              )}
              {matches.map((topic) => (
                <li key={topic.id}>
                  <TopicButton
                    topic={topic}
                    active={selected?.id === topic.id}
                    onSelect={() => {
                      setSelected(topic);
                    }}
                    showUnit
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2">
              {subjects.map((subject) => {
                const subjectOpen = openSubjects.includes(subject.id);
                const units = new Map<string, { code: string; name: string; topics: Topic[] }>();

                for (const topic of roadmap.filter((t) => t.subjectId === subject.id)) {
                  const entry = units.get(topic.unitId) ?? {
                    code: topic.unitCode,
                    name: topic.unitName,
                    topics: [],
                  };
                  entry.topics.push(topic);
                  units.set(topic.unitId, entry);
                }

                return (
                  <li key={subject.id}>
                    <button
                      type="button"
                      aria-expanded={subjectOpen}
                      onClick={() =>
                        setOpenSubjects((list) => toggle(list, subject.id))
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left"
                    >
                      {subjectOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: text(0.45) }} />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: text(0.45) }} />
                      )}
                      <span aria-hidden="true">{subject.glyph}</span>
                      <span
                        className="truncate text-[14.5px] font-bold"
                        style={{ color: text() }}
                      >
                        {subject.name}
                      </span>
                    </button>

                    {subjectOpen && (
                      <ul className="mt-1 space-y-1 pl-5">
                        {[...units.entries()].map(([unitId, unit]) => {
                          const unitKey = `${subject.id}:${unitId}`;
                          const unitOpen = openUnits.includes(unitKey);

                          return (
                            <li key={unitId}>
                              <button
                                type="button"
                                aria-expanded={unitOpen}
                                onClick={() =>
                                  setOpenUnits((list) => toggle(list, unitKey))
                                }
                                className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left"
                              >
                                {unitOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: acc() }} />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: acc() }} />
                                )}
                                <span
                                  className="font-mono text-[11.5px] font-bold"
                                  style={{ color: acc() }}
                                >
                                  {unit.code}
                                </span>
                                <span
                                  className="truncate font-mono text-[11.5px]"
                                  style={{ color: text(0.55) }}
                                >
                                  · {unit.name}
                                </span>
                              </button>

                              {unitOpen && (
                                <ul className="mt-1 space-y-0.5 pl-5">
                                  {unit.topics.map((topic) => (
                                    <li key={topic.id}>
                                      <TopicButton
                                        topic={topic}
                                        active={selected?.id === topic.id}
                                        onSelect={() => {
                                          setSelected(topic);
                                        }}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}

              {subjects.length === 0 && (
                <li className="text-[13.5px]" style={{ color: text(0.5) }}>
                  No subjects yet — finish onboarding first.
                </li>
              )}
            </ul>
          )}
        </div>
      </Panel>

      <div className="min-w-0">
        <Panel className="p-6 sm:p-7">
          <Kicker>Revision notes</Kicker>
          <h1
            className="font-display mt-3 text-[1.9rem] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[2.3rem]"
            style={{ color: text() }}
          >
            Instant exam focused notes in one clean canvas.
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: text(0.6) }}>
            Every topic expands to a full-width workspace for fast review,
            annotation and export.
          </p>
        </Panel>

        {selected ? (
          <NotesCanvas
            key={selected.id}
            topic={selected}
            boardId={state.boardId}
            classLevel={state.classLevel}
          />
        ) : (
          <Panel className="mt-5 flex min-h-[420px] items-center justify-center p-10 text-center">
            <div>
              <BookOpen className="mx-auto h-12 w-12" style={{ color: acc() }} />
              <p
                className="font-display mt-5 text-[1.35rem] font-extrabold tracking-[-0.02em]"
                style={{ color: text() }}
              >
                Pick a topic to begin.
              </p>
              <p className="mt-3 text-[14.5px]" style={{ color: text(0.6) }}>
                Notes are written on demand for the topic you choose.
              </p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function TopicButton({
  topic,
  active,
  onSelect,
  showUnit,
}: {
  topic: Topic;
  active: boolean;
  onSelect: () => void;
  showUnit?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors"
      style={{
        background: active ? acc(0.14) : "transparent",
        color: active ? text() : text(0.65),
        fontWeight: active ? 700 : 400,
      }}
    >
      {topic.name}
      {showUnit && (
        <span className="ml-1.5 font-mono text-[10.5px]" style={{ color: text(0.4) }}>
          {topic.unitCode}
        </span>
      )}
    </button>
  );
}
