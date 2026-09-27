package com.vandam.ink

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.EOFException
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

class PodcastDownloadService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("downloads", "Downloads", NotificationManager.IMPORTANCE_LOW))
        startForeground(2001, Notification.Builder(this, "downloads")
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloading episodes").setOngoing(true).build())
        PodcastTransfers.resume(this) {
            Handler(Looper.getMainLooper()).post {
                if (!PodcastTransfers.active()) stopSelfResult(startId)
            }
        }
        return START_STICKY
    }
}

internal object PodcastTransfers {
    private class Transfer {
        @Volatile var progress: Int? = null
        @Volatile var cancelled = false
        @Volatile var connection: HttpURLConnection? = null
    }
    private val jobs = mutableMapOf<String, Transfer>()
    private val workers = Executors.newFixedThreadPool(2)
    private var onIdle: (() -> Unit)? = null
    private fun saved(context: Context) = context.getSharedPreferences("podcast-downloads", Context.MODE_PRIVATE)

    @Synchronized fun active() = jobs.isNotEmpty()

    @Synchronized fun start(context: Context, data: JSONObject) {
        val store = saved(context)
        val id = data.getString("id")
        if (store.contains(id)) return
        val url = URL(data.getString("url"))
        require(url.protocol == "https" || url.protocol == "http") { "Invalid episode URL" }
        val entry = JSONObject().put("id", id).put("url", url.toString())
            .put("title", data.getString("title")).put("token", UUID.randomUUID().toString())
            .put("status", "downloading")
        for (key in listOf("artist", "artwork", "duration", "date")) {
            if (data.has(key)) entry.put(key, data.get(key))
        }
        check(store.edit().putString(id, entry.toString()).commit()) { "Could not save download" }
        try {
            context.startForegroundService(Intent(context, PodcastDownloadService::class.java))
        } catch (error: Exception) {
            store.edit().remove(id).commit()
            throw error
        }
    }

    @Synchronized fun remove(context: Context, id: String) {
        val store = saved(context)
        val entry = store.getString(id, null)?.let(::JSONObject) ?: return
        jobs[entry.getString("token")]?.let {
            it.cancelled = true
            it.connection?.disconnect()
        }
        entry.optJSONObject("file")?.let { InkManagedFiles(context).remove(it.getString("id")) }
        check(store.edit().remove(id).commit()) { "Could not remove download" }
    }

    @Synchronized fun metadata(context: Context, items: JSONArray): Boolean {
        val store = saved(context)
        val editor = store.edit()
        var changed = false
        for (index in 0 until items.length()) {
            val item = items.getJSONObject(index)
            val id = item.getString("id")
            val raw = store.getString(id, null) ?: continue
            val entry = JSONObject(raw)
            for (key in listOf("title", "artist", "artwork", "duration", "date")) {
                if (item.has(key)) entry.put(key, item.get(key))
            }
            if (entry.toString() != raw) {
                editor.putString(id, entry.toString())
                changed = true
            }
        }
        if (changed) check(editor.commit()) { "Could not save episode details" }
        return changed
    }

    @Synchronized fun state(context: Context): JSONArray {
        val result = JSONArray()
        var needsService = false
        for ((_, value) in saved(context).all) {
            val entry = JSONObject(value as String)
            val file = entry.optJSONObject("file")
            if (file != null) {
                val stored = InkManagedFiles(context).open(file.getString("id"))
                entry.put("status", if (stored != null) "finished" else "failed")
                    .put("bytes", stored?.optLong("size") ?: 0L)
            } else if (entry.optString("status") != "failed") {
                entry.put("status", "downloading").put("progress", jobs[entry.getString("token")]?.progress ?: JSONObject.NULL)
                if (!jobs.containsKey(entry.getString("token"))) needsService = true
            }
            if (file == null) entry.put("bytes", File(context.filesDir, "ink-files/${entry.getString("token")}.partial").length())
            result.put(entry)
        }
        if (needsService) context.startForegroundService(Intent(context, PodcastDownloadService::class.java))
        return result
    }

    @Synchronized fun resume(context: Context, idle: () -> Unit) {
        val app = context.applicationContext
        onIdle = idle
        for ((id, value) in saved(app).all) {
            val entry = JSONObject(value as String)
            if (entry.has("file") || entry.optString("status") == "failed") continue
            val token = entry.getString("token")
            if (jobs.containsKey(token)) continue
            val job = Transfer()
            jobs[token] = job
            workers.execute {
                try { transfer(app, id, entry, job) }
                finally {
                    val finished = synchronized(this) {
                        jobs.remove(token)
                        if (jobs.isEmpty()) onIdle.also { onIdle = null } else null
                    }
                    finished?.invoke()
                }
            }
        }
        if (jobs.isEmpty()) { onIdle = null; idle() }
    }

