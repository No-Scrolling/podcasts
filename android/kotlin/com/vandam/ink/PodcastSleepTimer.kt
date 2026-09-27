package com.vandam.ink

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject

@UnstableApi
internal class PodcastSleepTimer(activity: MainActivity) : NativeAdapter {
    private val context = activity.applicationContext

    override fun execute(requestId: Long, operation: String, payload: String, complete: NativeResultHandler) {
        Timer.handler.post {
            try {
                when (operation) {
                    "can-autoplay" -> complete(NativeResult.Success(Timer.canAutoplay().toString()))
                    "resume" -> { Timer.resume(); complete(NativeResult.Success("null")) }
                    "state" -> complete(NativeResult.Success(Timer.state().toString()))
                    "set" -> Timer.set(context, JSONObject(payload), complete)
                    else -> error("Unknown sleep timer operation")
                }
            } catch (error: Exception) {
                complete(NativeResult.Failure(NativeErrorKind.UNEXPECTED, error.message ?: "Could not set sleep timer", true))
            }
        }
    }

    override fun cancel(requestId: Long) = Unit

    private object Timer {
        val handler = Handler(Looper.getMainLooper())
        private var connection: ListenableFuture<MediaController>? = null
        private var controller: MediaController? = null
        private var wakeLock: PowerManager.WakeLock? = null
        private var stoppedEpisode: String? = null
        private var mode = "off"
        private var minutes = 0
        private var deadline = 0L
        private val expire = Runnable { finish() }
        private val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (mode == "episode" && playbackState == Player.STATE_ENDED) finish()
            }
        }

        fun canAutoplay() = mode != "episode" && stoppedEpisode == null
        fun resume() { stoppedEpisode = null }

        fun state(): JSONObject = JSONObject()
            .put("mode", mode)
            .put("minutes", minutes)
            .put("remainingMs", (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(0))

        fun set(context: Context, data: JSONObject, complete: NativeResultHandler) {
            val nextMode = data.getString("mode")
            val nextMinutes = data.optInt("minutes", 0)
            require(nextMode in listOf("off", "minutes", "episode")) { "Invalid sleep timer" }
            require(nextMode != "minutes" || nextMinutes in listOf(15, 30, 45, 60)) { "Invalid sleep duration" }
            clear()
            stoppedEpisode = null
            if (nextMode == "off") {
                complete(NativeResult.Success(state().toString()))
                return
            }
            val future = MediaController.Builder(context,
                SessionToken(context, ComponentName(context, InkAudioService::class.java)))
                .setConnectionHints(Bundle().apply {
                    putBoolean("ink.controller", true)
                    putString("ink.session", "podcasts")
                }).buildAsync()
            connection = future
            future.addListener({
                if (connection !== future) {
                    complete(NativeResult.Failure(NativeErrorKind.UNEXPECTED, "Sleep timer was cancelled", false))
                    return@addListener
                }
                try {
                    val player = future.get()
                    require(player.currentMediaItem != null) { "Choose an episode first" }
                    require(nextMode != "episode" || player.playbackState != Player.STATE_ENDED) { "This episode has already finished" }
                    controller = player
                    mode = nextMode
                    minutes = nextMinutes
                    player.addListener(listener)
                    if (nextMode == "minutes") {
                        val delay = nextMinutes * 60_000L
                        deadline = SystemClock.elapsedRealtime() + delay
                        // The timer must fire even while the screen is off or playback is paused.
                        wakeLock = (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
                            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Podcasts:SleepTimer").apply { acquire(delay + 5_000) }
                        handler.postDelayed(expire, delay)
                    }
                    complete(NativeResult.Success(state().toString()))
                } catch (error: Exception) {
                    clear()
                    complete(NativeResult.Failure(NativeErrorKind.UNEXPECTED, error.message ?: "Could not set sleep timer", true))
                }
            }, { command -> handler.post(command) })
        }

        private fun finish() {
            stoppedEpisode = controller?.currentMediaItem?.mediaId
            controller?.pause()
            clear()
        }

        private fun clear() {
            handler.removeCallbacks(expire)
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = null
            controller?.removeListener(listener)
            controller = null
            connection?.let(MediaController::releaseFuture)
            connection = null
            mode = "off"
            minutes = 0
            deadline = 0
        }
    }
}
