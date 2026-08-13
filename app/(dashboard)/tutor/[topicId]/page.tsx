import { TutorView } from "@/components/app/TutorView";

export default async function TutorPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  return <TutorView topicId={topicId} />;
}
