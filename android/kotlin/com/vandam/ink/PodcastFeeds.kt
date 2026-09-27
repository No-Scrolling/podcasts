package com.vandam.ink

import android.content.Context
import android.util.AtomicFile
import java.io.File
import android.util.Xml
import android.text.Html
import android.text.SpannableString
import android.text.style.URLSpan
import android.text.util.Linkify
import org.json.JSONArray
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap

internal class PodcastFeeds(context: Context) : NativeAdapter {
    private data class Catalogue(val show: JSONObject, val episodes: List<JSONObject>, val updatedAt: Long)
    private val directory = File(context.cacheDir, "podcast-feeds")
    private val catalogues = object : LinkedHashMap<String, Catalogue>(8, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Catalogue>): Boolean = size > 8
    }

    private fun file(id: String): File {
        require(id.matches(Regex("[0-9]+"))) { "Invalid show ID" }
        return File(directory, "$id.json")
    }

    @Synchronized private fun cached(id: String): Catalogue? {
        catalogues[id]?.let { return it }
        val file = file(id)
        if (!file.exists()) return null
        return try {
            val json = JSONObject(AtomicFile(file).openRead().bufferedReader().use { it.readText() })
            val items = json.getJSONArray("items")
            Catalogue(json.getJSONObject("show"), List(items.length()) { items.getJSONObject(it) }, json.getLong("updatedAt"))
                .also { catalogues[id] = it; file.setLastModified(System.currentTimeMillis()) }
        } catch (_: Exception) {
            file.delete()
            null
        }
    }

    @Synchronized private fun save(catalogue: Catalogue) {
        check(directory.isDirectory || directory.mkdirs()) { "Podcast cache is unavailable" }
        val id = catalogue.show.getString("id")
        val target = AtomicFile(file(id))
        val output = target.startWrite()
        try {
            output.write(JSONObject().put("show", catalogue.show).put("updatedAt", catalogue.updatedAt)
                .put("items", JSONArray(catalogue.episodes)).toString().toByteArray())
            target.finishWrite(output)
        } catch (error: Exception) {
            target.failWrite(output)
            throw error
        }
        catalogues[id] = catalogue
        val files = directory.listFiles()?.filter { it.extension == "json" }?.sortedByDescending { it.lastModified() }.orEmpty()
        var bytes = 0L
        files.forEachIndexed { index, file ->
            bytes += file.length()
            if (index >= 32 || bytes > 32 * 1024 * 1024) {
                file.delete()
                catalogues.remove(file.nameWithoutExtension)
            }
        }
    }

    private fun page(catalogue: Catalogue, after: String): JSONObject {
        val episodes = catalogue.episodes
        val start = if (after.isEmpty()) 0 else {
            val index = episodes.indexOfFirst { it.getString("guid") == after }
            check(index >= 0) { "The episode list changed. Reopen this show to refresh it." }
            index + 1
        }
        val end = (start + 24).coerceAtMost(episodes.size)
        return JSONObject().put("items", JSONArray(episodes.subList(start, end)))
            .put("total", episodes.size).put("updatedAt", catalogue.updatedAt)
            .put("next", if (end < episodes.size) episodes[end - 1].getString("guid") else JSONObject.NULL)
    }
    private val connections = ConcurrentHashMap<Long, HttpURLConnection>()

    override fun cancel(requestId: Long) {
        connections.remove(requestId)?.disconnect()
    }

    override fun execute(requestId: Long, operation: String, payload: String, complete: NativeResultHandler) {
        val executor = if (operation in listOf("cached-show", "cached", "page")) cacheWorker else worker
        executor.execute {
            try {
                val data = JSONObject(payload)
                val result = when (operation) {
                    "cached-show" -> cached(data.getString("id"))?.show?.toString() ?: "null"
                    "cached", "page" -> {
                        val catalogue = cached(data.getString("id"))
                        if (operation == "page") checkNotNull(catalogue) { "Reopen this show to load its episodes" }
                        catalogue?.let { page(it, data.optString("after")).toString() } ?: "null"
                    }
                    "details" -> {
                        val id = data.getString("id")
                        val episode = fetch(requestId, data.getString("url"), id)
                            .firstOrNull { it.getString("guid") == id }
                        checkNotNull(episode) { "Episode not found in this show's feed" }.toString()
                    }
                    "next" -> {
                        val show = data.getJSONObject("show")
                        val episodes = cached(show.getString("id"))?.episodes ?: fetch(requestId, show.getString("feed"))
                        val index = episodes.indexOfFirst { it.optString("guid") == data.getString("id") }
                        val skipped = data.getJSONArray("finished")
                        val finished = (0 until skipped.length()).map { skipped.getString(it) }.toSet()
                        (if (index >= 0) index + 1 until episodes.size else IntRange.EMPTY)
                            .firstOrNull { episodes[it].getString("guid") !in finished }
                            ?.let { episodes[it].toString() } ?: "null"
                    }
                    "load" -> {
                        val show = data.getJSONObject("show")
                        val episodes = fetch(requestId, show.getString("feed"))
                        val catalogue = Catalogue(show, episodes, System.currentTimeMillis())
                        save(catalogue)
                        page(catalogue, "").toString()
                    }
                    else -> error("Unknown feed operation")
                }
                complete(NativeResult.Success(result))
            } catch (error: Exception) {
                complete(NativeResult.Failure(NativeErrorKind.UNEXPECTED, error.message ?: "Could not load podcast", true))
            }
        }
    }

    private fun fetch(requestId: Long, address: String, detailId: String? = null): List<JSONObject> {
        val url = URL(address)
        require(url.protocol == "https" || url.protocol == "http") { "Invalid feed URL" }
        val connection = url.openConnection() as HttpURLConnection
        connections[requestId] = connection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            check(connection.responseCode in 200..299) { "Could not load podcast (${connection.responseCode})" }
            return connection.inputStream.buffered().use { input ->
                val parser = Xml.newPullParser()
                parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
                parser.setInput(input, null)
                readEpisodes(parser, detailId)
            }
        } finally {
            connections.remove(requestId)
            connection.disconnect()
        }
    }

    private fun readEpisodes(parser: XmlPullParser, detailId: String?): List<JSONObject> {
        val episodes = mutableListOf<JSONObject>()
        val ids = mutableSetOf<String>()
        var channel = false
        var item: JSONObject? = null
        var itemDepth = 0
        var field: String? = null
        val value = StringBuilder()
        while (parser.nextToken() != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> {
                    val name = parser.name
                    if (name == "channel" && parser.depth == 2) channel = true
                    if (channel && name == "item" && parser.depth == 3) {
                        item = JSONObject()
                        itemDepth = parser.depth
                    } else if (item != null && parser.depth == itemDepth + 1) {
                        when (name) {
                            "enclosure" -> if (!item.has("audio")) item.put("audio", parser.getAttributeValue(null, "url"))
                            "itunes:image" -> item.put("artwork", parser.getAttributeValue(null, "href"))
                            "guid", "title", "pubDate", "itunes:duration" -> {
                                field = name
                                value.setLength(0)
                            }
                            "description", "content:encoded", "itunes:summary" -> if (detailId != null) {
                                field = name
                                value.setLength(0)
                            }
                        }
                    }
                }
                XmlPullParser.TEXT, XmlPullParser.CDSECT, XmlPullParser.ENTITY_REF -> {
                    if (field != null) parser.text?.let { value.append(it) }
                }
                XmlPullParser.END_TAG -> {
                    if (item != null && parser.depth == itemDepth + 1 && parser.name == field) {
                        item.put(field, value.toString().trim())
                        field = null
                    } else if (item != null && parser.depth == itemDepth && parser.name == "item") {
                        val audio = item.optString("audio")
                        val id = item.optString("guid").ifEmpty { audio }
                        if (detailId != null) {
                            val description = item.optString("content:encoded").ifBlank {
                                item.optString("description").ifBlank { item.optString("itunes:summary") }
                            }
                            item.remove("content:encoded")
                            item.remove("description")
                            item.remove("itunes:summary")
                            if (id == detailId) item.put("description", descriptionParts(description))
                        }
                        if ((audio.startsWith("https://") || audio.startsWith("http://")) && ids.add(id)) {
                            item.put("guid", id)
                            if (id == detailId) return listOf(item)
                            if (detailId == null) episodes.add(item)
                        }
                        item = null
                    }
                }
                XmlPullParser.DOCDECL -> error("Podcast feeds with document declarations are unsupported")
            }
        }
        check(channel) { "This show has an unsupported feed" }
        val dateFormats = listOf("EEE, dd MMM yyyy HH:mm:ss Z", "dd MMM yyyy HH:mm:ss Z")
            .map { SimpleDateFormat(it, Locale.US) }
        return episodes.map { episode ->
            val date = dateFormats.firstNotNullOfOrNull { format ->
                runCatching { format.parse(episode.optString("pubDate"))?.time }.getOrNull()
            } ?: 0L
            episode to date
        }.sortedByDescending { it.second }.map { it.first }
    }

    private fun descriptionParts(html: String): JSONArray {
        val text = SpannableString(Html.fromHtml(html.replace("\u2060", ""), Html.FROM_HTML_MODE_LEGACY).trim())
        val detected = SpannableString(text.toString())
        Linkify.addLinks(detected, Linkify.WEB_URLS)
        val authored = text.getSpans(0, text.length, URLSpan::class.java)
        for (span in detected.getSpans(0, detected.length, URLSpan::class.java)) {
            val start = detected.getSpanStart(span)
            val end = detected.getSpanEnd(span)
            if (authored.none { text.getSpanStart(it) < end && text.getSpanEnd(it) > start }) {
                text.setSpan(URLSpan(span.url), start, end, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
        val parts = JSONArray()
        var cursor = 0
        for (span in text.getSpans(0, text.length, URLSpan::class.java).sortedBy { text.getSpanStart(it) }) {
            val start = text.getSpanStart(span)
            val end = text.getSpanEnd(span)
            if (start < cursor || !span.url.startsWith("https://", true) && !span.url.startsWith("http://", true)) continue
            if (start > cursor) parts.put(JSONObject().put("text", text.subSequence(cursor, start).toString()))
            parts.put(JSONObject().put("text", text.subSequence(start, end).toString()).put("href", span.url))
            cursor = end
        }
        if (cursor < text.length) parts.put(JSONObject().put("text", text.subSequence(cursor, text.length).toString()))
        return parts
    }

    companion object {
        private val worker = Executors.newFixedThreadPool(2)
        private val cacheWorker = Executors.newSingleThreadExecutor()
    }
}
