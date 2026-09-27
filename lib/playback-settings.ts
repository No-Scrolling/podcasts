import * as v from "valibot";
import { createStore } from "@ink/store";

export const seekOptions = [5, 10, 30] as const;
const seekSeconds = v.picklist(seekOptions);
export type SeekSeconds = v.InferOutput<typeof seekSeconds>;
const settings = v.object({
  playNext: v.optional(v.boolean(), false),
  back: seekSeconds,
  forward: seekSeconds,
  deleteDownloads: v.optional(v.picklist(["manual", "finished"]), "manual"),
});

export const playbackSettings = createStore<v.InferOutput<typeof settings>>({
  key: "podcasts.playback",
  version: 1,
  initial: { playNext: false, back: 10, forward: 30, deleteDownloads: "manual" },
  decode: v.parser(settings),
});
