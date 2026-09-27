import { Screen, Button, Toggle, Text, ErrorState, LoadingState, useSnapshot, useAction } from "ink";
import { appearance, hideImages } from "../../lib/appearance";
export default function Settings() {
  const images = useSnapshot(hideImages);
  const saveImages = useAction((hidden: boolean) => hideImages.set(hidden));
  const saved = useSnapshot(appearance);
  const save = useAction((invert: boolean) => appearance.set(invert ? "light" : "dark"));
  return <Screen title="Settings">
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={() => { void appearance.get(); }} />
      : <Toggle label="Invert Colours" value={saved.data === "light"} onChange={save.run} />}
    {save.status === "error" && <Text>{save.error.message}</Text>}
    {images.status === "loading" ? <LoadingState /> : images.status === "error"
      ? <ErrorState message={images.error.message} onRetry={() => { void hideImages.get(); }} />
      : <Toggle label="Hide images" value={images.data} onChange={saveImages.run} />}
    {saveImages.status === "error" && <Text>{saveImages.error.message}</Text>}
    <Button href="/settings/player">Player</Button>
    <Button href="/settings/downloads">Downloads</Button>
  </Screen>;
}
