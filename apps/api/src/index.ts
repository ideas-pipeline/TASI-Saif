import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ideasRouter } from "./routes/ideas.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/ideas", ideasRouter);

const port = Number(process.env.PORT) || 8000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on port ${port}`);
});
