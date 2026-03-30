import type { GeneratedIdea } from "@sultan-saif/shared";
import { fetchAllSources, type SourceArticle } from "./sources.js";

export type { GeneratedIdea };
export { fetchAllSources, type SourceArticle } from "./sources.js";

export async function generateIdeasFromSources(): Promise<GeneratedIdea[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  const result = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text =
    result.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("") || "";

  // Extract JSON from response — handle cases where Claude wraps in markdown code blocks
  const jsonMatch = text.match(/\{[\s\S]*"ideas"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Claude response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { ideas: GeneratedIdea[] };
  return parsed.ideas;
}
