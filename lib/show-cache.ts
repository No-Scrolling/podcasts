import type { ResourceSnapshot, ResourceSource } from "ink";
import { getShow, episodePage, type Show, type EpisodePage } from "./catalogue";

type ShowDetails = { show: Show } & EpisodePage;
const STALE_TIME = 5 * 60_000;

export function createShowDetails() {
  const entries = new Map<string, ReturnType<typeof entry>>();

  function entry(id: string) {
    let state: ResourceSnapshot<ShowDetails> = { status: "loading" };
    let pending: Promise<void> | null = null;
    let retryAt = 0;
    let updatedAt = 0;
    const listeners = new Set<() => void>();
    const publish = (next: ResourceSnapshot<ShowDetails>) => {
      state = next;
      for (const listener of listeners) listener();
    };
    function load(force = false): Promise<void> {
      if (pending) return pending;
      if (!force && (Date.now() < retryAt || state.status === "ready" && Date.now() - updatedAt < STALE_TIME)) return Promise.resolve();
      pending = Promise.resolve().then(async () => {
        const show = await getShow(id);
        if (state.status !== "ready") {
          const cached = await episodePage(show, undefined, "cached");
          if (cached) {
            updatedAt = cached.updatedAt;
            publish({ status: "ready", data: { show, ...cached }, refreshing: false, refreshError: null });
          }
        }
        if (!force && state.status === "ready" && Date.now() - updatedAt < STALE_TIME) return;
        if (state.status === "ready") publish({ ...state, refreshing: true, refreshError: null });
        const page = await episodePage(show);
        if (!page) throw new Error("Show not found");
        const data = { show, ...page };
        updatedAt = page.updatedAt;
        if (state.status === "ready" && JSON.stringify(state.data.episodes) === JSON.stringify(data.episodes)
          && state.data.total === data.total && state.data.next === data.next) {
          // Preserve the page identity so an unchanged refresh does not reset pagination.
          publish({ ...state, refreshing: false, refreshError: null });
        } else publish({ status: "ready", data, refreshing: false, refreshError: null });
        retryAt = 0;
      }).catch(cause => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        retryAt = Date.now() + 60_000;
        publish(state.status === "ready" ? { ...state, refreshing: false, refreshError: error } : { status: "error", error });
      }).finally(() => { pending = null; });
      return pending;
    }
    const source: ResourceSource<ShowDetails> = {
      getSnapshot: () => state,
      subscribe(listener) {
        listeners.add(listener);
        void load();
        return () => { listeners.delete(listener); };
      },
      refresh: () => load(true),
    };
    return { source, listeners, isPending: () => pending !== null };
  }

  return (id: string) => {
    const cached = entries.get(id) ?? entry(id);
    entries.delete(id);
    entries.set(id, cached);
    for (const [key, value] of entries) {
      if (entries.size <= 32) break;
      if (key !== id && !value.listeners.size && !value.isPending()) entries.delete(key);
    }
    return cached.source;
  };
}
