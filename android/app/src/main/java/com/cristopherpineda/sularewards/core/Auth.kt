package com.cristopherpineda.sularewards.core

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** Entrar con Google o con un código por correo. Las dos terminan igual: la API regresa un token de sesión. */
object Auth {
    /** El usuario cerró la hoja de Google: no es un error que haya que mostrar. */
    class Cancelled : Exception()

    /** Qué botones mostrar (la API dice si ya hay client ID de Google). */
    suspend fun config(): AuthConfig? = runCatching { Api.request<AuthConfig>("GET", "/auth/config") }.getOrNull()

    /**
     * «Continuar con Google» con Credential Manager. El id token sale para el client ID «web» de la API
     * (GOOGLE_WEB_CLIENT_ID), que es el que ella acepta; la app Android solo tiene que estar registrada en el mismo
     * proyecto de Google Cloud con su huella SHA-1 (docs/google-play.md).
     */
    suspend fun google(activityContext: Context, webClientId: String): SignedIn {
        val option = GetSignInWithGoogleOption.Builder(webClientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = try {
            CredentialManager.create(activityContext).getCredential(activityContext, request).credential
        } catch (e: GetCredentialCancellationException) {
            throw Cancelled()
        } catch (e: GetCredentialException) {
            throw ApiError("No se pudo entrar con Google. Intenta de nuevo.", 0)
        }
        if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            throw ApiError("No se pudo entrar con Google. Intenta de nuevo.", 0)
        }
        val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
        return Api.request("POST", "/auth/google", body = jsonOf("id_token" to idToken))
    }

    suspend fun requestCode(email: String) {
        Api.send("POST", "/auth/code", jsonOf("email" to email))
    }

    suspend fun verify(email: String, code: String): SignedIn =
        Api.request("POST", "/auth/verify", body = jsonOf("email" to email, "code" to code))
}
