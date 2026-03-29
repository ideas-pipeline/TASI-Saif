import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const ideaStatusEnum = pgEnum("idea_status", [
  "inbox",
  "approved",
  "in_execution",
  "archived",
]);

export const ideas = pgTable("ideas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  status: ideaStatusEnum("status").notNull().default("inbox"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
