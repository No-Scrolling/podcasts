import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AudioItem, usePlayer } from "@ink/audio";
import { callNative } from "ink/native";
import { getShow, nextEpisode } from "./catalogue";
import { currentEpisode } from "./current-episode";
import { downloads } from "./downloads";
import { playbackSettings } from "./playback-settings";
import { episodeProgress, saveProgress } from "./progress";

export function useAutoplay(player: ReturnType<typeof usePlayer>) {
  const current = useRef(player.state);
  useLayoutEffect(() => { current.current = player.state; }, [player.state]);
  const generation = useRef(0);
  const previous = useRef({ id: "", ended: true });
  const [error, setError] = useState<Error | null>(null);
  function cancel() {
    generation.current++;
    setError(null);
  }
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    const state = player.state;
    const item = state.current;
    if (!state.ready || !item) return;
    const last = previous.current;
    previous.current = { id: item.id, ended: state.ended };
    if (!state.ended || last.ended || last.id !== item.id) return;
    const request = ++generation.current;
    const valid = () => generation.current === request && current.current.current?.id === item.id;
    const allowed = async () => valid() && (await playbackSettings.get()).playNext
      && await callNative("podcast-sleep-timer", "can-autoplay", {}) === "true" && valid();
    void (async () => {
      await saveProgress(state);
      if (!await allowed()) return;
      const context = await currentEpisode.get();
      if (context.id !== item.id) return;
      const history = await episodeProgress.get();
      await downloads.refresh();
      const saved = downloads.getSnapshot();
      if (saved.status !== "ready") return;
      const available = saved.data.filter(entry => entry.status === "finished" && entry.src);
      let next: AudioItem;
      let date: string;
      if (context.source.type === "downloads") {
        const index = context.source.ids.indexOf(item.id);
        if (index < 0) return;
        const byId = new Map(available.map(entry => [entry.id, entry]));
        const id = context.source.ids.slice(index + 1).find(id => byId.has(id) && !history[id]?.finished);
        const episode = id ? byId.get(id) : undefined;
        if (!episode?.src) return;
        next = { id: episode.id, src: episode.src, title: episode.title, artist: episode.artist,
          artwork: episode.artwork, duration: episode.duration ?? history[episode.id]?.duration };
        date = episode.date ?? "";
      } else {
        const separator = item.id.indexOf("/");
        const showId = item.id.slice(0, separator);
        const prefix = `${showId}/`;
        const show = await getShow(showId);
        const finished: string[] = [];
        for (const [id, value] of Object.entries(history)) {
          if (id.startsWith(prefix) && value.finished) finished.push(id.slice(prefix.length));
        }
        const episode = await nextEpisode(show, item.id.slice(separator + 1), finished);
        if (!episode) return;
        const id = `${prefix}${episode.id}`;
        const local = available.find(entry => entry.id === id);
        next = { id, src: local?.src ?? episode.audio, title: episode.title, artist: show.title,
          album: show.title, artwork: episode.artwork, duration: episode.duration };
        date = episode.date;
      }
      const progress = (await episodeProgress.get())[next.id];
      if (progress?.finished || !await allowed()) return;
      await currentEpisode.set({ id: next.id, date, source: context.source });
      if (!valid()) return;
      await player.setQueue([next], { startPosition: progress?.position ?? 0 });
      if (await callNative("podcast-sleep-timer", "can-autoplay", {}) === "true" && generation.current === request
        && (await playbackSettings.get()).playNext) await player.play();
    })().catch(cause => {
      if (valid()) setError(cause instanceof Error ? cause : new Error(String(cause)));
    });
  }, [player.state, player.setQueue, player.play]);
  return { cancel, error };
}
