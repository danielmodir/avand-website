package ir.toojibee.app

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceResponse
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The web app's own files (demo/ and the few assets/ it uses), served from
 * the phone so the app opens instantly and offline. The page still lives
 * at https://toojibee.ir/demo/, so its API calls (/api/v1) and saved data
 * are the same as on the website.
 *
 * Which files, and their content hashes, come from demo/app-files.json,
 * written by deploy/build-site-zip.ps1 for every site deploy. The APK
 * carries one copy (assets/web/). When online, the live list is fetched
 * (a few hundred bytes; an ETag makes "nothing new" an empty 304) and only
 * files whose hash changed are downloaded, into files/web/obj/<hash>. The
 * new list takes over the next time the page loads.
 */
object WebFiles {
    const val HOST = "toojibee.ir"
    const val ORIGIN = "https://$HOST"
    const val START = "$ORIGIN/demo/"
    private const val LIST = "demo/app-files.json"
    private const val CHECK_EVERY_MS = 3_600_000L

    private class Listing(val built: Long, val minApp: Int, val files: Map<String, String>)

    private lateinit var appContext: Context
    private lateinit var bundled: Listing
    @Volatile private var active: Listing? = null
    @Volatile private var updating = false

    private val dir get() = File(appContext.filesDir, "web")
    private val objDir get() = File(dir, "obj")
    private val savedList get() = File(dir, "app-files.json")

    fun init(context: Context) {
        if (::appContext.isInitialized) return
        appContext = context.applicationContext
        bundled = appContext.assets.open("web/$LIST").use { parse(it.readBytes().decodeToString()) }
        activate()
    }

    /** The newest usable list: a downloaded one if it's newer than the APK's. */
    fun activate(): Boolean {
        val saved = try { if (savedList.exists()) parse(savedList.readText()) else null } catch (e: Exception) { null }
        val next = if (saved != null && saved.built > bundled.built && saved.minApp <= BuildConfig.VERSION_CODE) saved else bundled
        val changed = active !== null && active!!.built != next.built
        active = next
        return changed
    }

    /** True when a newer list was downloaded and isn't in use yet. */
    fun updateWaiting(): Boolean {
        val saved = try { if (savedList.exists()) parse(savedList.readText()) else null } catch (e: Exception) { null }
        return saved != null && saved.built > (active?.built ?: 0) && saved.minApp <= BuildConfig.VERSION_CODE
    }

    fun isAppPage(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == HOST && (uri.path ?: "").let { it == "/demo" || it.startsWith("/demo/") }

    /** The file for a request to our origin, or null (network: the API, uploads, …). */
    fun response(uri: Uri): WebResourceResponse? {
        if (uri.scheme != "https" || uri.host != HOST) return null
        var path = (uri.path ?: return null).trimStart('/')
        if (path == "demo") path = "demo/"
        if (path.endsWith("/")) path += "index.html"
        val list = active ?: return null
        val hash = list.files[path] ?: return null
        val stream: InputStream = if (bundled.files[path] == hash) {
            appContext.assets.open("web/$path")
        } else {
            val f = File(objDir, hash)
            if (!f.exists()) return null
            FileInputStream(f)
        }
        val res = WebResourceResponse(mime(path), if (isText(path)) "utf-8" else null, stream)
        res.responseHeaders = mapOf("Cache-Control" to "no-cache", "Access-Control-Allow-Origin" to ORIGIN)
        return res
    }

    /** Fetches the live list and the changed files (background thread). */
    fun checkForUpdate() {
        if (updating) return
        val prefs = appContext.getSharedPreferences("web", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("checked", 0) < CHECK_EVERY_MS) return
        updating = true
        Thread {
            try {
                val conn = URL("$ORIGIN/$LIST").openConnection() as HttpURLConnection
                conn.connectTimeout = 15_000; conn.readTimeout = 20_000
                prefs.getString("etag", null)?.let { conn.setRequestProperty("If-None-Match", it) }
                val code = conn.responseCode
                if (code == 304) { prefs.edit().putLong("checked", now).apply(); return@Thread }
                if (code != 200) return@Thread
                val text = conn.inputStream.use { it.readBytes().decodeToString() }
                val etag = conn.getHeaderField("ETag")
                val live = parse(text)
                val current = active ?: bundled
                // (A site deploy that changed none of these files changes nothing here.)
                if (live.built > current.built && live.minApp <= BuildConfig.VERSION_CODE && live.files != current.files) {
                    objDir.mkdirs()
                    for ((path, hash) in live.files) {
                        if (bundled.files[path] == hash || File(objDir, hash).exists()) continue
                        download("$ORIGIN/$path?h=$hash", hash)
                    }
                    val tmp = File(dir, "app-files.json.tmp")
                    tmp.writeText(text)
                    if (!tmp.renameTo(savedList)) { savedList.delete(); tmp.renameTo(savedList) }
                    // Keep only what the new list or the page now on screen still uses.
                    val keep = live.files.values.toSet() + current.files.values.toSet()
                    objDir.listFiles()?.forEach { if (it.name !in keep) it.delete() }
                }
                prefs.edit().putLong("checked", now).putString("etag", etag).apply()
            } catch (e: Exception) {
                // Offline or a broken download: the next check tries again.
            } finally {
                updating = false
            }
        }.start()
    }

    private fun download(url: String, hash: String) {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000; conn.readTimeout = 60_000
        if (conn.responseCode != 200) throw IllegalStateException("HTTP ${conn.responseCode} for $url")
        val bytes = conn.inputStream.use { it.readBytes() }
        if (hashOf(bytes) != hash) throw IllegalStateException("hash mismatch for $url")
        val tmp = File(objDir, "$hash.tmp")
        tmp.writeBytes(bytes)
        tmp.renameTo(File(objDir, hash))
    }

    /** Same as deploy/build-site-zip.ps1: SHA-256, first 16 hex digits. */
    private fun hashOf(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).take(8).joinToString("") { "%02x".format(it) }

    private fun parse(json: String): Listing {
        val o = JSONObject(json)
        val files = o.getJSONObject("files")
        val map = HashMap<String, String>(files.length() * 2)
        files.keys().forEach { map[it] = files.getString(it) }
        return Listing(o.getLong("built"), o.optInt("minApp", 1), map)
    }

    private fun isText(path: String) = path.substringAfterLast('.') in setOf("html", "js", "css", "json", "svg", "txt")

    private fun mime(path: String) = when (path.substringAfterLast('.')) {
        "html" -> "text/html"
        "js" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "webp" -> "image/webp"
        "woff2" -> "font/woff2"
        "ico" -> "image/x-icon"
        else -> "application/octet-stream"
    }
}
