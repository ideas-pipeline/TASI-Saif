"use client";

import { useState, useEffect, useCallback } from "react";
import type { Idea, IdeaStatus } from "@sultan-saif/shared";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const API_URL =
  typeof window !== "undefined"
    ? "/api/backend"
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");

const COLUMNS: { status: IdeaStatus; label: string }[] = [
  { status: "inbox", label: "\u{1F4E5} \u0627\u0644\u0648\u0627\u0631\u062F" },
  { status: "approved", label: "\u2705 \u0645\u0648\u0627\u0641\u0642 \u0639\u0644\u064A\u0647\u0627" },
  { status: "in_execution", label: "\u{1F680} \u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630" },
  { status: "archived", label: "\u{1F5C4}\uFE0F \u0627\u0644\u0645\u0624\u0631\u0634\u0641" },
];

const NEXT_STATUS: Partial<Record<IdeaStatus, IdeaStatus>> = {
  inbox: "approved",
  approved: "in_execution",
};

const NEXT_LABEL: Partial<Record<IdeaStatus, string>> = {
  inbox: "\u0645\u0648\u0627\u0641\u0642\u0629",
  approved: "\u062A\u0646\u0641\u064A\u0630",
};

const SOURCE_COLORS: Record<string, string> = {
  "Hacker News": "#ff6600",
  "Dev.to": "#3b49df",
  "GitHub Trending": "#238636",
  "Reddit r/programming": "#ff4500",
};

interface DroppableColumnProps {
  status: IdeaStatus;
  label: string;
  ideas: Idea[];
  updateStatus: (id: string, status: IdeaStatus) => Promise<void>;
  deleteIdea: (id: string) => Promise<void>;
}

function DroppableColumn({
  status,
  label,
  ideas,
  updateStatus,
  deleteIdea,
}: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({
    id: `column-${status}`,
  });

  return (
    <SortableContext
      id={`column-${status}`}
      items={ideas.map((idea) => idea.id)}
      strategy={verticalListSortingStrategy}
    >
      <div ref={setNodeRef} className="column" data-status={status}>
        <div className="column-header">
          <span className="column-title">{label}</span>
          <span className="column-count">{ideas.length}</span>
        </div>

        {ideas.length === 0 ? (
          <div className="empty-state" style={{ minHeight: "200px" }}>
            لا توجد أفكار
          </div>
        ) : (
          ideas.map((idea) => (
            <DraggableCard
              key={idea.id}
              idea={idea}
              updateStatus={updateStatus}
              deleteIdea={deleteIdea}
            />
          ))
        )}
      </div>
    </SortableContext>
  );
}

interface DraggableCardProps {
  idea: Idea;
  updateStatus: (id: string, status: IdeaStatus) => Promise<void>;
  deleteIdea: (id: string) => Promise<void>;
}

