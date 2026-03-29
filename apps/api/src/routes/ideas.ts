import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, ideas } from "@sultan-saif/db";
import { generateIdeasFromSources } from "@sultan-saif/ai";
import type { IdeaStatus } from "@sultan-saif/shared";

export const ideasRouter = new Hono();

// GET /ideas?status=inbox
ideasRouter.get("/", async (c) => {
  const status = c.req.query("status") as IdeaStatus | undefined;

  const rows = status
    ? await db.select().from(ideas).where(eq(ideas.status, status))
    : await db.select().from(ideas);

  return c.json({ data: rows });
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

// POST /ideas/generate
ideasRouter.post("/generate", async (c) => {
  const generated = await generateIdeasFromSources();

  const inserted = await db
    .insert(ideas)
    .values(
      generated.map((idea) => ({
        title: idea.title,
        summary: idea.summary,
        sourceUrl: idea.sourceUrl,
        sourceName: idea.sourceName,
        status: "inbox" as IdeaStatus,
      }))
    )
    .returning();

  return c.json({ data: inserted });
});
