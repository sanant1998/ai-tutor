import { LegalPage } from "@/components/legal/LegalPage";
import { PRIVACY } from "@/lib/legal";

export const metadata = {
  title: "Privacy Policy · PaperPath",
  description:
    "What PaperPath collects about a student, how parental consent works, how long anything is kept, and how to see or delete it.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Most people who use PaperPath are children. This policy is written on that assumption, and in the plainest language we could manage — a policy a parent cannot read is not consent to anything."
      sections={PRIVACY}
    />
  );
}
