/* A teacher's sections, or an explanation of why there are none.
 *
 * Server-rendered: whether this person is a teacher at all is a database
 * question, and a client-side check would show the teacher shell to a student
 * for a frame before deciding otherwise. */

import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { PageHeader, Panel } from "@/components/app/ui";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherIndexPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Teacher" title="Your classes" />
        <Panel className="p-6">
          <p className="text-[15px] opacity-70">
            This deployment is not connected to a database yet, so there are no classes to
            show. Ask whoever set it up to finish the connection.
          </p>
        </Panel>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return (
      <Panel className="p-6">
        <p className="text-[15px] opacity-70">Sign in to see your classes.</p>
      </Panel>
    );
  }

  /* Through the user's own client, inside RLS. A teacher sees the sections of
     orgs they belong to and nothing else, and that rule lives in the policy
     rather than in this query. */
  const { data: sections, error } = await supabase
    .from("sections")
    .select("id, name, class_level, teacher_id, orgs(name)")
    .order("name");

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Teacher" title="Your classes" />
        <Panel className="p-6">
          <p className="text-[15px] opacity-70">
            The school tables are not set up on this project yet. Run{" "}
            <code>supabase/schools.sql</code>.
          </p>
        </Panel>
      </div>
    );
  }

  const mine = (sections ?? []).filter((row) => row.teacher_id === auth.user!.id);
  const rows = mine.length > 0 ? mine : (sections ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Teacher"
        title="Your classes"
        sub="Which topic the whole class is stuck on, and which student needs attention."
      />

      {rows.length === 0 ? (
        <Panel className="space-y-3 p-6">
          <p className="text-[15px] opacity-75">
            Aapke account se koi class judi nahi hai.
          </p>
          <p className="text-[14px] opacity-60">
            School ya coaching ke liye ye feature seats pe chalta hai — ek admin
            aapko section assign karega. Abhi tak set up nahi hua hai to hume
            batayein.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((section) => {
            const org = section.orgs as unknown as { name?: string } | { name?: string }[] | null;

            return (
              <Link key={section.id as string} href={`/teacher/${section.id}`}>
                <Panel className="flex items-center gap-3 p-5 transition-opacity hover:opacity-80">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
                    <GraduationCap className="h-4 w-4 opacity-70" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold">{section.name as string}</p>
                    <p className="text-[12px] opacity-55">
                      {(Array.isArray(org) ? org[0]?.name : org?.name) ?? ""}
                    </p>
                  </div>
                </Panel>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
