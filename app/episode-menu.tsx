import * as v from "valibot";
import { useState } from "react";
import { back, Button, ErrorState, LoadingState, navigate, replace, Screen, useAction, useRouteParams, useSnapshot } from "ink";
import { downloadEpisode, downloads, removeDownload } from "../lib/downloads";
import { usePodcastPlayer } from "../lib/player";
import { episodeProgress, markAsFinished, restartProgress } from "../lib/progress";

const parseParams = v.parser(v.object({
  showId: v.string(), episodeId: v.string(),
  audio: v.pipe(v.string(), v.regex(/^https?:\/\//i)),
  title: v.string(),
  fromDownloads: v.fallback(v.boolean(), false),
  date: v.fallback(v.optional(v.string()), undefined),
  artist: v.fallback(v.optional(v.string()), undefined),
  artwork: v.fallback(v.optional(v.string()), undefined),
  duration: v.fallback(v.optional(v.number()), undefined),
}));

export default function EpisodeMenu() {
  const { showId, episodeId, audio, title, artist, artwork, duration, date, fromDownloads } = useRouteParams(parseParams);
  const player = usePodcastPlayer();
  const saved = useSnapshot(downloads);
  const history = useSnapshot(episodeProgress);
  const id = `${showId}/${episodeId}`;
  const entry = saved.status === "ready" ? saved.data.find(item => item.id === id) : undefined;
  const action = useAction(async () => {
    if (entry?.status === "downloading") {
      await removeDownload(id);
    } else {
      if (entry?.status === "failed") await removeDownload(id);
      await downloadEpisode(id, audio, title, { artist, artwork, duration, date });
    }
    back();
  });
  const [selectedFinished, setSelectedFinished] = useState<boolean | null>(null);
  const finished = selectedFinished ?? (history.status === "ready" && history.data[id]?.finished === true);
  const changeProgress = useAction(async () => {
    setSelectedFinished(finished);
    if (finished) {
      if (player.state.current?.id === id) {
        await player.pause();
        await player.seek(0);
      }
      await restartProgress(id);
    } else {
      await markAsFinished(id);
    }
    back();
  });
  const error = changeProgress.status === "error" ? changeProgress.error : history.status === "error" ? history.error : action.status === "error" ? action.error
    : saved.status === "error" ? saved.error : null;
  if (error) return <Screen title="Episode"><ErrorState message={error.message} onRetry={() => {
    if (changeProgress.status === "error") changeProgress.run();
    else if (history.status === "error") void episodeProgress.get();
    else if (action.status === "error") action.run();
    else void downloads.refresh();
  }} /></Screen>;
  return <Screen title="Episode">
    <Button onPress={() => navigate({ path: "/episode-details", params: { showId, episodeId, fromDownloads } })}>Episode details</Button>
    {fromDownloads && <Button onPress={() => replace({ path: "/show/[id]", params: { id: showId } })}>Go to Show</Button>}
    {saved.status === "loading" ? <LoadingState />
      : entry?.status === "finished"
        ? <Button onPress={() => navigate({ path: "/delete-download", params: { id } })}>Remove download</Button>
        : <Button onPress={action.run}>{entry?.status === "downloading" ? "Cancel download" : "Download"}</Button>}
    {history.status === "ready" &&
      <Button onPress={changeProgress.run}>{finished ? "Mark as not started" : "Mark as finished"}</Button>}
  </Screen>;
}
