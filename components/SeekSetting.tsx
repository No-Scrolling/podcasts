import { back, Button, ErrorState, LoadingState, Screen, Text, useAction, useSnapshot } from "ink";
import { playbackSettings, seekOptions, type SeekSeconds } from "../lib/playback-settings";

export function SeekSetting({ direction }: { direction: "back" | "forward" }) {
  const saved = useSnapshot(playbackSettings);
  const save = useAction(async (seconds: SeekSeconds) => {
    await playbackSettings.update(current => ({ ...current, [direction]: seconds }));
    back();
  });
  return <Screen title={direction === "back" ? "Seek back by" : "Seek forward by"}>
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={() => { void playbackSettings.get(); }} />
      : seekOptions.map(seconds => <Button key={seconds} selected={saved.data[direction] === seconds}
          onPress={() => save.run(seconds)}>{seconds} seconds</Button>)}
    {save.status === "error" && <Text>{save.error.message}</Text>}
  </Screen>;
}