    private fun transfer(context: Context, id: String, entry: JSONObject, job: Transfer) {
        val token = entry.getString("token")
        val directory = File(context.filesDir, "ink-files")
        val partial = File(directory, "$token.partial")
        val output = File(directory, "$token.data")
        try {
            check(directory.isDirectory || directory.mkdirs()) { "Download storage is unavailable" }
            val mime = download(entry.getString("url"), partial, job)
            synchronized(this) {
                check(!job.cancelled && saved(context).getString(id, null)?.let(::JSONObject)?.optString("token") == token) { "Download cancelled" }
                check(partial.renameTo(output)) { "Could not save episode" }
                val file = InkManagedFiles(context).adopt(output,
                    mime, entry.getString("title"), token)
                entry.put("file", file).put("status", "finished")
                check(saved(context).edit().putString(id, entry.toString()).commit()) { "Could not save episode" }
            }
        } catch (error: Exception) {
            if (!job.cancelled) Log.w("PodcastDownloads", "Download stopped (${error.javaClass.simpleName})")
            synchronized(this) {
                InkManagedFiles(context).remove(token)
                output.delete()
                if (!job.cancelled && saved(context).getString(id, null)?.let(::JSONObject)?.optString("token") == token) {
                    entry.remove("file")
                    entry.put("status", "failed")
                    saved(context).edit().putString(id, entry.toString()).commit()
                }
            }
        } finally {
            job.connection?.disconnect()
            partial.delete()
            File(partial.path + ".validator").delete()
        }
    }

    private fun download(address: String, partial: File, job: Transfer): String {
        val validatorFile = File(partial.path + ".validator")
        var validator = if (validatorFile.isFile) validatorFile.readText().takeIf { it.isNotBlank() } else null
        for (attempt in 0..3) {
            check(!job.cancelled) { "Download cancelled" }
            if (validator == null) partial.delete()
            val offset = partial.length()
            try {
                val connection = connect(address, job, offset, validator)
                if (connection.responseCode == 416) {
                    partial.delete()
                    validatorFile.delete()
                    validator = null
                    throw IOException("Stored range is no longer available")
                }
                val append = connection.responseCode == 206
                val range = if (append) Regex("bytes (\\d+)-(\\d+)/(\\d+)")
                    .matchEntire(connection.getHeaderField("Content-Range") ?: "") else null
                val total = if (append) {
                    check(range != null && range.groupValues[1].toLong() == offset) { "Invalid audio range" }
                    val end = range.groupValues[2].toLong()
                    val size = range.groupValues[3].toLong()
                    check(end >= offset && end < size) { "Invalid audio range" }
                    size
                } else connection.contentLengthLong
                val nextValidator = connection.getHeaderField("ETag")?.takeUnless { it.startsWith("W/") }
                    ?: connection.getHeaderField("Last-Modified")
                if (append && nextValidator != null && nextValidator != validator) {
                    partial.delete()
                    validatorFile.delete()
                    validator = null
                    throw IOException("Audio changed while downloading")
                }
                if (!append) {
                    validatorFile.delete()
                    FileOutputStream(partial).close()
                    validator = nextValidator
                    if (validator != null) validatorFile.writeText(validator)
                }
                var received = if (append) offset else 0L
                job.progress = if (total > 0) (received * 100 / total).toInt().coerceIn(0, 99) else null
                connection.inputStream.use { input ->
                    FileOutputStream(partial, append).buffered().use { sink ->
                        val buffer = ByteArray(32768)
                        while (true) {
                            check(!job.cancelled) { "Download cancelled" }
                            val count = input.read(buffer)
                            if (count < 0) break
                            sink.write(buffer, 0, count)
                            received += count
                            if (total > 0) job.progress = (received * 100 / total).toInt().coerceIn(0, 99)
                        }
                    }
                }
                if (total >= 0 && received != total) throw EOFException("Incomplete audio")
                return connection.contentType?.substringBefore(';') ?: "audio/mpeg"
            } catch (error: IOException) {
                if (job.cancelled || attempt == 3) throw error
            } finally {
                job.connection?.disconnect()
                job.connection = null
            }
            // Keep cancellation responsive during the retry delay.
            repeat((1 shl attempt) * 4) {
                check(!job.cancelled) { "Download cancelled" }
                Thread.sleep(250)
            }
        }
        error("Download attempts exhausted")
    }

    private fun connect(address: String, job: Transfer, offset: Long, validator: String?): HttpURLConnection {
        var url = URL(address)
        repeat(20) {
            check(!job.cancelled) { "Download cancelled" }
            require(url.protocol == "https" || url.protocol == "http") { "Invalid audio redirect" }
            val connection = url.openConnection() as HttpURLConnection
            job.connection = connection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.setRequestProperty("Accept-Encoding", "identity")
            if (offset > 0 && validator != null) {
                connection.setRequestProperty("Range", "bytes=$offset-")
                connection.setRequestProperty("If-Range", validator)
            }
            val status = connection.responseCode
            if (status in listOf(301, 302, 303, 307, 308)) {
                try { url = URL(url, requireNotNull(connection.getHeaderField("Location")) { "Missing audio redirect" }) }
                finally { connection.disconnect() }
            } else {
                if (status == 408 || status == 429 || status in 500..599) throw IOException("Audio server unavailable ($status)")
                check(status == 200 || (offset > 0 && status in listOf(206, 416))) { "Could not download audio ($status)" }
                return connection
            }
        }
        error("Too many audio redirects")
    }
}
