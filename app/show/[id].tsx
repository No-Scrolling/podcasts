import { useShowImages } from "../../lib/appearance";
import { useState } from "react";
import { Screen, Stack, Image, Text, List, Row, LoadingState, ErrorState, EmptyState, useSnapshot, useRouteParams, useAction, navigate } from "ink";
import { downloadDone, star, starFilled } from "ink/icons";
import { showDetails, episodePage, episodeInfo, type Episode, type Show } from "../../lib/catalogue";
import { favourites, toggleStar } from "../../lib/library";
import { episodeProgress, restartProgress } from "../../lib/progress";
import { downloads, downloadProgressLabel } from "../../lib/downloads";
import { currentEpisode } from "../../lib/current-episode";
import { usePodcastPlayer } from "../../lib/player";

export default function ShowPage() {
  const showImages = useShowImages();
  const { id } = useRouteParams("/show/[id]");
  const source = showDetails(id);
  const result = useSnapshot(source);
  const initial = result.status === "ready" ? result.data : null;
  const [pages, setPages] = useState(initial);
  const [previous, setPrevious] = useState(initial);
  if (previous !== initial) {
    setPrevious(initial);
    setPages(current => {
      if (!current || !initial || current.show.id !== initial.show.id || initial.next === null) return initial;
      const ids = new Set(initial.episodes.map(episode => episode.id));
      const tail = current.episodes.slice(previous?.episodes.length ?? 0).filter(episode => !ids.has(episode.id));
      return tail.length ? { ...initial, episodes: [...initial.episodes, ...tail], next: current.next } : initial;
    });
  }
  const catalogue = previous === initial ? pages : initial;
  async function loadMore() {
    if (!catalogue?.next) return;
    const next = await episodePage(catalogue.show, catalogue.next);
    if (!next) return;
    setPages(current => current === catalogue
      ? { ...current, ...next, episodes: [...current.episodes, ...next.episodes] } : current);
  }
  const saved = useSnapshot(favourites);
  const downloaded = useSnapshot(downloads);
  const history = useSnapshot(episodeProgress);
  const player = usePodcastPlayer();
  const starAction = useAction(toggleStar);
  const play = useAction(async (episode: Episode, show: Show) => {
    if (!player.state.ready) throw new Error("Audio player is not ready. Try again.");
    const trackId = `${show.id}/${episode.id}`;
    await currentEpisode.set({ id: trackId, date: episode.date, source: { type: "show" } });
    if (player.state.current?.id === trackId) {
      navigate("/playing");
      return;
    }
    await downloads.refresh();
    const cached = downloads.getSnapshot();
    const local = cached.status === "ready" ? cached.data.find(item => item.id === trackId && item.status === "finished") : undefined;
    const src = local?.src ?? episode.audio;
    const progress = (await episodeProgress.get())[trackId];
    await player.setQueue([{ id: trackId, src, title: episode.title, artist: show.title, album: show.title, artwork: episode.artwork, duration: episode.duration }],
      { startPosition: progress && !progress.finished ? progress.position : 0 });
    if (progress?.finished) await restartProgress(trackId);
    await player.play();
    navigate("/playing");
  });
  const starred = saved.status === "ready" && saved.data.some(show => show.id === id);
  const show = result.status === "ready" ? result.data.show : null;
  return <Screen title="Show" wide rightAction={show && saved.status === "ready"
    ? { icon: starred ? starFilled : star, onPress: () => starAction.run(show) } : undefined}>
    {result.status === "loading" ? <LoadingState /> : result.status === "error"
      ? <ErrorState message={result.error.message} onRetry={source.refresh} /> : <>
        <Stack axis="horizontal" align="center" gap={16}>
          {showImages && result.data.show.artwork && <Image src={result.data.show.artwork} width={100} height={100} fit="cover" />}
          <Stack gap={2}>
            <Text size={28} maxLines={2}>{result.data.show.title}</Text>
            <Text size={20} maxLines={2}>{result.data.show.author}</Text>
            <Text size={20}>{result.data.total} episodes</Text>
          </Stack>
        </Stack>
        {saved.status === "error" && <ErrorState message={saved.error.message} onRetry={() => { void favourites.get(); }} />}
        {starAction.status === "error" && <Text>{starAction.error.message}</Text>}
        {play.status === "error" && <Text>{play.error.message}</Text>}
        {!catalogue?.episodes.length ? <EmptyState title="No episodes" /> : <List items={catalogue.episodes} gap={16} hasMore={catalogue.next !== null} onLoadMore={loadMore}
          keyExtractor={episode => episode.id} renderItem={episode => {
            const entry = downloaded.status === "ready"
              ? downloaded.data.find(item => item.id === `${id}/${episode.id}`) : undefined;
            const trackId = `${id}/${episode.id}`;
            const progress = history.status === "ready" ? history.data[trackId] : undefined;
            const subtitle = [entry?.status === "downloading" ? downloadProgressLabel(entry) : "", episodeInfo(episode, progress)].filter(Boolean).join(" • ");
            return <Row title={episode.title} titleMaxLines={2} subtitle={subtitle}
              subtitleIcon={entry?.status === "finished" ? downloadDone : undefined}
              onLongPress={() => navigate({ path: "/episode-menu", params: { showId: id, episodeId: episode.id, audio: episode.audio, title: episode.title, artist: result.data.show.title, artwork: episode.artwork, duration: episode.duration, date: episode.date } })}
              onPress={() => play.run(episode, result.data.show)} />;
          }} />}
      </>}
  </Screen>;
}
