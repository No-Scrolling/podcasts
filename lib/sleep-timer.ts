import * as v from "valibot";
import { useEffect } from "react";
import { resource, useSnapshot } from "ink";
import { callNative } from "ink/native";

export type SleepTimerOption = "off" | "episode" | 15 | 30 | 45 | 60;
const timerSchema = v.object({
  mode: v.picklist(["off", "minutes", "episode"]),
  minutes: v.number(),
  remainingMs: v.number(),
});

export const sleepTimer = resource({
  key: () => ["sleep-timer"],
  async load() {
    return v.parse(timerSchema, JSON.parse(await callNative("podcast-sleep-timer", "state", {})));
  },
})();

export async function setSleepTimer(option: SleepTimerOption) {
  await callNative("podcast-sleep-timer", "set", option === "off" || option === "episode"
    ? { mode: option } : { mode: "minutes", minutes: option });
  await sleepTimer.refresh();
}

export function useSleepTimer(ended: boolean) {
  const state = useSnapshot(sleepTimer);
  useEffect(() => { void sleepTimer.refresh(); }, [ended]);
  const remaining = state.status === "ready" && state.data.mode === "minutes" ? state.data.remainingMs : null;
  useEffect(() => {
    if (remaining === null) return;
    const timer = setTimeout(() => { void sleepTimer.refresh(); }, remaining + 100);
    return () => clearTimeout(timer);
  }, [remaining]);
  return state;
}
