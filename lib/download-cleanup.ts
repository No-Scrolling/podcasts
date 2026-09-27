import { useEffect, useRef } from "react";
import { useSnapshot } from "ink";
import type { usePlayer } from "@ink/audio";
import { downloads, removeDownload } from "./downloads";
import { episodeProgress } from "./progress";
import { playbackSettings } from "./playback-settings";

export function useDownloadCleanup(player: ReturnType<typeof usePlayer>) {
  const settings = useSnapshot(playbackSettings);
  const history = useSnapshot(episodeProgress);
  const saved = useSnapshot(downloads);
  const pending = useRef(new Set<string>());
  useEffect(() => {
    if (settings.status !== "ready" || settings.data.deleteDownloads !== "finished"
      || history.status !== "ready" || saved.status !== "ready" || !player.state.ready) return;
    const files = new Set<string>();
    for (const item of saved.data) {
      if (item.src && history.data[item.id]?.finished) files.add(item.src);
    }
    for (const src of pending.current) if (!files.has(src)) pending.current.delete(src);
    for (const item of saved.data) {
      if (!item.src || item.status !== "finished" || !history.data[item.id]?.finished || pending.current.has(item.src)) continue;
      const current = player.state.current;
      // Keep the file open while someone continues listening after marking it finished.
      if (current?.id === item.id && player.state.playWhenReady && !player.state.ended) continue;
      pending.current.add(item.src);
      void (async () => {
        if (current?.id === item.id && current.src === item.src) {
          await player.setQueue([{ ...current, src: item.url, duration: player.state.duration }],
            { startPosition: player.state.ended ? player.state.duration : player.state.position, prepare: false });
        }
        await removeDownload(item.id);
      })().catch(error => console.error("Could not remove finished download", error));
    }
  }, [settings, history, saved, player]);
}
