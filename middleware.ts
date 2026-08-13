import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { APP_NAV } from "@/lib/nav";
import { PATH_HEADER } from "@/lib/roles";

/* Routes behind the app shell. Derived from the nav so a new page is guarded
   the moment it appears in the sidebar.

   Deriving from the nav alone is not enough, though, and the gap is easy to
   miss: a page can live inside the (dashboard) group — and so render the whole
   app shell — without appearing in EVERY role's sidebar. /practice/[topicId] is
   reached from a link, /teacher is in the teacher's nav and not a student's.
   Without the list below, a signed-out visitor loads the app shell on those
   paths and only discovers they are not signed in when the first fetch 401s.

   Anything added under app/(dashboard)/ that is not in APP_NAV belongs here. */
const ALSO_GUARDED = [
  /* Resolves the role and forwards; meaningless signed out. */
  "/home",
  "/practice",
  "/parent-consent",
  "/teacher",
  "/onboarding",
  /* Not under (dashboard), but every one of them is signed-in-only and the
     admin pages check membership again server-side. */
  "/admin",
];

const GUARDED = [...APP_NAV.map((item) => item.href), ...ALSO_GUARDED];

function isGuarded(pathname: string) {
  return GUARDED.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

/* Refreshes the Supabase session cookie on navigation so Server Components
   always read a valid session, and bounces signed-out visitors away from the
   app. Does nothing while Supabase is unconfigured, which keeps a
   keyless preview deploy fully browsable. */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /* The path, forwarded to the app shell.
   *
   * A layout is not told which page is rendering inside it, and the role gate
   * lives in the shell's layout because that is the one place the role is
   * already loaded. Without this it would have to be repeated in each of the
   * dozen-odd pages instead — which is the version that eventually misses one.
   *
   * Set on the REQUEST headers, so it reaches the server components; it is not
   * a response header and never reaches the browser. */
  request.headers.set(PATH_HEADER, request.nextUrl.pathname);

  let response = NextResponse.next({ request });

  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        /* Rebuilt from `request`, which still carries PATH_HEADER. */
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isGuarded(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    /* Come back to where they were headed once they are in. */
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  /* Someone already signed in has no use for the auth screens. */
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const app = request.nextUrl.clone();
    /* /home picks the landing page from the role. */
    app.pathname = "/home";
    app.search = "";
    return NextResponse.redirect(app);
  }

  return response;
}

export const config = {
  matcher: [
    /* Everything except Next internals and static files. */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
