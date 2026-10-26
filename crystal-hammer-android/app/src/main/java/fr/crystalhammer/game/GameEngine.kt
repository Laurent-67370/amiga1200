package fr.crystalhammer.game

import android.content.Context
import android.graphics.RectF
import kotlin.math.*
import kotlin.random.Random

internal class GameEngine(private val context: Context) {
    companion object {
        const val WIDTH = 360f
        const val HEIGHT = 640f
        const val LEFT = 8f
        const val RIGHT = 352f
        const val TOP = 52f
        const val BOTTOM = 640f
        const val PADDLE_Y = 590f
        const val PADDLE_HEIGHT = 12f
        const val COLS = 20
        const val ROWS = 20
        const val BRICK_TOP = 108f
        const val BRICK_WIDTH = (RIGHT - LEFT) / COLS
        const val BRICK_HEIGHT = 16f

        fun brickRect(index: Int): RectF {
            val column = index % COLS
            val row = index / COLS
            val left = LEFT + column * BRICK_WIDTH
            val top = BRICK_TOP + row * BRICK_HEIGHT
            return RectF(left, top, left + BRICK_WIDTH, top + BRICK_HEIGHT)
        }
    }

    val state = GameState()
    var eventListener: (GameEvent) -> Unit = {}
    var demonstration = false

    fun startNewGame(difficulty: Difficulty = Difficulty.NORMAL) {
        demonstration = false
        state.difficulty = difficulty
        state.score = 0
        state.lives = difficulty.initialLives
        state.level = 1
        state.stats = RunStats()
        state.nextExtraLife = difficulty.extraLifeThreshold
        state.random = Random(1987)
        loadLevel()
    }

    fun startDemo(oneBasedLevel: Int) {
        demonstration = true
        state.difficulty = Difficulty.NORMAL
        state.score = 0
        state.lives = 3
        state.level = oneBasedLevel.coerceIn(1, LevelDecoder.LEVEL_COUNT)
        state.stats = RunStats()
        state.nextExtraLife = Int.MAX_VALUE
        state.random = Random(1987 + state.level)
        loadLevel()
    }

    fun continueGame(
        level: Int,
        score: Int,
        lives: Int,
        difficulty: Difficulty = Difficulty.NORMAL,
        stats: RunStats = RunStats()
    ) {
        demonstration = false
        state.difficulty = difficulty
        state.level = level.coerceIn(1, LevelDecoder.LEVEL_COUNT)
        state.score = score.coerceAtLeast(0)
        state.lives = lives.coerceIn(1, 9)
        state.stats = stats
        state.nextExtraLife = difficulty.extraLifeThreshold
        while (state.nextExtraLife <= state.score && state.nextExtraLife < Int.MAX_VALUE - difficulty.extraLifeThreshold) {
            state.nextExtraLife += difficulty.extraLifeThreshold
        }
        state.random = Random(1987 + state.level)
        loadLevel()
    }

    private fun loadLevel() {
        state.bricks = LevelDecoder.fromAssets(context, state.level)
        state.screen = Screen.INTRO
        state.stateTime = 0f
        state.wormClock = 8f
        state.paddleX = WIDTH / 2f
        resetVolley()
    }

    private fun resetVolley() {
        state.balls.clear()
        state.powerUps.clear()
        state.lasers.clear()
        state.worms.clear()
        state.particles.clear()
        state.wideTime = 0f
        state.stickyTime = 0f
        state.laserTime = 0f
        state.laserCooldown = 0f
        state.paddleWidth = 66f
        state.paddleX = WIDTH / 2f
        state.balls += Ball(state.paddleX, PADDLE_Y - 5f, 0f, 0f)
    }

    fun pause() {
        if (state.screen == Screen.PLAYING) state.screen = Screen.PAUSED
    }

