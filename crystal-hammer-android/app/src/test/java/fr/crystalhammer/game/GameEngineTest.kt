package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class GameEngineTest {
    /** Un seul cristal en haut à gauche, pour que le tableau ne se termine pas tout seul. */
    private fun engine(): GameEngine {
        val engine = GameEngine { _ ->
            Array(GameEngine.ROWS * GameEngine.COLS) { index ->
                if (index == 0) Brick(1, 3, 3) else Brick(0, 0, 0)
            }
        }
        engine.startNewGame(Difficulty.NORMAL)
        engine.primaryAction()
        assertEquals(Screen.PLAYING, engine.state.screen)
        return engine
    }

    private fun GameEngine.launchWithOffset(offset: Float): Ball {
        val ball = state.balls.single()
        ball.stickOffset = offset
        primaryAction()
        return ball
    }

    @Test
    fun `le depart suit le cote du vaisseau touche`() {
        val right = engine().launchWithOffset(30f)
        assertTrue(right.vx > 0f && right.vy < 0f)
        val left = engine().launchWithOffset(-30f)
        assertTrue(left.vx < 0f && left.vy < 0f)
    }

    @Test
    fun `un depart excentre est plus rasant qu'un depart central`() {
        val edge = engine().launchWithOffset(33f)
        val centre = engine().launchWithOffset(0f)
        assertTrue(abs(edge.vx / edge.vy) > abs(centre.vx / centre.vy))
        assertTrue("jamais vertical", abs(centre.vx) > 1f)
    }

    @Test
    fun `le multi-balles fonctionne meme balle collee`() {
        val engine = engine()
        assertTrue(engine.state.balls.single().stuck)
        engine.state.powerUps += PowerUp(engine.state.paddleX, GameEngine.PADDLE_Y, PowerType.MULTI)
        engine.update(1f / 120f)
        assertEquals(3, engine.state.balls.size)
        assertTrue(engine.state.balls.none { it.stuck })
    }

    @Test
    fun `le tir continu respecte la cadence du laser`() {
        val engine = engine()
        engine.primaryAction()
        engine.state.laserTime = 5f
        engine.state.fireHeld = true
        repeat(120) { engine.update(1f / 120f) }
        // Une salve de deux tirs toutes les 0,24 s : cinq salves en une seconde.
        assertEquals(10, engine.state.stats.laserShots)
        engine.state.fireHeld = false
        repeat(120) { engine.update(1f / 120f) }
        assertEquals(10, engine.state.stats.laserShots)
    }

    @Test
    fun `pas de tir continu sans bonus laser`() {
        val engine = engine()
        engine.primaryAction()
        engine.state.fireHeld = true
        repeat(60) { engine.update(1f / 120f) }
        assertEquals(0, engine.state.stats.laserShots)
    }

    @Test
    fun `la vie supplementaire a son propre evenement`() {
        val engine = engine()
        val events = mutableListOf<GameEvent>()
        engine.eventListener = { events += it }
        engine.state.score = Difficulty.NORMAL.extraLifeThreshold - 100
        val lives = engine.state.lives
        engine.state.powerUps += PowerUp(engine.state.paddleX, GameEngine.PADDLE_Y, PowerType.WIDE)
        engine.update(1f / 120f)
        assertEquals(lives + 1, engine.state.lives)
        assertTrue(GameEvent.EXTRA_LIFE in events)
    }

    @Test
    fun `chaque coup sur un cristal invalide le calque affiche`() {
        val engine = engine()
        engine.primaryAction()
        val version = engine.state.bricksVersion
        val ball = engine.state.balls.single()
        ball.x = GameEngine.LEFT + GameEngine.BRICK_WIDTH / 2f
        ball.y = GameEngine.BRICK_TOP + GameEngine.BRICK_HEIGHT + 6f
        ball.vx = 0.1f
        ball.vy = -200f
        repeat(10) { engine.update(1f / 120f) }
        assertEquals(2, engine.state.bricks[0].hits)
        assertTrue(engine.state.bricksVersion > version)
        assertFalse(engine.state.screen == Screen.LEVEL_CLEAR)
    }
}
