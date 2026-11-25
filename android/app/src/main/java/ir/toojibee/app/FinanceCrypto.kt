package ir.toojibee.app

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Encrypts the finance offline cache with a non-exportable Android Keystore key. */
object FinanceCrypto {
    private const val ALIAS = "toojibee.finance.v1"
    private const val MAX_PLAIN = 2_000_000
    private const val MAX_CIPHER = 3_000_000

    private fun key(create: Boolean): SecretKey? {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        if (!create) return null
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build())
        return generator.generateKey()
    }

    private fun owner(uid: String?): ByteArray? = uid?.takeIf {
        it.length in 1..100 && it.all { c -> c.isLetterOrDigit() || c == '-' || c == '_' }
    }?.toByteArray(StandardCharsets.UTF_8)

    fun seal(uid: String?, plain: String?): String {
        val aad = owner(uid) ?: return ""
        if (plain == null || plain.length > MAX_PLAIN) return ""
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key(true))
            cipher.updateAAD(aad)
            val encrypted = cipher.doFinal(plain.toByteArray(StandardCharsets.UTF_8))
            Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
        } catch (e: Exception) { "" }
    }

    fun open(uid: String?, sealed: String?): String {
        val aad = owner(uid) ?: return ""
        if (sealed == null || sealed.length > MAX_CIPHER) return ""
        return try {
            val bytes = Base64.decode(sealed, Base64.DEFAULT)
            if (bytes.size < 29) return "" // 12-byte IV + 16-byte GCM tag + data
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(false) ?: return "", GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            cipher.updateAAD(aad)
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), StandardCharsets.UTF_8)
        } catch (e: Exception) { "" }
    }
}
