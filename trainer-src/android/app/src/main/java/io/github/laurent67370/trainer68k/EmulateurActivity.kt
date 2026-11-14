package io.github.laurent67370.trainer68k

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast

/**
 * L'émulateur amiga1200 (WinUAE 6 / PUAE en WebAssembly), embarqué dans l'APK : Amiga 500 ou 1200, sans connexion.
 * « Essayer sur l'Amiga » l'ouvre avec la disquette du programme dans l'adresse (#nom=…&modele=…&trainer=…) ; la page
 * la range dans sa Bibliothèque, l'insère dans DF0: et démarre. Retour : on revient au Trainer.
 */
class EmulateurActivity : Activity() {
    private lateinit var web: WebView
    private var choixFichiers: ValueCallback<Array<Uri>>? = null

    companion object {
        const val EXTRA_FRAGMENT = "fragment"
        private const val CHOISIR = 1
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        web = WebView(this)
        web.setBackgroundColor(Color.BLACK)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            textZoom = 100
        }
        Pages.autoriserFils(web)
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                if (request.url.host == Pages.HOTE) Pages.reponse(this@EmulateurActivity, request.url.path ?: "/") else null

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == Pages.HOTE) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (e: ActivityNotFoundException) { /* rien */ }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // Kickstart, disquettes, jeux : choisis sur le téléphone (bouton « Importer le mien… » de l'émulateur)
            override fun onShowFileChooser(view: WebView, rappel: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                choixFichiers?.onReceiveValue(null)
                choixFichiers = rappel
                val intent = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                return try {
                    startActivityForResult(intent, CHOISIR)
                    true
                } catch (e: ActivityNotFoundException) {
                    choixFichiers = null
                    false
                }
            }
        }
        val cadre = FrameLayout(this)
        cadre.setBackgroundColor(Color.BLACK)
        cadre.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        if (Build.VERSION.SDK_INT >= 30) {
            cadre.setOnApplyWindowInsetsListener { v, insets ->
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom)
                WindowInsets.CONSUMED
            }
        } else cadre.fitsSystemWindows = true
        setContentView(cadre)
        if (!Pages.isolationPossible()) {
            Toast.makeText(this, "Cette version de WebView ne permet pas l'émulateur intégré : mettez à jour « Android System WebView » (Play Store).", Toast.LENGTH_LONG).show()
        }
        val fragment = intent.getStringExtra(EXTRA_FRAGMENT) ?: ""
        // Mode simple : l'écran de l'Amiga et quelques gros boutons (wasm/app/simple-puae.js)
        web.addJavascriptInterface(Pont(), "AndroidEmulateur")
        web.loadUrl("${Pages.ORIGINE}/emu/index.html?simple=1$fragment")
    }

    @Deprecated("Activity sans AndroidX")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != CHOISIR) return
        val uris = when {
            resultCode != RESULT_OK || data == null -> null
            data.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        choixFichiers?.onReceiveValue(uris)
        choixFichiers = null
    }

    /** Appelé par la page (bouton « ◀ Trainer » du mode simple). */
    inner class Pont {
        @android.webkit.JavascriptInterface
        fun retour() = runOnUiThread { finish() }
    }

    override fun onDestroy() {
        // L'émulateur s'arrête avec l'écran : sa mémoire est rendue
        web.destroy()
        super.onDestroy()
    }
}
