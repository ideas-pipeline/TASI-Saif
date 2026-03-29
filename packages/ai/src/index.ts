import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedIdea } from "@sultan-saif/shared";

export type { GeneratedIdea };

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants: number;
}

async function fetchHackerNewsTopStories(limit = 20): Promise<HNItem[]> {
  const response = await fetch(
    "https://hacker-news.firebaseio.com/v0/topstories.json"
  );
  const ids = (await response.json()) as number[];
  const topIds = ids.slice(0, limit * 3); // fetch more to filter

  const items = await Promise.all(
    topIds.map(async (id) => {
      const r = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      );
      return r.json() as Promise<HNItem>;
    })
  );

  // Keep only items with URLs (link posts, not Ask HN etc.)
  return items.filter((item) => item.url).slice(0, limit);
}

export async function generateIdeasFromSources(): Promise<GeneratedIdea[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const client = new Anthropic({ apiKey });

  const stories = await fetchHackerNewsTopStories(15);

  const storySummaries = stories
    .map(
      (s, i) =>
        `${i + 1}. Title: "${s.title}"\n   URL: ${s.url}\n   Score: ${s.score}`
    )
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a tech strategist. Review these trending tech articles from Hacker News and extract the top 5 most interesting and actionable ideas for a software team.

For each idea, provide:
- A concise title (max 10 words)
- A summary of the idea and why it's valuable (2-3 sentences)
- The source URL and source name

Articles:
${storySummaries}

Respond ONLY with valid JSON in this exact format:
{
  "ideas": [
    {
      "title": "...",
      "summary": "...",
      "sourceUrl": "...",
      "sourceName": "Hacker News"
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
