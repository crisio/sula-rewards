package com.cristopherpineda.sularewards.core

import com.cristopherpineda.sularewards.BuildConfig

object Config {
    /** API de Sula Rewards (Cloudflare Worker), la misma que usan la web y la app de iPhone. */
    const val API_URL = "https://sula-rewards-api.cristopheropineda.workers.dev"

    /** La web (GitHub Pages): la tarjeta del cliente, la página para unirse, el panel y las páginas legales. */
    const val WEB_URL = "https://crisio.github.io/sula-rewards/"
    const val PANEL_URL = WEB_URL + "panel"
    const val PRIVACY_URL = WEB_URL + "privacidad.html"
    const val SUPPORT_URL = WEB_URL + "soporte.html"

    /** Lo que abre el cliente para ver su tarjeta y guardarla en el Wallet. */
    fun cardUrl(id: String) = WEB_URL + "tarjeta/" + id

    /** El QR del mostrador: el cliente se une y saca su tarjeta. */
    fun joinUrl(slug: String) = WEB_URL + "unete/" + slug

    val version: String get() = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"
}
