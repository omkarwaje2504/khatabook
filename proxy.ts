import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie means straight to the login page.
// Pages and server actions still verify the session against the database.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("khata_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
