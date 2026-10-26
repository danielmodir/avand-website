package ir.toojibee.app

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

/**
 * Hands one picture from the app's cache (cacheDir/share) to the app the
 * person shares it with (a share card, the web app's share-card.js). Only
 * readable, only with the one-time permission the share intent grants; no
 * library (androidx FileProvider) needed for this.
 */
class ShareFiles : ContentProvider() {
    companion object {
        const val AUTHORITY = "ir.toojibee.app.share"
        fun dir(c: android.content.Context) = File(c.cacheDir, "share").apply { mkdirs() }
        fun uri(name: String): Uri = Uri.parse("content://$AUTHORITY/$name")
    }

    private fun file(uri: Uri): File {
        val name = uri.lastPathSegment ?: throw FileNotFoundException()
        if (!name.matches(Regex("[\\w.-]{1,80}"))) throw FileNotFoundException()
        val f = File(dir(context!!), name)
        if (!f.isFile) throw FileNotFoundException()
        return f
    }

    override fun onCreate() = true
    override fun getType(uri: Uri) = "image/png"
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor =
        ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY)

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor {
        val f = file(uri)
        return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply { addRow(arrayOf<Any>(f.name, f.length())) }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?) = 0
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?) = 0
}
