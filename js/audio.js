/**
 * audio.js — Web Audio API Sonification Layer
 * 
 * Maps quantum state and interactions to sound:
 * - Spin state → oscillator frequency
 * - Pulse activation → resonant chirp
 * - Decoherence → white noise
 * - Gate voltage changes → pitch bends
 */

const AudioEngine = (() => {
    let audioCtx = null;
    let isEnabled = false;
    let isInitialized = false;

    // Nodes
    let masterGain = null;
    let spinOscillator = null;
    let spinGain = null;
    let noiseSource = null;
    let noiseGain = null;
    let pulseOscillator = null;
    let pulseGain = null;

    // Parameters
    const BASE_FREQ_0 = 220;  // Hz — frequency for |0⟩
    const BASE_FREQ_1 = 660;  // Hz — frequency for |1⟩
    const MASTER_VOLUME = 0.15;

    /**
     * Initialize the Web Audio context and nodes.
     * Must be called from a user gesture.
     */
    function init() {
        if (isInitialized) return;

        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            // Master gain
            masterGain = audioCtx.createGain();
            masterGain.gain.value = MASTER_VOLUME;
            masterGain.connect(audioCtx.destination);

            // Spin state oscillator (continuous drone)
            spinOscillator = audioCtx.createOscillator();
            spinOscillator.type = 'sine';
            spinOscillator.frequency.value = BASE_FREQ_0;
            spinGain = audioCtx.createGain();
            spinGain.gain.value = 0.3;
            spinOscillator.connect(spinGain);
            spinGain.connect(masterGain);
            spinOscillator.start();

            // Noise generator for decoherence
            const bufferSize = audioCtx.sampleRate * 2;
            const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            noiseSource = audioCtx.createBufferSource();
            noiseSource.buffer = noiseBuffer;
            noiseSource.loop = true;
            noiseGain = audioCtx.createGain();
            noiseGain.gain.value = 0;
            noiseSource.connect(noiseGain);
            noiseGain.connect(masterGain);
            noiseSource.start();

            isInitialized = true;
        } catch (e) {
            console.warn('Web Audio API not available:', e);
        }
    }

    /**
     * Toggle audio on/off.
     */
    function toggle() {
        if (!isInitialized) init();
        isEnabled = !isEnabled;
        if (masterGain) {
            masterGain.gain.setTargetAtTime(
                isEnabled ? MASTER_VOLUME : 0,
                audioCtx.currentTime,
                0.1
            );
        }
        return isEnabled;
    }

    /**
     * Set enabled state explicitly.
     */
    function setEnabled(enabled) {
        if (!isInitialized && enabled) init();
        isEnabled = enabled;
        if (masterGain && audioCtx) {
            masterGain.gain.setTargetAtTime(
                isEnabled ? MASTER_VOLUME : 0,
                audioCtx.currentTime,
                0.1
            );
        }
    }

    /**
     * Update spin oscillator frequency based on P(|1⟩).
     */
    function updateSpinState(p1) {
        if (!isInitialized || !isEnabled) return;
        const freq = BASE_FREQ_0 + (BASE_FREQ_1 - BASE_FREQ_0) * p1;
        spinOscillator.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
    }

    /**
     * Update noise level based on decoherence intensity.
     */
    function updateNoise(intensity) {
        if (!isInitialized || !isEnabled) return;
        noiseGain.gain.setTargetAtTime(intensity * 0.4, audioCtx.currentTime, 0.1);
    }

    /**
     * Play a pulse chirp sound.
     */
    function playPulseStart() {
        if (!isInitialized || !isEnabled) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = 440;
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
            gain.gain.value = 0.2;
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        } catch (e) { /* ignore */ }
    }

    /**
     * Play a gate voltage change tick.
     */
    function playGateTick() {
        if (!isInitialized || !isEnabled) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 800 + Math.random() * 200;
            gain.gain.value = 0.05;
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.05);
        } catch (e) { /* ignore */ }
    }

    /**
     * Play electron trapped sound.
     */
    function playTrapped() {
        if (!isInitialized || !isEnabled) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 330;
            osc.frequency.exponentialRampToValueAtTime(660, audioCtx.currentTime + 0.3);
            gain.gain.value = 0.2;
            gain.gain.setTargetAtTime(0.001, audioCtx.currentTime + 0.4, 0.1);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.6);
        } catch (e) { /* ignore */ }
    }

    function getEnabled() {
        return isEnabled;
    }

    return {
        init,
        toggle,
        setEnabled,
        getEnabled,
        updateSpinState,
        updateNoise,
        playPulseStart,
        playGateTick,
        playTrapped
    };
})();
