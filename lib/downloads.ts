import * as v from "valibot";
import { resource } from "ink";
import { callNative } from "ink/native";

const optionalText = v.fallback(v.optional(v.string()), undefined);
const downloadSchema = v.pipe(v.object({
  id: v.string(),
  url: v.string(),
  title: v.fallback(v.string(), "Episode"),
  artist: optionalText,
  artwork: optionalText,
  duration: v.fallback(v.optional(v.number()), undefined),
  date: optionalText,
  status: v.picklist(["downloading", "finished", "failed"]),
  progress: v.fallback(v.nullable(v.pipe(v.number(), v.transform(value => Math.min(99, Math.max(0, value))))), null),
  bytes: v.fallback(v.number(), 0),
  file: v.fallback(v.optional(v.object({ src: optionalText })), undefined),
}), v.transform(({ file, ...download }) => ({ ...download, src: file?.src })));
export type Download = v.InferOutput<typeof downloadSchema>;

const downloadState = resource({
  key: () => ["downloads"],
  async load(): Promise<Download[]> {
    return v.parse(v.array(downloadSchema), JSON.parse(
      await callNative("podcast-downloads", "state", {}, { timeoutMs: 120_000 }),
    ));
  },
})();

let subscribers = 0;
let poll: ReturnType<typeof setTimeout> | undefined;

function scheduleProgress() {
  clearTimeout(poll);
  poll = undefined;
  const state = downloadState.getSnapshot();
  if (subscribers && state.status === "ready" && !state.refreshing && !state.refreshError
    && state.data.some(item => item.status === "downloading")) {
    poll = setTimeout(() => { void downloadState.refresh(); }, 50);
  }
}

export const downloads = {
  getSnapshot: downloadState.getSnapshot,
  refresh: downloadState.refresh,
  subscribe(listener: () => void) {
    subscribers++;
    const unsubscribe = downloadState.subscribe(() => {
      scheduleProgress();
      listener();
    });
    scheduleProgress();
    return () => {
      unsubscribe();
      subscribers--;
      if (!subscribers) {
        clearTimeout(poll);
        poll = undefined;
      }
    };
  },
};

export async function downloadEpisode(id: string, url: string, title: string, metadata: Pick<Download, "artist" | "artwork" | "duration" | "date"> = {}) {
  await callNative("podcast-downloads", "start", { id, url, title, ...metadata }, { timeoutMs: 120_000 });
  await downloads.refresh();
}

export async function removeDownload(id: string) {
  await callNative("podcast-downloads", "remove", { id });
  await downloads.refresh();
}

export function downloadProgressLabel(download?: Download) {
  return download?.progress == null ? "Downloading…" : `${download.progress}%`;
}