    fun primaryAction() {
        when (state.screen) {
            Screen.TITLE, Screen.GAME_OVER, Screen.VICTORY -> startNewGame()
            Screen.INTRO -> {
                state.screen = Screen.PLAYING
                state.stateTime = 0f
            }
            Screen.PAUSED -> state.screen = Screen.PLAYING
            Screen.PLAYING -> {
                var launched = false
                for (ball in state.balls) {
                    if (ball.stuck) {
                        launch(ball)
                        launched = true
                    }
                }
                if (!launched && state.laserTime > 0f) fireLaser()
            }
            Screen.LEVEL_CLEAR, Screen.HIGH_SCORES -> Unit
        }
    }

    fun movePaddle(x: Float) {
        if (state.screen != Screen.PLAYING) return
        state.paddleX = x.coerceIn(LEFT + state.paddleWidth / 2f, RIGHT - state.paddleWidth / 2f)
    }

    private fun launch(ball: Ball) {
        val angle = Math.toRadians(-68.0)
        val speed = 210f * state.difficulty.speedScale
        ball.vx = (cos(angle) * speed).toFloat()
        ball.vy = (sin(angle) * speed).toFloat()
        ball.stuck = false
        ball.stickyCatch = false
        ball.stallTime = 0f
    }

    fun update(dt: Float) {
        if (state.screen == Screen.INTRO) {
            state.stateTime += dt
            if (state.stateTime >= 1.8f) {
                state.screen = Screen.PLAYING
                state.stateTime = 0f
            }
            return
        }
        if (state.screen == Screen.LEVEL_CLEAR) {
            state.stateTime += dt
            updateParticles(dt)
            if (state.stateTime >= 1.8f) {
                if (state.level >= LevelDecoder.LEVEL_COUNT) {
                    state.screen = Screen.VICTORY
                } else {
                    state.level++
                    loadLevel()
                }
            }
            return
        }
        if (state.screen != Screen.PLAYING) return

        state.stateTime += dt
        state.wideTime = max(0f, state.wideTime - dt)
        val stickyWasActive = state.stickyTime > 0f
        state.stickyTime = max(0f, state.stickyTime - dt)
        if (stickyWasActive && state.stickyTime == 0f) {
            // Une balle capturée par le bonus repart automatiquement à la fin de l'effet.
            state.balls.filter { it.stuck && it.stickyCatch }.forEach { launch(it) }
        }
        state.laserTime = max(0f, state.laserTime - dt)
        state.laserCooldown = max(0f, state.laserCooldown - dt)
        state.paddleWidth = if (state.wideTime > 0f) 98f else 66f
        movePaddle(state.paddleX)

        updateBalls(dt)
        if (state.screen != Screen.PLAYING) return
        updatePowerUps(dt)
        if (state.screen != Screen.PLAYING) return
        updateLasers(dt)
        updateWorms(dt)
        if (state.screen != Screen.PLAYING) return
        updateParticles(dt)

        state.wormClock -= dt
        if (state.wormClock <= 0f) {
            if (state.worms.size < 2 && remainingBricks() in 1..260) spawnWorm()
            state.wormClock = 10f + state.random.nextFloat() * 8f
        }

        if (remainingBricks() == 0) completeLevel()
    }

    private fun updateBalls(dt: Float) {
        val iterator = state.balls.iterator()
        while (iterator.hasNext()) {
            val ball = iterator.next()
            if (ball.stuck) {
                ball.x = state.paddleX + ball.stickOffset
                ball.y = PADDLE_Y - ball.radius - 0.5f
                continue
            }
            val oldX = ball.x
            val oldY = ball.y
            ball.x += ball.vx * dt
            ball.y += ball.vy * dt

            if (ball.x - ball.radius < LEFT) {
                ball.x = LEFT + ball.radius
                ball.vx = abs(ball.vx)
            } else if (ball.x + ball.radius > RIGHT) {
                ball.x = RIGHT - ball.radius
                ball.vx = -abs(ball.vx)
            }
            if (ball.y - ball.radius < TOP) {
                ball.y = TOP + ball.radius
                ball.vy = abs(ball.vy)
            }

            collidePaddle(ball, oldY)
            if (!ball.stuck) collideBricks(ball, oldX, oldY)
            collideWorms(ball)

            if (!ball.stuck) {
                BallSafety.ensure(ball, 340f * state.difficulty.speedScale)
                val displacement = hypot(ball.x - oldX, ball.y - oldY)
                ball.stallTime = if (displacement < 0.01f) ball.stallTime + dt else 0f
                if (ball.stallTime >= 1.25f) BallSafety.release(ball)
            }

            if (ball.y - ball.radius > BOTTOM) iterator.remove()
        }
        if (state.balls.isEmpty()) loseLife()
    }

