/**
 * pulseController.js — Microwave Pulse UI & Animation (v2)
 *
 * Hold-to-pulse button with SVG ring progress.
 * Google Material Design colors.
 */

const PulseController = (() => {
    let isPulsing = false;
    let pulseDuration = 0;
    const PI_PULSE_TIME = 2.0; // seconds for π rotation
    let btn, ringFg;

    function init(button, ring) {
        btn = button;
        ringFg = ring;
        if (!btn) return;

        const start = () => {
            if (btn.disabled) return;
            isPulsing = true;
            pulseDuration = 0;
            btn.classList.add('pulsing');
            if (AudioFeedback && AudioFeedback.playPulseStart) AudioFeedback.playPulseStart();
        };

        const stop = () => {
            isPulsing = false;
            btn.classList.remove('pulsing');
            if (ringFg) ringFg.style.strokeDashoffset = '339.3';
        };

        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
        btn.addEventListener('touchstart', e => { e.preventDefault(); start(); });
        btn.addEventListener('touchend', stop);
    }

    function update(dt) {
        if (!isPulsing) return;
        pulseDuration += dt;

        // Update ring progress
        const progress = Math.min(pulseDuration / PI_PULSE_TIME, 1);
        const circumference = 339.3;
        if (ringFg) {
            ringFg.style.strokeDashoffset = (circumference * (1 - progress)).toString();
        }

        // Color transition: blue → red at π pulse
        if (btn) {
            if (progress > 0.45 && progress < 0.55) {
                btn.style.borderColor = '#fbbc04'; // Google yellow at π/2
            } else if (progress > 0.9) {
                btn.style.borderColor = '#ea4335'; // Google red at π
            } else {
                btn.style.borderColor = '#1a73e8'; // Google blue
            }
        }
    }

    function getIsPulsing() { return isPulsing; }
    function getDuration() { return pulseDuration; }

    return { init, update, getIsPulsing, getDuration };
})();
