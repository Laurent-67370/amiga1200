package fr.crystalhammer.game

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.ToneGenerator
import android.util.Log
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

/** Effets et musique sont paresseux : aucun échec audio ne peut empêcher le jeu de démarrer. */
internal class SoundPlayer(
    private val toneFactory: (Int) -> ToneGenerator = { volume ->
        ToneGenerator(AudioManager.STREAM_MUSIC, volume)
    }
) {
    private var tones: ToneGenerator? = null
    private var effectsDisabled = false
    private var effectsVolume = 70
    private var music: AudioTrack? = null
    private var musicDisabled = false
    private var musicRequested = false
    private var musicVolume = 35

    fun play(event: GameEvent) {
        if (effectsVolume <= 0) return
        val generator = getGenerator() ?: return
        try {
            when (event) {
                GameEvent.PADDLE -> generator.startTone(ToneGenerator.TONE_PROP_ACK, 28)
                GameEvent.BRICK -> generator.startTone(ToneGenerator.TONE_PROP_BEEP, 24)
                GameEvent.HARD_BRICK -> generator.startTone(ToneGenerator.TONE_PROP_NACK, 22)
                GameEvent.POWER -> generator.startTone(ToneGenerator.TONE_CDMA_PIP, 90)
                GameEvent.LASER -> generator.startTone(ToneGenerator.TONE_PROP_BEEP2, 32)
                GameEvent.LOST -> generator.startTone(ToneGenerator.TONE_CDMA_SOFT_ERROR_LITE, 180)
                GameEvent.LEVEL -> generator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 160)
                GameEvent.WORM -> generator.startTone(ToneGenerator.TONE_CDMA_CONFIRM, 80)
            }
        } catch (error: RuntimeException) {
            disableEffects("Lecture audio impossible", error)
        }
    }

    fun setEffectsVolume(volume: Int) {
        val newVolume = volume.coerceIn(0, 100)
        if (newVolume == effectsVolume) return
        effectsVolume = newVolume
        releaseTones()
    }

    fun setMusicVolume(volume: Int) {
        musicVolume = volume.coerceIn(0, 100)
        try {
            music?.setVolume(musicVolume / 100f * 0.55f)
            if (musicVolume == 0) music?.pause() else if (musicRequested) startMusic()
        } catch (error: RuntimeException) {
            disableMusic("Réglage musical impossible", error)
        }
    }

    fun startMusic() {
        musicRequested = true
        if (musicVolume <= 0 || musicDisabled) return
        try {
            val track = music ?: createMusicTrack().also { music = it }
            track.setVolume(musicVolume / 100f * 0.55f)
            if (track.playState != AudioTrack.PLAYSTATE_PLAYING) track.play()
        } catch (error: RuntimeException) {
            disableMusic("Musique indisponible", error)
        }
    }

    fun pauseMusic() {
        try {
            music?.pause()
        } catch (error: RuntimeException) {
            disableMusic("Pause musicale impossible", error)
        }
    }

    fun resumeMusic() {
        if (musicRequested) startMusic()
    }

    private fun getGenerator(): ToneGenerator? {
        if (effectsDisabled) return null
        return try {
            tones ?: toneFactory((effectsVolume * 0.65f).toInt().coerceIn(1, 100)).also { tones = it }
        } catch (error: RuntimeException) {
            disableEffects("Initialisation audio impossible", error)
            null
        }
    }

    private fun createMusicTrack(): AudioTrack {
        val sampleRate = 22_050
        val samples = ChipTune.compose(sampleRate)
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(samples.size * 2)
            .build()
        val written = track.write(samples, 0, samples.size)
        if (written != samples.size) {
            track.release()
            throw IllegalStateException("Écriture musicale incomplète")
        }
        track.setLoopPoints(0, samples.size, -1)
        return track
    }

    private fun disableEffects(message: String, error: RuntimeException) {
        effectsDisabled = true
        Log.e("CrystalHammer", message + "; le jeu continue sans effets sonores", error)
        releaseTones()
    }

    private fun disableMusic(message: String, error: RuntimeException) {
        musicDisabled = true
        Log.e("CrystalHammer", message + "; le jeu continue sans musique", error)
        releaseMusic()
    }

    private fun releaseTones() {
        try {
            tones?.release()
        } catch (_: RuntimeException) {
            // Certains pilotes audio peuvent aussi échouer pendant la libération.
        }
        tones = null
    }

    private fun releaseMusic() {
        try {
            music?.release()
        } catch (_: RuntimeException) {
            // La fermeture du jeu ne doit pas échouer à cause de l'audio.
        }
        music = null
    }

    fun release() {
        releaseTones()
        releaseMusic()
        effectsDisabled = true
        musicDisabled = true
        musicRequested = false
    }
}

/** Petite boucle originale de huit secondes : voix carrée, basse triangulaire et percussion. */
internal object ChipTune {
    private val melody = intArrayOf(
        12, 19, 24, 19, 15, 22, 24, 27, 12, 19, 24, 28, 27, 24, 22, 19,
        10, 17, 22, 17, 14, 21, 22, 26, 10, 17, 22, 25, 24, 22, 21, 17,
        8, 15, 20, 15, 12, 19, 20, 24, 8, 15, 20, 23, 22, 20, 19, 15,
        7, 14, 19, 14, 11, 18, 19, 23, 12, 15, 19, 24, 23, 19, 18, 14
    )
    private val bassRoots = intArrayOf(0, 0, -2, -2, -4, -4, -5, -5)

    fun compose(sampleRate: Int): ShortArray {
        require(sampleRate >= 8_000)
        val result = ShortArray(sampleRate * 8)
        val stepDuration = 0.125
        val leadFrequencies = DoubleArray(melody.size) { 220.0 * 2.0.pow(melody[it] / 12.0) }
        val bassFrequencies = DoubleArray(bassRoots.size) { 110.0 * 2.0.pow(bassRoots[it] / 12.0) }
        var noise = 0x1357
        for (index in result.indices) {
            val time = index.toDouble() / sampleRate
            val step = (time / stepDuration).toInt() % melody.size
            val withinStep = time % stepDuration
            val envelope = when {
                withinStep < 0.008 -> withinStep / 0.008
                withinStep > 0.105 -> ((0.125 - withinStep) / 0.020).coerceIn(0.0, 1.0)
                else -> 1.0
            }
            val leadFrequency = leadFrequencies[step]
            val leadPhase = (time * leadFrequency) % 1.0
            val lead = if (leadPhase < 0.25) 1.0 else -0.65
            val bassFrequency = bassFrequencies[(step / 8) % bassRoots.size]
            val bassPhase = (time * bassFrequency) % 1.0
            val bass = 1.0 - 4.0 * kotlin.math.abs(bassPhase - 0.5)
            noise = noise * 1103515245 + 12345
            val percussion = if (step % 2 == 0 && withinStep < 0.025) {
                ((noise ushr 16) % 2000 - 1000) / 1000.0 * (1.0 - withinStep / 0.025)
            } else 0.0
            val mixed = (lead * envelope * 0.24 + bass * 0.15 + percussion * 0.07)
                .coerceIn(-1.0, 1.0)
            result[index] = floor(mixed * Short.MAX_VALUE).toInt().toShort()
        }
        return result
    }
}
