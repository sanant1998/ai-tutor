import { PracticeView } from "@/components/app/PracticeView";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  return <PracticeView topicId={topicId} />;
}
