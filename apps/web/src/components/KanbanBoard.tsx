"use client";

import { useState, useEffect, useCallback } from "react";
import type { Idea, IdeaStatus } from "@sultan-saif/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const COLUMNS: { status: IdeaStatus; label: string }[] = [
  { status: "inbox", label: "📥 الوارد" },
  { status: "approved", label: "✅ موافق عليها" },
  { status: "in_execution", label: "🚀 قيد التنفيذ" },
  { status: "archived", label: "🗄️ المؤرشف" },
];

const NEXT_STATUS: Partial<Record<IdeaStatus, IdeaStatus>> = {
  inbox: "approved",
  approved: "in_execution",
};

const NEXT_LABEL: Partial<Record<IdeaStatus, string>> = {
  inbox: "موافقة",
  approved: "تنفيذ",
};

export function KanbanBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const showToast = (message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchIdeas = useCallback(async () => {
    const res = await fetch(`${API_URL}/ideas`);
    const json = await res.json() as { data: Idea[] };
    setIdeas(json.data);
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

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
      const json = await res.json() as { data: Idea[] };
      if (res.ok) {
        setIdeas((prev) => [...json.data, ...prev]);
        showToast(`تم توليد ${json.data.length} فكرة جديدة`);
      } else {
        showToast("فشل توليد الأفكار", true);
      }
    } catch {
      showToast("خطأ في الاتصال بالخادم", true);
    } finally {
      setGenerating(false);
    }
  };

  const ideasByStatus = (status: IdeaStatus) =>
    ideas.filter((idea) => idea.status === status);

  return (
    <>
      <header className="header">
        <h1>💡 نظام توليد الأفكار التقنية</h1>
        <button
          className="generate-btn"
          onClick={generateIdeas}
          disabled={generating}
        >
          {generating ? "جاري التوليد..." : "⚡ توليد أفكار جديدة"}
        </button>
      </header>

      <div className="board">
        {COLUMNS.map(({ status, label }) => {
          const columnIdeas = ideasByStatus(status);
          return (
            <div key={status} className="column">
              <div className="column-header">
                <span className="column-title">{label}</span>
                <span className="column-count">{columnIdeas.length}</span>
              </div>

              {columnIdeas.length === 0 ? (
                <div className="empty-state">لا توجد أفكار</div>
              ) : (
                columnIdeas.map((idea) => (
                  <div key={idea.id} className="card">
                    <div className="card-title">{idea.title}</div>
                    <div className="card-summary">{idea.summary}</div>
                    {idea.sourceName && (
                      <div className="card-source">
                        المصدر:{" "}
                        {idea.sourceUrl ? (
                          <a
                            href={idea.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {idea.sourceName}
                          </a>
                        ) : (
                          idea.sourceName
                        )}
                      </div>
                    )}
                    <div className="card-actions">
                      {NEXT_STATUS[status] && (
                        <button
                          className={`action-btn ${status === "inbox" ? "btn-approve" : "btn-execute"}`}
                          onClick={() => updateStatus(idea.id, NEXT_STATUS[status]!)}
                        >
                          {NEXT_LABEL[status]}
                        </button>
                      )}
                      {status !== "archived" && (
                        <button
                          className="action-btn btn-archive"
                          onClick={() => updateStatus(idea.id, "archived")}
                        >
                          أرشفة
                        </button>
                      )}
                      {status === "archived" && (
                        <button
                          className="action-btn btn-inbox"
                          onClick={() => updateStatus(idea.id, "inbox")}
                        >
                          استرجاع
                        </button>
                      )}
                      <button
                        className="action-btn btn-delete"
                        onClick={() => deleteIdea(idea.id)}
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div className={`toast${toast.error ? " error" : ""}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
