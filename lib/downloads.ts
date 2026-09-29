import * as v from "valibot";
import type { Snapshot } from "ink";
import { attachNativeController } from "ink/native/controller";
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

const stateSchema = v.object({ revision: v.number(), items: v.array(downloadSchema) });
let snapshot: Snapshot<Download[]> = { status: "loading" };
let revision = -1;
let attachment: ReturnType<typeof attachNativeController> | undefined;
const listeners = new Set<() => void>();

function publish(value: unknown) {
  const state = v.parse(stateSchema, value);
  if (state.revision < revision) return;
  revision = state.revision;
  snapshot = { status: "ready", data: state.items };
  for (const listener of listeners) listener();
}
function failed(cause: unknown) {
  snapshot = { status: "error", error: cause instanceof Error ? cause : new Error(String(cause)) };
  for (const listener of listeners) listener();
}

function observe() {
  if (attachment) return;
  const current = attachNativeController("podcast-downloads", {}, value => {
    if (attachment !== current) return;
    try { publish(value); } catch (error) { failed(error); }
  });
  attachment = current;
  void current.ready.catch(error => {
    if (attachment === current) { attachment = undefined; failed(error); }
  });
}

export const downloads = {
  getSnapshot: () => snapshot,
  async refresh(): Promise<void> {
    if (listeners.size) observe();
    const previousRevision = revision;
    try { publish(JSON.parse(await callNative("podcast-downloads", "state", {}, { timeoutMs: 120_000 }))); }
    catch (error) { if (revision === previousRevision) failed(error); }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    observe();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        const current = attachment;
        attachment = undefined;
        void current?.dispose().catch(error => console.error("Could not stop observing downloads", error));
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
