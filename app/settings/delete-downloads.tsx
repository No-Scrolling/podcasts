import { back, Button, ErrorState, LoadingState, Screen, Text, useAction, useSnapshot } from "ink";
import { playbackSettings } from "../../lib/playback-settings";

export default function DeleteDownloads() {
  const saved = useSnapshot(playbackSettings);
  const save = useAction(async (deleteDownloads: "manual" | "finished") => {
    await playbackSettings.update(current => ({ ...current, deleteDownloads }));
    back();
  });
  return <Screen title="Delete downloads">
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={() => { void playbackSettings.get(); }} />
      : <>
        <Button selected={saved.data.deleteDownloads === "manual"} onPress={() => save.run("manual")}>Manually</Button>
        <Button selected={saved.data.deleteDownloads === "finished"} onPress={() => save.run("finished")}>When finished</Button>
      </>}
    {save.status === "error" && <Text>{save.error.message}</Text>}
  </Screen>;
}
