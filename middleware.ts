import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Voice Interview Agent"',
    },
  });
}

export function middleware(req: NextRequest) {
  const username = process.env.APP_BASIC_AUTH_USERNAME;
  const password = process.env.APP_BASIC_AUTH_PASSWORD;

  if (!username && !password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Basic auth is not configured.", { status: 503 });
    }
    return NextResponse.next();
  }

  if (!username || !password) {
    return new NextResponse("Basic auth is partially configured.", { status: 503 });
  }

  const expected = `Basic ${btoa(`${username}:${password}`)}`;
  if (req.headers.get("authorization") !== expected) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)"],
};
