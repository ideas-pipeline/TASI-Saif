export type IdeaStatus = "inbox" | "approved" | "in_execution" | "archived";

export interface Idea {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string | null;
  sourceName: string | null;
  status: IdeaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedIdea {
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
}
