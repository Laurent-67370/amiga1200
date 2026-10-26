package fr.crystalhammer.game

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.graphics.*
import android.text.InputFilter
import android.text.InputType
import android.view.HapticFeedbackConstants
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.widget.EditText
import java.util.Locale
import kotlin.math.*

internal class GameView(context: Context) : View(context) {
    private val engine = GameEngine(context)
    private val sound = SoundPlayer()
    private val preferences = context.getSharedPreferences("crystal_hammer", Context.MODE_PRIVATE)
    private val highScores = HighScoreStore(context)
    private var leaderboard = highScores.entries()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val path = Path()
    private val bold = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    private val regular = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
    private val monoBold = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    private var pendingEntry: HighScoreEntry? = null
    private var recentEntry: HighScoreEntry? = null
    private val backgroundPalettes = arrayOf(
        intArrayOf(0xFF167F8C.toInt(), 0xFF185D9C.toInt(), 0xFF527D38.toInt(), 0xFF858322.toInt()),
        intArrayOf(0xFF56358F.toInt(), 0xFF283F91.toInt(), 0xFF9A3D79.toInt(), 0xFF246F86.toInt()),
        intArrayOf(0xFF963E35.toInt(), 0xFFAA6828.toInt(), 0xFF6E3D83.toInt(), 0xFF3F637E.toInt()),
        intArrayOf(0xFF16705E.toInt(), 0xFF27824C.toInt(), 0xFF176B82.toInt(), 0xFF34477D.toInt()),
        intArrayOf(0xFF315C83.toInt(), 0xFF4B7187.toInt(), 0xFF5D6085.toInt(), 0xFF27747A.toInt())
    )
    private var viewScale = 1f
    private var offsetX = 0f
    private var offsetY = 0f
    // Marges sûres autour des encoches et caméras : le terrain de jeu n'y est jamais dessiné.
    private var safeLeft = 0
    private var safeTop = 0
    private var safeRight = 0
    private var safeBottom = 0
    private var lastFrame = 0L
    private var accumulator = 0f
    private var running = true
    private var clock = 0f
    private var background: LinearGradient? = null
    private var cachedBackground: Bitmap? = null
    private var cachedBackgroundLevel = -1
    private var cachedBackgroundScale = 0f
    private var brickLayer: Bitmap? = null
    private var brickLayerVersion = -1
    private var brickLayerScale = 0f
    private val brickLayerBounds = RectF(
        GameEngine.LEFT, GameEngine.BRICK_TOP,
        GameEngine.RIGHT, GameEngine.BRICK_TOP + GameEngine.ROWS * GameEngine.BRICK_HEIGHT
    )
    private var ballGlowShader: Shader? = null
    private var ballBodyShader: Shader? = null
    private val powerGlowShader = RadialGradient(0f, 0f, 1f, 0x66FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP)
    private var steeringPointerId = MotionEvent.INVALID_POINTER_ID
    private var extraLifeBanner = 0f
    private var lastScreen = engine.state.screen
    private var nameDialog: AlertDialog? = null
    private var lastInteraction = System.nanoTime()
    private var demoMode = false
    private var demoLevelIndex = 0
    private var demoLevelTime = 0f
    private var demoActionTime = 0f
    private val demoLevels = intArrayOf(1, 8, 15, 22, 29, 30)
    private val idleTimeoutNanos = 60_000_000_000L
    private var bonusIndex = 0
    private var bonusTimer = 0f
    private var bonusAnimation = 0f
    private val bonusNames = arrayOf(
        "VAISSEAU LARGE", "BALLE LENTE", "CRISTAL COLLANT", "MULTI-BALLES",
        "LASER JUMELAIRE", "VIE SUPPLÉMENTAIRE", "SAUT DE TABLEAU", "MALUS : À ÉVITER"
    )
    private val bonusDescriptions = arrayOf(
        arrayOf("Plus de largeur pendant 18 s", "pour rattraper la balle."),
        arrayOf("Ralentit les balles", "pour mieux viser et anticiper."),
        arrayOf("Capture la balle au contact.", "Retouche pour la relancer."),
        arrayOf("Divise la balle en trois", "pour casser plus de cristaux."),
        arrayOf("Touche pour tirer pendant 12 s", "et viser les cristaux."),
        arrayOf("Ajoute immédiatement", "une vie à ta partie."),
        arrayOf("Termine instantanément", "le tableau en cours."),
        arrayOf("Fait perdre une vie !", "Laisse filer ce cristal gris.")
    )
    private var soundEnabled = preferences.getBoolean("sound_enabled", true)
    private var hapticsEnabled = preferences.getBoolean("haptics_enabled", true)
    private var touchSensitivity = preferences.getFloat("touch_sensitivity", 1f)
    private var controlMode = runCatching {
        ControlMode.valueOf(preferences.getString("control_mode", ControlMode.RELATIVE.name)!!)
    }.getOrDefault(ControlMode.RELATIVE)
    private var selectedDifficulty = runCatching {
        Difficulty.valueOf(preferences.getString("difficulty", Difficulty.NORMAL.name)!!)
    }.getOrDefault(Difficulty.NORMAL)
    private var effectsVolume = preferences.getInt("effects_volume", 70)
    private var musicVolume = preferences.getInt("music_volume", 35)
    private var visualEffects = preferences.getBoolean("visual_effects", true)
    private var settingsOpen = false
    private var lastTouchX = 0f
    private var zoneDirection = 0
    private var leftPressed = false
    private var rightPressed = false
    private var gamepadAxis = 0f
    private var shakeAmount = 0f
    private var impactFlash = 0f
    private var tutorialStep = 0
    private var tutorialTimer = 0f

