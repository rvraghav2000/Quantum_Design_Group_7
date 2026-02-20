/**
 * handTracking.js — Webcam Hand Gesture Controls
 *
 * Uses MediaPipe Hands to detect:
 *   - Pinch (thumb+index) with either hand → rotate lattice (drag-like)
 *   - Left hand height → controls Temperature (mK)
 *   - Right hand height → controls B-field (T)
 *
 * Requires MediaPipe CDN scripts loaded in HTML.
 */

const HandTracking = (() => {
    let video, canvasOverlay, ctx;
    let hands;
    let camera;
    let enabled = false;
    let initialized = false;

    // Gesture state
    let leftHandY = null;   // 0 = bottom, 1 = top
    let rightHandY = null;
    let pinchActive = false;
    let pinchPos = { x: 0.5, y: 0.5 };
    let prevPinchPos = null;
    let gestureStatus = '';

    // Smoothing
    const smooth = (prev, curr, factor = 0.3) => prev === null ? curr : prev + (curr - prev) * factor;

    // Callbacks for parameter control
    let onRotate = null;
    let onTemperatureChange = null;
    let onBFieldChange = null;

    function init(callbacks = {}) {
        onRotate = callbacks.onRotate || null;
        onTemperatureChange = callbacks.onTemperatureChange || null;
        onBFieldChange = callbacks.onBFieldChange || null;
    }

    async function start() {
        if (enabled) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('[HandTracking] getUserMedia not supported');
            updateStatusUI('Camera not available');
            return;
        }

        // Create video element
        video = document.createElement('video');
        video.id = 'hand-video';
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.style.display = 'none';
        document.body.appendChild(video);

        // Create overlay canvas
        canvasOverlay = document.getElementById('hand-canvas');
        if (!canvasOverlay) {
            canvasOverlay = document.createElement('canvas');
            canvasOverlay.id = 'hand-canvas';
            document.body.appendChild(canvasOverlay);
        }
        ctx = canvasOverlay.getContext('2d');

        try {
            // Initialize MediaPipe Hands
            hands = new window.Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 0,  // fastest
                minDetectionConfidence: 0.6,
                minTrackingConfidence: 0.5
            });

            hands.onResults(onResults);

            // Start camera
            camera = new window.Camera(video, {
                onFrame: async () => {
                    if (hands && enabled) {
                        await hands.send({ image: video });
                    }
                },
                width: 320,
                height: 240
            });

            await camera.start();
            enabled = true;
            initialized = true;

            // Size overlay
            canvasOverlay.width = 320;
            canvasOverlay.height = 240;

            updateStatusUI('✋ Tracking active');
            console.log('[HandTracking] Started');
        } catch (e) {
            console.error('[HandTracking] Failed to start:', e);
            updateStatusUI('Failed: ' + e.message);
        }
    }

    function stop() {
        if (camera) {
            camera.stop();
        }
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
        }
        enabled = false;
        pinchActive = false;
        leftHandY = null;
        rightHandY = null;
        updateStatusUI('Stopped');
        console.log('[HandTracking] Stopped');
    }

    function onResults(results) {
        if (!ctx || !canvasOverlay) return;

        // Clear overlay
        ctx.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);

        // Draw mirrored camera feed
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(results.image, -canvasOverlay.width, 0, canvasOverlay.width, canvasOverlay.height);
        ctx.restore();

        let newPinchActive = false;
        let newLeftY = null;
        let newRightY = null;
        let statusParts = [];

        if (results.multiHandLandmarks && results.multiHandedness) {
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i];
                // MediaPipe reports handedness from camera perspective, 
                // so "Left" in results = user's RIGHT hand (mirrored)
                const isLeftHand = handedness.label === 'Right'; // user's left
                const isRightHand = handedness.label === 'Left'; // user's right

                // Draw hand skeleton
                drawHand(landmarks, isLeftHand ? '#00e676' : '#ff1744');

                // ─── Detect pinch (thumb tip + index tip distance) ────
                const thumbTip = landmarks[4];
                const indexTip = landmarks[8];
                const pinchDist = Math.sqrt(
                    Math.pow(thumbTip.x - indexTip.x, 2) +
                    Math.pow(thumbTip.y - indexTip.y, 2)
                );

                if (pinchDist < 0.06) {
                    newPinchActive = true;
                    // Pinch position (midpoint of thumb+index)
                    const px = (thumbTip.x + indexTip.x) / 2;
                    const py = (thumbTip.y + indexTip.y) / 2;
                    pinchPos = { x: 1 - px, y: py }; // mirror x

                    // Draw pinch indicator
                    const cx = (1 - px) * canvasOverlay.width;
                    const cy = py * canvasOverlay.height;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                    ctx.fill();
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    statusParts.push('🤏 Pinch');
                }

                // ─── Wrist height for parameter control ────
                const wristY = 1 - landmarks[0].y; // 0=bottom, 1=top

                // Use all fingertips to detect "hand raised"
                const middleTip = landmarks[12];
                const avgFingerY = 1 - (indexTip.y + middleTip.y + landmarks[16].y) / 3;

                if (isLeftHand) {
                    newLeftY = smooth(leftHandY, avgFingerY, 0.25);
                    statusParts.push(`🌡 T: ${Math.round(mapRange(newLeftY, 0.2, 0.9, 20, 4000))} mK`);
                }
                if (isRightHand) {
                    newRightY = smooth(rightHandY, avgFingerY, 0.25);
                    statusParts.push(`🧲 B: ${mapRange(newRightY, 0.2, 0.9, 0.1, 3.0).toFixed(2)} T`);
                }
            }
        }

        // ─── Apply gestures ────

        // Pinch → rotate lattice
        if (newPinchActive && prevPinchPos) {
            const dx = (pinchPos.x - prevPinchPos.x) * 4;
            const dy = (pinchPos.y - prevPinchPos.y) * 4;
            if (onRotate && (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001)) {
                onRotate(dx, dy);
            }
        }
        if (newPinchActive) {
            prevPinchPos = { ...pinchPos };
        } else {
            prevPinchPos = null;
        }
        pinchActive = newPinchActive;

        // Left hand → Temperature
        if (newLeftY !== null) {
            leftHandY = newLeftY;
            const tempMK = Math.round(mapRange(leftHandY, 0.2, 0.9, 20, 4000));
            const clampedTemp = Math.max(20, Math.min(4000, tempMK));
            if (onTemperatureChange) onTemperatureChange(clampedTemp);
        } else {
            leftHandY = null;
        }

        // Right hand → B-field
        if (newRightY !== null) {
            rightHandY = newRightY;
            const bField = mapRange(rightHandY, 0.2, 0.9, 0.1, 3.0);
            const clampedB = Math.max(0.1, Math.min(3.0, bField));
            if (onBFieldChange) onBFieldChange(parseFloat(clampedB.toFixed(2)));
        } else {
            rightHandY = null;
        }

        // Update status
        if (statusParts.length > 0) {
            gestureStatus = statusParts.join(' · ');
        } else {
            gestureStatus = '✋ Show hands';
        }
        updateStatusUI(gestureStatus);
    }

    function drawHand(landmarks, color) {
        if (!ctx) return;
        const w = canvasOverlay.width;
        const h = canvasOverlay.height;

        // Connections
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],     // thumb
            [0, 5], [5, 6], [6, 7], [7, 8],     // index
            [5, 9], [9, 10], [10, 11], [11, 12], // middle
            [9, 13], [13, 14], [14, 15], [15, 16], // ring
            [13, 17], [17, 18], [18, 19], [19, 20], // pinky
            [0, 17]
        ];

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;
        for (const [a, b] of connections) {
            ctx.beginPath();
            ctx.moveTo((1 - landmarks[a].x) * w, landmarks[a].y * h);
            ctx.lineTo((1 - landmarks[b].x) * w, landmarks[b].y * h);
            ctx.stroke();
        }

        // Landmarks
        ctx.fillStyle = color;
        for (let i = 0; i < landmarks.length; i++) {
            const x = (1 - landmarks[i].x) * w;
            const y = landmarks[i].y * h;
            ctx.beginPath();
            ctx.arc(x, y, i === 4 || i === 8 ? 4 : 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }

    function mapRange(val, inMin, inMax, outMin, outMax) {
        const t = Math.max(0, Math.min(1, (val - inMin) / (inMax - inMin)));
        return outMin + t * (outMax - outMin);
    }

    function updateStatusUI(text) {
        const el = document.getElementById('gesture-status');
        if (el) el.textContent = text;
    }

    function isEnabled() { return enabled; }
    function isActive() { return enabled && initialized; }

    return { init, start, stop, isEnabled, isActive };
})();
