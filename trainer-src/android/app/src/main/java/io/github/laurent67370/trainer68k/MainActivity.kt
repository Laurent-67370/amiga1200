package io.github.laurent67370.trainer68k

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.view.View
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast

/**
 * 68k Trainer (parcours Amiga 500 / 1200) : la page web du Trainer, embarquée dans l'APK et servie hors ligne
 * à l'adresse https://appassets.androidplatform.net/ (origine sûre : stockage local, modules ES, chiffrement).
 * Le pont « AndroidTrainer » fait ce que la WebView ne sait pas faire seule : enregistrer un fichier (exécutable
 * Amiga, source, profil), imprimer le certificat en PDF et ouvrir l'émulateur amiga1200 dans le navigateur.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var fichierAttente: ByteArray? = null
    private var choixFichiers: ValueCallback<Array<Uri>>? = null
    /** Page du certificat en cours d'impression (gardée tant que l'impression en a besoin). */
    private var pageImpression: WebView? = null
    private lateinit var cadre: FrameLayout
    private var vuePleinEcran: View? = null
    private var rappelPleinEcran: WebChromeClient.CustomViewCallback? = null

    companion object {
        private const val HOTE = Pages.HOTE
        private const val ENREGISTRER = 1
        private const val CHOISIR = 2
        /** Application Amiga 1200 (dépôt amiga1200-android) et son entrée pour les programmes du Trainer (Trainer.kt) */
        private const val EMU_PAQUET = "io.github.laurent67370.amiga1200"
        private const val EMU_ACTION = "io.github.laurent67370.amiga1200.TRAINER"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(24, 24, 24)
        window.navigationBarColor = Color.rgb(24, 24, 24)
        web = WebView(this)
        web.setBackgroundColor(Color.rgb(30, 30, 30))
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            textZoom = 100
        }
        web.addJavascriptInterface(Pont(), "AndroidTrainer")
        // L'émulateur s'affiche aussi dans la page du Trainer (sélecteur Simulateur / Amiga 500 / Amiga 1200)
        Pages.autoriserFils(web)
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                if (request.url.host == HOTE) Pages.reponse(this@MainActivity, request.url.path ?: "/") else null

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOTE) return false
                ouvrir(request.url.toString())
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // Plein écran demandé par l'émulateur (bouton « Plein écran ») : sa vue occupe toute la fenêtre
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                vuePleinEcran?.let { cadre.removeView(it) }
                vuePleinEcran = view
                rappelPleinEcran = callback
                cadre.addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            }

            override fun onHideCustomView() {
                vuePleinEcran?.let { cadre.removeView(it) }
                vuePleinEcran = null
                rappelPleinEcran?.onCustomViewHidden()
                rappelPleinEcran = null
            }

            override fun onShowFileChooser(view: WebView, rappel: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                choixFichiers?.onReceiveValue(null)
                choixFichiers = rappel
                val intent = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                return try {
                    startActivityForResult(intent, CHOISIR)
                    true
                } catch (e: ActivityNotFoundException) {
                    choixFichiers = null
                    false
                }
            }
        }
        // Barres du système (Android 15 dessine l'application dessous) : la page est placée entre la barre d'état et
        // la barre de navigation, et au-dessus du clavier. La marge est donnée au cadre : une WebView n'en tient pas compte.
        cadre = FrameLayout(this)
        cadre.setBackgroundColor(Color.rgb(24, 24, 24))
        cadre.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        if (Build.VERSION.SDK_INT >= 30) {
            cadre.setOnApplyWindowInsetsListener { v, insets ->
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom)
                WindowInsets.CONSUMED
            }
        } else cadre.fitsSystemWindows = true
        setContentView(cadre)
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://$HOTE/index.html")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Activity sans AndroidX")
    override fun onBackPressed() {
        // Retour : ferme d'abord le sommaire du parcours s'il est ouvert (web/sommaire.ts), sinon quitte
        web.evaluateJavascript(
            "(function(){var b=document.querySelector('.btn-sommaire');" +
                "if(b&&document.body.classList.contains('sommaire-ouvert')){b.click();return 1}return 0})()"
        ) { r ->
            if (r != "1") {
                if (web.canGoBack()) web.goBack() else finish()
            }
        }
    }

    private fun ouvrir(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "Aucun navigateur pour ouvrir $url", Toast.LENGTH_LONG).show()
        }
    }

    @Deprecated("Activity sans AndroidX")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            CHOISIR -> {
                val uri = data?.data
                choixFichiers?.onReceiveValue(if (resultCode == RESULT_OK && uri != null) arrayOf(uri) else null)
                choixFichiers = null
            }
            ENREGISTRER -> {
                val octets = fichierAttente
                fichierAttente = null
                val uri = data?.data
                if (resultCode != RESULT_OK || uri == null || octets == null) return
                try {
                    contentResolver.openOutputStream(uri, "wt")?.use { it.write(octets) }
                    Toast.makeText(this, "Fichier enregistré.", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(this, "Enregistrement impossible : ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /** Appelé par la page (web/plateforme.ts), sur un fil à part : l'interface est touchée par runOnUiThread. */
    inner class Pont {
        @JavascriptInterface
        fun enregistrer(nom: String, base64: String, mime: String) {
            val octets = Base64.decode(base64, Base64.DEFAULT)
            runOnUiThread {
                fichierAttente = octets
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime.ifEmpty { "application/octet-stream" })
                    .putExtra(Intent.EXTRA_TITLE, nom)
                try {
                    startActivityForResult(intent, ENREGISTRER)
                } catch (e: ActivityNotFoundException) {
                    fichierAttente = null
                    Toast.makeText(this@MainActivity, "Pas de gestionnaire de fichiers sur ce téléphone.", Toast.LENGTH_LONG).show()
                }
            }
        }

        /**
         * « Essayer sur l'Amiga » : la disquette (gzip, base64) part dans l'application Amiga 1200 (amiga1200-android)
         * si elle est installée et sait la recevoir ; faux sinon (la page ouvre alors l'émulateur web).
         */
        @JavascriptInterface
        fun lancerAmiga(nom: String, gzBase64: String, modele: String): Boolean {
            val intent = Intent(EMU_ACTION).setPackage(EMU_PAQUET)
                .putExtra("adf_gz", Base64.decode(gzBase64, Base64.DEFAULT))
                .putExtra("nom", nom)
                .putExtra("modele", if (modele == "a1200") "A1200" else "A500")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            if (intent.resolveActivity(packageManager) == null) return false
            runOnUiThread {
                try {
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Application Amiga 1200 injoignable : ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
            return true
        }

        /** L'émulateur Amiga intégré à l'APK peut démarrer sur ce téléphone (WebView assez récente). */
        @JavascriptInterface
        fun emulateurInterne(): Boolean = Pages.emulateurDisponible(this@MainActivity)

        /** Ouvre l'émulateur intégré ; `fragment` : « #nom=…&modele=…&trainer=… » pour lancer une disquette, ou vide. */
        @JavascriptInterface
        fun ouvrirEmulateur(fragment: String) {
            val f = if (fragment.isEmpty() || fragment.startsWith("#")) fragment else ""
            runOnUiThread {
                startActivity(Intent(this@MainActivity, EmulateurActivity::class.java).putExtra(EmulateurActivity.EXTRA_FRAGMENT, f))
            }
        }

        @JavascriptInterface
        fun ouvrirLien(url: String) {
            if (url.startsWith("https://") || url.startsWith("http://")) runOnUiThread { ouvrir(url) }
        }

        @JavascriptInterface
        fun imprimer(html: String, nom: String) {
            runOnUiThread {
                // Page à part, imprimée une fois chargée : « Enregistrer au format PDF » dans la boîte d'impression
                val page = WebView(this@MainActivity).also { pageImpression = it }
                page.settings.javaScriptEnabled = false
                page.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        val pm = getSystemService(PRINT_SERVICE) as PrintManager
                        val attributs = PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape())
                            .build()
                        pm.print(nom, view.createPrintDocumentAdapter(nom), attributs)
                        view.visibility = View.GONE
                    }
                }
                page.loadDataWithBaseURL("https://$HOTE/", html, "text/html", "utf-8", null)
            }
        }

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME
    }
}
