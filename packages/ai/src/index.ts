import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedIdea } from "@sultan-saif/shared";
import { fetchAllSources, type SourceArticle } from "./sources.js";

export type { GeneratedIdea };
export { fetchAllSources, type SourceArticle } from "./sources.js";

export async function generateIdeasFromSources(): Promise<GeneratedIdea[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const client = new Anthropic({ apiKey });

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

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are a tech strategist. Review these trending tech articles from multiple sources (Hacker News, Dev.to, GitHub Trending, Reddit) and extract the top 8 most interesting and actionable ideas for a software team.

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
}`,
      },
    ],
  });

  const content = message.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const parsed = JSON.parse(content.text) as { ideas: GeneratedIdea[] };
  return parsed.ideas;
}
