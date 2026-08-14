/* The Indian school syllabus: board → class → subject → chapter.

   This replaces the old international model (board → subject → unit), which
   was shaped around Edexcel IAL papers and does not describe how CBSE, ICSE or
   UP Board work. Here the unit of study is a textbook chapter.

   ---------------------------------------------------------------------------
   THE RULE THIS FILE EXISTS TO ENFORCE

   Nothing goes in SYLLABUS unless it was read off a real source, and every
   entry records where it came from and when. A wrong chapter list is worse
   than a missing one: the app builds a revision plan from these names and then
   asks an AI to write questions on them, so an invented chapter becomes a
   student revising something that is not on their paper.

   Combinations that have not been sourced yet are simply absent. `isCovered`
   returns false for them and the UI offers them as "not ready" rather than
   showing plausible-looking placeholders.
   ---------------------------------------------------------------------------

   NCERT is mid-transition under NCF-SE 2023: several textbooks were replaced
   for the 2026-27 session, with different chapter counts and titles from the
   books most online summaries still describe. Each entry below names the book
   it came from for that reason. */

/* ---------------------------------------------------------------------------
   COUNTRY

   The tree below is India-shaped — board, class, textbook chapter — because
   that is the market it was written for. The United States has no boards: a
   school follows a set of published STANDARDS, either the national ones or its
   own state's, and the year of school is a grade rather than a class.

   Rather than a second parallel model, country is a filter over one model. A
   board carries the country it belongs to, and everything downstream — which
   boards to offer, which grades exist, what a year is called, which subjects
   are taught — is derived from that. There is no second code path to keep in
   step with the first.
   --------------------------------------------------------------------------- */
export type CountryId = "in" | "us";

export type Country = {
  id: CountryId;
  name: string;
  /* What one year of school is called: "Class 8" here, "Grade 8" there. */
  classNoun: string;
  /* What the curriculum authority is called, for the question on the picker. */
  boardNoun: string;
};

export const COUNTRIES: Country[] = [
  { id: "in", name: "India", classNoun: "Class", boardNoun: "exam board" },
  { id: "us", name: "United States", classNoun: "Grade", boardNoun: "standards" },
];

export const DEFAULT_COUNTRY: CountryId = "in";

export type BoardId =
  | "cbse"
  | "icse"
  | "upboard"
  | "common-core"
  | "california"
  | "texas"
  | "newyork"
  | "florida";

export type Board = {
  id: BoardId;
  country: CountryId;
  name: string;
  detail: string;
  /* Whose textbooks or standards this board's syllabus actually follows. */
  basis: string;
};

/* The US entries are the four largest state frameworks plus the national
   default. NGSS is folded into each rather than listed separately: a student
   belongs to one curriculum, and "Common Core" in practice means CCSS for
   Maths and English with NGSS alongside it for Science. Texas and Florida are
   listed on their own because both explicitly do NOT use Common Core, and
   offering a Texan child a Common Core plan would be quietly wrong. */
export const BOARDS: Board[] = [
  {
    id: "cbse",
    country: "in",
    name: "CBSE",
    detail: "Central Board of Secondary Education",
    basis: "NCERT textbooks",
  },
  {
    id: "icse",
    country: "in",
    name: "ICSE",
    detail: "CISCE · Council for the Indian School Certificate Examinations",
    basis: "CISCE's own syllabus, publisher-independent",
  },
  {
    id: "upboard",
    country: "in",
    name: "UP Board",
    detail: "UPMSP · Uttar Pradesh Madhyamik Shiksha Parishad",
    basis: "NCERT textbooks for the secondary classes",
  },
  {
    id: "common-core",
    country: "us",
    name: "Common Core",
    detail: "Common Core State Standards · used by most states",
    basis: "CCSS for Mathematics and English Language Arts, NGSS for Science",
  },
  {
    id: "california",
    country: "us",
    name: "California",
    detail: "CA Content Standards · California Department of Education",
    basis: "California's own edition of CCSS, plus CA NGSS",
  },
  {
    id: "texas",
    country: "us",
    name: "Texas TEKS",
    detail: "Texas Essential Knowledge and Skills · Texas Education Agency",
    basis: "TEKS — Texas does not use Common Core",
  },
  {
    id: "newyork",
    country: "us",
    name: "New York",
    detail: "Next Generation Learning Standards · NYSED",
    basis: "NY Next Generation Standards, with NYSSLS for Science",
  },
  {
    id: "florida",
    country: "us",
    name: "Florida B.E.S.T.",
    detail: "Benchmarks for Excellent Student Thinking · Florida DOE",
    basis: "Florida B.E.S.T. Standards — replaced Common Core in Florida",
  },
];