function DraggableCard({ idea, updateStatus, deleteIdea }: DraggableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: idea.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="card"
    >
      <div className="card-title">{idea.title}</div>
      <div className="card-summary">{idea.summary}</div>
      {idea.sourceName && (
        <div className="card-source">
          <span
            className="source-badge"
            style={{
              backgroundColor:
                SOURCE_COLORS[idea.sourceName] ?? "#6b7280",
            }}
          >
            {idea.sourceName}
          </span>
          {idea.sourceUrl && (
            <a
              href={idea.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
              onClick={(e) => e.stopPropagation()}
            >
              رابط المصدر
            </a>
          )}
        </div>
      )}
      <div className="card-actions">
        {NEXT_STATUS[idea.status] && (
          <button
            className={`action-btn ${idea.status === "inbox" ? "btn-approve" : "btn-execute"}`}
            onClick={(e) => {
              e.stopPropagation();
              updateStatus(idea.id, NEXT_STATUS[idea.status]!);
            }}
          >
            {NEXT_LABEL[idea.status]}
          </button>
        )}
        {idea.status !== "archived" && (
          <button
            className="action-btn btn-archive"
            onClick={(e) => {
              e.stopPropagation();
              updateStatus(idea.id, "archived");
            }}
          >
            أرشفة
          </button>
        )}
        {idea.status === "archived" && (
          <button
            className="action-btn btn-inbox"
            onClick={(e) => {
              e.stopPropagation();
              updateStatus(idea.id, "inbox");
            }}
          >
            استرجاع
          </button>
        )}
        <button
          className="action-btn btn-delete"
          onClick={(e) => {
            e.stopPropagation();
            deleteIdea(idea.id);
          }}
        >
          حذف
        </button>
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const showToast = (message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchIdeas = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch(`${API_URL}/ideas`);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json = (await res.json()) as { data: Idea[] };
      setIdeas(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setFetchError(`فشل تحميل الأفكار: ${msg}`);
      console.error("fetchIdeas error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/ideas/sources`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: string[] };
      setAvailableSources(json.data);
    } catch (err) {
      console.error("fetchSources error:", err);
    }
  }, []);

  useEffect(() => {
    fetchIdeas();
    fetchSources();
  }, [fetchIdeas, fetchSources]);

  const updateStatus = async (id: string, status: IdeaStatus) => {
    const res = await fetch(`${API_URL}/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setIdeas((prev) =>
        prev.map((idea) => (idea.id === id ? { ...idea, status } : idea))
      );
    }
  };

  const deleteIdea = async (id: string) => {
    const res = await fetch(`${API_URL}/ideas/${id}`, { method: "DELETE" });
    if (res.ok) {
      setIdeas((prev) => prev.filter((idea) => idea.id !== id));
    }
  };

  const generateIdeas = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/ideas/generate`, { method: "POST" });
      const json = (await res.json()) as {
        data: Idea[];
        stats?: { generated: number; duplicates: number; inserted: number };
      };
      if (res.ok) {
        setIdeas((prev) => [...json.data, ...prev]);
        const stats = json.stats;
        const msg = stats
          ? `\u062A\u0645 \u062A\u0648\u0644\u064A\u062F ${stats.inserted} \u0641\u0643\u0631\u0629 \u062C\u062F\u064A\u062F\u0629 (${stats.duplicates} \u0645\u0643\u0631\u0631\u0629)`
          : `\u062A\u0645 \u062A\u0648\u0644\u064A\u062F ${json.data.length} \u0641\u0643\u0631\u0629 \u062C\u062F\u064A\u062F\u0629`;
        showToast(msg);
        fetchSources();
      } else {
        showToast("\u0641\u0634\u0644 \u062A\u0648\u0644\u064A\u062F \u0627\u0644\u0623\u0641\u0643\u0627\u0631", true);
      }
    } catch {
      showToast("\u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u062E\u0627\u062F\u0645", true);
    } finally {
      setGenerating(false);
    }
  };

  const filteredIdeas =
    sourceFilter === "all"
      ? ideas
      : ideas.filter((idea) => idea.sourceName === sourceFilter);

  const ideasByStatus = (status: IdeaStatus) =>
    filteredIdeas.filter((idea) => idea.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdea = ideas.find((idea) => idea.id === active.id);
    if (!activeIdea) return;

    // Extract status from the droppable id (format: "column-{status}")
    const newStatus = over.id.toString().replace("column-", "") as IdeaStatus;

    if (activeIdea.status !== newStatus) {
      updateStatus(activeIdea.id, newStatus);
    }
  };

  const activeIdea = activeId ? ideas.find((idea) => idea.id === activeId) : null;

  return (
    <>
      <header className="header">
        <h1>{"\u{1F4A1}"} \u0646\u0638\u0627\u0645 \u062A\u0648\u0644\u064A\u062F \u0627\u0644\u0623\u0641\u0643\u0627\u0631 \u0627\u0644\u062A\u0642\u0646\u064A\u0629</h1>
        <div className="header-actions">
          <select
            className="source-filter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0635\u0627\u062F\u0631</option>
            {availableSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <button
            className="generate-btn"
            onClick={generateIdeas}
            disabled={generating}
          >
            {generating
              ? "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u0648\u0644\u064A\u062F..."
              : "\u26A1 \u062A\u0648\u0644\u064A\u062F \u0623\u0641\u0643\u0627\u0631 \u062C\u062F\u064A\u062F\u0629"}
          </button>
        </div>
      </header>

      {fetchError && (
        <div className="toast error" style={{ position: "relative", marginBottom: "1rem" }}>
          {fetchError}
          <button className="action-btn" onClick={fetchIdeas} style={{ marginInlineStart: "0.5rem" }}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {loading ? (
        <div className="board">
          <div className="loading-container">
            <div className="spinner"></div>
            <div className="empty-state">جاري التحميل...</div>
          </div>
        </div>
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {COLUMNS.map(({ status, label }) => (
            <DroppableColumn
              key={status}
              status={status}
              label={label}
              ideas={ideasByStatus(status)}
              updateStatus={updateStatus}
              deleteIdea={deleteIdea}
            />
          ))}
        </div>
        <DragOverlay>
          {activeIdea ? (
            <div className="card" style={{ opacity: 0.9 }}>
              <div className="card-title">{activeIdea.title}</div>
              <div className="card-summary">{activeIdea.summary}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}

      {toast && (
        <div className={`toast${toast.error ? " error" : ""}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
