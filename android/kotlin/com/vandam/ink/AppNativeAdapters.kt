package com.vandam.ink

import org.json.JSONObject
import java.util.concurrent.Executors

internal fun createAppNativeAdapters(activity: MainActivity): Map<String, NativeAdapter> = mapOf(
    "podcast-downloads" to PodcastDownloads(activity),
    "podcast-feeds" to PodcastFeeds(activity.applicationContext),
    "podcast-sleep-timer" to PodcastSleepTimer(activity),
)

private class PodcastDownloads(activity: MainActivity) : NativeAdapter {
    private val context = activity.applicationContext

    override fun execute(requestId: Long, operation: String, payload: String, complete: NativeResultHandler) {
        worker.execute {
            try {
                val data = JSONObject(payload)
                val result = when (operation) {
                    "start" -> { PodcastTransfers.start(context, data); "null" }
                    "remove" -> { PodcastTransfers.remove(context, data.getString("id")); "null" }
                    "metadata" -> PodcastTransfers.metadata(context, data.getJSONArray("items")).toString()
                    "state" -> PodcastTransfers.state(context).toString()
                    else -> error("Unknown download operation")
                }
                complete(NativeResult.Success(result))
            } catch (error: Exception) {
                complete(NativeResult.Failure(NativeErrorKind.UNEXPECTED, error.message ?: "Download failed", true))
            }
        }
    }

    override fun cancel(requestId: Long) = Unit

    companion object {
        private val worker = Executors.newSingleThreadExecutor()
    }
}
