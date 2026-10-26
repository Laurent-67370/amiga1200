package fr.crystalhammer.game

import kotlin.random.Random

internal enum class Screen {
    TITLE, INTRO, PLAYING, PAUSED, LEVEL_CLEAR, GAME_OVER, VICTORY, HIGH_SCORES
}

internal enum class Difficulty(
    val label: String,
    val initialLives: Int,
    val speedScale: Float,
    val dropChance: Float,
    val extraLifeThreshold: Int
) {
    AMIGA("AMIGA", 3, 1.08f, 0.20f, 12_000),
    NORMAL("NORMALE", 3, 1f, 0.25f, 10_000),
    EASY("FACILE", 5, 0.88f, 0.31f, 8_000)
}

internal enum class ControlMode(val label: String) {
    RELATIVE("GLISSEMENT"),
    DIRECT("DIRECT"),
    ZONES("ZONES G / D")
}

internal enum class PowerType(val color: Long, val symbol: String) {
    WIDE(0xFF397BFF, "↔"),
    SLOW(0xFFFFD84A, "S"),
    STICKY(0xFF54E88A, "C"),
    MULTI(0xFF54E8FF, "3"),
    LASER(0xFFFF596D, "L"),
    LIFE(0xFFFF9B45, "+"),
    SKIP(0xFFFF70D7, "»"),
    DEATH(0xFFB8BDC9, "×")
}

internal enum class GameEvent {
    PADDLE, BRICK, HARD_BRICK, POWER, LASER, LOST, LEVEL, WORM, EXTRA_LIFE
}

internal data class Brick(
    val color: Int,
    val maxHits: Int,
    var hits: Int,
    val solid: Boolean = false
)

internal data class Ball(
    var x: Float,
    var y: Float,
    var vx: Float,
    var vy: Float,
    var stuck: Boolean = true,
    var stickOffset: Float = 0f,
    var stickyCatch: Boolean = false,
    var stallTime: Float = 0f,
    val radius: Float = 4.2f
)

internal data class PowerUp(
    var x: Float,
    var y: Float,
    val type: PowerType,
    var rotation: Float = 0f
)

internal data class Laser(var x: Float, var y: Float)

internal data class Worm(
    var x: Float,
    var y: Float,
    val speed: Float,
    val phase: Float,
    var age: Float = 0f
)

internal data class Particle(
    var x: Float,
    var y: Float,
    var vx: Float,
    var vy: Float,
    var life: Float,
    val color: Int
)

internal class RunStats {
    var bricksDestroyed = 0
    var powerUpsCollected = 0
    var levelsCompleted = 0
    var laserShots = 0
    var laserHits = 0
    var currentCombo = 0
    var bestCombo = 0

    val laserPrecision: Int
        get() = if (laserShots == 0) 0 else (laserHits * 100 / laserShots).coerceIn(0, 100)

    fun brickDestroyed() {
        bricksDestroyed++
        currentCombo++
        if (currentCombo > bestCombo) bestCombo = currentCombo
    }

    fun resetCombo() {
        currentCombo = 0
    }
}

internal class GameState {
    var screen = Screen.TITLE
    var score = 0
    var highScore = 0
    var lives = 3
    var level = 1
    var difficulty = Difficulty.NORMAL
    var stats = RunStats()
    var nextExtraLife = Difficulty.NORMAL.extraLifeThreshold
    var paddleX = GameEngine.WIDTH / 2f
    var paddleWidth = 66f
    var wideTime = 0f
    var stickyTime = 0f
    var laserTime = 0f
    var laserCooldown = 0f
    var stateTime = 0f
    var wormClock = 9f
    var bricks = Array(GameEngine.ROWS * GameEngine.COLS) { Brick(0, 0, 0) }
    /** Incrémenté à chaque changement visible des cristaux : l'affichage met leur calque en cache. */
    var bricksVersion = 0
    /** Tir continu demandé tant qu'un doigt, une touche ou un bouton reste enfoncé. */
    var fireHeld = false
    val balls = mutableListOf<Ball>()
    val powerUps = mutableListOf<PowerUp>()
    val lasers = mutableListOf<Laser>()
    val worms = mutableListOf<Worm>()
    val particles = mutableListOf<Particle>()
    var random: Random = Random(1987)
}
