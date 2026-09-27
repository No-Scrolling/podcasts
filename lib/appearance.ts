import * as v from "valibot";
import { useEffect } from "react";
import { setColourScheme, useSnapshot, type ColourScheme } from "ink";
import { createStore } from "@ink/store";

export const appearance = createStore<ColourScheme>({
  key: "podcasts.appearance",
  version: 1,
  initial: "dark",
  decode: v.parser(v.picklist(["dark", "light"])),
});

export function useAppearance() {
  const saved = useSnapshot(appearance);
  useEffect(() => {
    if (saved.status === "ready") setColourScheme(saved.data);
  }, [saved]);
}

export const hideImages = createStore({
  key: "podcasts.hide-images",
  version: 1,
  initial: false,
  decode: v.parser(v.boolean()),
});

export function useShowImages() {
  const saved = useSnapshot(hideImages);
  return saved.status === "ready" && !saved.data;
}
