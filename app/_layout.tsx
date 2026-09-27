import { useEffect, useLayoutEffect, useRef } from "react";
import { Slot } from "ink";
import { callNative, onNativeMessage } from "ink/native";
import { usePlayer, type PlayerState } from "@ink/audio";
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
  const savedAt = useRef(0);
  useEffect(() => {
    const state = player.state;
    const last = previous.current;
    if (!state.current || !state.ready || state.buffering || state.error) return;
    previous.current = state;
    const changedEpisode = state.current.id !== last?.current?.id;
    if (changedEpisode) {
      savedAt.current = Date.now();
      return;
    }
    const paused = last?.playWhenReady && !state.playWhenReady;
    const ended = state.ended && !last?.ended;
    const checkpoint = state.playing && Date.now() - savedAt.current >= 30_000;
    if (!paused && !ended && !checkpoint) return;
    savedAt.current = Date.now();
    void saveProgress(state).catch(error => console.error("Could not save episode progress", error));
  }, [player.state]);
  useEffect(() => {
    const save = () => {
      savedAt.current = Date.now();
      void saveProgress(current.current).catch(error => console.error("Could not save episode progress", error));
    };
    const unsubscribe = onNativeMessage("pause", save);
    return () => { unsubscribe(); save(); };
  }, []);
  async function switchToDownloadedSource(position: number) {
    const state = current.current;
    const saved = downloads.getSnapshot();
    const item = state.current;
    if (!item || saved.status !== "ready") return false;
    const local = saved.data.find(download => download.id === item.id && download.status === "finished");
    if (!local?.src || local.src === item.src) return false;
    await player.setQueue([{ ...item, src: local.src, duration: state.duration }], { startPosition: position });
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
      const state = current.current;
      if (!state.playWhenReady) {
        await callNative("podcast-sleep-timer", "resume", {});
        await switchToDownloadedSource(state.ended ? 0 : state.position);
      }
      await player.toggle();
    },
    async setQueue(...args: Parameters<typeof player.setQueue>) {
      autoplay.cancel();
      await saveProgress(current.current);
      await player.setQueue(...args);
    },
    async seek(position: number) {
      autoplay.cancel();
      const state = current.current;
      if (!await switchToDownloadedSource(position)) await player.seek(position);
      await saveProgress({ ...state, position: Math.max(0, Math.min(position, state.duration)), ended: false, buffering: false });
      savedAt.current = Date.now();
    },
  };
  return <PodcastPlayerContext.Provider value={controls}><Slot /></PodcastPlayerContext.Provider>;
}
