import { Screen, Field, ErrorState, LoadingState, useSnapshot } from "ink";
import { downloads } from "../../lib/downloads";
import { playbackSettings } from "../../lib/playback-settings";

function storageSize(bytes: number) {
  if (bytes === 0) return "0 MB";
  if (bytes < 1_000_000) return `${Math.ceil(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

export default function DownloadSettings() {
  const files = useSnapshot(downloads);
  const saved = useSnapshot(playbackSettings);
  return <Screen title="Downloads">
    {files.status === "loading" ? <LoadingState /> : files.status === "error"
      ? <ErrorState message={files.error.message} onRetry={downloads.refresh} />
      : <Field label="Storage used">{storageSize(files.data.reduce((total, file) => total + file.bytes, 0))}</Field>}
    {saved.status === "loading" ? <LoadingState /> : saved.status === "error"
      ? <ErrorState message={saved.error.message} onRetry={() => { void playbackSettings.get(); }} />
      : <Field label="Delete downloads" href="/settings/delete-downloads">{saved.data.deleteDownloads === "manual" ? "Manually" : "When finished"}</Field>}
  </Screen>;
}
