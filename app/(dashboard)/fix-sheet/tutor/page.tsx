import { TutorFixSheet } from "@/components/app/TutorFixSheet";

/* Sits beside the existing /fix-sheet, which is the revision side's version and
   is written by a model from marked prose.
 *
 * Two fix sheets is not duplication: they are built from different evidence and
 * one of them is free. This one only has rows where the tutor has diagnosed a
 * specific misconception, so it is empty until a student has practised — and
 * the other one covers the case where there is nothing but written answers to
 * go on. */

export default function TutorFixSheetPage() {
  return (
    <>
      <p className="mx-auto mb-4 max-w-3xl text-[13px] opacity-55 print:hidden">
        Ye sheet un galtiyon se banti hai jo tutor ne pakdi hain — har line
        kisi asli sawal se aayi hai. Jo chapters abhi tutor me nahi hain, unke
        liye <a href="/fix-sheet" className="underline">purani fix sheet</a> use
        karo.
      </p>

      <TutorFixSheet />
    </>
  );
}
