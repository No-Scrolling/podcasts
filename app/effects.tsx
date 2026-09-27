import { LoadingState, Screen, Text, Toggle, useAction } from "ink";
import { usePodcastPlayer } from "../lib/player";

export default function Effects() {
  const player = usePodcastPlayer();
  const silence = useAction((enabled: boolean) => player.setSkipSilence(enabled));
  const boost = useAction((enabled: boolean) => player.setVoiceBoost(enabled));
  const seconds = Math.floor(player.state.silenceSaved / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const amount = minutes ? minutes % 60 : seconds;
  const unit = minutes ? "minute" : "second";
  const prefix = hours ? `${hours} ${hours === 1 ? "hour" : "hours"} ` : "";
  const saved = `Total time saved: ${prefix}${amount} ${unit}${amount === 1 ? "" : "s"}`;
  return <Screen title="Effects">
    {!player.state.ready ? <LoadingState /> :
      <>
        <Toggle label="Smart speed" subtitle={saved} value={player.state.skipSilence} onChange={silence.run} />
        <Toggle label="Voice boost" value={player.state.voiceBoost} onChange={boost.run} />
      </>}
    {silence.status === "error" && <Text>{silence.error.message}</Text>}
    {boost.status === "error" && <Text>{boost.error.message}</Text>}
    {player.state.error && <Text>{player.state.error.message}</Text>}
  </Screen>;
}