    init {
        isFocusable = true
        isFocusableInTouchMode = true
        requestFocus()
        sound.setEffectsVolume(effectsVolume)
        sound.setMusicVolume(musicVolume)
        engine.state.highScore = preferences.getInt("high_score", 0)
        engine.eventListener = { event ->
            if (!demoMode) {
                if (soundEnabled) sound.play(event)
                if (hapticsEnabled) {
                    when (event) {
                        GameEvent.POWER, GameEvent.EXTRA_LIFE ->
                            performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                        GameEvent.LOST -> performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                        GameEvent.LEVEL -> performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                        else -> Unit
                    }
                }
                if (event == GameEvent.POWER && tutorialStep == 3) finishTutorial()
                if (event == GameEvent.EXTRA_LIFE) extraLifeBanner = 1.6f
            }
            if (visualEffects) {
                when (event) {
                    GameEvent.LOST -> { shakeAmount = 5f; impactFlash = 0.34f }
                    GameEvent.LEVEL -> { shakeAmount = 2.5f; impactFlash = 0.20f }
                    GameEvent.POWER, GameEvent.EXTRA_LIFE -> impactFlash = 0.13f
                    GameEvent.BRICK, GameEvent.WORM -> shakeAmount = max(shakeAmount, 0.8f)
                    else -> Unit
                }
            }
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        updateLayout(w, h)
        background = LinearGradient(0f, 0f, 0f, h.toFloat(), 0xFF030611.toInt(), 0xFF101638.toInt(), Shader.TileMode.CLAMP)
    }

    override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            val cutout = insets.displayCutout
            safeLeft = cutout?.safeInsetLeft ?: 0
            safeTop = cutout?.safeInsetTop ?: 0
            safeRight = cutout?.safeInsetRight ?: 0
            safeBottom = cutout?.safeInsetBottom ?: 0
            if (width > 0 && height > 0) updateLayout(width, height)
        }
        return super.onApplyWindowInsets(insets)
    }

    private fun updateLayout(w: Int, h: Int) {
        val availableWidth = (w - safeLeft - safeRight).coerceAtLeast(1)
        val availableHeight = (h - safeTop - safeBottom).coerceAtLeast(1)
        viewScale = min(availableWidth / GameEngine.WIDTH, availableHeight / GameEngine.HEIGHT)
        offsetX = safeLeft + (availableWidth - GameEngine.WIDTH * viewScale) / 2f
        offsetY = safeTop + (availableHeight - GameEngine.HEIGHT * viewScale) / 2f
    }

    /** Résolution des calques en cache : nette sur les grands écrans, bornée pour la mémoire. */
    private fun cacheScale(): Float = viewScale.coerceIn(1f, 3f)

    override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
        super.onWindowFocusChanged(hasWindowFocus)
        // Volet de notifications, appel entrant ou fenêtre système : la partie se met en pause.
        if (!hasWindowFocus && !demoMode) {
            engine.pause()
            releaseControls()
        }
    }

    private fun releaseControls() {
        zoneDirection = 0
        leftPressed = false
        rightPressed = false
        gamepadAxis = 0f
        steeringPointerId = MotionEvent.INVALID_POINTER_ID
        engine.state.fireHeld = false
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val now = System.nanoTime()
        val elapsed = if (lastFrame == 0L) 0f else ((now - lastFrame) / 1_000_000_000.0).toFloat().coerceAtMost(0.05f)
        lastFrame = now
        if (running && !demoMode && engine.state.screen == Screen.TITLE && now - lastInteraction >= idleTimeoutNanos) {
            startDemo()
        }
        clock += elapsed
        shakeAmount = max(0f, shakeAmount - elapsed * 15f)
        impactFlash = max(0f, impactFlash - elapsed * 1.8f)
        extraLifeBanner = max(0f, extraLifeBanner - elapsed)
        if (running && !demoMode && engine.state.screen == Screen.TITLE) {
            bonusTimer += elapsed
            bonusAnimation = max(0f, bonusAnimation - elapsed * 3.5f)
            if (bonusTimer >= 4.5f) advanceBonusGuide()
        }
        if (running) {
            accumulator += elapsed
            val step = 1f / 120f
            while (accumulator >= step) {
                if (demoMode) updateDemo(step) else {
                    updateTutorial(step)
                    updateDirectionalControls(step)
                }
                engine.update(step)
                accumulator -= step
            }
        }
        checkHighScorePrompt()

        paint.shader = background
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        paint.shader = null
        canvas.save()
        canvas.translate(offsetX, offsetY)
        canvas.scale(viewScale, viewScale)
        drawBackground(canvas)
        when (engine.state.screen) {
            Screen.TITLE -> drawTitle(canvas)
            Screen.HIGH_SCORES -> drawHighScoreTable(canvas)
            else -> {
                canvas.save()
                if (visualEffects && shakeAmount > 0f) {
                    canvas.translate(sin(clock * 91f) * shakeAmount, cos(clock * 77f) * shakeAmount * 0.55f)
                }
                drawGame(canvas)
                canvas.restore()
            }
        }
        if (demoMode) drawDemoBadge(canvas)
        canvas.restore()
        if (running) postInvalidateOnAnimation()
    }

    private fun drawBackground(canvas: Canvas) {
        val level = if (engine.state.screen == Screen.TITLE) 1 else engine.state.level.coerceIn(1, 30)
        val scale = cacheScale()
        if (cachedBackgroundLevel != level || cachedBackgroundScale != scale || cachedBackground == null) {
            cachedBackground?.recycle()
            val bitmap = Bitmap.createBitmap(
                ceil(GameEngine.WIDTH * scale).toInt(), ceil(GameEngine.HEIGHT * scale).toInt(),
                Bitmap.Config.ARGB_8888
            )
            val offscreen = Canvas(bitmap)
            offscreen.scale(scale, scale)
            drawBackgroundContent(offscreen, level)
            cachedBackground = bitmap
            cachedBackgroundLevel = level
            cachedBackgroundScale = scale
        }
        canvas.drawBitmap(cachedBackground!!, null, RectF(0f, 0f, GameEngine.WIDTH, GameEngine.HEIGHT), bitmapPaint)
    }

    /** Les 400 cristaux ne sont redessinés que lorsqu'ils changent, pas à chaque image. */
    private fun drawBricks(canvas: Canvas) {
        val scale = cacheScale()
        val version = engine.state.bricksVersion
        var layer = brickLayer
        if (layer == null || brickLayerScale != scale) {
            layer?.recycle()
            layer = Bitmap.createBitmap(
                ceil(brickLayerBounds.width() * scale).toInt(), ceil(brickLayerBounds.height() * scale).toInt(),
                Bitmap.Config.ARGB_8888
            )
            brickLayer = layer
            brickLayerScale = scale
            brickLayerVersion = -1
        }
        if (brickLayerVersion != version) {
            layer.eraseColor(Color.TRANSPARENT)
            val offscreen = Canvas(layer)
            offscreen.scale(scale, scale)
            offscreen.translate(-brickLayerBounds.left, -brickLayerBounds.top)
            for (index in engine.state.bricks.indices) {
                val brick = engine.state.bricks[index]
                if (brick.hits > 0) drawBrick(offscreen, GameEngine.brickRect(index), brick)
            }
            brickLayerVersion = version
        }
        canvas.drawBitmap(layer, null, brickLayerBounds, bitmapPaint)
    }

    private fun drawBackgroundContent(canvas: Canvas, level: Int) {
        paint.color = 0xFF03050D.toInt()
        canvas.drawRoundRect(RectF(3f, 3f, 357f, 638f), 14f, 14f, paint)

        // Le décor est calculé une seule fois par tableau, puis réutilisé à chaque image.
        canvas.save()
        canvas.clipRect(GameEngine.LEFT, GameEngine.TOP, GameEngine.RIGHT, GameEngine.HEIGHT)
        val palette = backgroundPalettes[(level - 1) / 6]
        when ((level - 1) % 6) {
            0 -> drawChevronPattern(canvas, palette)
            1 -> drawDiamondPattern(canvas, palette)
            2 -> drawWavePattern(canvas, palette)
            3 -> drawTrianglePattern(canvas, palette)
            4 -> drawRingPattern(canvas, palette)
            else -> drawRibbonPattern(canvas, palette)
        }
        paint.style = Paint.Style.FILL
        paint.strokeCap = Paint.Cap.BUTT
        paint.shader = LinearGradient(
            0f, GameEngine.TOP, 0f, GameEngine.HEIGHT,
            0x08000000, 0x48000000, Shader.TileMode.CLAMP
        )
        canvas.drawRect(GameEngine.LEFT, GameEngine.TOP, GameEngine.RIGHT, GameEngine.HEIGHT, paint)
        paint.shader = null
        canvas.restore()

        // Bordures métalliques rivetées.
        for (side in listOf(GameEngine.LEFT, GameEngine.RIGHT)) {
            paint.color = 0xFF263647.toInt()
            canvas.drawRect(side - 3f, GameEngine.TOP, side + 1f, GameEngine.HEIGHT, paint)
            var segmentY = GameEngine.TOP + 2f
            while (segmentY < GameEngine.HEIGHT) {
                val left = if (side == GameEngine.LEFT) side - 4f else side
                paint.color = 0xFF8D9BA7.toInt()
                canvas.drawRect(left, segmentY, left + 4f, segmentY + 11f, paint)
                paint.color = 0xFFD8E2E5.toInt()
                canvas.drawRect(left + 0.7f, segmentY + 1f, left + 3.3f, segmentY + 2f, paint)
                paint.color = 0xFF1B2630.toInt()
                canvas.drawCircle(left + 2f, segmentY + 7.5f, 0.8f, paint)
                segmentY += 14f
            }
        }
    }

    private fun drawChevronPattern(canvas: Canvas, palette: IntArray) {
        var row = 0
        var y = GameEngine.TOP - 4f
        paint.style = Paint.Style.STROKE
        paint.strokeJoin = Paint.Join.MITER
        while (y < GameEngine.HEIGHT + 35f) {
            val start = GameEngine.LEFT - 58f + if (row % 2 == 0) 0f else 28f
            path.reset()
            path.moveTo(start, y)
            var x = start
            while (x < GameEngine.RIGHT + 58f) {
                path.lineTo(x + 28f, y - 19f)
                path.lineTo(x + 56f, y)
                x += 56f
            }
            paint.strokeWidth = 25f
            paint.color = 0xFF07111F.toInt()
            canvas.drawPath(path, paint)
            paint.strokeWidth = 21f
            paint.color = palette[row % palette.size]
            canvas.drawPath(path, paint)
            paint.strokeWidth = 1f
            paint.color = lighten(palette[row % palette.size], 0.22f)
            canvas.drawPath(path, paint)
            row++
            y += 34f
        }
    }

    private fun drawDiamondPattern(canvas: Canvas, palette: IntArray) {
        val step = 36f
        var row = 0
        var y = GameEngine.TOP - step
        while (y < GameEngine.HEIGHT + step) {
            var x = GameEngine.LEFT - step + if (row % 2 == 0) 0f else step / 2f
            var column = 0
            while (x < GameEngine.RIGHT + step) {
                path.reset()
                path.moveTo(x, y - 16f)
                path.lineTo(x + 16f, y)
                path.lineTo(x, y + 16f)
                path.lineTo(x - 16f, y)
                path.close()
                val color = palette[(row + column) % palette.size]
                paint.style = Paint.Style.FILL
                paint.color = color
                canvas.drawPath(path, paint)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 1.5f
                paint.color = 0xFF07111F.toInt()
                canvas.drawPath(path, paint)
                paint.strokeWidth = 0.8f
                paint.color = lighten(color, 0.32f)
                canvas.drawLine(x - 12f, y, x, y - 12f, paint)
                x += step
                column++
            }
            row++
            y += step * 0.88f
        }
    }

    private fun drawWavePattern(canvas: Canvas, palette: IntArray) {
        var row = 0
        var y = GameEngine.TOP - 12f
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        while (y < GameEngine.HEIGHT + 30f) {
            path.reset()
            path.moveTo(GameEngine.LEFT - 16f, y)
            var x = GameEngine.LEFT - 16f
            while (x <= GameEngine.RIGHT + 16f) {
                path.lineTo(x, y + sin(x * 0.085f + row * 0.9f) * 9f)
                x += 7f
            }
            val color = palette[row % palette.size]
            paint.strokeWidth = 20f
            paint.color = 0xFF07111F.toInt()
            canvas.drawPath(path, paint)
            paint.strokeWidth = 16f
            paint.color = color
            canvas.drawPath(path, paint)
            paint.strokeWidth = 1f
            paint.color = lighten(color, 0.35f)
            canvas.drawPath(path, paint)
            row++
            y += 34f
        }
    }

    private fun drawTrianglePattern(canvas: Canvas, palette: IntArray) {
        val width = 38f
        val height = 32f
        var row = 0
        var y = GameEngine.TOP - height
        while (y < GameEngine.HEIGHT + height) {
            var x = GameEngine.LEFT - width
            var column = 0
            while (x < GameEngine.RIGHT + width) {
                for (half in 0 until 2) {
                    path.reset()
                    if (half == 0) {
                        path.moveTo(x, y)
                        path.lineTo(x + width, y)
                        path.lineTo(x, y + height)
                    } else {
                        path.moveTo(x + width, y)
                        path.lineTo(x + width, y + height)
                        path.lineTo(x, y + height)
                    }
                    path.close()
                    val color = palette[(row + column + half) % palette.size]
                    paint.style = Paint.Style.FILL
                    paint.color = color
                    canvas.drawPath(path, paint)
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = 1.4f
                    paint.color = 0xFF07111F.toInt()
                    canvas.drawPath(path, paint)
                }
                x += width
                column++
            }
            row++
            y += height
        }
    }

    private fun drawRingPattern(canvas: Canvas, palette: IntArray) {
        val step = 46f
        var row = 0
        var y = GameEngine.TOP - 12f
        while (y < GameEngine.HEIGHT + step) {
            var x = GameEngine.LEFT + 12f + if (row % 2 == 0) 0f else step / 2f
            var column = 0
            while (x < GameEngine.RIGHT + step) {
                val color = palette[(row + column) % palette.size]
                paint.style = Paint.Style.FILL
                paint.color = 0xFF07111F.toInt()
                canvas.drawCircle(x, y, 19f, paint)
                paint.color = color
                canvas.drawCircle(x, y, 16.5f, paint)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 2.2f
                paint.color = lighten(color, 0.35f)
                canvas.drawCircle(x, y, 10f, paint)
                paint.style = Paint.Style.FILL
                paint.color = darken(color, 0.45f)
                canvas.drawCircle(x, y, 3f, paint)
                x += step
                column++
            }
            row++
            y += step * 0.86f
        }
    }

    private fun drawRibbonPattern(canvas: Canvas, palette: IntArray) {
        val height = GameEngine.HEIGHT - GameEngine.TOP
        var x = GameEngine.LEFT - height
        var band = 0
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.BUTT
        while (x < GameEngine.RIGHT) {
            val endX = x + height
            val color = palette[band % palette.size]
            paint.strokeWidth = 27f
            paint.color = 0xFF07111F.toInt()
            canvas.drawLine(x, GameEngine.HEIGHT, endX, GameEngine.TOP, paint)
            paint.strokeWidth = 22f
            paint.color = color
            canvas.drawLine(x, GameEngine.HEIGHT, endX, GameEngine.TOP, paint)
            paint.strokeWidth = 1f
            paint.color = lighten(color, 0.35f)
            canvas.drawLine(x, GameEngine.HEIGHT, endX, GameEngine.TOP, paint)
            if (band % 2 == 0) {
                val nodeX = x + height * 0.52f
                val nodeY = GameEngine.TOP + height * 0.48f
                paint.style = Paint.Style.FILL
                paint.color = 0xFF07111F.toInt()
                canvas.drawCircle(nodeX, nodeY, 4.2f, paint)
                paint.color = lighten(color, 0.5f)
                canvas.drawCircle(nodeX, nodeY, 2.2f, paint)
                paint.style = Paint.Style.STROKE
            }
            x += 44f
            band++
        }
    }

    private fun drawTitle(canvas: Canvas) {
        // Des panneaux translucides laissent voir le décor sans nuire à la lecture.
        paint.color = 0xD9071020.toInt()
        canvas.drawRoundRect(RectF(25f, 72f, 335f, 338f), 18f, 18f, paint)
        canvas.drawRoundRect(RectF(38f, 438f, 322f, 614f), 14f, 14f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.2f
        paint.color = 0xFF47768B.toInt()
        canvas.drawRoundRect(RectF(25f, 72f, 335f, 338f), 18f, 18f, paint)
        paint.style = Paint.Style.FILL

        drawCrystal(canvas, 180f, 135f, 58f, 0xFF55E6FF.toInt(), clock * 12f)
        text(canvas, "CRYSTAL", 180f, 245f, 43f, 0xFFE8FAFF.toInt(), true)
        text(canvas, "HAMMER", 180f, 289f, 43f, 0xFF63DDFF.toInt(), true)
        text(canvas, "RECRÉATION ANDROID NATIVE", 180f, 320f, 11f, 0xFF92A6C9.toInt(), false)
        text(canvas, "DÉMO AUTO APRÈS 60 S D'INACTIVITÉ", 180f, 63f, 8f, 0xFF9CB2D3.toInt(), true, font = monoBold)
        drawMenuButton(
            canvas, RectF(88f, 337f, 272f, 357f),
            "DIFFICULTÉ : ${selectedDifficulty.label}", 0xFFB18CFF.toInt()
        )

        val progress = hasProgress()
        val primaryButton = if (progress) RectF(54f, 358f, 306f, 400f) else RectF(54f, 365f, 306f, 414f)
        paint.color = 0xFF142C50.toInt()
        canvas.drawRoundRect(primaryButton, 22f, 22f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.5f
        paint.color = 0xFF58DFFB.toInt()
        canvas.drawRoundRect(primaryButton, 22f, 22f, paint)
        paint.style = Paint.Style.FILL
        if (progress) {
            val savedLevel = preferences.getInt("saved_level", 1)
            text(canvas, "CONTINUER • TABLEAU $savedLevel", 180f, 384f, 13f, Color.WHITE, true)
            paint.color = 0xFF101F35.toInt()
            canvas.drawRoundRect(RectF(78f, 405f, 282f, 434f), 13f, 13f, paint)
            text(canvas, "NOUVELLE PARTIE", 180f, 424f, 10f, 0xFF9CEBFF.toInt(), true)
        } else {
            text(canvas, "TOUCHER POUR JOUER", 180f, 397f, 16f, Color.WHITE, true)
            val controlHint = when (controlMode) {
                ControlMode.RELATIVE -> "GLISSE POUR PILOTER  •  TOUCHE POUR LANCER OU TIRER"
                ControlMode.DIRECT -> "GUIDE LE VAISSEAU  •  TOUCHE POUR LANCER OU TIRER"
                ControlMode.ZONES -> "ZONES POUR PILOTER  •  CENTRE POUR LANCER OU TIRER"
            }
            text(canvas, controlHint, 180f, 429f, 8f, 0xFFD5E2F5.toInt(), true, font = monoBold)
        }
        drawBonusGuide(canvas)
        text(canvas, "MEILLEURS SCORES", 180f, 537f, 10f, 0xFFFFD85A.toInt(), true)
        if (leaderboard.isEmpty()) {
            val label = if (engine.state.highScore > 0) "RECORD ACTUEL  ${engine.state.highScore}" else "AUCUN SCORE ENREGISTRÉ"
            text(canvas, label, 180f, 559f, 11f, 0xFFD5E2F5.toInt(), false)
        } else {
            leaderboard.take(5).forEachIndexed { index, entry ->
                val y = 551f + index * 15f
                text(canvas, "${index + 1}.", 65f, y, 10f, 0xFF7F98BD.toInt(), true, Paint.Align.LEFT)
                text(canvas, entry.name, 88f, y, 10f, Color.WHITE, true, Paint.Align.LEFT)
                text(canvas, entry.score.toString(), 288f, y, 10f, 0xFFFFD85A.toInt(), true, Paint.Align.RIGHT)
            }
        }
        text(canvas, "Code, visuels et sons recréés — aucun émulateur", 180f, 625f, 8f, 0xFF6F83A4.toInt(), false)
    }

    private fun drawBonusGuide(canvas: Canvas) {
        val type = PowerType.values()[bonusIndex]
        val accent = type.color.toInt()
        val card = RectF(46f, 443f, 314f, 525f)
        paint.color = 0xE80B1728.toInt()
        canvas.drawRoundRect(card, 10f, 10f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1f
        paint.color = accent
        canvas.drawRoundRect(card, 10f, 10f, paint)
        paint.style = Paint.Style.FILL
        text(canvas, "MINI GUIDE DES BONUS", 58f, 458f, 7.5f, 0xFF9CB2D3.toInt(), true, Paint.Align.LEFT, monoBold)
        text(canvas, "${bonusIndex + 1} / 8", 302f, 458f, 8f, accent, true, Paint.Align.RIGHT, monoBold)

        canvas.save()
        canvas.clipRect(48f, 463f, 312f, 512f)
        canvas.translate(bonusAnimation * bonusAnimation * 34f, 0f)
        paint.shader = RadialGradient(74f, 486f, 23f, 0x55FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP)
        canvas.drawCircle(74f, 486f, 23f, paint)
        paint.shader = null
        drawCrystal(canvas, 74f, 486f, 15f, accent, clock * 24f)
        text(canvas, type.symbol, 74f, 491f, 13f, Color.WHITE, true, font = monoBold)
        text(canvas, bonusNames[bonusIndex], 104f, 478f, 10.5f, accent, true, Paint.Align.LEFT, monoBold)
        text(canvas, bonusDescriptions[bonusIndex][0], 104f, 495f, 9f, 0xFFE7F2FF.toInt(), false, Paint.Align.LEFT)
        text(canvas, bonusDescriptions[bonusIndex][1], 104f, 509f, 9f, 0xFFB5C8E2.toInt(), false, Paint.Align.LEFT)
        canvas.restore()

        for (index in PowerType.values().indices) {
            paint.color = if (index == bonusIndex) accent else 0xFF40526A.toInt()
            canvas.drawCircle(137f + index * 10f, 518f, if (index == bonusIndex) 2.2f else 1.4f, paint)
        }
        text(canvas, "TOUCHEZ", 301f, 520f, 7f, 0xFF7F98BD.toInt(), true, Paint.Align.RIGHT, monoBold)
    }

    private fun advanceBonusGuide() {
        bonusIndex = (bonusIndex + 1) % PowerType.values().size
        bonusTimer = 0f
        bonusAnimation = 1f
    }

    private fun drawGame(canvas: Canvas) {
        drawHud(canvas)
        drawBricks(canvas)
        engine.state.worms.forEach { drawWorm(canvas, it) }
        engine.state.powerUps.forEach { drawPowerUp(canvas, it) }
        engine.state.lasers.forEach { laser ->
            paint.color = 0xFFFF4E67.toInt()
            canvas.drawRoundRect(RectF(laser.x - 1.3f, laser.y - 7f, laser.x + 1.3f, laser.y + 5f), 1f, 1f, paint)
            paint.color = 0xFFFFE4E9.toInt()
            canvas.drawRect(laser.x - 0.45f, laser.y - 6f, laser.x + 0.45f, laser.y + 3f, paint)
        }
        if (visualEffects) engine.state.particles.forEach { particle ->
            paint.color = particle.color
            paint.alpha = (particle.life * 255).toInt().coerceIn(0, 255)
            canvas.drawCircle(particle.x, particle.y, 1.7f, paint)
        }
        paint.alpha = 255
        drawPaddle(canvas)
        engine.state.balls.forEach { drawBall(canvas, it) }
        if (engine.state.screen == Screen.PLAYING && controlMode == ControlMode.ZONES) drawControlZones(canvas)
        if (visualEffects && impactFlash > 0f) {
            paint.color = Color.WHITE
            paint.alpha = (impactFlash * 100).toInt().coerceIn(0, 45)
            canvas.drawRect(GameEngine.LEFT, GameEngine.TOP, GameEngine.RIGHT, GameEngine.HEIGHT, paint)
            paint.alpha = 255
        }

        if (extraLifeBanner > 0f && engine.state.screen == Screen.PLAYING) {
            val alpha = (extraLifeBanner / 0.4f).coerceAtMost(1f)
            val rise = (1.6f - extraLifeBanner) * 10f
            paint.color = 0xD9081322.toInt()
            paint.alpha = (alpha * 217).toInt()
            canvas.drawRoundRect(RectF(92f, 470f - rise, 268f, 494f - rise), 12f, 12f, paint)
            text(canvas, "VIE SUPPLÉMENTAIRE !", 180f, 486f - rise, 11f, 0xFFFF9B45.toInt(), true, font = monoBold)
        }

        if (engine.state.screen == Screen.PLAYING && tutorialStep > 0) {
            drawTutorialGuide(canvas)
        } else if (engine.state.screen == Screen.PLAYING && engine.state.balls.any { it.stuck }) {
            text(canvas, "TOUCHEZ POUR LANCER", 180f, 552f, 11f, 0xFFD7F7FF.toInt(), true)
        }
        when (engine.state.screen) {
            Screen.INTRO -> drawLevelIntro(canvas)
            Screen.PAUSED -> drawPauseMenu(canvas)
            Screen.LEVEL_CLEAR -> overlay(canvas, "NIVEAU TERMINÉ", "+ ${1000 + engine.state.lives * 100} POINTS")
            Screen.GAME_OVER -> drawRunSummary(canvas, false)
            Screen.VICTORY -> drawRunSummary(canvas, true)
            else -> Unit
        }
    }

    private fun drawControlZones(canvas: Canvas) {
        for (left in booleanArrayOf(true, false)) {
            val rect = if (left) RectF(13f, 610f, 103f, 635f) else RectF(257f, 610f, 347f, 635f)
            paint.color = 0x7014233A
            canvas.drawRoundRect(rect, 10f, 10f, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 0.8f
            paint.color = 0x8058DFFB.toInt()
            canvas.drawRoundRect(rect, 10f, 10f, paint)
            paint.style = Paint.Style.FILL
            text(canvas, if (left) "◀ GAUCHE" else "DROITE ▶", rect.centerX(), 627f, 8f, 0xAAE8FAFF.toInt(), true, font = monoBold)
        }
        text(canvas, "CENTRE : LANCER / TIRER", 180f, 627f, 7f, 0xAA9CB2D3.toInt(), true, font = monoBold)
    }

    private fun drawRunSummary(canvas: Canvas, victory: Boolean) {
        paint.color = 0xE9050916.toInt()
        canvas.drawRect(0f, 0f, GameEngine.WIDTH, GameEngine.HEIGHT, paint)
        paint.color = 0xF2102643.toInt()
        canvas.drawRoundRect(RectF(28f, 157f, 332f, 491f), 18f, 18f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.3f
        paint.color = if (victory) 0xFFFFD85A.toInt() else 0xFF63DDFF.toInt()
        canvas.drawRoundRect(RectF(28f, 157f, 332f, 491f), 18f, 18f, paint)
        paint.style = Paint.Style.FILL
        text(canvas, if (victory) "CRISTAUX LIBÉRÉS !" else "PARTIE TERMINÉE", 180f, 198f, 22f, 0xFF6DE6FF.toInt(), true)
        text(canvas, "SCORE  ${String.format(Locale.FRANCE, "%06d", engine.state.score)}", 180f, 237f, 20f, 0xFFFFD85A.toInt(), true, font = monoBold)
        text(canvas, "DIFFICULTÉ ${engine.state.difficulty.label}", 180f, 261f, 9f, 0xFFB5C8E2.toInt(), true, font = monoBold)
        val stats = engine.state.stats
        val precision = if (stats.laserShots == 0) "—" else "${stats.laserPrecision} %"
        val rows = arrayOf(
            "TABLEAUX TERMINÉS" to stats.levelsCompleted.toString(),
            "CRISTAUX DÉTRUITS" to stats.bricksDestroyed.toString(),
            "BONUS RÉCUPÉRÉS" to stats.powerUpsCollected.toString(),
            "MEILLEURE SÉRIE" to stats.bestCombo.toString(),
            "PRÉCISION LASER" to precision
        )
        rows.forEachIndexed { index, row ->
            val y = 298f + index * 31f
            text(canvas, row.first, 57f, y, 9f, 0xFF9CB2D3.toInt(), true, Paint.Align.LEFT, monoBold)
            text(canvas, row.second, 303f, y, 12f, Color.WHITE, true, Paint.Align.RIGHT, monoBold)
        }
        if (sin(clock * 5f) > -0.25f) {
            text(canvas, "TOUCHEZ POUR LES HIGHSCORES", 180f, 471f, 9f, 0xFF9CEBFF.toInt(), true, font = monoBold)
        }
    }

    private fun drawHighScoreTable(canvas: Canvas) {
        // Damier de points bleus et typographie monospace inspirés de l'écran Amiga.
        paint.color = 0xF8070B10.toInt()
        canvas.drawRect(GameEngine.LEFT, GameEngine.TOP, GameEngine.RIGHT, GameEngine.HEIGHT, paint)
        paint.color = 0xFF153D91.toInt()
        var dotY = GameEngine.TOP + 10f
        while (dotY < GameEngine.HEIGHT) {
            var dotX = GameEngine.LEFT + 12f
            while (dotX < GameEngine.RIGHT) {
                canvas.drawCircle(dotX, dotY, 4.2f, paint)
                dotX += 22f
            }
            dotY += 22f
        }
        paint.color = 0xB8050910.toInt()
        canvas.drawRoundRect(RectF(23f, 70f, 337f, 616f), 8f, 8f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.2f
        paint.color = 0xFF6D8296.toInt()
        canvas.drawRoundRect(RectF(23f, 70f, 337f, 616f), 8f, 8f, paint)
        paint.style = Paint.Style.FILL

        text(canvas, "CRYSTAL HAMMER", 182f, 106f, 23f, 0xFF300713.toInt(), true, font = monoBold)
        text(canvas, "CRYSTAL HAMMER", 180f, 104f, 23f, 0xFFE34C63.toInt(), true, font = monoBold)
        text(canvas, "H E R O E S", 180f, 132f, 18f, 0xFFFF7082.toInt(), true, font = monoBold)
        text(canvas, "LES 20 MEILLEURS PILOTES", 180f, 153f, 9f, 0xFF8EA9D5.toInt(), true, font = monoBold)

        val entries = (leaderboard + listOfNotNull(pendingEntry))
            .sortedWith(compareByDescending<HighScoreEntry> { it.score }.thenBy { it.name })
            .take(HighScoreLeaderboard.MAX_ENTRIES)
        for (index in 0 until HighScoreLeaderboard.MAX_ENTRIES) {
            val entry = entries.getOrNull(index)
            val y = 178f + index * 19.4f
            val highlighted = entry != null && entry == recentEntry
            if (highlighted) {
                paint.color = if (sin(clock * 7f) > 0f) 0x6638CFE8 else 0x3338CFE8
                canvas.drawRoundRect(RectF(35f, y - 13f, 325f, y + 4f), 3f, 3f, paint)
            }
            val color = when {
                highlighted -> 0xFF72F4FF.toInt()
                entry != null -> 0xFFE34C63.toInt()
                else -> 0xFF63303E.toInt()
            }
            text(canvas, "${index + 1}.", 74f, y, 12f, color, true, Paint.Align.RIGHT, monoBold)
            text(canvas, entry?.name ?: "...", 125f, y, 13f, color, true, Paint.Align.CENTER, monoBold)
            text(canvas, String.format(Locale.FRANCE, "%06d", entry?.score ?: 0), 311f, y, 13f, color, true, Paint.Align.RIGHT, monoBold)
        }

        val message = when {
            pendingEntry != null -> "NOUVEAU SCORE — ENTRE TES 3 INITIALES"
            recentEntry != null -> "SCORE ENREGISTRÉ !"
            else -> "TON SCORE  ${String.format(Locale.FRANCE, "%06d", engine.state.score)}"
        }
        text(canvas, message, 180f, 584f, 10f, 0xFFFFD85A.toInt(), true, font = monoBold)
        if (pendingEntry == null && sin(clock * 5f) > -0.25f) {
            text(canvas, "TOUCHEZ POUR CONTINUER", 180f, 606f, 9f, 0xFF9CEBFF.toInt(), true, font = monoBold)
        }
    }

    private fun drawLevelIntro(canvas: Canvas) {
        val level = engine.state.level
        val accent = crystalColor((level - 1) % 7 + 1)
        paint.color = 0xB8050912.toInt()
        canvas.drawRect(0f, 0f, GameEngine.WIDTH, GameEngine.HEIGHT, paint)
        paint.color = 0xF20B1422.toInt()
        canvas.drawRoundRect(RectF(31f, 164f, 329f, 452f), 14f, 14f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2f
        paint.color = accent
        canvas.drawRoundRect(RectF(31f, 164f, 329f, 452f), 14f, 14f, paint)
        paint.strokeWidth = 0.8f
        paint.color = 0xFFE7F6FF.toInt()
        canvas.drawRoundRect(RectF(35f, 168f, 325f, 448f), 11f, 11f, paint)
        paint.style = Paint.Style.FILL

        drawCrystal(canvas, 126f, 213f, 18f, accent, -clock * 20f)
        drawCrystal(canvas, 180f, 204f, 25f, accent, clock * 16f)
        drawCrystal(canvas, 234f, 213f, 18f, accent, clock * 20f)
        text(canvas, if (level == 1 && engine.state.score == 0) "NOUVELLE PARTIE" else "TABLEAU SUIVANT", 180f, 258f, 10f, 0xFF9CB2D3.toInt(), true, font = monoBold)
        text(canvas, "TABLEAU ${level.toString().padStart(2, '0')}", 182f, 306f, 27f, 0xFF07101C.toInt(), true, font = monoBold)
        text(canvas, "TABLEAU ${level.toString().padStart(2, '0')}", 180f, 303f, 27f, 0xFFEFFCFF.toInt(), true, font = monoBold)
        text(canvas, "NIVEAU $level / 30", 180f, 331f, 11f, accent, true, font = monoBold)
        text(canvas, "PRÉPARE-TOI", 180f, 365f, 17f, 0xFFFFD85A.toInt(), true, font = monoBold)

        val progress = (engine.state.stateTime / 1.8f).coerceIn(0f, 1f)
        paint.color = 0xFF253448.toInt()
        canvas.drawRoundRect(RectF(76f, 389f, 284f, 395f), 3f, 3f, paint)
        paint.color = accent
        canvas.drawRoundRect(RectF(76f, 389f, 76f + 208f * progress, 395f), 3f, 3f, paint)
        if (sin(clock * 6f) > -0.25f) {
            text(canvas, "TOUCHEZ POUR COMMENCER", 180f, 425f, 9f, 0xFF9CEBFF.toInt(), true, font = monoBold)
        }
    }

    private fun drawHud(canvas: Canvas) {
        text(canvas, "SCORE", 14f, 14f, 8f, 0xFF7F98BD.toInt(), true, Paint.Align.LEFT)
        text(canvas, String.format(Locale.FRANCE, "%06d", engine.state.score), 14f, 32f, 16f, Color.WHITE, true, Paint.Align.LEFT)
        text(canvas, "RECORD ${String.format(Locale.FRANCE, "%06d", engine.state.highScore)}", 14f, 46f, 8f, 0xFFFFD85A.toInt(), true, Paint.Align.LEFT)
        text(canvas, "NIVEAU ${engine.state.level}/30", 180f, 19f, 11f, 0xFF63DDFF.toInt(), true)
        text(canvas, "VIES ${"◆".repeat(engine.state.lives)}", 180f, 38f, 11f, 0xFFFFD85A.toInt(), true)
        text(canvas, "Ⅱ", 332f, 34f, 20f, 0xFFA9BEDC.toInt(), true)
        val effects = mutableListOf<String>()
        if (engine.state.wideTime > 0f) effects += "LARGE ${engine.state.wideTime.ceilToInt()}"
        if (engine.state.stickyTime > 0f) effects += "COLLE ${engine.state.stickyTime.ceilToInt()}"
        if (engine.state.laserTime > 0f) effects += "LASER ${engine.state.laserTime.ceilToInt()}"
        if (effects.isNotEmpty()) text(canvas, effects.joinToString("  "), 180f, 64f, 8f, 0xFF9CEBFF.toInt(), true)
    }

    private fun drawBrick(canvas: Canvas, rect: RectF, brick: Brick) {
        val r = RectF(rect.left + 0.35f, rect.top + 0.45f, rect.right - 0.35f, rect.bottom - 0.45f)
        val base = if (brick.solid) 0xFF9AA8B2.toInt() else crystalColor(brick.color)
        val bevel = 2.6f

        // Silhouette sombre, puis trois faces pour obtenir un vrai relief.
        path.reset()
        path.moveTo(r.left + bevel, r.top)
        path.lineTo(r.right - bevel, r.top)
        path.lineTo(r.right, r.top + bevel)
        path.lineTo(r.right, r.bottom - bevel)
        path.lineTo(r.right - bevel, r.bottom)
        path.lineTo(r.left + bevel, r.bottom)
        path.lineTo(r.left, r.bottom - bevel)
        path.lineTo(r.left, r.top + bevel)
        path.close()
        paint.style = Paint.Style.FILL
        paint.color = 0xFF070B12.toInt()
        canvas.drawPath(path, paint)

        path.reset()
        path.moveTo(r.left + bevel, r.top + 1f)
        path.lineTo(r.right - bevel, r.top + 1f)
        path.lineTo(r.right - 1f, r.top + bevel + 0.7f)
        path.lineTo(r.right - 1f, r.bottom - bevel)
        path.lineTo(r.right - bevel, r.bottom - 1f)
        path.lineTo(r.left + bevel, r.bottom - 1f)
        path.lineTo(r.left + 1f, r.bottom - bevel)
        path.lineTo(r.left + 1f, r.top + bevel + 0.7f)
        path.close()
        paint.color = base
        canvas.drawPath(path, paint)

        // Face supérieure éclairée.
        path.reset()
        path.moveTo(r.left + bevel, r.top + 1f)
        path.lineTo(r.right - bevel, r.top + 1f)
        path.lineTo(r.right - 1f, r.top + bevel + 0.7f)
        path.lineTo(r.right - 3.4f, r.top + 4.2f)
        path.lineTo(r.left + 3.4f, r.top + 4.2f)
        path.lineTo(r.left + 1f, r.top + bevel + 0.7f)
        path.close()
        paint.color = lighten(base, if (brick.solid) 0.58f else 0.46f)
        canvas.drawPath(path, paint)

        // Tranche droite et tranche basse dans l'ombre.
        path.reset()
        path.moveTo(r.right - 3.4f, r.top + 4.2f)
        path.lineTo(r.right - 1f, r.top + bevel + 0.7f)
        path.lineTo(r.right - 1f, r.bottom - bevel)
        path.lineTo(r.right - bevel, r.bottom - 1f)
        path.lineTo(r.right - 3.4f, r.bottom - 3f)
        path.close()
        paint.color = darken(base, 0.48f)
        canvas.drawPath(path, paint)
        path.reset()
        path.moveTo(r.left + 3.4f, r.bottom - 3f)
        path.lineTo(r.right - 3.4f, r.bottom - 3f)
        path.lineTo(r.right - bevel, r.bottom - 1f)
        path.lineTo(r.left + bevel, r.bottom - 1f)
        path.lineTo(r.left + 1f, r.bottom - bevel)
        path.close()
        paint.color = darken(base, 0.66f)
        canvas.drawPath(path, paint)

        if (brick.solid) {
            paint.color = 0xFF35424D.toInt()
            canvas.drawCircle(r.left + 3.2f, r.centerY(), 0.85f, paint)
            canvas.drawCircle(r.right - 3.2f, r.centerY(), 0.85f, paint)
            paint.color = 0xFFEAF4F7.toInt()
            canvas.drawCircle(r.left + 3f, r.centerY() - 0.25f, 0.3f, paint)
            canvas.drawCircle(r.right - 3.4f, r.centerY() - 0.25f, 0.3f, paint)
            paint.color = 0x66FFFFFF
            canvas.drawRect(r.left + 5f, r.top + 5.2f, r.right - 5f, r.top + 5.8f, paint)
        } else {
            // Petit reflet caractéristique des cristaux Amiga.
            paint.color = 0xEFFFFFFF.toInt()
            path.reset()
            path.moveTo(r.left + 4f, r.top + 4.8f)
            path.lineTo(r.left + 6.3f, r.top + 3.2f)
            path.lineTo(r.left + 8.2f, r.top + 4.2f)
            path.lineTo(r.left + 5.7f, r.top + 5.6f)
            path.close()
            canvas.drawPath(path, paint)
        }

        if (brick.maxHits > 1 && brick.hits < brick.maxHits) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 0.9f
            paint.color = 0xCC111622.toInt()
            path.reset()
            path.moveTo(r.centerX() - 2f, r.top + 3f)
            path.lineTo(r.centerX() + 0.5f, r.centerY())
            path.lineTo(r.centerX() - 1.5f, r.bottom - 2f)
            path.moveTo(r.centerX() + 0.5f, r.centerY())
            path.lineTo(r.centerX() + 4f, r.centerY() - 2.5f)
            canvas.drawPath(path, paint)
            paint.style = Paint.Style.FILL
        }
    }

    private fun drawPaddle(canvas: Canvas) {
        val half = engine.state.paddleWidth / 2f
        val center = engine.state.paddleX
        val left = center - half
        val right = center + half
        val y = GameEngine.PADDLE_Y
        val color = when {
            engine.state.laserTime > 0f -> 0xFFFF5E72.toInt()
            engine.state.stickyTime > 0f -> 0xFF55E68C.toInt()
            engine.state.wideTime > 0f -> 0xFF4B8DFF.toInt()
            else -> 0xFF38CDE8.toInt()
        }
        val flame = 3.5f + (sin(clock * 24f) + 1f) * 1.4f

        paint.color = 0x59000000
        canvas.drawOval(RectF(left + 2f, y + 10f, right - 2f, y + 17f), paint)

        // Deux moteurs avec une flamme animée.
        for (engineX in floatArrayOf(center - half * 0.42f, center + half * 0.42f)) {
            paint.color = 0xFF202B38.toInt()
            canvas.drawRoundRect(RectF(engineX - 3f, y + 5f, engineX + 3f, y + 12f), 1.5f, 1.5f, paint)
            path.reset()
            path.moveTo(engineX - 2f, y + 11f)
            path.lineTo(engineX + 2f, y + 11f)
            path.lineTo(engineX, y + 11f + flame)
            path.close()
            paint.color = 0xFFFF8B32.toInt()
            canvas.drawPath(path, paint)
            paint.color = 0xFFFFF29A.toInt()
            canvas.drawCircle(engineX, y + 11.5f, 1.1f, paint)
        }

        // Ailes colorées et fuselage argenté, dessinés séparément.
        path.reset()
        path.moveTo(left, y + 5f)
        path.lineTo(left + half * 0.24f, y + 0.5f)
        path.lineTo(center - 8f, y + 1f)
        path.lineTo(center, y - 5.5f)
        path.lineTo(center + 8f, y + 1f)
        path.lineTo(right - half * 0.24f, y + 0.5f)
        path.lineTo(right, y + 5f)
        path.lineTo(right - half * 0.22f, y + 10f)
        path.lineTo(center + 8f, y + 8f)
        path.lineTo(center, y + 11f)
        path.lineTo(center - 8f, y + 8f)
        path.lineTo(left + half * 0.22f, y + 10f)
        path.close()
        paint.color = 0xFF101923.toInt()
        canvas.drawPath(path, paint)

        path.reset()
        path.moveTo(left + 1.5f, y + 5f)
        path.lineTo(left + half * 0.25f, y + 1.8f)
        path.lineTo(center - 8f, y + 2.5f)
        path.lineTo(center - 8f, y + 7f)
        path.lineTo(left + half * 0.23f, y + 8.5f)
        path.close()
        paint.color = color
        canvas.drawPath(path, paint)
        path.reset()
        path.moveTo(right - 1.5f, y + 5f)
        path.lineTo(right - half * 0.25f, y + 1.8f)
        path.lineTo(center + 8f, y + 2.5f)
        path.lineTo(center + 8f, y + 7f)
        path.lineTo(right - half * 0.23f, y + 8.5f)
        path.close()
        paint.color = darken(color, 0.7f)
        canvas.drawPath(path, paint)

        path.reset()
        path.moveTo(center, y - 4f)
        path.lineTo(center + 7f, y + 2f)
        path.lineTo(center + 6f, y + 7f)
        path.lineTo(center, y + 9.5f)
        path.lineTo(center - 6f, y + 7f)
        path.lineTo(center - 7f, y + 2f)
        path.close()
        paint.shader = LinearGradient(left, y, right, y, 0xFF788B9B.toInt(), 0xFFE9F4F5.toInt(), Shader.TileMode.CLAMP)
        canvas.drawPath(path, paint)
        paint.shader = null

        paint.color = 0xFF082D47.toInt()
        canvas.drawOval(RectF(center - 4f, y - 2.5f, center + 4f, y + 5f), paint)
        paint.color = 0xFF66E9FF.toInt()
        canvas.drawOval(RectF(center - 2.8f, y - 1.5f, center + 2.8f, y + 3.5f), paint)
        paint.color = 0xFFEFFFFF.toInt()
        canvas.drawOval(RectF(center - 1.8f, y - 0.8f, center + 0.2f, y + 0.7f), paint)
        paint.color = 0xCCFFFFFF.toInt()
        canvas.drawRect(left + 5f, y + 4f, left + half * 0.52f, y + 5f, paint)

        if (engine.state.laserTime > 0f) {
            for (gunX in floatArrayOf(left + 8f, right - 8f)) {
                paint.color = 0xFF202733.toInt()
                canvas.drawRoundRect(RectF(gunX - 1.8f, y - 6f, gunX + 1.8f, y + 3f), 1f, 1f, paint)
                paint.color = 0xFFFFD5DB.toInt()
                canvas.drawRect(gunX - 0.7f, y - 6f, gunX + 0.7f, y - 2f, paint)
            }
        }
    }

    private fun drawBall(canvas: Canvas, ball: Ball) {
        if (visualEffects && !ball.stuck) {
            val speed = hypot(ball.vx, ball.vy).coerceAtLeast(1f)
            paint.shader = null
            for (index in 3 downTo 1) {
                paint.color = 0xFF55E6FF.toInt()
                paint.alpha = 24 + (4 - index) * 18
                canvas.drawCircle(
                    ball.x - ball.vx / speed * index * 4.2f,
                    ball.y - ball.vy / speed * index * 4.2f,
                    ball.radius * (1f - index * 0.16f), paint
                )
            }
            paint.alpha = 255
        }
        // Dégradés créés une seule fois autour de l'origine, puis déplacés avec la balle.
        val glow = ballGlowShader ?: RadialGradient(
            0f, 0f, ball.radius * 2.6f,
            0x8855E6FF.toInt(), 0x0055E6FF, Shader.TileMode.CLAMP
        ).also { ballGlowShader = it }
        val body = ballBodyShader ?: RadialGradient(
            -ball.radius * 0.35f, -ball.radius * 0.4f, ball.radius * 1.25f,
            Color.WHITE, 0xFF28A8E8.toInt(), Shader.TileMode.CLAMP
        ).also { ballBodyShader = it }
        canvas.save()
        canvas.translate(ball.x, ball.y)
        paint.color = Color.WHITE
        paint.shader = glow
        canvas.drawCircle(0f, 0f, ball.radius * 2.6f, paint)
        paint.shader = body
        canvas.drawCircle(0f, 0f, ball.radius, paint)
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 0.65f
        paint.color = 0xFF073B66.toInt()
        canvas.drawCircle(0f, 0f, ball.radius, paint)
        paint.style = Paint.Style.FILL
        paint.color = Color.WHITE
        canvas.drawCircle(-1.35f, -1.45f, ball.radius * 0.28f, paint)
        canvas.restore()
    }

    private fun drawPowerUp(canvas: Canvas, power: PowerUp) {
        val pulse = 11f + sin(clock * 7f + power.x) * 1.5f
        canvas.save()
        canvas.translate(power.x, power.y)
        canvas.scale(pulse, pulse)
        paint.color = Color.WHITE
        paint.shader = powerGlowShader
        canvas.drawCircle(0f, 0f, 1f, paint)
        paint.shader = null
        canvas.restore()
        canvas.save()
        canvas.rotate(power.rotation, power.x, power.y)
        drawCrystal(canvas, power.x, power.y, 8f, power.type.color.toInt(), 0f)
        canvas.restore()
        text(canvas, power.type.symbol, power.x, power.y + 3.2f, 9f, Color.WHITE, true)
    }

    private fun drawCrystal(canvas: Canvas, x: Float, y: Float, radius: Float, color: Int, rotation: Float) {
        canvas.save()
        canvas.rotate(rotation, x, y)
        val vertices = Array(6) { i ->
            val angle = -Math.PI / 2 + i * Math.PI / 3
            floatArrayOf(x + cos(angle).toFloat() * radius, y + sin(angle).toFloat() * radius)
        }
        val facets = intArrayOf(
            lighten(color, 0.62f), lighten(color, 0.28f), color,
            darken(color, 0.58f), darken(color, 0.72f), lighten(color, 0.42f)
        )

        path.reset()
        vertices.forEachIndexed { index, vertex ->
            if (index == 0) path.moveTo(vertex[0], vertex[1]) else path.lineTo(vertex[0], vertex[1])
        }
        path.close()
        paint.color = 0xFF07101C.toInt()
        canvas.drawPath(path, paint)

        for (i in 0 until 6) {
            val a = vertices[i]
            val b = vertices[(i + 1) % 6]
            path.reset()
            path.moveTo(x, y + radius * 0.06f)
            path.lineTo(x + (a[0] - x) * 0.9f, y + (a[1] - y) * 0.9f)
            path.lineTo(x + (b[0] - x) * 0.9f, y + (b[1] - y) * 0.9f)
            path.close()
            paint.color = facets[i]
            canvas.drawPath(path, paint)
        }

        // Arêtes internes et éclat blanc sur la face supérieure gauche.
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = max(0.55f, radius * 0.035f)
        paint.color = 0x55FFFFFF
        for (i in 0 until 6) {
            val vertex = vertices[i]
            canvas.drawLine(x, y + radius * 0.06f, vertex[0] * 0.9f + x * 0.1f, vertex[1] * 0.9f + y * 0.1f, paint)
        }
        paint.style = Paint.Style.FILL
        paint.color = 0xEFFFFFFF.toInt()
        path.reset()
        path.moveTo(x - radius * 0.13f, y - radius * 0.73f)
        path.lineTo(x + radius * 0.04f, y - radius * 0.52f)
        path.lineTo(x - radius * 0.17f, y - radius * 0.25f)
        path.lineTo(x - radius * 0.34f, y - radius * 0.48f)
        path.close()
        canvas.drawPath(path, paint)
        paint.color = Color.WHITE
        canvas.drawCircle(x - radius * 0.28f, y - radius * 0.47f, max(0.8f, radius * 0.055f), paint)
        canvas.restore()
    }

    private fun drawWorm(canvas: Canvas, worm: Worm) {
        for (i in 4 downTo 0) {
            val x = worm.x + sin(worm.age * 5f - i * 0.65f + worm.phase) * 4f
            val y = worm.y - i * 5f
            val radius = 5.2f - i * 0.35f
            paint.color = 0xFF101A20.toInt()
            canvas.drawCircle(x, y, radius + 0.8f, paint)
            paint.shader = RadialGradient(
                x - radius * 0.35f, y - radius * 0.4f, radius * 1.3f,
                if (i == 0) 0xFFE5FF8B.toInt() else 0xFF9BE8D4.toInt(),
                if (i == 0) 0xFF5C8E2B.toInt() else 0xFF287C78.toInt(),
                Shader.TileMode.CLAMP
            )
            canvas.drawCircle(x, y, radius, paint)
            paint.shader = null
            paint.color = 0xAAFFFFFF.toInt()
            canvas.drawCircle(x - radius * 0.32f, y - radius * 0.35f, max(0.55f, radius * 0.16f), paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 0.55f
            paint.color = 0xFF193A3D.toInt()
            canvas.drawCircle(x, y, radius * 0.72f, paint)
            paint.style = Paint.Style.FILL
        }
        paint.color = 0xFF071317.toInt()
        canvas.drawCircle(worm.x - 1.8f, worm.y - 1f, 1.15f, paint)
        canvas.drawCircle(worm.x + 1.8f, worm.y - 1f, 1.15f, paint)
        paint.color = 0xFFFF566C.toInt()
        canvas.drawCircle(worm.x - 1.8f, worm.y - 1.1f, 0.55f, paint)
        canvas.drawCircle(worm.x + 1.8f, worm.y - 1.1f, 0.55f, paint)
        // Petites mandibules métalliques.
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 0.8f
        paint.color = 0xFFD3E4DF.toInt()
        canvas.drawLine(worm.x - 3f, worm.y + 2f, worm.x - 1f, worm.y + 3.5f, paint)
        canvas.drawLine(worm.x + 3f, worm.y + 2f, worm.x + 1f, worm.y + 3.5f, paint)
        paint.style = Paint.Style.FILL
    }

    private fun drawPauseMenu(canvas: Canvas) {
        if (settingsOpen) {
            drawSettingsMenu(canvas)
            return
        }
        paint.color = 0xD9050916.toInt()
        canvas.drawRect(0f, 0f, GameEngine.WIDTH, GameEngine.HEIGHT, paint)
        paint.color = 0xF20B1422.toInt()
        canvas.drawRoundRect(RectF(40f, 116f, 320f, 574f), 16f, 16f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.2f
        paint.color = 0xFF58DFFB.toInt()
        canvas.drawRoundRect(RectF(40f, 116f, 320f, 574f), 16f, 16f, paint)
        paint.style = Paint.Style.FILL
        text(canvas, "PAUSE", 180f, 159f, 27f, 0xFFE8FAFF.toInt(), true, font = monoBold)
        text(canvas, "TABLEAU ${engine.state.level}  •  ${engine.state.difficulty.label}", 180f, 184f, 9f, 0xFFFFD85A.toInt(), true, font = monoBold)

        drawMenuButton(canvas, RectF(65f, 215f, 295f, 260f), "REPRENDRE", 0xFF42D8EC.toInt())
        drawMenuButton(canvas, RectF(65f, 280f, 295f, 325f), "RECOMMENCER", 0xFF829ABD.toInt())
        drawMenuButton(canvas, RectF(65f, 345f, 295f, 390f), "RÉGLAGES", 0xFFB18CFF.toInt())
        drawMenuButton(canvas, RectF(65f, 410f, 295f, 455f), "QUITTER VERS L'ACCUEIL", 0xFFFF7180.toInt())
        text(canvas, "Reprise au début du tableau en cas d'interruption.", 180f, 499f, 9f, 0xFFB5C8E2.toInt(), false)
        text(canvas, "MANETTE ET CLAVIER PRISES EN CHARGE", 180f, 528f, 8f, 0xFF7F98BD.toInt(), true, font = monoBold)
        text(canvas, "RETOUR, START OU P = REPRENDRE", 180f, 552f, 8f, 0xFF7F98BD.toInt(), true, font = monoBold)
    }

    private fun drawSettingsMenu(canvas: Canvas) {
        paint.color = 0xED050916.toInt()
        canvas.drawRect(0f, 0f, GameEngine.WIDTH, GameEngine.HEIGHT, paint)
        paint.color = 0xF20B1422.toInt()
        canvas.drawRoundRect(RectF(35f, 72f, 325f, 601f), 16f, 16f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.2f
        paint.color = 0xFFB18CFF.toInt()
        canvas.drawRoundRect(RectF(35f, 72f, 325f, 601f), 16f, 16f, paint)
        paint.style = Paint.Style.FILL
        text(canvas, "RÉGLAGES", 180f, 116f, 24f, 0xFFE8FAFF.toInt(), true, font = monoBold)
        text(canvas, "TOUCHE UNE LIGNE POUR LA MODIFIER", 180f, 143f, 8f, 0xFF9CB2D3.toInt(), true, font = monoBold)
        val sensitivity = when {
            touchSensitivity < 0.9f -> "FAIBLE"
            touchSensitivity > 1.1f -> "ÉLEVÉE"
            else -> "NORMALE"
        }
        val labels = arrayOf(
            "SON  ${if (soundEnabled) "OUI" else "NON"}",
            "VOLUME EFFETS  $effectsVolume %",
            "MUSIQUE  ${if (musicVolume == 0) "NON" else "$musicVolume %"}",
            "VIBRATIONS  ${if (hapticsEnabled) "OUI" else "NON"}",
            "SENSIBILITÉ  $sensitivity",
            "CONTRÔLES  ${controlMode.label}",
            "EFFETS VISUELS  ${if (visualEffects) "OUI" else "NON"}",
            "RETOUR À LA PAUSE"
        )
        val accents = intArrayOf(
            if (soundEnabled) 0xFF65E572.toInt() else 0xFF718096.toInt(),
            0xFF63DDFF.toInt(), 0xFF63DDFF.toInt(),
            if (hapticsEnabled) 0xFF65E572.toInt() else 0xFF718096.toInt(),
            0xFFB18CFF.toInt(), 0xFFB18CFF.toInt(),
            if (visualEffects) 0xFF65E572.toInt() else 0xFF718096.toInt(),
            0xFFFFD85A.toInt()
        )
        labels.forEachIndexed { index, label ->
            drawMenuButton(canvas, settingsRect(index), label, accents[index])
        }
        text(canvas, "Les réglages sont enregistrés automatiquement.", 180f, 575f, 8f, 0xFF7F98BD.toInt(), false)
    }

    private fun settingsRect(index: Int): RectF {
        val top = 168f + index * 47f
        return RectF(55f, top, 305f, top + 37f)
    }

    private fun drawMenuButton(canvas: Canvas, rect: RectF, label: String, accent: Int) {
        paint.color = 0xFF14243A.toInt()
        canvas.drawRoundRect(rect, 10f, 10f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1f
        paint.color = accent
        canvas.drawRoundRect(rect, 10f, 10f, paint)
        paint.style = Paint.Style.FILL
        text(canvas, label, rect.centerX(), rect.centerY() + 4f, 11f, accent, true, font = monoBold)
    }

    private fun drawTutorialGuide(canvas: Canvas) {
        val title = when (tutorialStep) {
            1 -> "1. PILOTE TON VAISSEAU"
            2 -> "2. LANCE LA BALLE"
            else -> "3. RÉCUPÈRE LES BONUS"
        }
        val description = when (tutorialStep) {
            1 -> when (controlMode) {
                ControlMode.RELATIVE -> "Glisse ton doigt pour te déplacer."
                ControlMode.DIRECT -> "Déplace ton doigt pour guider le vaisseau."
                ControlMode.ZONES -> "Maintiens la zone gauche ou droite."
            }
            2 -> "Touche l'écran pour libérer la balle."
            else -> "Attrape les bonus, évite le cristal gris !"
        }
        paint.color = 0xE90B1728.toInt()
        canvas.drawRoundRect(RectF(32f, 510f, 328f, 572f), 10f, 10f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1f
        paint.color = 0xFF58DFFB.toInt()
        canvas.drawRoundRect(RectF(32f, 510f, 328f, 572f), 10f, 10f, paint)
        paint.style = Paint.Style.FILL
        text(canvas, title, 48f, 532f, 10f, 0xFFFFD85A.toInt(), true, Paint.Align.LEFT, monoBold)
        text(canvas, description, 180f, 555f, 10f, Color.WHITE, false)
        text(canvas, "PASSER", 314f, 526f, 7f, 0xFF9CB2D3.toInt(), true, Paint.Align.RIGHT, monoBold)
    }

    private fun overlay(canvas: Canvas, title: String, subtitle: String, action: String? = null) {
        paint.color = 0xD9050916.toInt()
        canvas.drawRect(0f, 0f, GameEngine.WIDTH, GameEngine.HEIGHT, paint)
        paint.color = 0xFF102643.toInt()
        canvas.drawRoundRect(RectF(25f, 250f, 335f, 382f), 18f, 18f, paint)
        text(canvas, title, 180f, 296f, 24f, 0xFF6DE6FF.toInt(), true)
        text(canvas, subtitle, 180f, 332f, 11f, Color.WHITE, true)
        if (action != null) text(canvas, action, 180f, 360f, 10f, 0xFF9CEBFF.toInt(), true)
    }

    private fun text(
        canvas: Canvas,
        value: String,
        x: Float,
        y: Float,
        size: Float,
        color: Int,
        isBold: Boolean,
        align: Paint.Align = Paint.Align.CENTER,
        font: Typeface? = null
    ) {
        paint.shader = null
        paint.style = Paint.Style.FILL
        paint.color = color
        paint.alpha = 255
        paint.textSize = size
        paint.textAlign = align
        paint.typeface = font ?: if (isBold) bold else regular
        canvas.drawText(value, x, y, paint)
    }

    private fun crystalColor(index: Int): Int = when (index) {
        1 -> 0xFF55E6FF.toInt()
        2 -> 0xFFFF66C4.toInt()
        3 -> 0xFFFFD94F.toInt()
        4 -> 0xFFFF914D.toInt()
        5 -> 0xFFFF5268.toInt()
        6 -> 0xFF65E572.toInt()
        else -> 0xFFE8F4FF.toInt()
    }

    private fun darken(color: Int, factor: Float): Int = Color.rgb(
        (Color.red(color) * factor).toInt(),
        (Color.green(color) * factor).toInt(),
        (Color.blue(color) * factor).toInt()
    )

    private fun lighten(color: Int, amount: Float): Int = Color.rgb(
        (Color.red(color) + (255 - Color.red(color)) * amount).toInt(),
        (Color.green(color) + (255 - Color.green(color)) * amount).toInt(),
        (Color.blue(color) + (255 - Color.blue(color)) * amount).toInt()
    )

    private fun Float.ceilToInt(): Int = ceil(this).toInt()

    private fun hasProgress(): Boolean = preferences.getBoolean("has_progress", false)

    private fun saveProgressCheckpoint() {
        if (demoMode) return
        val stats = engine.state.stats
        preferences.edit()
            .putBoolean("has_progress", true)
            .putInt("saved_level", engine.state.level)
            .putInt("saved_score", engine.state.score)
            .putInt("saved_lives", engine.state.lives)
            .putString("saved_difficulty", engine.state.difficulty.name)
            .putInt("saved_bricks", stats.bricksDestroyed)
            .putInt("saved_bonus", stats.powerUpsCollected)
            .putInt("saved_levels", stats.levelsCompleted)
            .putInt("saved_laser_shots", stats.laserShots)
            .putInt("saved_laser_hits", stats.laserHits)
            .putInt("saved_best_combo", stats.bestCombo)
            .apply()
    }

    private fun clearProgress() {
        preferences.edit().putBoolean("has_progress", false).apply()
    }

    private fun beginNewGame() {
        settingsOpen = false
        engine.startNewGame(selectedDifficulty)
        sound.startMusic()
        tutorialStep = if (preferences.getBoolean("tutorial_done", false)) 0 else 1
        tutorialTimer = 0f
    }

    private fun continueSavedGame() {
        if (!hasProgress()) {
            beginNewGame()
            return
        }
        tutorialStep = 0
        settingsOpen = false
        val stats = RunStats().apply {
            bricksDestroyed = preferences.getInt("saved_bricks", 0)
            powerUpsCollected = preferences.getInt("saved_bonus", 0)
            levelsCompleted = preferences.getInt("saved_levels", 0)
            laserShots = preferences.getInt("saved_laser_shots", 0)
            laserHits = preferences.getInt("saved_laser_hits", 0)
            bestCombo = preferences.getInt("saved_best_combo", 0)
        }
        val difficulty = runCatching {
            Difficulty.valueOf(preferences.getString("saved_difficulty", Difficulty.NORMAL.name)!!)
        }.getOrDefault(Difficulty.NORMAL)
        engine.continueGame(
            preferences.getInt("saved_level", 1),
            preferences.getInt("saved_score", 0),
            preferences.getInt("saved_lives", difficulty.initialLives),
            difficulty,
            stats
        )
        sound.startMusic()
    }

    private fun finishTutorial() {
        tutorialStep = 0
        tutorialTimer = 0f
        preferences.edit().putBoolean("tutorial_done", true).apply()
    }

    private fun updateTutorial(dt: Float) {
        if (tutorialStep == 0 || engine.state.screen != Screen.PLAYING) return
        when (tutorialStep) {
            1 -> if (abs(engine.state.paddleX - GameEngine.WIDTH / 2f) > 18f) tutorialStep = 2
            2 -> if (engine.state.balls.isNotEmpty() && engine.state.balls.none { it.stuck }) {
                tutorialStep = 3
                tutorialTimer = 0f
            }
            3 -> {
                tutorialTimer += dt
                if (tutorialTimer >= 5f) finishTutorial()
            }
        }
    }

    private fun startDemo() {
        demoMode = true
        tutorialStep = 0
        demoLevelIndex = 0
        pendingEntry = null
        recentEntry = null
        startDemoLevel()
    }

    private fun startDemoLevel() {
        demoLevelTime = 0f
        demoActionTime = 0f
        engine.startDemo(demoLevels[demoLevelIndex])
        engine.state.screen = Screen.PLAYING
        engine.state.stateTime = 0f
        engine.primaryAction()
        lastScreen = Screen.PLAYING
    }

    private fun stopDemo() {
        demoMode = false
        engine.demonstration = false
        engine.state.screen = Screen.TITLE
        engine.state.score = 0
        engine.state.level = 1
        engine.state.highScore = preferences.getInt("high_score", 0)
        leaderboard = highScores.entries()
        lastScreen = Screen.TITLE
        lastInteraction = System.nanoTime()
        accumulator = 0f
    }

    private fun updateDemo(dt: Float) {
        demoLevelTime += dt
        demoActionTime += dt
        if (demoLevelTime >= 12f || engine.state.screen == Screen.LEVEL_CLEAR ||
            engine.state.screen == Screen.GAME_OVER || engine.state.screen == Screen.VICTORY
        ) {
            demoLevelIndex = (demoLevelIndex + 1) % demoLevels.size
            startDemoLevel()
            return
        }
        if (engine.state.screen == Screen.INTRO) {
            engine.state.screen = Screen.PLAYING
            engine.state.stateTime = 0f
        }
        if (engine.state.screen != Screen.PLAYING) return

        val movingBalls = engine.state.balls.filter { !it.stuck }
        val target = movingBalls.filter { it.vy > 0f }
            .minByOrNull { (GameEngine.PADDLE_Y - it.y) / it.vy }
            ?: movingBalls.firstOrNull()
            ?: engine.state.balls.firstOrNull()
        val targetX = target?.let { predictBallX(it) } ?: GameEngine.WIDTH / 2f
        val maxMovement = 430f * dt
        val nextX = engine.state.paddleX + (targetX - engine.state.paddleX).coerceIn(-maxMovement, maxMovement)
        engine.movePaddle(nextX)

        if (engine.state.balls.any { it.stuck } || demoActionTime >= 0.55f) {
            engine.primaryAction()
            demoActionTime = 0f
        }
    }

    private fun predictBallX(ball: Ball): Float {
        if (ball.stuck || ball.vy <= 0f) return ball.x
        val minX = GameEngine.LEFT + ball.radius
        val maxX = GameEngine.RIGHT - ball.radius
        val width = maxX - minX
        val time = ((GameEngine.PADDLE_Y - ball.y) / ball.vy).coerceIn(0f, 4f)
        val period = width * 2f
        val travel = ball.x + ball.vx * time - minX
        val wrapped = ((travel % period) + period) % period
        return minX + if (wrapped <= width) wrapped else period - wrapped
    }

    private fun drawDemoBadge(canvas: Canvas) {
        paint.color = 0xD9081322.toInt()
        canvas.drawRoundRect(RectF(75f, 613f, 285f, 636f), 10f, 10f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 0.8f
        paint.color = 0xFF63DDFF.toInt()
        canvas.drawRoundRect(RectF(75f, 613f, 285f, 636f), 10f, 10f, paint)
        paint.style = Paint.Style.FILL
        text(canvas, "DÉMO  •  TOUCHEZ POUR QUITTER", 180f, 628f, 9f, 0xFFE8FAFF.toInt(), true, font = monoBold)
    }

    private fun checkHighScorePrompt() {
        if (demoMode) {
            lastScreen = engine.state.screen
            return
        }
        val currentScreen = engine.state.screen
        val changed = currentScreen != lastScreen
        lastScreen = currentScreen
        // Le record est écrit aux changements d'écran, plus à chaque cristal touché.
        if (changed) saveHighScore()
        if (changed && currentScreen == Screen.INTRO) saveProgressCheckpoint()
        if (changed && (currentScreen == Screen.GAME_OVER || currentScreen == Screen.VICTORY)) clearProgress()
    }

    private fun openHighScores() {
        if (engine.state.screen != Screen.GAME_OVER && engine.state.screen != Screen.VICTORY) return
        val finalScore = engine.state.score
        val candidate = if (HighScoreLeaderboard.qualifies(leaderboard, finalScore)) {
            HighScoreEntry(highScores.lastName.take(HighScoreLeaderboard.MAX_NAME_LENGTH).ifEmpty { "..." }, finalScore)
        } else null
        pendingEntry = candidate
        recentEntry = candidate
        engine.state.screen = Screen.HIGH_SCORES
        lastScreen = Screen.HIGH_SCORES
        if (candidate != null) post { showHighScoreDialog(finalScore) }
    }

    private fun showHighScoreDialog(finalScore: Int) {
        if (nameDialog?.isShowing == true || pendingEntry?.score != finalScore) return
        if (engine.state.screen != Screen.HIGH_SCORES || finalScore != engine.state.score) return

        val input = EditText(context).apply {
            hint = "ABC"
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            filters = arrayOf(InputFilter.LengthFilter(HighScoreLeaderboard.MAX_NAME_LENGTH))
            setText(highScores.lastName.take(HighScoreLeaderboard.MAX_NAME_LENGTH))
            setSelection(text.length)
        }
        val dialog = AlertDialog.Builder(context)
            .setTitle("CRYSTAL HAMMER HEROES")
            .setMessage("Score : $finalScore\nEntre ta signature (1 à 3 caractères).")
            .setView(input)
            .setPositiveButton("ENREGISTRER", null)
            .setNegativeButton("IGNORER", null)
            .create()
        nameDialog = dialog
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val name = input.text.toString().trim().uppercase(Locale.ROOT)
                    .take(HighScoreLeaderboard.MAX_NAME_LENGTH)
                if (name.isEmpty()) {
                    input.error = "Entre au moins une initiale"
                    return@setOnClickListener
                }
                leaderboard = highScores.add(name, finalScore)
                recentEntry = HighScoreEntry(name, finalScore)
                pendingEntry = null
                engine.state.highScore = maxOf(
                    engine.state.highScore,
                    leaderboard.maxOfOrNull { it.score } ?: 0
                )
                saveHighScore()
                invalidate()
                dialog.dismiss()
            }
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener {
                pendingEntry = null
                recentEntry = null
                dialog.dismiss()
            }
        }
        dialog.setOnDismissListener {
            if (pendingEntry?.score == finalScore) {
                pendingEntry = null
                recentEntry = null
            }
            if (nameDialog === dialog) nameDialog = null
        }
        dialog.show()
        dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        input.requestFocus()
    }

    private fun handleTitleTouch(x: Float, y: Float) {
        sound.startMusic()
        if (x in 82f..278f && y in 334f..359f) {
            val values = Difficulty.values()
            selectedDifficulty = values[(selectedDifficulty.ordinal + 1) % values.size]
            preferences.edit().putString("difficulty", selectedDifficulty.name).apply()
            return
        }
        if (x in 40f..320f && y in 438f..528f) {
            advanceBonusGuide()
            return
        }
        if (hasProgress()) {
            when (y) {
                in 355f..402f -> continueSavedGame()
                in 403f..437f -> beginNewGame()
            }
        } else if (y in 350f..420f) {
            beginNewGame()
        }
    }

    private fun handlePauseTouch(x: Float, y: Float) {
        if (x !in 50f..310f) return
        if (settingsOpen) {
            for (index in 0..7) {
                if (!settingsRect(index).contains(x, y)) continue
                when (index) {
                    0 -> {
                        soundEnabled = !soundEnabled
                        preferences.edit().putBoolean("sound_enabled", soundEnabled).apply()
                    }
                    1 -> {
                        effectsVolume = nextVolume(effectsVolume)
                        sound.setEffectsVolume(effectsVolume)
                        preferences.edit().putInt("effects_volume", effectsVolume).apply()
                    }
                    2 -> {
                        musicVolume = nextVolume(musicVolume)
                        sound.setMusicVolume(musicVolume)
                        if (musicVolume > 0) sound.startMusic()
                        preferences.edit().putInt("music_volume", musicVolume).apply()
                    }
                    3 -> {
                        hapticsEnabled = !hapticsEnabled
                        preferences.edit().putBoolean("haptics_enabled", hapticsEnabled).apply()
                        if (hapticsEnabled) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                    }
                    4 -> {
                        touchSensitivity = when {
                            touchSensitivity < 0.9f -> 1f
                            touchSensitivity > 1.1f -> 0.75f
                            else -> 1.35f
                        }
                        preferences.edit().putFloat("touch_sensitivity", touchSensitivity).apply()
                    }
                    5 -> {
                        val values = ControlMode.values()
                        controlMode = values[(controlMode.ordinal + 1) % values.size]
                        zoneDirection = 0
                        preferences.edit().putString("control_mode", controlMode.name).apply()
                    }
                    6 -> {
                        visualEffects = !visualEffects
                        shakeAmount = 0f
                        impactFlash = 0f
                        preferences.edit().putBoolean("visual_effects", visualEffects).apply()
                    }
                    7 -> settingsOpen = false
                }
                return
            }
            return
        }
        when (y) {
            in 215f..260f -> engine.state.screen = Screen.PLAYING
            in 280f..325f -> beginNewGame()
            in 345f..390f -> settingsOpen = true
            in 410f..455f -> {
                saveHighScore()
                tutorialStep = 0
                zoneDirection = 0
                engine.state.screen = Screen.TITLE
            }
        }
    }

    private fun nextVolume(current: Int): Int = when {
        current < 25 -> 25
        current < 50 -> 50
        current < 75 -> 75
        current < 100 -> 100
        else -> 0
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        lastInteraction = System.nanoTime()
        requestFocus()
        if (demoMode) {
            if (event.actionMasked == MotionEvent.ACTION_DOWN) stopDemo()
            return true
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val x = toGameX(event.getX(0))
                val y = toGameY(event.getY(0))
                sound.startMusic()
                when (engine.state.screen) {
                    Screen.TITLE -> handleTitleTouch(x, y)
                    Screen.HIGH_SCORES -> if (pendingEntry == null) {
                        recentEntry = null
                        engine.state.screen = Screen.TITLE
                    }
                    Screen.GAME_OVER, Screen.VICTORY -> openHighScores()
                    Screen.PAUSED -> handlePauseTouch(x, y)
                    Screen.PLAYING -> if (x > 305f && y < 52f) {
                        engine.pause()
                        releaseControls()
                    } else if (tutorialStep > 0 && x > 265f && y in 505f..535f) {
                        finishTutorial()
                    } else {
                        steeringPointerId = event.getPointerId(0)
                        lastTouchX = x
                        playingPointerDown(x)
                    }
                    else -> engine.primaryAction()
                }
            }
            MotionEvent.ACTION_POINTER_DOWN -> if (engine.state.screen == Screen.PLAYING) {
                // Un second doigt lance ou tire sans interrompre le pilotage du premier.
                val x = toGameX(event.getX(event.actionIndex))
                if (steeringPointerId == MotionEvent.INVALID_POINTER_ID) {
                    steeringPointerId = event.getPointerId(event.actionIndex)
                    lastTouchX = x
                }
                when (controlMode) {
                    ControlMode.ZONES -> {
                        zoneDirection = zoneFromPointers(event, -1)
                        if (zoneFor(x) == 0) engine.primaryAction()
                    }
                    else -> engine.primaryAction()
                }
                engine.state.fireHeld = true
            }
            MotionEvent.ACTION_MOVE -> if (engine.state.screen == Screen.PLAYING) {
                if (controlMode == ControlMode.ZONES) {
                    zoneDirection = zoneFromPointers(event, -1)
                } else {
                    val index = event.findPointerIndex(steeringPointerId)
                    if (index >= 0) {
                        val x = toGameX(event.getX(index))
                        if (controlMode == ControlMode.RELATIVE) {
                            val delta = (x - lastTouchX) * touchSensitivity
                            engine.movePaddle(engine.state.paddleX + delta)
                        } else {
                            engine.movePaddle(x)
                        }
                        lastTouchX = x
                    }
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                val liftedIndex = event.actionIndex
                if (event.getPointerId(liftedIndex) == steeringPointerId) {
                    // Le pilotage passe au doigt restant, sans saut du vaisseau.
                    val nextIndex = if (liftedIndex == 0) 1 else 0
                    steeringPointerId = event.getPointerId(nextIndex)
                    lastTouchX = toGameX(event.getX(nextIndex))
                }
                if (controlMode == ControlMode.ZONES) zoneDirection = zoneFromPointers(event, liftedIndex)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                zoneDirection = 0
                steeringPointerId = MotionEvent.INVALID_POINTER_ID
                engine.state.fireHeld = false
            }
        }
        return true
    }

    private fun playingPointerDown(x: Float) {
        when (controlMode) {
            ControlMode.RELATIVE -> engine.primaryAction()
            ControlMode.DIRECT -> {
                engine.movePaddle(x)
                engine.primaryAction()
            }
            ControlMode.ZONES -> {
                zoneDirection = zoneFor(x)
                if (zoneDirection == 0) engine.primaryAction()
            }
        }
        engine.state.fireHeld = true
    }

    private fun toGameX(rawX: Float): Float = (rawX - offsetX) / viewScale

    private fun toGameY(rawY: Float): Float = (rawY - offsetY) / viewScale

    private fun zoneFor(x: Float): Int = when {
        x < 120f -> -1
        x > 240f -> 1
        else -> 0
    }

    /** Somme des zones touchées par tous les doigts, en ignorant celui qui se lève. */
    private fun zoneFromPointers(event: MotionEvent, ignoredIndex: Int): Int {
        var direction = 0
        for (index in 0 until event.pointerCount) {
            if (index != ignoredIndex) direction += zoneFor(toGameX(event.getX(index)))
        }
        return direction.coerceIn(-1, 1)
    }

    private fun updateDirectionalControls(dt: Float) {
        if (engine.state.screen != Screen.PLAYING) return
        val keyboard = (if (rightPressed) 1f else 0f) - (if (leftPressed) 1f else 0f)
        val analog = if (abs(gamepadAxis) >= 0.18f) gamepadAxis else 0f
        val direction = (keyboard + zoneDirection + analog).coerceIn(-1f, 1f)
        if (direction != 0f) {
            engine.movePaddle(engine.state.paddleX + direction * 340f * touchSensitivity * dt)
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        lastInteraction = System.nanoTime()
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_A -> {
                leftPressed = true
                return true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_D -> {
                rightPressed = true
                return true
            }
            KeyEvent.KEYCODE_BUTTON_START, KeyEvent.KEYCODE_P, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                if (event.repeatCount == 0) togglePause()
                return true
            }
        }
        if (isFireKey(keyCode)) {
            if (event.repeatCount == 0) handleExternalAction()
            if (engine.state.screen == Screen.PLAYING) engine.state.fireHeld = true
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        when {
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_A -> leftPressed = false
            keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_D -> rightPressed = false
            isFireKey(keyCode) -> engine.state.fireHeld = false
            keyCode == KeyEvent.KEYCODE_BUTTON_START || keyCode == KeyEvent.KEYCODE_P ||
                keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> Unit
            else -> return super.onKeyUp(keyCode, event)
        }
        return true
    }

    private fun isFireKey(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_SPACE || keyCode == KeyEvent.KEYCODE_ENTER ||
            keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER || keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            keyCode == KeyEvent.KEYCODE_BUTTON_A || keyCode == KeyEvent.KEYCODE_BUTTON_X

    private fun togglePause() {
        when {
            demoMode -> stopDemo()
            engine.state.screen == Screen.PLAYING -> {
                engine.pause()
                releaseControls()
            }
            engine.state.screen == Screen.PAUSED -> {
                settingsOpen = false
                engine.state.screen = Screen.PLAYING
            }
            else -> handleExternalAction()
        }
    }

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        if (event.source and InputDevice.SOURCE_CLASS_JOYSTICK == InputDevice.SOURCE_CLASS_JOYSTICK &&
            event.actionMasked == MotionEvent.ACTION_MOVE
        ) {
            // Beaucoup de manettes envoient leur croix comme un axe « chapeau » plutôt que des touches.
            val hat = event.getAxisValue(MotionEvent.AXIS_HAT_X)
            val stick = event.getAxisValue(MotionEvent.AXIS_X)
            gamepadAxis = (if (abs(hat) >= 0.5f) hat else stick).coerceIn(-1f, 1f)
            if (abs(gamepadAxis) >= 0.18f) lastInteraction = System.nanoTime()
            return true
        }
        return super.onGenericMotionEvent(event)
    }

    private fun handleExternalAction() {
        lastInteraction = System.nanoTime()
        sound.startMusic()
        if (demoMode) {
            stopDemo()
            return
        }
        when (engine.state.screen) {
            Screen.TITLE -> if (hasProgress()) continueSavedGame() else beginNewGame()
            Screen.GAME_OVER, Screen.VICTORY -> openHighScores()
            Screen.HIGH_SCORES -> if (pendingEntry == null) {
                recentEntry = null
                engine.state.screen = Screen.TITLE
            }
            Screen.PAUSED -> if (settingsOpen) settingsOpen = false else engine.state.screen = Screen.PLAYING
            else -> engine.primaryAction()
        }
    }

    fun handleBack(): Boolean {
        if (demoMode) {
            stopDemo()
            return true
        }
        if (engine.state.screen == Screen.TITLE) return false
        when (engine.state.screen) {
            Screen.PLAYING -> {
                engine.pause()
                releaseControls()
            }
            Screen.PAUSED -> if (settingsOpen) settingsOpen = false else engine.state.screen = Screen.PLAYING
            Screen.GAME_OVER, Screen.VICTORY -> openHighScores()
            else -> engine.state.screen = Screen.TITLE
        }
        return true
    }

    fun pause() {
        if (!demoMode) engine.pause()
        releaseControls()
        saveHighScore()
        sound.pauseMusic()
        running = false
    }

    fun resume() {
        running = true
        requestFocus()
        lastFrame = 0L
        lastInteraction = System.nanoTime()
        accumulator = 0f
        sound.resumeMusic()
        postInvalidateOnAnimation()
    }

    fun release() {
        nameDialog?.dismiss()
        nameDialog = null
        saveHighScore()
        cachedBackground?.recycle()
        cachedBackground = null
        cachedBackgroundLevel = -1
        brickLayer?.recycle()
        brickLayer = null
        brickLayerVersion = -1
        sound.release()
    }

    private fun saveHighScore() {
        if (!demoMode) preferences.edit().putInt("high_score", engine.state.highScore).apply()
    }
}
