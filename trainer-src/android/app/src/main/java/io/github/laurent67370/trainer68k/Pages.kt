package io.github.laurent67370.trainer68k

import android.content.Context
import android.webkit.MimeTypeMap
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.IOException

/**
 * Pages servies depuis l'APK à l'adresse https://appassets.androidplatform.net/ : le Trainer à la racine des
 * « assets », l'émulateur amiga1200 dans emu/ (préparé par preparer-emulateur.sh).
 */
object Pages {
    const val HOTE = "appassets.androidplatform.net"
    const val ORIGINE = "https://$HOTE"

    /** L'émulateur est dans l'APK et la WebView peut lui donner ses fils d'exécution (mémoire partagée). */
    fun emulateurDisponible(ctx: Context): Boolean =
        isolationPossible() && try { ctx.assets.open("emu/index.html").close(); true } catch (e: IOException) { false }

    fun isolationPossible(): Boolean =
        WebViewFeature.isFeatureSupported(WebViewFeature.CROSS_ORIGIN_ISOLATED_ALLOWLIST) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

    /**
     * Autorise SharedArrayBuffer pour les pages de l'application (androidx.webkit 1.18, liste d'origines de confiance) :
     * l'émulateur en a besoin pour ses fils d'exécution WebAssembly. Seule l'origine de l'APK est sur la liste.
     */
    fun autoriserFils(web: WebView): Boolean {
        if (!isolationPossible()) return false
        return try {
            WebViewCompat.getProfile(web).setCrossOriginIsolatedAllowlist(setOf(ORIGINE))
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Fichier des « assets » ; ceux de l'émulateur portent les en-têtes d'isolation. */
    fun reponse(ctx: Context, chemin: String): WebResourceResponse {
        val nom = chemin.trimStart('/').ifEmpty { "index.html" }.let { if (it.endsWith("/")) it + "index.html" else it }
        val ext = nom.substringAfterLast('.', "").lowercase()
        val type = when (ext) {
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "html" -> "text/html"
            "json", "webmanifest" -> "application/json"
            "wasm" -> "application/wasm"
            "svg" -> "image/svg+xml"
            "ttf" -> "font/ttf"
            "gz" -> "application/gzip"
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
        }
        val enTetes = if (nom.startsWith("emu/")) mapOf(
            "Document-Isolation-Policy" to "isolate-and-require-corp",
            "Cross-Origin-Opener-Policy" to "same-origin",
            "Cross-Origin-Embedder-Policy" to "require-corp",
            "Cross-Origin-Resource-Policy" to "same-origin",
            "Cache-Control" to "no-cache"
        ) else mapOf("Cache-Control" to "no-cache")
        return try {
            val texte = type.startsWith("text/") || type == "application/json"
            // Fichiers .gz : rangés sous « nom.gz.data » (preparer-emulateur.sh), les outils d'Android les traitant à part
            val fichier = if (nom.endsWith(".gz")) "$nom.data" else nom
            WebResourceResponse(type, if (texte) "utf-8" else null, 200, "OK", enTetes, ctx.assets.open(fichier))
        } catch (e: IOException) {
            WebResourceResponse("text/plain", "utf-8", 404, "Not Found", enTetes, "".byteInputStream())
        }
    }
}
