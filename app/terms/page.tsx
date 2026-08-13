import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS } from "@/lib/legal";

export const metadata = {
  title: "Terms of Use · PaperPath",
  description: "What PaperPath is, what it is not, and the rules for using it.",
};

export default function TermsPage() {
  return <LegalPage title="Terms of Use" sections={TERMS} />;
}
