import { Screen, Field, Toggle, Text, ErrorState, LoadingState, useSnapshot, useAction } from "ink";
import { playbackSettings } from "../../lib/playback-settings";

export default function PlayerSettings() {
  const saved = useSnapshot(playbackSettings);
  const save = useAction((playNext: boolean) => playbackSettings.update(current => ({ ...current, playNext })));
  return <Screen title="Player">
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={() => { void playbackSettings.get(); }} />
      : <>
        <Field label="Seek back by" href="/settings/seek-back">{saved.data.back} seconds</Field>
        <Field label="Seek forward by" href="/settings/seek-forward">{saved.data.forward} seconds</Field>
        <Toggle label="Play next episode" value={saved.data.playNext} onChange={save.run} />
      </>}
    {save.status === "error" && <Text>{save.error.message}</Text>}
  </Screen>;
}
