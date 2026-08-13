/* Content packs fail quietly, which is why this exists.

   A missing distractor map does not throw. It just means the server cannot say
   why an answer was wrong, so it pays a model to guess, and a student gets a
   vaguer diagnosis than the one we could have given for free. A question
   pointing at a deleted concept does not throw either — the tutor simply has
   nothing to teach from and improvises, which is the exact failure the seeded
   curriculum was built to prevent.

   None of that shows up in a test run. It shows up as a slightly worse product
   six weeks later. So the checks run before the content reaches the database,
   and the seed script refuses on an error.

   Errors block the seed. Warnings are gaps worth filling but not worth
   stopping for. */

import type { BankQuestion, ContentFile, Concept } from "./pack.ts";
import { wrongOptionKeys } from "./pack.ts";

export type Issue = {
  severity: "error" | "warn";
  where: string;
  message: string;
};

/* How many questions a concept wants before it can carry a teaching session.
   Below this the CHECK beat starts repeating itself within one sitting. */
const QUESTIONS_PER_CONCEPT = 6;

export function validateFile(file: ContentFile): Issue[] {
  const issues: Issue[] = [];
  const at = (where: string, message: string, severity: Issue["severity"] = "error") =>
    issues.push({ severity, where, message });

  /* --- Header ------------------------------------------------------------ */
  if (!file.provenance?.source || !file.provenance?.verifiedOn) {
    at(
      "provenance",
      "Every pack records where its content came from and when it was checked.",
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(file.provenance?.verifiedOn ?? "")) {
    at("provenance.verifiedOn", "Expected an ISO date, e.g. 2026-08-12.");
  }

  if (!file.topic?.id || !file.chapter?.id || !file.subject?.id) {
    at("header", "subject.id, chapter.id and topic.id are all required.");
    return issues;
  }

  if ((file.topic.prereqTopicIds ?? []).includes(file.topic.id)) {
    at("topic.prereqTopicIds", "A topic cannot be its own prerequisite.");
  }

  /* --- Concepts ---------------------------------------------------------- */
  const conceptById = new Map<string, Concept>();
  const seenSeq = new Set<number>();

  file.concepts.forEach((concept, index) => {
    const where = `concepts[${index}] ${concept.id}`;

    if (!concept.id) at(where, "A concept needs an id.");
    if (conceptById.has(concept.id)) at(where, `Duplicate concept id ${concept.id}.`);
    conceptById.set(concept.id, concept);

    if (seenSeq.has(concept.seq)) at(where, `Two concepts share seq ${concept.seq}.`);
    seenSeq.add(concept.seq);

    if (!concept.statement?.trim()) at(where, "statement is the definition; it cannot be blank.");
    if (!concept.hook?.trim()) {
      at(where, "No hook — the HOOK beat will have to invent an opener.", "warn");
    }

    if (concept.misconceptions.length === 0) {
      at(
        where,
        "No misconceptions. The CHECK beat has nothing specific to probe for, which is most of the value of a pack.",
      );
    }

    const seenMisconception = new Set<string>();
    concept.misconceptions.forEach((misconception, mIndex) => {
      const mWhere = `${where} misconceptions[${mIndex}]`;
      if (seenMisconception.has(misconception.id)) {
        at(mWhere, `Duplicate misconception id ${misconception.id} within this concept.`);
      }
      seenMisconception.add(misconception.id);

      if (!misconception.probe?.trim()) {
        at(mWhere, "No probe — the tutor cannot test for this misconception.", "warn");
      }
      if (!misconception.correction?.trim()) {
        at(mWhere, "No correction — the fix sheet has nothing to print.");
      }
    });

    if (concept.worked_examples.length === 0) {
      at(
        where,
        "No worked examples. The second reteach is meant to show a full solution, and without one the tutor writes its own.",
        "warn",
      );
    }

    concept.worked_examples.forEach((example, eIndex) => {
      if (example.steps.length === 0) {
        at(`${where} worked_examples[${eIndex}]`, "A worked example with no steps is just an answer.");
      }
    });

    checkLatex(concept.statement, `${where}.statement`, at);
    concept.formulas.forEach((formula, fIndex) => {
      if (!formula.latex?.trim()) {
        at(`${where} formulas[${fIndex}]`, "A formula entry needs latex.");
      }
    });
  });

  /* --- Questions --------------------------------------------------------- */
  const seenQuestionId = new Set<string>();
  const perConcept = new Map<string, number>();
  const probedMisconceptions = new Set<string>();

  file.questions.forEach((question, index) => {
    const where = `questions[${index}] ${question.id}`;

    if (!question.id) at(where, "A question needs an id.");
    if (seenQuestionId.has(question.id)) at(where, `Duplicate question id ${question.id}.`);
    seenQuestionId.add(question.id);

    if (!question.stem?.trim()) at(where, "stem cannot be blank.");
    if (!question.solution?.trim()) {
      at(where, "solution cannot be blank — it is what the student is shown after a wrong answer.");
    }

    checkLatex(question.stem, `${where}.stem`, at);

    const concept = question.conceptId ? conceptById.get(question.conceptId) : undefined;

    if (question.conceptId && !concept) {
      at(where, `conceptId ${question.conceptId} is not a concept in this file.`);
    }

    if (concept) {
      perConcept.set(concept.id, (perConcept.get(concept.id) ?? 0) + 1);
    } else if (!question.conceptId) {
      at(where, "No conceptId. Practice can still serve it, but the tutor cannot use it as a check.", "warn");
    }

    checkAnswerShape(question, where, at);
    checkDistractors(question, concept, where, at, probedMisconceptions);
  });

  /* --- Coverage ---------------------------------------------------------- */
  file.concepts.forEach((concept) => {
    const count = perConcept.get(concept.id) ?? 0;

    if (count === 0) {
      at(
        `concepts ${concept.id}`,
        "No questions at all. A concept that cannot be checked cannot be taught.",
      );
    } else if (count < QUESTIONS_PER_CONCEPT) {
      at(
        `concepts ${concept.id}`,
        `${count} question${count === 1 ? "" : "s"}; ${QUESTIONS_PER_CONCEPT} is the floor before checks start repeating.`,
        "warn",
      );
    }

    const levels = new Set(
      file.questions.filter((q) => q.conceptId === concept.id).map((q) => q.level),
    );

    if (count > 0 && !levels.has("L1")) {
      at(
        `concepts ${concept.id}`,
        "No L1 question. After two failed reteaches the tutor drops to a foundation question, and there is none to drop to.",
      );
    }

    if (count > 0 && !levels.has("L3") && !levels.has("L4")) {
      at(`concepts ${concept.id}`, "Nothing above L2 — mastery cannot be evidenced.", "warn");
    }

    /* A misconception nothing points at is a misconception the app can name
       but never detect. */
    concept.misconceptions.forEach((misconception) => {
      const key = `${concept.id}:${misconception.id}`;
      if (!probedMisconceptions.has(key)) {
        at(
          `concepts ${concept.id} ${misconception.id}`,
          "No question distractor maps to this misconception, so it can only ever be found by asking a model.",
          "warn",
        );
      }
    });
  });

  return issues;
}

/* --------------------------------------------------------------------------
   Individual checks
   -------------------------------------------------------------------------- */

type Report = (where: string, message: string, severity?: Issue["severity"]) => void;

function checkAnswerShape(question: BankQuestion, where: string, at: Report) {
  const { qtype, correct, options } = question;

  if (qtype === "mcq" || qtype === "msq") {
    if (!options || options.length < 2) {
      at(where, `${qtype} needs at least two options.`);
      return;
    }

    const keys = new Set(options.map((option) => option.key));
    if (keys.size !== options.length) at(where, "Two options share a key.");

    if (!Array.isArray(correct)) {
      at(where, `${qtype} answers are an array of option keys.`);
      return;
    }

    if (correct.length === 0) at(where, "No correct option marked.");
    if (qtype === "mcq" && correct.length !== 1) {
      at(where, "An mcq has exactly one correct option; use msq for more.");
    }

    correct.forEach((key) => {
      if (!keys.has(key)) at(where, `Correct answer "${key}" is not one of the options.`);
    });

    return;
  }

  if (qtype === "nvt") {
    if (Array.isArray(correct) || !("value" in (correct as object))) {
      at(where, "nvt answers are { value, tol }.");
      return;
    }

    const answer = correct as { value: number; tol: number };
    if (!Number.isFinite(answer.value)) at(where, "nvt value must be a number.");
    if (!Number.isFinite(answer.tol) || answer.tol < 0) {
      at(where, "nvt tol must be a non-negative number — 0 means exact.");
    }

    if (options) at(where, "nvt questions do not take options.", "warn");
    return;
  }

  /* subjective */
  if (Array.isArray(correct) || !("rubric" in (correct as object))) {
    at(where, "subjective answers are { rubric: [...] } — the points a marker looks for.");
    return;
  }

  if ((correct as { rubric: string[] }).rubric.length === 0) {
    at(where, "An empty rubric gives the marker nothing to mark against.");
  }
}

function checkDistractors(
  question: BankQuestion,
  concept: Concept | undefined,
  where: string,
  at: Report,
  probed: Set<string>,
) {
  const map = question.distractor_map ?? {};

  if (question.qtype === "nvt" || question.qtype === "subjective") {
    if (Object.keys(map).length > 0) {
      at(where, "distractor_map only applies to option-based questions.", "warn");
    }
    return;
  }

  const wrong = wrongOptionKeys(question);
  const optionKeys = new Set((question.options ?? []).map((option) => option.key));

  Object.entries(map).forEach(([key, misconceptionId]) => {
    if (!optionKeys.has(key)) {
      at(where, `distractor_map names option "${key}", which does not exist.`);
      return;
    }

    if (!wrong.includes(key)) {
      at(where, `distractor_map names option "${key}", which is the correct answer.`);
      return;
    }

    if (!concept) return;

    const known = concept.misconceptions.some((entry) => entry.id === misconceptionId);
    if (!known) {
      at(
        where,
        `distractor_map points at misconception "${misconceptionId}", which concept ${concept.id} does not define.`,
      );
      return;
    }

    probed.add(`${concept.id}:${misconceptionId}`);
  });

  const uncovered = wrong.filter((key) => !(key in map));

  if (uncovered.length > 0) {
    at(
      where,
      `Wrong option${uncovered.length === 1 ? "" : "s"} ${uncovered.join(", ")} map to no misconception. A student who picks one gets "that's not right" instead of a diagnosis.`,
      "warn",
    );
  }
}

/* A stray $ turns the rest of a card into maths. Cheap to catch here. */
function checkLatex(text: string, where: string, at: Report) {
  if (!text) return;
  const delimiters = (text.match(/(?<!\\)\$/g) ?? []).length;
  if (delimiters % 2 !== 0) {
    at(where, "Odd number of $ delimiters — some maths is left open.");
  }
}

/* --------------------------------------------------------------------------
   Cross-file checks

   Prerequisites point across files, so they can only be resolved once every
   pack has been read.
   -------------------------------------------------------------------------- */
export function validateCollection(files: ContentFile[]): Issue[] {
  const issues: Issue[] = [];
  const topicIds = new Set(files.map((file) => file.topic.id));
  const seenTopic = new Map<string, number>();
  const seenQuestionIds = new Map<string, string>();

  files.forEach((file) => {
    seenTopic.set(file.topic.id, (seenTopic.get(file.topic.id) ?? 0) + 1);

    (file.topic.prereqTopicIds ?? []).forEach((id) => {
      if (!topicIds.has(id)) {
        issues.push({
          severity: "error",
          where: `${file.topic.id}.prereqTopicIds`,
          message: `Prerequisite ${id} is not a topic in the content set. It would lock the topic permanently.`,
        });
      }
    });

    file.questions.forEach((question) => {
      const owner = seenQuestionIds.get(question.id);
      if (owner && owner !== file.topic.id) {
        issues.push({
          severity: "error",
          where: `${file.topic.id} ${question.id}`,
          message: `Question id also used in ${owner}. Ids are the primary key; the second one would overwrite the first.`,
        });
      }
      seenQuestionIds.set(question.id, file.topic.id);
    });
  });

  seenTopic.forEach((count, id) => {
    if (count > 1) {
      issues.push({
        severity: "error",
        where: id,
        message: `${count} files declare this topic id.`,
      });
    }
  });

  return issues;
}
