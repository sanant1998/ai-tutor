import { ParentView } from "@/components/app/ParentView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parent · PaperPath",
  robots: { index: false, follow: false },
};

export default function ParentPage() {
  return <ParentView />;
}
