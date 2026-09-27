import * as v from "valibot";
import { Screen, Stack, Text, LoadingState, ErrorState, useRouteParams, useSnapshot, useAction, navigate, back } from "ink";
import { episodeDetails, episodeInfo } from "../lib/catalogue";
import { EpisodeDescription } from "../components/episode-description";
import { usePodcastPlayer } from "../lib/player";
import { downloads } from "../lib/downloads";
import { currentEpisode } from "../lib/current-episode";
import { episodeProgress, restartProgress } from "../lib/progress";

const parseParams = v.parser(v.object({
  showId: v.string(), episodeId: v.string(),
  fromPlayer: v.fallback(v.boolean(), false),
  fromDownloads: v.fallback(v.boolean(), false),
}));

export default function EpisodeDetails() {
  const { showId, episodeId, fromPlayer, fromDownloads } = useRouteParams(parseParams);
  const source = episodeDetails(showId, episodeId);
  const result = useSnapshot(source);
  const player = usePodcastPlayer();
  const playAt = useAction(async (position: number) => {
    if (result.status !== "ready") return;
    if (!player.state.ready) throw new Error("Audio player is not ready. Try again.");
    const { episode, show } = result.data;
    const id = `${showId}/${episodeId}`;
    if ((await episodeProgress.get())[id]?.finished) await restartProgress(id);
    if (player.state.current?.id === id) {
      await player.seek(position);
    } else {
      await downloads.refresh();
      const saved = downloads.getSnapshot();
      if (saved.status === "error") throw saved.error;
      const finished = saved.status === "ready" ? saved.data.filter(item => item.status === "finished" && item.src) : [];
      const local = finished.find(item => item.id === id);
      await currentEpisode.set({ id, date: episode.date, source: fromDownloads
        ? { type: "downloads", ids: finished.map(item => item.id) } : { type: "show" } });
      await player.setQueue([{ id, src: local?.src ?? episode.audio, title: episode.title,
        artist: show.title, album: show.title, artwork: episode.artwork, duration: episode.duration }], { startPosition: position });
    }
    await player.play();
    if (fromPlayer) back();
    else navigate("/playing");
  });
  return <Screen title="Episode details" wide>
    {result.status === "loading" ? <LoadingState /> : result.status === "error"
      ? <ErrorState message={result.error.message} onRetry={source.refresh} /> : <>
        <Stack gap={2}>
          <Text size={28}>{result.data.episode.title}</Text>
          <Text size={20}>{result.data.show.title}</Text>
          <Text size={20}>{episodeInfo(result.data.episode)}</Text>
        </Stack>
        {playAt.status === "error" && <Text>{playAt.error.message}</Text>}
        <EpisodeDescription parts={result.data.description} duration={result.data.episode.duration} onTimestamp={playAt.run} />
      </>}
  </Screen>;
}
