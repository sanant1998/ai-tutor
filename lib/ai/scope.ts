/* Turns the ids a client sends into the names a prompt needs.

   The client never sends prose. It sends a board id, class, subject id and
   chapter id, and this module looks each one up in the sourced syllabus.
   Anything not in it is rejected, so a crafted request cannot smuggle
   instructions into the prompt — and a stale bookmark fails loudly instead of
   generating questions for a chapter that is not on the student's syllabus. */

import { EXAM_BOARDS, SUBJECTS, unitsFor } from "@/lib/onboarding";
import { CLASSES, type ClassLevel } from "@/lib/syllabus";

export type Scope = {
  board: string;
  boardLevel: string;
  classLevel: ClassLevel;
  subject: string;
  unitCode: string;
  unitName: string;
  topic: string;
  topicId: string;
};

export type ScopeRequest = {
  boardId?: unknown;
  classLevel?: unknown;
  subjectId?: unknown;
  /* Named `unitId` and meaning CHAPTER.
   *
   * The original model was Edexcel's — board, subject, unit — and the move to
   * the Indian model made the unit of study a textbook chapter. The lookup
   * below already resolves this against `chapters`; only the name is left
   * over, and it is left over because it is in the request bodies the existing
   * client sends.
   *
   * Renaming it is a client-and-server change in one commit. Worth doing;
   * until then this comment is here so nobody concludes there are two
   * competing syllabus models. There is one. */
  unitId?: unknown;
  topicId?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

/* Resolves a full chapter scope. `requireTopic` is kept for callers that work
   at subject level rather than naming one chapter. */
export function resolveScope(
  request: ScopeRequest,
  { requireTopic = true }: { requireTopic?: boolean } = {},
): Scope | null {
  const board = EXAM_BOARDS.find((entry) => entry.id === asString(request.boardId));
  const subject = SUBJECTS.find((entry) => entry.id === asString(request.subjectId));
  if (!board || !subject || board.comingSoon) return null;

  const level = Number(request.classLevel);
  if (!CLASSES.includes(level as ClassLevel)) return null;
  const classLevel = level as ClassLevel;

  /* The subject has to be taught in that class, and the chapter has to be one
     the sourced syllabus actually lists for that board and class. */
  if (!subject.classes.includes(classLevel)) return null;

  const chapters = unitsFor(board.id, classLevel, subject.id);
  if (chapters.length === 0) return null;

  const chapter = chapters.find((entry) => entry.id === asString(request.unitId));
  if (!chapter) return null;

  /* One chapter is one topic, so a topic id must be exactly this chapter's.
     Checked rather than trusted, because the id arrives from the browser. */
  const topicId = asString(request.topicId);

  if (topicId) {
    if (topicId !== `${subject.id}:${chapter.id}`) return null;
  } else if (requireTopic) {
    return null;
  }

  return {
    board: board.name,
    boardLevel: board.detail,
    classLevel,
    subject: subject.name,
    unitCode: chapter.code,
    unitName: chapter.name,
    topic: topicId ? chapter.name : "",
    topicId,
  };
}

/* One line of context every prompt opens with. */
export function scopeLine(scope: Scope) {
  return `${scope.board} · Class ${scope.classLevel} · ${scope.subject} · ${scope.unitCode} ${scope.unitName}`;
}
