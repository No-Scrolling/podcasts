import * as v from "valibot";
import { createStore } from "@ink/store";

const episodeSchema = v.object({
  id: v.string(),
  date: v.string(),
  source: v.optional(v.variant("type", [
    v.object({ type: v.literal("show") }),
    v.object({ type: v.literal("downloads"), ids: v.array(v.string()) }),
  ]), { type: "show" }),
});

export const currentEpisode = createStore<v.InferOutput<typeof episodeSchema>>({
  key: "podcasts.current-episode",
  version: 1,
  initial: { id: "", date: "", source: { type: "show" } },
  decode: v.parser(episodeSchema),
});
