import * as v from "valibot";
import { back, Confirmation, ErrorState, Screen, useAction, useRouteParams, useSnapshot } from "ink";
import { downloads, removeDownload } from "../lib/downloads";
import { usePodcastPlayer } from "../lib/player";

const parseParams = v.parser(v.object({ id: v.string() }));

export default function DeleteDownload() {
  const { id } = useRouteParams(parseParams);
  const saved = useSnapshot(downloads);
  const player = usePodcastPlayer();
  const remove = useAction(async () => {
    if (saved.status !== "ready" || !player.state.ready) return;
    const download = saved.data.find(item => item.id === id);
    const state = await player.getState();
    const current = state.current;
    if (download && current?.id === id && current.src === download.src) {
      await player.replaceSource(id, download.url);
    }
    await removeDownload(id);
    back();
    back();
  });
  const error = saved.status === "error" ? saved.error : remove.status === "error" ? remove.error : null;
  if (error) return <Screen title="Delete download"><ErrorState message={error.message} onRetry={remove.run} /></Screen>;
  return <Confirmation title="Delete download" confirmLabel="Delete" onConfirm={remove.run} pending={remove.status === "pending" || saved.status === "loading" || !player.state.ready} pendingLabel="Delete">
    Are you sure you want to delete this downloaded episode?
  </Confirmation>;
}
