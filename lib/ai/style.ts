/* House style, appended to every system prompt.

   These rules exist because of what the app does with the text, not because
   of taste:

   - Marks live in their own field and are rendered as a badge, so repeating
     "(3 marks)" inside the prompt shows the student the same number twice.
   - Every surface renders plain text. LaTeX delimiters arrive as literal
     backslashes on screen, which is worse than no formatting at all. Unicode
     maths renders correctly everywhere with no dependency.

   If a maths renderer is added later, relax the notation rule here and every
   route follows — the rule is in one place for exactly that reason. */

/* What board a student sits changes more than the syllabus: it changes the
   words a question is asked in and how marks are given. The prompts were
   written for Edexcel and Cambridge, where papers talk about units, paper
   codes and command words. None of that exists in a CBSE classroom. */
export const BOARD_CONTEXT = `This is an Indian school board. Write the way the board and its textbooks do:
- The syllabus is the NCERT or CISCE textbook chapter named in the scope. Stay
  inside that chapter. Do not reach into later chapters, and do not use content
  from a higher class.
- Use the board's own vocabulary: chapter, exercise, board exam, marks, step
  marking, value points. Not "unit", "paper code" or "command word".
- Marks are whole numbers — usually 1, 2, 3 or 5, with long answers at 5.
- Step marking applies: each correct step earns its own mark even when the
  final answer is wrong.
- Use Indian conventions where they differ: rupees, lakh and crore, Indian
  names and places in word problems, SI units.`;

export const HOUSE_STYLE = `Formatting, which this app renders as plain text:
- Write mathematics and units in plain Unicode: x², √3, ×, ÷, ≈, ≤, π, θ, Δ,
  ⁻¹, °C, m s⁻². Fractions as (a + b)/c.
- Never use LaTeX, never use \\( \\), $ $, \\frac, ^ or _ for scripts, and
  never use markdown bold, italics or backticks.
- Never write the mark allocation inside the text. Marks are shown separately,
  and repeating them reads as a mistake.`;
