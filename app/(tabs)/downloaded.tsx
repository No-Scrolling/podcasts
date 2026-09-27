import { Screen, List, Row, EmptyState, ErrorState, LoadingState, Text, useSnapshot, useAction, navigate } from "ink";
import { graphicEq } from "ink/icons";
import { episodeInfo } from "../../lib/catalogue";
import { downloads, type Download } from "../../lib/downloads";
import { episodeProgress, restartProgress } from "../../lib/progress";
import { currentEpisode } from "../../lib/current-episode";
import { usePodcastPlayer } from "../../lib/player";

export default function Downloaded() {
  const saved = useSnapshot(downloads);
  const history = useSnapshot(episodeProgress);
  const player = usePodcastPlayer();
  const play = useAction(async (item: Download) => {
    if (!item.src) return;
    if (!player.state.ready) throw new Error("Audio player is not ready. Try again.");
    await currentEpisode.set({ id: item.id, date: item.date ?? "", source: { type: "downloads", ids: items.map(entry => entry.id) } });
    const sameEpisode = player.state.current?.id === item.id;
    if (!sameEpisode || player.state.current?.src !== item.src) {
      const progress = (await episodeProgress.get())[item.id];
      let position = progress && !progress.finished ? progress.position : 0;
      if (sameEpisode && !player.state.ended) position = player.state.position;
      await player.setQueue([{ id: item.id, src: item.src, title: item.title, artist: item.artist, artwork: item.artwork, duration: item.duration ?? progress?.duration }],
        { startPosition: position });
      if (progress?.finished) await restartProgress(item.id);
      await player.play();
    }
    navigate("/playing");
  });
  const items = saved.status === "ready" ? saved.data
    .filter(item => item.status === "finished" && item.src)
    .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0) || a.id.localeCompare(b.id)) : [];
  return <Screen wide title="Downloaded" rightAction={{ icon: graphicEq, onPress: () => navigate("/playing") }}>
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={downloads.refresh} />
      : !items.length ? <EmptyState title="No downloaded episodes" />
      : <List items={items} gap={16} keyExtractor={item => item.id} renderItem={item =>
        <Row title={item.title} titleMaxLines={2}
          subtitle={[item.artist, episodeInfo(item, history.status === "ready" ? history.data[item.id] : undefined)].filter(Boolean).join(" • ")}
          onPress={() => play.run(item)} onLongPress={() => {
            const separator = item.id.indexOf("/");
            navigate({ path: "/episode-menu", params: { fromDownloads: true, showId: item.id.slice(0, separator), episodeId: item.id.slice(separator + 1), audio: item.url, title: item.title, artist: item.artist ?? null, artwork: item.artwork ?? null, duration: item.duration ?? null, date: item.date ?? null } });
          }} />} />}
    {play.status === "error" && <Text>{play.error.message}</Text>}
  </Screen>;
}
