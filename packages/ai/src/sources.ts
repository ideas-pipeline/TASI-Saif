export interface SourceArticle {
  title: string;
  url: string;
  score?: number;
  sourceName: string;
}

// --- Hacker News ---

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants: number;
}

export async function fetchHackerNews(limit = 15): Promise<SourceArticle[]> {
  const res = await fetch(
    "https://hacker-news.firebaseio.com/v0/topstories.json"
  );
  const ids = (await res.json()) as number[];

  const items = await Promise.all(
    ids.slice(0, limit * 2).map(async (id) => {
      const r = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      );
      return r.json() as Promise<HNItem>;
    })
  );

  return items
    .filter((item) => item.url)
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      url: item.url!,
      score: item.score,
      sourceName: "Hacker News",
    }));
}

// --- Dev.to ---

interface DevToArticle {
  title: string;
  url: string;
  positive_reactions_count: number;
  description: string;
}

export async function fetchDevTo(limit = 10): Promise<SourceArticle[]> {
  const res = await fetch(
    `https://dev.to/api/articles?top=1&per_page=${limit}`
  );
  const articles = (await res.json()) as DevToArticle[];

  return articles.map((a) => ({
    title: a.title,
    url: a.url,
    score: a.positive_reactions_count,
    sourceName: "Dev.to",
  }));
}

// --- GitHub Trending (via GitHub search API — most starred repos created recently) ---

interface GHSearchResult {
  items: {
    full_name: string;
    html_url: string;
    description: string | null;
    stargazers_count: number;
    language: string | null;
  }[];
}

export async function fetchGitHubTrending(
  limit = 10
): Promise<SourceArticle[]> {
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .split("T")[0];
  const res = await fetch(
    `https://api.github.com/search/repositories?q=created:>${oneWeekAgo}&sort=stars&order=desc&per_page=${limit}`,
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );
  const data = (await res.json()) as GHSearchResult;

  return (data.items ?? []).map((repo) => ({
    title: `${repo.full_name}: ${repo.description ?? "New trending repo"}`,
    url: repo.html_url,
    score: repo.stargazers_count,
    sourceName: "GitHub Trending",
  }));
}

// --- Reddit /r/programming ---

interface RedditListing {
  data: {
    children: {
      data: {
        title: string;
        url: string;
        score: number;
        is_self: boolean;
      };
    }[];
  };
}

export async function fetchRedditProgramming(
  limit = 10
): Promise<SourceArticle[]> {
  const res = await fetch(
    `https://www.reddit.com/r/programming/top.json?t=day&limit=${limit}`,
    { headers: { "User-Agent": "IdeaGen/1.0" } }
  );
  const data = (await res.json()) as RedditListing;

  return (data.data?.children ?? [])
    .filter((c) => !c.data.is_self)
    .map((c) => ({
      title: c.data.title,
      url: c.data.url,
      score: c.data.score,
      sourceName: "Reddit r/programming",
    }));
}

// --- Aggregate all sources ---

export async function fetchAllSources(): Promise<SourceArticle[]> {
  const results = await Promise.allSettled([
    fetchHackerNews(15),
    fetchDevTo(10),
    fetchGitHubTrending(10),
    fetchRedditProgramming(10),
  ]);

  const articles: SourceArticle[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    }
  }

  return articles;
}
