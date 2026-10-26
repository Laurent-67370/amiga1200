package fr.crystalhammer.game

/** Réglages purs et testables : les tirages restent déterministes pour chaque difficulté. */
internal object GameBalance {
    private val types = PowerType.values()
    private val weights = mapOf(
        Difficulty.AMIGA to intArrayOf(18, 15, 15, 12, 16, 4, 4, 16),
        Difficulty.NORMAL to intArrayOf(18, 15, 15, 13, 16, 6, 5, 12),
        Difficulty.EASY to intArrayOf(18, 15, 15, 15, 15, 8, 7, 7)
    )

    fun powerForRoll(roll: Int, difficulty: Difficulty): PowerType {
        require(roll in 0..99)
        var cursor = 0
        val difficultyWeights = weights.getValue(difficulty)
        for (index in types.indices) {
            cursor += difficultyWeights[index]
            if (roll < cursor) return types[index]
        }
        return PowerType.DEATH
    }

    fun maxBalls(difficulty: Difficulty): Int = if (difficulty == Difficulty.EASY) 6 else 5
}
