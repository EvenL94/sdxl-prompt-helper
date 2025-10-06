"use client";
import React, { useEffect, useRef, useState } from "react";

// --- Types ---
type Shot = {
  id: string;
  title: string;
  positive: string;
  negative: string;
};

// Helper for unique ids (no external libs)
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Storage key
const LS_KEY = "sd-shot-list-v2";

// Export file signature (bump to v2 for positive/negative prompts)
const EXPORT_SIGNATURE = {
  type: "sd-shot-list",
  version: 2,
};

export default function Page() {
  const [shots, setShots] = useState<Shot[]>([
    { id: uid(), title: "分镜 1", positive: "", negative: "" },
  ]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string>("");

  // Drag & Drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // --- Load from localStorage (supports v1 and v2) ---
  useEffect(() => {
    try {
      // Try new key first
      const rawV2 = localStorage.getItem(LS_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (
          parsed?.type === EXPORT_SIGNATURE.type &&
          parsed?.version === 2 &&
          Array.isArray(parsed.items)
        ) {
          const restored: Shot[] = parsed.items.map((it: any) => ({
            id: uid(),
            title: String(it.title ?? ""),
            positive: String(it.positive ?? ""),
            negative: String(it.negative ?? ""),
          }));
          if (restored.length) return setShots(restored);
        }
      }

      // Fallback: load legacy v1 key if present
      const rawV1 = localStorage.getItem("sd-shot-list-v1");
      if (rawV1) {
        const parsed = JSON.parse(rawV1);
        if (
          parsed?.type === EXPORT_SIGNATURE.type &&
          parsed?.version === 1 &&
          Array.isArray(parsed.items)
        ) {
          const restored: Shot[] = parsed.items.map((it: any) => ({
            id: uid(),
            title: String(it.title ?? ""),
            positive: String(it.prompt ?? ""),
            negative: "",
          }));
          if (restored.length) setShots(restored);
        }
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist to localStorage on change (save as v2)
  useEffect(() => {
    const payload = {
      ...EXPORT_SIGNATURE,
      items: shots.map(({ title, positive, negative }) => ({
        title,
        positive,
        negative,
      })),
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (e) {
      // ignore quota errors
    }
  }, [shots]);

  const addShotAfter = (index: number) => {
    setShots((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, {
        id: uid(),
        title: `分镜 ${prev.length + 1}`,
        positive: "",
        negative: "",
      });
      return copy;
    });
  };

  const addShotToEnd = () => addShotAfter(shots.length - 1);

  const updateShot = (index: number, patch: Partial<Shot>) => {
    setShots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const removeShot = (index: number) => {
    setShots((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev
    );
  };

  const reorderShots = (from: number, to: number) => {
    setShots((prev) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= prev.length ||
        to >= prev.length
      )
        return prev;
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  };

  const handleExport = () => {
    const payload = {
      ...EXPORT_SIGNATURE,
      exportedAt: new Date().toISOString(),
      items: shots.map(({ title, positive, negative }) => ({
        title,
        positive,
        negative,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `sd-shot-list-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMessage("已导出为 .txt（JSON v2 格式）。");
    setTimeout(() => setMessage(""), 2000);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  // Import supports v2 (positive/negative) and legacy v1 (prompt-only)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text);
        if (
          !parsed ||
          parsed.type !== EXPORT_SIGNATURE.type ||
          !Array.isArray(parsed.items)
        ) {
          throw new Error("导入的文件不是有效的 sd-shot-list 格式");
        }

        let next: Shot[] = [];
        if (parsed.version === 2) {
          next = parsed.items.map((it: any) => ({
            id: uid(),
            title: String(it.title ?? ""),
            positive: String(it.positive ?? ""),
            negative: String(it.negative ?? ""),
          }));
        } else if (parsed.version === 1) {
          // Legacy: map prompt -> positive
          next = parsed.items.map((it: any) => ({
            id: uid(),
            title: String(it.title ?? ""),
            positive: String(it.prompt ?? ""),
            negative: "",
          }));
        } else {
          throw new Error("不支持的版本号");
        }

        if (!next.length) throw new Error("导入内容为空");
        setShots(next);
        setMessage(
          `已导入 ${next.length} 条分镜（版本 v${parsed.version}），当前内容已覆盖。`
        );
        setTimeout(() => setMessage(""), 2500);
      } catch (err: any) {
        alert(err?.message || "导入失败：无法解析文件");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  // Drag handlers for each item
  const onDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    setOverIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const onDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  };

  const onDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndex ?? Number(e.dataTransfer.getData("text/plain"));
    const to = index;
    if (!Number.isNaN(from)) reorderShots(from, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  const onDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            SD 分镜 Prompt 管理器
          </h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleImportClick}
              className="rounded-2xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 active:scale-[0.99]"
            >
              导入 TXT
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,application/json,text/plain"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={handleExport}
              className="rounded-2xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 active:scale-[0.99]"
            >
              导出 TXT
            </button>
            <button
              onClick={addShotToEnd}
              className="rounded-2xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white active:scale-[0.99]"
            >
              + 新建分镜
            </button>
          </div>
        </header>

        {message && (
          <p className="mt-3 text-sm text-emerald-400" role="status">
            {message}
          </p>
        )}

        {/* Tips */}
        <div className="mt-4 text-xs text-neutral-500">
          提示：按住卡片空白处拖拽即可排序；已支持删除按钮。现在可分别编辑{" "}
          <span className="font-semibold text-neutral-300">Positive</span> 与{" "}
          <span className="font-semibold text-neutral-300">Negative</span>{" "}
          Prompt。
        </div>

        {/* List */}
        <section className="mt-4 space-y-6">
          {shots.map((shot, index) => {
            const isDragging = dragIndex === index;
            const isOver =
              overIndex === index && dragIndex !== null && dragIndex !== index;
            return (
              <article
                key={shot.id}
                draggable
                onDragStart={onDragStart(index)}
                onDragOver={onDragOver(index)}
                onDrop={onDrop(index)}
                onDragEnd={onDragEnd}
                onDragLeave={() => setOverIndex(null)}
                className={
                  "rounded-2xl border bg-neutral-900/40 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition-all " +
                  (isDragging
                    ? " border-emerald-400/60 ring-2 ring-emerald-400/40"
                    : isOver
                    ? " border-emerald-400/40 ring-1 ring-emerald-400/30"
                    : " border-neutral-800")
                }
                style={{ cursor: "grab" }}
                title="拖拽以重新排序"
              >
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm text-neutral-300">Title</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeShot(index)}
                      className="rounded-xl border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
                      title="删除该分镜"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <input
                  value={shot.title}
                  onChange={(e) => updateShot(index, { title: e.target.value })}
                  placeholder="例如：镜头切入主角面部"
                  className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-700"
                />

                {/* Positive */}
                <div className="mt-4 flex items-center justify-between">
                  <label className="text-sm text-neutral-300">
                    Positive Prompt
                  </label>
                  <span className="text-xs text-neutral-500">可多行</span>
                </div>
                <textarea
                  value={shot.positive}
                  onChange={(e) =>
                    updateShot(index, { positive: e.target.value })
                  }
                  placeholder="正向提示词：masterpiece, ultra-detailed, cinematic lighting, ..."
                  rows={5}
                  className="mt-2 w-full resize-y rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-neutral-700"
                />

                {/* Negative */}
                <div className="mt-4 flex items-center justify-between">
                  <label className="text-sm text-neutral-300">
                    Negative Prompt
                  </label>
                  <span className="text-xs text-neutral-500">可多行</span>
                </div>
                <textarea
                  value={shot.negative}
                  onChange={(e) =>
                    updateShot(index, { negative: e.target.value })
                  }
                  placeholder="负向提示词：lowres, bad anatomy, blurry, ..."
                  rows={5}
                  className="mt-2 w-full resize-y rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-neutral-700"
                />

                {/* Action Row */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => addShotAfter(index)}
                    className="rounded-xl bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white active:scale-[0.99]"
                  >
                    + 在下方添加分镜
                  </button>
                  <div className="text-xs text-neutral-500">#{index + 1}</div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Footer / Help */}
        <footer className="mt-10 border-t border-neutral-800 pt-4 text-xs leading-6 text-neutral-400">
          <p>
            导出格式说明（v2）：生成的 <code>.txt</code> 文件为 JSON
            文本，结构如下：
          </p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <code>{`{
  "type": "sd-shot-list",
  "version": 2,
  "exportedAt": "ISO8601 时间",
  "items": [
    { "title": "分镜 1", "positive": "...", "negative": "..." },
    { "title": "分镜 2", "positive": "...", "negative": "..." }
  ]
}`}</code>
          </pre>
          <p className="mt-2">
            兼容导入旧版 v1（将旧字段 <code>prompt</code> 自动映射为{" "}
            <code>positive</code>）。
          </p>
        </footer>
      </div>
    </main>
  );
}
