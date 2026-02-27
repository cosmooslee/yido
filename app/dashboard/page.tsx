'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type BlockedUrl = {
  id: string;
  url: string;
  created_at: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [urls, setUrls] = useState<BlockedUrl[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusEndAt, setFocusEndAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    const init = async () => {
      setError(null);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace("/login");
          return;
        }

        await fetchUrls();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "데이터를 불러오는 중 오류가 발생했습니다.";
        setError(message);
      } finally {
        setInitialized(true);
      }
    };

    void init();
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("focus_end_at");
    if (stored) {
      const endAt = Number(stored);
      if (!Number.isNaN(endAt) && endAt > Date.now()) {
        setFocusEndAt(endAt);
        setRemainingSeconds(Math.floor((endAt - Date.now()) / 1000));
      } else {
        window.localStorage.removeItem("focus_end_at");
      }
    }
  }, []);

  useEffect(() => {
    if (!focusEndAt) return;

    const id = window.setInterval(() => {
      const diff = Math.floor((focusEndAt - Date.now()) / 1000);
      if (diff <= 0) {
        window.clearInterval(id);
        setFocusEndAt(null);
        setRemainingSeconds(0);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("focus_end_at");
        }
        return;
      }
      setRemainingSeconds(diff);
    }, 1000);

    return () => window.clearInterval(id);
  }, [focusEndAt]);

  const fetchUrls = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error: selectError } = await supabase
        .from("blocked_urls")
        .select("id, url, created_at")
        .order("created_at", { ascending: false });

      if (selectError) {
        throw selectError;
      }

      setUrls(data ?? []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "목록을 불러오는 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setLoadingList(false);
    }
  };

  const handleAddUrl = async () => {
    if (!newUrl.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { error: insertError } = await supabase.from("blocked_urls").insert({
        url: newUrl.trim(),
        user_id: user.id,
      });

      if (insertError) {
        throw insertError;
      }

      setNewUrl("");
      await fetchUrls();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "URL을 추가하는 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUrl = async (id: string) => {
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { error: deleteError } = await supabase
        .from("blocked_urls")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      setUrls((prev) => prev.filter((item) => item.id !== id));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "URL을 삭제하는 중 오류가 발생했습니다.";
      setError(message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleStartFocus = async () => {
    if (urls.length === 0) {
      setError("차단할 URL이 없습니다. 먼저 URL을 추가해 주세요.");
      return;
    }

    setFocusLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urls: urls.map((item) => item.url),
        }),
      });

      const data = await response.json();

      if (!response.ok || data?.success === false) {
        const message =
          data?.error ?? "Cloudflare 차단 규칙을 생성하는 중 오류가 발생했습니다.";
        throw new Error(message);
      }

      const fourHoursMs = 4 * 60 * 60 * 1000;
      const endAt = Date.now() + fourHoursMs;

      setFocusEndAt(endAt);
      setRemainingSeconds(Math.floor(fourHoursMs / 1000));

      if (typeof window !== "undefined") {
        window.localStorage.setItem("focus_end_at", String(endAt));
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "집중 모드를 시작하는 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setFocusLoading(false);
    }
  };

  const formatRemaining = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const pad = (v: number) => v.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-4xl flex-col gap-6 rounded-2xl bg-white p-8 shadow-xl shadow-zinc-200/60 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:shadow-none dark:ring-zinc-800">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              나만의 집중 대시보드
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              집중을 방해하는 웹사이트를 URL 목록으로 관리해 보세요.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            로그아웃
          </button>
        </header>

        <section className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                4시간 집중 모드
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                버튼을 누르면 등록된 URL이 Cloudflare Zero Trust를 통해 차단되고,
                4시간 카운트다운이 시작됩니다.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white px-3 py-1.5 text-xs font-mono text-zinc-800 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-800">
                {focusEndAt
                  ? `남은 시간 ${formatRemaining(remainingSeconds)}`
                  : "아직 집중 모드가 시작되지 않았습니다."}
              </div>
              <button
                type="button"
                onClick={handleStartFocus}
                disabled={focusLoading || urls.length === 0}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-emerald-50 shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {focusLoading ? "시작 중..." : "4시간 집중 모드 시작"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            차단할 URL 추가
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            예: https://www.youtube.com, https://twitter.com
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="집중을 방해하는 사이트 주소를 입력하세요"
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-transparent focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-zinc-50"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              disabled={submitting || !newUrl.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {submitting ? "추가 중..." : "URL 추가"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              차단 URL 목록
            </h2>
            <button
              type="button"
              onClick={() => void fetchUrls()}
              disabled={loadingList}
              className="text-xs text-zinc-500 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingList ? "새로고침 중..." : "새로고침"}
            </button>
          </div>

          {error && (
            <p className="mt-2 text-xs text-red-500" role="alert">
              {error}
            </p>
          )}

          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
            {loadingList && urls.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                목록을 불러오는 중입니다...
              </p>
            ) : urls.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                아직 등록된 URL이 없습니다. 위 입력창에 주소를 추가해 보세요.
              </p>
            ) : (
              urls.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-950 dark:ring-zinc-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">
                      {item.url}
                    </p>
                    {item.created_at && (
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUrl(item.id)}
                    className="text-xs text-zinc-400 transition hover:text-red-500"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