    private fun collidePaddle(ball: Ball, oldY: Float) {
        if (ball.vy <= 0f) return
        val half = state.paddleWidth / 2f
        // Le croisement de la face supérieure est testé entre deux pas pour éviter un vaisseau traversé.
        if (oldY + ball.radius > PADDLE_Y || ball.y + ball.radius < PADDLE_Y) return
        if (ball.y - ball.radius > PADDLE_Y + PADDLE_HEIGHT) return
        if (ball.x + ball.radius < state.paddleX - half || ball.x - ball.radius > state.paddleX + half) return

        ball.y = PADDLE_Y - ball.radius
        if (state.stickyTime > 0f) {
            ball.stuck = true
            ball.stickyCatch = true
            ball.stickOffset = (ball.x - state.paddleX).coerceIn(-half + 6f, half - 6f)
            ball.vx = 0f
            ball.vy = 0f
        } else {
            ball.stickyCatch = false
            ball.stallTime = 0f
            val speed = hypot(ball.vx, ball.vy).coerceIn(180f, 330f * state.difficulty.speedScale)
            state.stats.resetCombo()
            val offset = ((ball.x - state.paddleX) / half).coerceIn(-1f, 1f)
            val angle = Math.toRadians((-90.0 + offset * 62.0))
            ball.vx = (cos(angle) * speed).toFloat()
            ball.vy = (sin(angle) * speed).toFloat()
        }
        eventListener(GameEvent.PADDLE)
    }

    private fun collideBricks(ball: Ball, oldX: Float, oldY: Float) {
        val minX = min(oldX, ball.x) - ball.radius
        val maxX = max(oldX, ball.x) + ball.radius
        val minY = min(oldY, ball.y) - ball.radius
        val maxY = max(oldY, ball.y) + ball.radius
        val firstColumn = (floor((minX - LEFT) / BRICK_WIDTH).toInt()).coerceIn(0, COLS - 1)
        val lastColumn = (floor((maxX - LEFT) / BRICK_WIDTH).toInt()).coerceIn(0, COLS - 1)
        val firstRow = (floor((minY - BRICK_TOP) / BRICK_HEIGHT).toInt()).coerceIn(0, ROWS - 1)
        val lastRow = (floor((maxY - BRICK_TOP) / BRICK_HEIGHT).toInt()).coerceIn(0, ROWS - 1)

        for (row in firstRow..lastRow) {
            for (column in firstColumn..lastColumn) {
                val index = row * COLS + column
                val brick = state.bricks[index]
                if (brick.hits <= 0) continue
                val rect = brickRect(index)
                val nearestX = ball.x.coerceIn(rect.left, rect.right)
                val nearestY = ball.y.coerceIn(rect.top, rect.bottom)
                val dx = ball.x - nearestX
                val dy = ball.y - nearestY
                if (dx * dx + dy * dy > ball.radius * ball.radius) continue

                if (oldY + ball.radius <= rect.top || oldY - ball.radius >= rect.bottom) {
                    ball.vy = -ball.vy
                    ball.y = oldY
                } else if (oldX + ball.radius <= rect.left || oldX - ball.radius >= rect.right) {
                    ball.vx = -ball.vx
                    ball.x = oldX
                } else {
                    if (abs(dx) > abs(dy)) ball.vx = -ball.vx else ball.vy = -ball.vy
                    ball.x = oldX
                    ball.y = oldY
                }
                avoidHorizontalPath(ball)
                hitBrick(index, rect)
                return
            }
        }
    }

