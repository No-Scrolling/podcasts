package com.vandam.ink

import org.json.JSONObject
import java.util.concurrent.Executors

internal fun createAppNativeAdapters(activity: MainActivity): Map<String, NativeAdapter> = mapOf(
    "podcast-downloads" to PodcastDownloads(activity),
    "podcast-feeds" to PodcastFeeds(activity.applicationContext),
    "podcast-sleep-timer" to PodcastSleepTimer(activity),
)

private class PodcastDownloads(private val activity: MainActivity) : NativeControllerAdapter {
    private val observers = mutableMapOf<Long, () -> Unit>()
    private val context = activity.applicationContext

    override fun execute(requestId: Long, operation: String, payload: String, complete: NativeResultHandler) {
        worker.execute {
            try {
                val data = JSONObject(payload)
                val result = when (operation) {
                    "start" -> { PodcastTransfers.start(context, data); "null" }
                    "remove" -> { PodcastTransfers.remove(context, data.getString("id")); "null" }
                    "metadata" -> PodcastTransfers.metadata(context, data.getJSONArray("items")).toString()
                    "state" -> PodcastTransfers.snapshot(context).toString()
                    else -> error("Unknown download operation")
                }
                complete(NativeResult.Success(result))
            } catch (error: Exception) {
                complete(NativeResult.Failure(NativeErrorKind.UNEXPECTED, error.message ?: "Download failed", true))
            }
        }
    }

    override fun executeController(controller: Long, operation: String, payload: String, complete: NativeResultHandler) {
        worker.execute {
            try {
                when (operation) {
                    "activate" -> {
                        observers.remove(controller)?.let(PodcastTransfers::unobserve)
                        val listener: () -> Unit = {
                            worker.execute {
                                if (observers.containsKey(controller)) publish(controller)
                            }
                        }
                        observers[controller] = listener
                        PodcastTransfers.observe(listener)
                        publish(controller)
                    }
                    "deactivate" -> observers.remove(controller)?.let(PodcastTransfers::unobserve)
                    else -> error("Unknown download subscription operation")
                }
                complete(NativeResult.Success("null"))
            } catch (error: Exception) {
                observers.remove(controller)?.let(PodcastTransfers::unobserve)
                complete(NativeResult.Failure(NativeErrorKind.UNEXPECTED, error.message ?: "Could not observe downloads", true))
            }
        }
    }

    private fun publish(controller: Long) {
        val snapshot = try { PodcastTransfers.snapshot(context) }
        catch (error: Exception) { JSONObject().put("error", error.message ?: "Could not read downloads") }
        activity.updateController(controller, snapshot.toString())
    }

    override fun cancel(requestId: Long) = Unit

    companion object {
        private val worker = Executors.newSingleThreadExecutor()
    }
}
