import { back, Button, ErrorState, LoadingState, Screen, Text, useAction } from "ink";
import { usePodcastPlayer } from "../lib/player";

export default function Speed() {
  const player = usePodcastPlayer();
  const save = useAction(async (speed: number) => {
    await player.setSpeed(speed);
    back();
  });
  return <Screen title="Speed">
    {player.state.error ? <ErrorState message={player.state.error.message} onRetry={() => save.run(1)} />
      : !player.state.ready ? <LoadingState />
      : [0.5, 1, 1.25, 1.5, 2].map(speed =>
        <Button key={speed} selected={player.state.speed === speed} onPress={() => save.run(speed)}>{speed}x</Button>)}
    {save.status === "error" && <Text>{save.error.message}</Text>}
  </Screen>;
}