    private fun avoidHorizontalPath(ball: Ball) {
        if (abs(ball.vy) < 65f) {
            val sign = if (ball.vy >= 0f) 1f else -1f
            ball.vy = sign * 65f
            val speed = hypot(ball.vx, ball.vy)
            ball.vx = sign(ball.vx) * sqrt(max(1f, speed * speed - ball.vy * ball.vy))
        }
    }

    private fun hitBrick(index: Int, rect: RectF, fromLaser: Boolean = false) {
        val brick = state.bricks[index]
        if (fromLaser) state.stats.laserHits++
        if (brick.solid) {
            eventListener(GameEvent.HARD_BRICK)
            return
        }
        brick.hits--
        addScore(if (brick.hits == 0) 60 else 15)
        burst(rect.centerX(), rect.centerY(), crystalColor(brick.color), 5)
        if (brick.hits == 0) {
            state.stats.brickDestroyed()
            if (brick.color != 7 && state.powerUps.isEmpty() &&
                state.random.nextFloat() < state.difficulty.dropChance
            ) {
                spawnPowerUp(rect.centerX(), rect.centerY())
            }
            accelerateBalls()
        }
        eventListener(if (brick.hits == 0) GameEvent.BRICK else GameEvent.HARD_BRICK)
    }

    private fun accelerateBalls() {
        for (ball in state.balls) {
            if (ball.stuck) continue
            val speed = hypot(ball.vx, ball.vy)
            if (speed < 325f * state.difficulty.speedScale) {
                val factor = (speed + 1.2f) / speed
                ball.vx *= factor
                ball.vy *= factor
            }
        }
    }

    private fun spawnPowerUp(x: Float, y: Float) {
        val type = GameBalance.powerForRoll(state.random.nextInt(100), state.difficulty)
        state.powerUps += PowerUp(x, y, type)
    }

    private fun updatePowerUps(dt: Float) {
        val iterator = state.powerUps.iterator()
        while (iterator.hasNext()) {
            val power = iterator.next()
            power.y += 68f * dt
            power.rotation += 150f * dt
            val withinX = abs(power.x - state.paddleX) <= state.paddleWidth / 2f + 7f
            val withinY = power.y + 7f >= PADDLE_Y && power.y - 7f <= PADDLE_Y + PADDLE_HEIGHT
            if (withinX && withinY) {
                iterator.remove()
                applyPower(power.type)
                // Un bonus peut réinitialiser la volée ou vider la liste : on sort immédiatement.
                return
            } else if (power.y > HEIGHT + 10f) {
                iterator.remove()
            }
        }
    }

    private fun applyPower(type: PowerType) {
        if (type != PowerType.DEATH) state.stats.powerUpsCollected++
        when (type) {
            PowerType.WIDE -> state.wideTime = 18f
            PowerType.SLOW -> state.balls.forEach { ball ->
                if (!ball.stuck) {
                    val speed = hypot(ball.vx, ball.vy)
                    val slowSpeed = 175f * state.difficulty.speedScale
                    if (speed > slowSpeed) {
                        ball.vx *= slowSpeed / speed
                        ball.vy *= slowSpeed / speed
                    }
                }
            }
            PowerType.STICKY -> state.stickyTime = 15f
            PowerType.MULTI -> splitBalls()
            PowerType.LASER -> state.laserTime = 12f
            PowerType.LIFE -> state.lives = min(9, state.lives + 1)
            PowerType.SKIP -> completeLevel()
            PowerType.DEATH -> loseLife()
        }
        if (type != PowerType.DEATH) {
            addScore(250)
            eventListener(GameEvent.POWER)
        }
    }

