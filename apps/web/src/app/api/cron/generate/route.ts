import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json(
      { error: "API URL not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(`${apiUrl}/ideas/generate/scheduled`, {
    method: "POST",
    headers: {
      "x-cron-secret": cronSecret || "",
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
