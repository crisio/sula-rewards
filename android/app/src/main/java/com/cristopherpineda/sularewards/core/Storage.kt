package com.cristopherpineda.sularewards.core

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Lo que la app guarda en el teléfono: la sesión (cifrada) y, para abrir rápido, el usuario y sus negocios. */
object Storage {
    lateinit var prefs: SharedPreferences
        private set

    fun init(context: Context) {
        prefs = context.getSharedPreferences("sula", Context.MODE_PRIVATE)
    }

    fun string(key: String): String? = prefs.getString(key, null)

    fun set(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }

    fun stringSet(key: String): Set<String> = prefs.getStringSet(key, emptySet()).orEmpty().toSet()

    fun setStringSet(key: String, value: Set<String>) {
        prefs.edit().putStringSet(key, value).apply()
    }
}

/**
 * El token de sesión, cifrado con una llave AES del Android Keystore que no sale de este teléfono (como el llavero
 * del iPhone). Si la llave se pierde (por ejemplo, al restaurar en otro teléfono), simplemente se vuelve a entrar.
 */
object TokenStore {
    private const val ALIAS = "sula.session"
    private const val KEY = "sula.token"

    fun read(): String? {
        val stored = Storage.string(KEY) ?: return null
        return runCatching {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
            String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
        }.getOrElse {
            Storage.set(KEY, null)
            null
        }
    }

    fun save(token: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        Storage.set(KEY, Base64.encodeToString(sealed, Base64.NO_WRAP))
    }

    fun delete() = Storage.set(KEY, null)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }
}