    private fun splitBalls() {
        val source = state.balls.firstOrNull { !it.stuck } ?: return
        val speed = hypot(source.vx, source.vy)
        val base = atan2(source.vy, source.vx)
        for (delta in listOf(-0.48f, 0.48f)) {
            if (state.balls.size >= GameBalance.maxBalls(state.difficulty)) break
            state.balls += Ball(
                source.x, source.y,
                cos(base + delta) * speed,
                sin(base + delta) * speed,
                stuck = false
            )
        }
    }

    private fun fireLaser() {
        if (state.laserCooldown > 0f) return
        val offset = state.paddleWidth * 0.32f
        state.lasers += Laser(state.paddleX - offset, PADDLE_Y - 4f)
        state.lasers += Laser(state.paddleX + offset, PADDLE_Y - 4f)
        state.stats.laserShots += 2
        state.laserCooldown = 0.24f
        eventListener(GameEvent.LASER)
    }

    private fun updateLasers(dt: Float) {
        val iterator = state.lasers.iterator()
        laserLoop@ while (iterator.hasNext()) {
            val laser = iterator.next()
            laser.y -= 410f * dt
            if (laser.y < TOP) {
                iterator.remove()
                continue
            }
            val column = floor((laser.x - LEFT) / BRICK_WIDTH).toInt()
            val row = floor((laser.y - BRICK_TOP) / BRICK_HEIGHT).toInt()
            if (column in 0 until COLS && row in 0 until ROWS) {
                val index = row * COLS + column
                val brick = state.bricks[index]
                if (brick.hits > 0) {
                    val rect = brickRect(index)
                    if (laser.x in rect.left..rect.right && laser.y in rect.top..rect.bottom) {
                        hitBrick(index, rect, fromLaser = true)
                        iterator.remove()
                        continue@laserLoop
                    }
                }
            }
            val worms = state.worms.iterator()
            while (worms.hasNext()) {
                val worm = worms.next()
                if (hypot(laser.x - worm.x, laser.y - worm.y) < 12f) {
                    worms.remove()
                    iterator.remove()
                    state.stats.laserHits++
                    addScore(500)
                    burst(worm.x, worm.y, 0xFF9BE564.toInt(), 12)
                    eventListener(GameEvent.WORM)
                    continue@laserLoop
                }
            }
        }
    }

    private fun spawnWorm() {
        state.worms += Worm(
            x = LEFT + 30f + state.random.nextFloat() * (RIGHT - LEFT - 60f),
            y = TOP + 8f,
            speed = 22f + state.random.nextFloat() * 10f,
            phase = state.random.nextFloat() * 6.28f
        )
    }

    private fun updateWorms(dt: Float) {
        val iterator = state.worms.iterator()
        while (iterator.hasNext()) {
            val worm = iterator.next()
            worm.age += dt
            worm.y += worm.speed * dt
            worm.x += sin(worm.age * 2.4f + worm.phase) * 17f * dt
            if (worm.y > HEIGHT + 20f) {
                iterator.remove()
                continue
            }
            val touchesPaddle = worm.y + 8f >= PADDLE_Y &&
                abs(worm.x - state.paddleX) < state.paddleWidth / 2f + 6f
            if (touchesPaddle) {
                loseLife()
                return
            }
        }
    }

    private fun collideWorms(ball: Ball) {
        val iterator = state.worms.iterator()
        while (iterator.hasNext()) {
            val worm = iterator.next()
            if (hypot(ball.x - worm.x, ball.y - worm.y) < 11f + ball.radius) {
                iterator.remove()
                ball.vy = -ball.vy
                ball.vx += sin(worm.age * 5f) * 35f
                avoidHorizontalPath(ball)
                addScore(500)
                burst(worm.x, worm.y, 0xFF9BE564.toInt(), 12)
                eventListener(GameEvent.WORM)
                return
            }
        }
    }

    private fun loseLife() {
        if (state.screen != Screen.PLAYING) return
        state.lives--
        state.stats.resetCombo()
        eventListener(GameEvent.LOST)
        if (state.lives <= 0) {
            state.lives = 0
            state.screen = Screen.GAME_OVER
            state.balls.clear()
        } else {
            resetVolley()
        }
    }

