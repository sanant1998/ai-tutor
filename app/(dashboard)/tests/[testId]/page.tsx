import { TestView } from "@/components/app/TestView";

export const metadata = {
  title: "Test · PaperPath",
  robots: { index: false, follow: false },
};

export default async function TestPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;
  return <TestView testId={testId} />;
}
