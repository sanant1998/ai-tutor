import { TeacherView } from "@/components/app/TeacherView";

export default async function TeacherSectionPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  return <TeacherView sectionId={sectionId} />;
}