    private fun completeLevel() {
        if (state.screen != Screen.PLAYING) return
        addScore(1000 + state.lives * 100)
        state.stats.levelsCompleted++
        state.screen = Screen.LEVEL_CLEAR
        state.stateTime = 0f
        state.powerUps.clear()
        state.lasers.clear()
        state.worms.clear()
        eventListener(GameEvent.LEVEL)
    }

    private fun remainingBricks(): Int = state.bricks.count { !it.solid && it.hits > 0 }

    private fun addScore(points: Int) {
        state.score += points
        if (!demonstration) {
            if (state.score > state.highScore) state.highScore = state.score
            while (state.score >= state.nextExtraLife && state.nextExtraLife < Int.MAX_VALUE) {
                state.lives = min(9, state.lives + 1)
                state.nextExtraLife = if (state.nextExtraLife > Int.MAX_VALUE - state.difficulty.extraLifeThreshold) {
                    Int.MAX_VALUE
                } else {
                    state.nextExtraLife + state.difficulty.extraLifeThreshold
                }
                eventListener(GameEvent.POWER)
            }
        }
    }

    private fun burst(x: Float, y: Float, color: Int, count: Int) {
        repeat(count) {
            val angle = state.random.nextFloat() * 6.28318f
            val speed = 25f + state.random.nextFloat() * 75f
            state.particles += Particle(
                x, y, cos(angle) * speed, sin(angle) * speed,
                0.3f + state.random.nextFloat() * 0.35f, color
            )
        }
    }

    private fun updateParticles(dt: Float) {
        val iterator = state.particles.iterator()
        while (iterator.hasNext()) {
            val particle = iterator.next()
            particle.life -= dt
            if (particle.life <= 0f) {
                iterator.remove()
            } else {
                particle.x += particle.vx * dt
                particle.y += particle.vy * dt
                particle.vy += 90f * dt
            }
        }
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
}


/** Garde-fous indépendants de l'affichage pour éviter toute balle morte ou invalide. */
internal object BallSafety {
    fun ensure(ball: Ball, maxSpeed: Float = 340f) {
        if (!ball.x.isFinite() || !ball.y.isFinite()) {
            ball.x = GameEngine.WIDTH / 2f
            ball.y = GameEngine.HEIGHT / 2f
            ball.vx = 85f
            ball.vy = -175f
        }
        if (!ball.vx.isFinite()) ball.vx = 85f
        if (!ball.vy.isFinite()) ball.vy = -175f

        var speed = hypot(ball.vx, ball.vy)
        if (speed < 1f) {
            ball.vx = 85f
            ball.vy = -175f
            speed = hypot(ball.vx, ball.vy)
        }
        val targetSpeed = speed.coerceIn(150f, maxSpeed.coerceAtLeast(150f))
        if (speed != targetSpeed) {
            ball.vx *= targetSpeed / speed
            ball.vy *= targetSpeed / speed
            speed = targetSpeed
        }
        if (abs(ball.vy) < 45f) {
            ball.vy = (if (ball.vy >= 0f) 1f else -1f) * 45f
            val horizontal = sqrt((speed * speed - ball.vy * ball.vy).coerceAtLeast(1f))
            ball.vx = (if (ball.vx >= 0f) 1f else -1f) * horizontal
        }
    }

    fun release(ball: Ball) {
        ball.x = ball.x.coerceIn(GameEngine.LEFT + ball.radius, GameEngine.RIGHT - ball.radius)
        ball.y = ball.y.coerceIn(GameEngine.TOP + ball.radius, GameEngine.PADDLE_Y - 20f)
        ball.vx = if (ball.x > GameEngine.WIDTH / 2f) -95f else 95f
        ball.vy = -180f
        ball.stallTime = 0f
        ensure(ball)
    }
}
