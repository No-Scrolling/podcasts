import * as v from "valibot";
import { createStore } from "@ink/store";
import type { PlayerState } from "@ink/audio";

const milliseconds = v.pipe(v.number(), v.finite(), v.minValue(0));
const progressSchema = v.object({
  position: milliseconds,
  duration: milliseconds,
  finished: v.boolean(),
  markedPlayed: v.optional(v.fallback(v.boolean(), false), false),
});
export type EpisodeProgress = v.InferInput<typeof progressSchema>;
export const episodeProgress = createStore<Record<string, EpisodeProgress>>({
  key: "podcasts.episode-progress",
  version: 1,
  initial: {},
  decode: v.parser(v.record(v.string(), progressSchema)),
});

export async function saveProgress(state: PlayerState) {
  if (!state.ready || !state.current || state.error || state.duration <= 0) return;
  const id = state.current.id;
  await episodeProgress.update(current => ({
    ...current,
    [id]: { position: state.position, duration: state.duration,
      markedPlayed: current[id]?.markedPlayed,
      finished: current[id]?.markedPlayed === true || state.ended || (current[id]?.finished === true && state.position >= state.duration - 1000) },
  }));
}

export function progressLabel(progress: EpisodeProgress | undefined) {
  if (!progress) return "";
  if (progress.finished) return "Finished";
  if (progress.position <= 0) return "";
  const minutes = Math.max(1, Math.ceil((progress.duration - progress.position) / 60_000));
  return `${minutes} min left`;
}

export async function markAsFinished(id: string) {
  await episodeProgress.update(current => ({
    ...current,
    [id]: { position: current[id]?.position ?? 0, duration: current[id]?.duration ?? 0,
      finished: true, markedPlayed: true },
  }));
}

export async function restartProgress(id: string) {
  await episodeProgress.update(current => ({
    ...current,
    [id]: { position: 0, duration: current[id]?.duration ?? 0, finished: false },
  }));
}
