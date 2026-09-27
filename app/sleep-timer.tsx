import { back, Button, ErrorState, LoadingState, Screen, Text, useAction } from "ink";
import { usePodcastPlayer } from "../lib/player";
import { setSleepTimer, sleepTimer, useSleepTimer, type SleepTimerOption } from "../lib/sleep-timer";

const options: readonly SleepTimerOption[] = ["off", 15, 30, 45, 60, "episode"];

export default function SleepTimer() {
  const player = usePodcastPlayer();
  const saved = useSleepTimer(player.state.ended);
  const save = useAction(async (option: SleepTimerOption) => {
    await setSleepTimer(option);
    back();
  });
  return <Screen title="Sleep timer">
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={sleepTimer.refresh} />
      : options.map(option => <Button key={option}
          selected={option === "off" || option === "episode" ? saved.data.mode === option : saved.data.mode === "minutes" && saved.data.minutes === option}
          onPress={() => save.run(option)}>
          {option === "off" ? "Off" : option === "episode" ? "End of episode" : `${option} minutes`}
        </Button>)}
    {save.status === "error" && <Text>{save.error.message}</Text>}
  </Screen>;
}
