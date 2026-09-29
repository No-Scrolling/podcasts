import { useEffect, useLayoutEffect, useRef } from "react";
import { Slot } from "ink";
import { callNative, onNativeMessage } from "ink/native";
import { usePlayer, type PlayerState, type SourceReplacement } from "@ink/audio";
import { useAutoplay } from "../lib/autoplay";
import { useAppearance } from "../lib/appearance";
import { PodcastPlayerContext } from "../lib/player";
import { useDownloadCleanup } from "../lib/download-cleanup";
import { downloads } from "../lib/downloads";
import { saveProgress } from "../lib/progress";

export default function Layout() {
  useAppearance();
  const player = usePlayer({ session: "podcasts", mode: "detached", usage: "speech" });
  useDownloadCleanup(player);
  const autoplay = useAutoplay(player);
  const current = useRef(player.state);
  useLayoutEffect(() => { current.current = player.state; }, [player.state]);
  const previous = useRef<PlayerState | null>(null);
  useEffect(() => {
    const state = player.state;
    const last = previous.current;
    if (!state.current || !state.ready || state.buffering || state.error) return;
    previous.current = state;
    const changedEpisode = state.current.id !== last?.current?.id;
    if (changedEpisode) return;
    const paused = last?.playWhenReady && !state.playWhenReady;
    const ended = state.ended && !last?.ended;
    if (!paused && !ended) return;
    void saveProgress(state).catch(error => console.error("Could not save episode progress", error));
  }, [player.state]);
  useEffect(() => {
    if (!player.state.ready) return;
    const save = async () => saveProgress(await player.getState());
    const checkpoint = setInterval(() => {
      if (current.current.playing) void save().catch(error => console.error("Could not save episode progress", error));
    }, 30_000);
    const unsubscribe = onNativeMessage("pause", () => {
      void save().catch(error => console.error("Could not save episode progress", error));
    });
    return () => { clearInterval(checkpoint); unsubscribe(); };
  }, [player.state.ready, player.getState]);
  async function switchToDownloadedSource(state: PlayerState, options: SourceReplacement = {}) {
    const saved = downloads.getSnapshot();
    const item = state.current;
    if (!item || saved.status !== "ready") return false;
    const local = saved.data.find(download => download.id === item.id && download.status === "finished");
    if (!local?.src || local.src === item.src) return false;
    await player.replaceSource(item.id, local.src, options);
    return true;
  }
  const controls = {
    ...player,
    state: { ...player.state, error: player.state.error ?? autoplay.error },
    async play() {
      autoplay.cancel();
      await callNative("podcast-sleep-timer", "resume", {});
      await player.play();
    },
    async pause() {
      autoplay.cancel();
      await player.pause();
    },
    async toggle() {
      autoplay.cancel();
      const state = await player.getState();
      if (!state.playWhenReady) {
        await callNative("podcast-sleep-timer", "resume", {});
        await switchToDownloadedSource(state, state.ended ? { position: 0 } : {});
      }
      await player.toggle();
    },
    async setQueue(...args: Parameters<typeof player.setQueue>) {
      autoplay.cancel();
      if (current.current.ready) await saveProgress(await player.getState());
      await player.setQueue(...args);
    },
    async seekBy(offset: number) {
      if (!Number.isSafeInteger(offset)) throw new RangeError("Seek offset must be a safe integer in milliseconds");
      autoplay.cancel();
      const state = await player.getState();
      if (!await switchToDownloadedSource(state, { offset })) await player.seekBy(offset);
      await saveProgress(await player.getState());
    },
    async seek(position: number) {
      autoplay.cancel();
      if (!await switchToDownloadedSource(await player.getState(), { position })) await player.seek(position);
      await saveProgress(await player.getState());
    },
  };
  return <PodcastPlayerContext.Provider value={controls}><Slot /></PodcastPlayerContext.Provider>;
}
