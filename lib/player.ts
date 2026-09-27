import { createContext, useContext } from "react";
import { usePlayer } from "@ink/audio";

export const PodcastPlayerContext = createContext<ReturnType<typeof usePlayer> | null>(null);

export function usePodcastPlayer() {
  const player = useContext(PodcastPlayerContext);
  if (!player) throw new Error("Podcast player is unavailable");
  return player;
}
