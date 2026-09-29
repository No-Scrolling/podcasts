import { useEffect, useState } from "react";
import { LoadingState, Screen, Text, Toggle, useAction } from "ink";
import { usePodcastPlayer } from "../lib/player";

export default function Effects() {
  const player = usePodcastPlayer();
  const [silenceSaved, setSilenceSaved] = useState(player.state.silenceSaved);
  useEffect(() => {
    if (!player.state.ready) return;
    let active = true;
    const refresh = async () => {
      try {
        const state = await player.getState();
        if (active) setSilenceSaved(state.silenceSaved);
      } catch (error) {
        if (active) console.error("Could not read playback effects", error);
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [player.state.ready, player.getState]);
  const silence = useAction((enabled: boolean) => player.setSkipSilence(enabled));
  const boost = useAction((enabled: boolean) => player.setVoiceBoost(enabled));
  const seconds = Math.floor(silenceSaved / 1000);
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
