import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GeneratedIdea } from "@sultan-saif/shared";
import { fetchAllSources, type SourceArticle } from "./sources.js";

const execFileAsync = promisify(execFile);

export type { GeneratedIdea };
export { fetchAllSources, type SourceArticle } from "./sources.js";

export async function generateIdeasFromSources(): Promise<GeneratedIdea[]> {
  const articles = await fetchAllSources();

  if (articles.length === 0) {
    return [];
  }

  const articleSummaries = articles
    .map(
      (a, i) =>
        `${i + 1}. [${a.sourceName}] Title: "${a.title}"\n   URL: ${a.url}${a.score ? `\n   Score: ${a.score}` : ""}`
    )
    .join("\n\n");

  const prompt = `You are a tech strategist. Review these trending tech articles from multiple sources (Hacker News, Dev.to, GitHub Trending, Reddit) and extract the top 8 most interesting and actionable ideas for a software team.

For each idea, provide:
- A concise title (max 10 words)
- A summary of the idea and why it's valuable (2-3 sentences)
- The source URL and source name (exactly as shown in brackets)

Prioritize diversity of sources — try to include ideas from at least 3 different sources.

Articles:
${articleSummaries}

Respond ONLY with valid JSON in this exact format:
{
  "ideas": [
    {
      "title": "...",
      "summary": "...",
      "sourceUrl": "...",
      "sourceName": "..."
    }
  ]
}`;

  const { stdout } = await execFileAsync(
    "claude",
    ["-p", prompt, "--output-format", "text", "--max-turns", "1"],
    { maxBuffer: 1024 * 1024, timeout: 120_000 }
  );

  const text = stdout.trim();

  // Extract JSON from response — handle cases where Claude wraps in markdown code blocks
  const jsonMatch = text.match(/\{[\s\S]*"ideas"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Claude response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { ideas: GeneratedIdea[] };
  return parsed.ideas;
}