export function boardsFor(country: CountryId): Board[] {
  return BOARDS.filter((board) => board.country === country);
}

/* Which country a board belongs to. Used so that everything downstream of a
   chosen board — grades, subject names, the word "Class" — can be derived from
   the board alone, without threading a country parameter through every call. */
export function countryOfBoard(boardId: string | null): CountryId {
  return BOARDS.find((board) => board.id === boardId)?.country ?? DEFAULT_COUNTRY;
}

/* 0 is Kindergarten. Numeric rather than a "K" string so that sorting, ranges
   and the existing band thresholds keep working without a special case in
   every comparison. India uses 1-10 of this range and nothing else. */
export type ClassLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/* India, unchanged. Exported under the old name because most of the app means
   this list when it says CLASSES. */
export const CLASSES: ClassLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const US_GRADES: ClassLevel[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function classesFor(country: CountryId): ClassLevel[] {
  return country === "us" ? US_GRADES : CLASSES;
}

export function classLabel(country: CountryId, level: ClassLevel): string {
  if (country !== "us") return `Class ${level}`;
  return level === 0 ? "Kindergarten" : `Grade ${level}`;
}

/* What fits inside a 64px chip: the bare number, or "K". */
export function classShortLabel(country: CountryId, level: ClassLevel): string {
  return country === "us" && level === 0 ? "K" : String(level);
}

/* Classes 1-5 are a different product from 6-10: a seven-year-old does not
   revise alone, so those screens are read by a parent. Kept as a band here so
   the UI can address the right person.

   The same thresholds hold for the US: Kindergarten is 0 and falls in
   "primary" with elementary, 6-8 is middle school, and 9-12 is high school. */
export function classBand(level: ClassLevel): "primary" | "middle" | "secondary" {
  if (level <= 5) return "primary";
  if (level <= 8) return "middle";
  return "secondary";
}

export type Subject = {
  id: string;
  name: string;
  glyph: string;
  /* Which classes this subject is taught in, in India. */
  classes: ClassLevel[];
  /* The US equivalent, where there is one. Absent means the subject is not
     taught there at all — Hindi and Sanskrit are not US school subjects, and
     Environmental Studies is folded into elementary Science rather than being
     its own paper. */
  us?: { name?: string; classes: ClassLevel[] };
};

const K_TO_12: ClassLevel[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const SUBJECTS: Subject[] = [
  {
    id: "maths",
    name: "Mathematics",
    glyph: "Σ",
    classes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    us: { classes: K_TO_12 },
  },
  { id: "evs", name: "Environmental Studies", glyph: "🌱", classes: [3, 4, 5] },
  {
    id: "science",
    name: "Science",
    glyph: "🔬",
    classes: [6, 7, 8, 9, 10],
    us: { classes: K_TO_12 },
  },
  {
    id: "sst",
    name: "Social Science",
    glyph: "🗺️",
    classes: [6, 7, 8, 9, 10],
    us: { name: "Social Studies", classes: K_TO_12 },
  },
  {
    id: "english",
    name: "English",
    glyph: "📖",
    classes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    us: { name: "English Language Arts", classes: K_TO_12 },
  },
  { id: "hindi", name: "Hindi", glyph: "📝", classes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { id: "sanskrit", name: "Sanskrit", glyph: "🕉️", classes: [6, 7, 8] },
  {
    id: "computer",
    name: "Computer Applications",
    glyph: "💻",
    classes: [9, 10],
    us: { name: "Computer Science", classes: [9, 10, 11, 12] },
  },
];

/* The subject list for one year of school. The country decides both which
   subjects exist and what they are called — a US ninth-grader takes English
   Language Arts, not English, and does not take Sanskrit at all. */
export function subjectsFor(
  level: ClassLevel,
  country: CountryId = DEFAULT_COUNTRY,
): Subject[] {
  if (country !== "us") {
    return SUBJECTS.filter((subject) => subject.classes.includes(level));
  }

  return SUBJECTS.filter((subject) => subject.us?.classes.includes(level)).map(
    (subject) => ({ ...subject, name: subject.us?.name ?? subject.name }),
  );
}

export type Chapter = {
  id: string;
  number: number;
  name: string;
  /* Rough time to learn it properly, in minutes. Used to pack the schedule.
     Estimated from chapter length, not published by any board. */
  minutes: number;
};

export type SyllabusEntry = {
  /* The textbook these chapters are from, named because NCERT replaced several
     books for 2026-27 and the old titles are still widely reproduced. */
  book: string;
  /* Where this list was read, and when. Both are required. */
  source: string;
  verifiedOn: string;
  /* Anything the sources disagreed on, so it can be checked against the real
     book rather than silently trusted. */
  caveat?: string;
  chapters: Chapter[];
};

function chapters(names: string[], minutes = 45): Chapter[] {
  return names.map((name, index) => ({
    id: String(index + 1),
    number: index + 1,
    name,
    minutes,
  }));
}

export function syllabusKey(
  board: BoardId,
  level: ClassLevel,
  subjectId: string,
) {
  return `${board}:${level}:${subjectId}`;
}

/* ---------------------------------------------------------------------------
   SOURCED SYLLABI

   Add an entry only with a real source. Everything else stays absent.
   --------------------------------------------------------------------------- */
export const SYLLABUS: Record<string, SyllabusEntry> = {
  "cbse:10:science": {
    book: "NCERT Science, Class 10",
    source: "learncbse.net NCERT Class 10 Science book page, cross-checked against careers360 syllabus listing",
    verifiedOn: "2026-08-12",
    caveat:
      "Chapter 8 appears as 'Heredity' in the rationalised book and 'Heredity and Evolution' in older summaries. Chapter 10 is written both as 'The Human Eye and the Colourful World' and without the articles.",
    chapters: chapters([
      "Chemical Reactions and Equations",
      "Acids, Bases and Salts",
      "Metals and Non-metals",
      "Carbon and its Compounds",
      "Life Processes",
      "Control and Coordination",
      "How do Organisms Reproduce?",
      "Heredity",
      "Light – Reflection and Refraction",
      "The Human Eye and the Colourful World",
      "Electricity",
      "Magnetic Effects of Electric Current",
      "Our Environment",
    ]),
  },

  "cbse:10:maths": {
    book: "NCERT Mathematics, Class 10",
    source: "learncbse.net NCERT Class 10 Mathematics book page",
    verifiedOn: "2026-08-12",
    chapters: chapters([
      "Real Numbers",
      "Polynomials",
      "Pair of Linear Equations in Two Variables",
      "Quadratic Equations",
      "Arithmetic Progressions",
      "Triangles",
      "Coordinate Geometry",
      "Introduction to Trigonometry",
      "Some Applications of Trigonometry",
      "Circles",
      "Areas Related to Circles",
      "Surface Areas and Volumes",
      "Statistics",
      "Probability",
    ]),
  },

  /* Social Science is one board subject taught from four separate books, and
     students refer to a chapter by its book, not by a running number across
     all four. So the book is carried in the name and the number is only the
     order it sits in the plan. */
  "cbse:10:sst": {
    book: "NCERT Class 10 Social Science — four books: India and the Contemporary World II, Contemporary India II, Democratic Politics II, Understanding Economic Development",
    source: "learncbse.net Class 10 Social Science page, corrected against byjus/vedantu/tiwariacademy chapter listings",
    verifiedOn: "2026-08-12",
    caveat:
      "The first source had two scraping errors: it gave Political Science chapter 4 as 'Democratic Politics' (it is 'Political Parties') and listed 'Notes for the Teacher' as Economics chapter 1, displacing 'Development'. Both corrected here against other listings — worth one check against the printed books.",
    chapters: chapters([
      "History Ch 1: The Rise of Nationalism in Europe",
      "History Ch 2: Nationalism in India",
      "History Ch 3: The Making of a Global World",
      "History Ch 4: The Age of Industrialisation",
      "History Ch 5: Print Culture and the Modern World",
      "Geography Ch 1: Resources and Development",
      "Geography Ch 2: Forest and Wildlife Resources",
      "Geography Ch 3: Water Resources",
      "Geography Ch 4: Agriculture",
      "Geography Ch 5: Minerals and Energy Resources",
      "Geography Ch 6: Manufacturing Industries",
      "Geography Ch 7: Lifelines of National Economy",
      "Civics Ch 1: Power-sharing",
      "Civics Ch 2: Federalism",
      "Civics Ch 3: Gender, Religion and Caste",
      "Civics Ch 4: Political Parties",
      "Civics Ch 5: Outcomes of Democracy",
      "Economics Ch 1: Development",
      "Economics Ch 2: Sectors of the Indian Economy",
      "Economics Ch 3: Money and Credit",
      "Economics Ch 4: Globalisation and the Indian Economy",
      "Economics Ch 5: Consumer Rights",
    ]),
  },

  "cbse:9:science": {
    book: "NCERT Exploration, Class 9 (new for 2026-27 under NCF-SE 2023)",
    source: "ncertbooks.org Class 9 Science book page, cross-checked against learncbse.net and a change summary",
    verifiedOn: "2026-08-12",
    caveat:
      "This book replaced the old Class 9 Science textbook. Reproduction and classification moved down from Class 10, so chapters 11-12 are Class 9 material now and are not retaught in Class 10.",
    chapters: chapters([
      "Exploration: Entering the World of Secondary Science",
      "Cell: The Building Block of Life",
      "Tissues in Action",
      "Describing Motion Around Us",
      "Exploring Mixtures and their Separation",
      "How Forces Affect Motion",
      "Work, Energy and Simple Machines",
      "Journey Inside the Atom",
      "Atomic Foundations of Matter",
      "Sound Waves: Characteristics and Applications",
      "Reproduction: How Life Continues",
      "Patterns in Life: Diversity and Classification",
      "Earth as a System: Energy, Matter and Life",
    ]),
  },

  /* Class 8 was replaced too, and more completely than Class 9 was.
   *
   * "Ganita Prakash" is the NCF-SE 2023 book: two parts of seven chapters
   * each, titles rewritten from scratch. It is not a rationalisation of the
   * old sixteen-chapter Mathematics book — "Rational Numbers", "Linear
   * Equations in One Variable", "Mensuration" and the rest are gone as chapter
   * headings, and the material is redistributed under names like "A Story of
   * Numbers" and "Algebra Play".
   *
   * That matters beyond this file: the concept packs in content/cbse/class8/
   * are written against the OLD book — ch01 Rational Numbers, ch02 Linear
   * Equations in One Variable — so the seeded curriculum and this chapter list
   * describe different textbooks. The material still gets taught somewhere in
   * the new book; the chapter a student is told to revise is what has moved.
   * Recorded here rather than quietly reconciled, because the honest list and
   * the seeded content genuinely disagree and only a person with the printed
   * book can say where each concept now lives. */
  "cbse:8:maths": {
    book: "NCERT Ganita Prakash Parts 1 and 2, Class 8 (new for 2026-27 under NEP 2020 / NCF-SE 2023)",
    source:
      "careers360 NCERT Class 8 Maths book page and educart.co Class 8 Maths chapter listing, fetched independently and agreeing on all fourteen titles",
    verifiedOn: "2026-08-13",
    caveat:
      "Replaced the older sixteen-chapter Mathematics book completely; every chapter title is new. Sources still in circulation give 16 chapters (the old book) or 7 (one part only) — both are wrong for 2026-27. The two parts each number their chapters from 1; they are numbered 1-14 straight through here because the revision plan needs one ordering. content/cbse/class8/maths/ is written against the OLD book and does not match this list.",
    chapters: chapters([
      /* Part 1 */
      "A Square and A Cube",
      "Power Play",
      "A Story of Numbers",
      "Quadrilaterals",
      "Number Play",
      "We Distribute, Yet Things Multiply",
      "Proportional Reasoning – 1",
      /* Part 2 */
      "Fractions in Disguise",
      "The Baudhayana–Pythagoras Theorem",
      "Proportional Reasoning – 2",
      "Exploring Some Geometric Themes",
      "Tales by Dots and Lines",
      "Algebra Play",
      "Area",
    ]),
  },

  "cbse:9:maths": {
    book: "NCERT Ganita Manjari Part 1, Class 9 (new for 2026-27 under NEP 2020)",
    source: "tiwariacademy / learncbse.in / boundlessmaths listings, cross-checked against learncbse.net",
    verifiedOn: "2026-08-12",
    caveat:
      "Replaced the older 15-chapter book; polynomials and Heron's formula are now folded into other chapters. Sources disagree on chapter 3: 'The World of Numbers' against 'The Dawn of Mathematics: The Human Need to Count'. Check against the printed book before relying on it.",
    chapters: chapters([
      "Orienting Yourself: The Use of Coordinates",
      "Introduction to Linear Polynomials",
      "The World of Numbers",
      "Exploring Algebraic Identities",
      "I'm Up and Down, and Round and Round",
      "Measuring Space: Perimeter and Area",
      "The Mathematics of Maybe: Introduction to Probability",
      "Predicting What Comes Next?: Exploring Sequences and Progressions",
    ]),
  },
};

/* UP Board teaches NCERT books in the secondary classes, so those syllabi are
   the same lists rather than copies that can drift apart. Only mapped where
   the CBSE entry itself is sourced. */
const UP_BOARD_FOLLOWS_NCERT: [ClassLevel, string][] = [
  [8, "maths"],
  [9, "science"],
  [9, "maths"],
  [9, "sst"],
  [10, "science"],
  [10, "maths"],
  [10, "sst"],
];

for (const [level, subjectId] of UP_BOARD_FOLLOWS_NCERT) {
  const entry = SYLLABUS[syllabusKey("cbse", level, subjectId)];
  if (entry) {
    SYLLABUS[syllabusKey("upboard", level, subjectId)] = {
      ...entry,
      source: `${entry.source} — UP Board prescribes NCERT for this class`,
    };
  }
}

/* --------------------------------------------------------------------------
   Lookups
   -------------------------------------------------------------------------- */
export function syllabusFor(
  board: BoardId,
  level: ClassLevel,
  subjectId: string,
): SyllabusEntry | null {
  return SYLLABUS[syllabusKey(board, level, subjectId)] ?? null;
}

export function chaptersFor(
  board: BoardId,
  level: ClassLevel,
  subjectId: string,
): Chapter[] {
  return syllabusFor(board, level, subjectId)?.chapters ?? [];
}

/* Whether this board, class and subject has a real chapter list behind it.
   The picker uses this to grey out what is not ready instead of offering a
   plan built on nothing. */
export function isCovered(
  board: BoardId,
  level: ClassLevel,
  subjectId: string,
): boolean {
  return chaptersFor(board, level, subjectId).length > 0;
}

/* Country is taken from the board rather than passed in: a board belongs to
   exactly one country, so asking the caller for both invites the two to
   disagree. Every US combination is uncovered today — SYLLABUS has no US
   entries, and it will not get any that were not read off a published
   standards document — so a US board honestly reports nothing ready rather
   than offering a plan built on invented chapters. */
export function coveredSubjects(board: BoardId, level: ClassLevel): Subject[] {
  return subjectsFor(level, countryOfBoard(board)).filter((subject) =>
    isCovered(board, level, subject.id),
  );
}

/* One board's coverage in a sentence: which years have a sourced chapter list
   and which subjects those lists cover.

   Written for the marketing page, which used to name boards from a hand-kept
   list in lib/content.ts and drifted — it advertised Edexcel and Cambridge
   long after the international model was removed, and offered CBSE "grades 10
   to 12" for a product that stops at 10. Deriving it means the page cannot
   claim a board the product does not have. */
export function boardCoverage(board: BoardId): {
  levels: ClassLevel[];
  subjects: string[];
} {
  const country = countryOfBoard(board);
  const levels: ClassLevel[] = [];
  const subjects = new Set<string>();

  for (const level of classesFor(country)) {
    const ready = coveredSubjects(board, level);
    if (ready.length === 0) continue;

    levels.push(level);
    for (const subject of ready) subjects.add(subject.name);
  }

  return { levels, subjects: [...subjects] };
}

/* What is and is not ready, for an at-a-glance answer to "which classes work
   right now" without reading the table by eye. */
export function coverageReport() {
  const rows: {
    board: BoardId;
    level: ClassLevel;
    subject: string;
    chapters: number;
  }[] = [];

  let possible = 0;

  for (const board of BOARDS) {
    for (const level of classesFor(board.country)) {
      for (const subject of subjectsFor(level, board.country)) {
        possible += 1;

        const count = chaptersFor(board.id, level, subject.id).length;
        if (count > 0) {
          rows.push({
            board: board.id,
            level,
            subject: subject.name,
            chapters: count,
          });
        }
      }
    }
  }

  return { covered: rows, coveredCount: rows.length, possible };
}
