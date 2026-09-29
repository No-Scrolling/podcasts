import { useShowImages } from "../lib/appearance";
import { Screen, PlayingScreen, LoadingState, EmptyState, ErrorState, useAction, useSnapshot, navigate } from "ink";
import { usePodcastPlayer } from "../lib/player";
import { download, downloadDone, schedule, graphicEq } from "ink/icons";
import { downloads, downloadEpisode, removeDownload } from "../lib/downloads";
import { useSleepTimer } from "../lib/sleep-timer";
import { currentEpisode } from "../lib/current-episode";
import { playbackSettings } from "../lib/playback-settings";
export default function Playing() {
  const showImages = useShowImages();
  const player = usePodcastPlayer();
  const { state } = player;
  const downloaded = useSnapshot(downloads);
  const timer = useSleepTimer(player.state.ended);
  const transfer = useAction(async () => {
    const item = state.current;
    if (!item) return;
    const existing = downloaded.status === "ready" ? downloaded.data.find(entry => entry.id === item.id) : undefined;
    if (existing?.status === "failed") await removeDownload(item.id);
    const episode = await currentEpisode.get();
    await downloadEpisode(item.id, existing?.url ?? item.src, item.title, { artist: item.artist, artwork: item.artwork, duration: state.duration, date: episode.id === item.id ? episode.date : existing?.date });
  });
  const saved = useSnapshot(playbackSettings);
  const recover = useAction(player.toggle);
  if (transfer.status === "error") return <Screen title="Download"><ErrorState message={transfer.error.message} onRetry={transfer.run} /></Screen>;
  const error = state.error ?? (recover.status === "error" ? recover.error : null);
  if (error) return <Screen title="Playing"><ErrorState message={error.message} onRetry={recover.run} /></Screen>;
  if (saved.status === "error") return <Screen title="Playing"><ErrorState message={saved.error.message} onRetry={() => { void playbackSettings.get(); }} /></Screen>;
  if (!state.ready || saved.status === "loading") return <Screen title="Playing"><LoadingState /></Screen>;
  if (!state.current) return <Screen title="Playing"><EmptyState title="Nothing playing" /></Screen>;
  const item = state.current;
  const entry = downloaded.status === "ready" ? downloaded.data.find(entry => entry.id === item.id) : undefined;
  const downloadAction = entry?.status === "finished"
    ? { icon: downloadDone, disabled: true, onPress: () => {} }
    : entry?.status === "downloading" || transfer.status === "pending"
      ? { label: `${entry?.progress ?? 0}%`, disabled: true, onPress: () => {} }
      : { icon: download, onPress: transfer.run };
  const showId = item.id.split("/", 1)[0];
  return <PlayingScreen image={showImages ? item.artwork || undefined : undefined} title={item.title}
    onTitlePress={() => navigate({ path: "/episode-details", params: { showId, episodeId: item.id.slice(showId.length + 1), fromPlayer: true } })}
    artists={[{ name: item.artist ?? "", onPress: showId ? () => navigate({ path: "/show/[id]", params: { id: showId } }) : undefined }]}
    actions={[downloadAction, { icon: schedule, selected: timer.status === "ready" && timer.data.mode !== "off", onPress: () => navigate("/sleep-timer") }, { icon: graphicEq, selected: state.skipSilence || state.voiceBoost, onPress: () => navigate("/effects") }, { label: `${state.speed}x`, onPress: () => navigate("/speed") }]}
    playback={player}
    previous={{ seconds: saved.data.back }}
    next={{ seconds: saved.data.forward }} />;
}
