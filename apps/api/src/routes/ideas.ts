import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { db, ideas } from "@sultan-saif/db";
import { generateIdeasFromSources } from "@sultan-saif/ai";
import type { IdeaStatus } from "@sultan-saif/shared";

export const ideasRouter = new Hono();

// GET /ideas?status=inbox&source=Hacker+News
ideasRouter.get("/", async (c) => {
  const status = c.req.query("status") as IdeaStatus | undefined;
  const source = c.req.query("source");

  let query = db.select().from(ideas).$dynamic();

  if (status) {
    query = query.where(eq(ideas.status, status));
  }
  if (source) {
    query = query.where(eq(ideas.sourceName, source));
  }

  const rows = await query;
  return c.json({ data: rows });
});

// GET /ideas/sources — list distinct source names
ideasRouter.get("/sources", async (c) => {
  const rows = await db
    .selectDistinct({ sourceName: ideas.sourceName })
    .from(ideas);
  const sources = rows
    .map((r) => r.sourceName)
    .filter((s): s is string => s !== null);
  return c.json({ data: sources });
});

// PATCH /ideas/:id
ideasRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ status: IdeaStatus }>();

  const validStatuses: IdeaStatus[] = [
    "inbox",
    "approved",
    "in_execution",
    "archived",
  ];
  if (!validStatuses.includes(body.status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const updated = await db
    .update(ideas)
    .set({ status: body.status, updatedAt: new Date() })
    .where(eq(ideas.id, id))
    .returning();

  if (!updated.length) {
    return c.json({ error: "Idea not found" }, 404);
  }

  return c.json({ data: updated[0] });
});

// DELETE /ideas/:id
ideasRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const deleted = await db
    .delete(ideas)
    .where(eq(ideas.id, id))
    .returning();

  if (!deleted.length) {
    return c.json({ error: "Idea not found" }, 404);
  }

  return c.json({ data: { deleted: true } });
});

// POST /ideas/generate — generate and insert new ideas, deduplicating by sourceUrl
ideasRouter.post("/generate", async (c) => {
  const generated = await generateIdeasFromSources();

  if (generated.length === 0) {
    return c.json({ data: [], message: "No ideas generated" });
  }

  // Deduplicate: check which sourceUrls already exist
  const sourceUrls = generated
    .map((idea) => idea.sourceUrl)
    .filter((url): url is string => !!url);

  let existingUrls = new Set<string>();
  if (sourceUrls.length > 0) {
    const existing = await db
      .select({ sourceUrl: ideas.sourceUrl })
      .from(ideas)
      .where(inArray(ideas.sourceUrl, sourceUrls));
    existingUrls = new Set(
      existing.map((e) => e.sourceUrl).filter((u): u is string => !!u)
    );
  }

  const newIdeas = generated.filter(
    (idea) => !idea.sourceUrl || !existingUrls.has(idea.sourceUrl)
  );

  if (newIdeas.length === 0) {
    return c.json({ data: [], message: "All ideas already exist" });
  }

  const inserted = await db
    .insert(ideas)
    .values(
      newIdeas.map((idea) => ({
        title: idea.title,
        summary: idea.summary,
        sourceUrl: idea.sourceUrl,
        sourceName: idea.sourceName,
        status: "inbox" as IdeaStatus,
      }))
    )
    .returning();

  return c.json({
    data: inserted,
    stats: {
      generated: generated.length,
      duplicates: generated.length - newIdeas.length,
      inserted: inserted.length,
    },
  });
});

// POST /ideas/generate/scheduled — for cron/scheduled invocation with secret key auth
ideasRouter.post("/generate/scheduled", async (c) => {
  const authHeader = c.req.header("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== cronSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Reuse the same generation logic
  const generated = await generateIdeasFromSources();

  if (generated.length === 0) {
    return c.json({ data: [], message: "No ideas generated" });
  }

  const sourceUrls = generated
    .map((idea) => idea.sourceUrl)
    .filter((url): url is string => !!url);

  let existingUrls = new Set<string>();
  if (sourceUrls.length > 0) {
    const existing = await db
      .select({ sourceUrl: ideas.sourceUrl })
      .from(ideas)
      .where(inArray(ideas.sourceUrl, sourceUrls));
    existingUrls = new Set(
      existing.map((e) => e.sourceUrl).filter((u): u is string => !!u)
    );
  }

  const newIdeas = generated.filter(
    (idea) => !idea.sourceUrl || !existingUrls.has(idea.sourceUrl)
  );

  if (newIdeas.length === 0) {
    return c.json({
      data: [],
      message: "All ideas already exist",
      scheduledAt: new Date().toISOString(),
    });
  }

  const inserted = await db
    .insert(ideas)
    .values(
      newIdeas.map((idea) => ({
        title: idea.title,
        summary: idea.summary,
        sourceUrl: idea.sourceUrl,
        sourceName: idea.sourceName,
        status: "inbox" as IdeaStatus,
      }))
    )
    .returning();

  return c.json({
    data: inserted,
    stats: {
      generated: generated.length,
      duplicates: generated.length - newIdeas.length,
      inserted: inserted.length,
    },
    scheduledAt: new Date().toISOString(),
  });
});
