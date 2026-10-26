package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

class BallSafetyTest {
    @Test
    fun `relance une balle de vitesse nulle`() {
        val ball = Ball(100f, 200f, 0f, 0f, stuck = false)
        BallSafety.ensure(ball)
        assertTrue(hypot(ball.vx, ball.vy) >= 150f)
        assertTrue(ball.vy < 0f)
    }

    @Test
    fun `corrige les coordonnees et vitesses invalides`() {
        val ball = Ball(Float.NaN, Float.POSITIVE_INFINITY, Float.NaN, Float.NaN, stuck = false)
        BallSafety.ensure(ball)
        assertTrue(ball.x.isFinite())
        assertTrue(ball.y.isFinite())
        assertTrue(ball.vx.isFinite())
        assertTrue(ball.vy.isFinite())
    }

    @Test
    fun `empeche une trajectoire presque horizontale`() {
        val ball = Ball(100f, 200f, 220f, 0.1f, stuck = false)
        BallSafety.ensure(ball)
        assertTrue(abs(ball.vy) >= 45f)
    }

    @Test
    fun `libere une balle immobilisee`() {
        val ball = Ball(350f, 100f, 0f, 0f, stuck = false, stallTime = 1.25f)
        BallSafety.release(ball)
        assertEquals(0f, ball.stallTime)
        assertTrue(ball.x <= GameEngine.RIGHT - ball.radius)
        assertTrue(hypot(ball.vx, ball.vy) >= 150f)
    }
}
