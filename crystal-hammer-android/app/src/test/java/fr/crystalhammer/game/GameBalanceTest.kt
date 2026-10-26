package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GameBalanceTest {
    @Test
    fun `chaque difficulte couvre exactement les 100 tirages`() {
        for (difficulty in Difficulty.values()) {
            val counts = (0..99).map { GameBalance.powerForRoll(it, difficulty) }.groupingBy { it }.eachCount()
            assertEquals(100, counts.values.sum())
            assertEquals(PowerType.values().toSet(), counts.keys)
        }
    }

    @Test
    fun `le malus est moins frequent en mode facile`() {
        fun deaths(difficulty: Difficulty) = (0..99).count {
            GameBalance.powerForRoll(it, difficulty) == PowerType.DEATH
        }
        assertTrue(deaths(Difficulty.EASY) < deaths(Difficulty.NORMAL))
        assertTrue(deaths(Difficulty.NORMAL) < deaths(Difficulty.AMIGA))
    }

    @Test
    fun `les bonus et vies suivent la difficulte`() {
        assertTrue(Difficulty.EASY.dropChance > Difficulty.NORMAL.dropChance)
        assertTrue(Difficulty.NORMAL.dropChance > Difficulty.AMIGA.dropChance)
        assertEquals(5, Difficulty.EASY.initialLives)
        assertEquals(3, Difficulty.AMIGA.initialLives)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `refuse un tirage hors limites`() {
        GameBalance.powerForRoll(100, Difficulty.NORMAL)
    }
}
