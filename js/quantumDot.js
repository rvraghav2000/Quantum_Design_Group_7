/**
 * quantumDot.js — Interactive Wavefunction Visualization & Quantum Dot (v4)
 *
 * FULLY INTERACTIVE:
 *   - Gate voltages visibly push/pull the electron cloud
 *   - |ψ|² cloud moves, reshapes, and recolors with spin state
 *   - Potential well graph updates in real-time with thick visible lines
 *   - Temperature visibly shakes/broadens the wavefunction
 *   - The electron cloud particles are bright and clearly visible
 */

const QuantumDot = (() => {
    let vLeft = 0, vCenter = 0, vRight = 0;
    const WELL_SIGMA = 0.5;
    const WELL_SEPARATION = 1.2;

    let isTrapped = false;
    const trapThreshold = 10; // slightly lower for easier trapping
    let electronAlpha = 0;
    let wavefunctionPhase = 0;

    let electronGroup, wfParticles, wfGlow, gateVisualsGroup;
    let wfPositions, wfColors, wfSizes;
    const PARTICLE_COUNT = 600; // more particles

    let potentialCurve;
    let potCanvas, potCtx;
    let canvasReady = false;

    // Store particles' individual phase for smooth animation
    const particlePhases = [];

    function init(scene) {
        electronGroup = new THREE.Group();
        electronGroup.visible = false;
        scene.add(electronGroup);

        // ─── Wavefunction particle cloud ────
        const pGeo = new THREE.BufferGeometry();
        wfPositions = new Float32Array(PARTICLE_COUNT * 3);
        wfColors = new Float32Array(PARTICLE_COUNT * 3);
        wfSizes = new Float32Array(PARTICLE_COUNT);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            wfPositions[i * 3] = (Math.random() - 0.5) * 1.5;
            wfPositions[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
            wfPositions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
            wfColors[i * 3] = 0.1;
            wfColors[i * 3 + 1] = 0.5;
            wfColors[i * 3 + 2] = 0.95;
            wfSizes[i] = 0.06 + Math.random() * 0.04;

            particlePhases.push({
                px: Math.random() * Math.PI * 2,
                py: Math.random() * Math.PI * 2,
                pz: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 2
            });
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(wfPositions, 3));
        pGeo.setAttribute('color', new THREE.BufferAttribute(wfColors, 3));

        wfParticles = new THREE.Points(pGeo, new THREE.PointsMaterial({
            size: 0.07,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        }));
        electronGroup.add(wfParticles);

        // Central glow sphere
        wfGlow = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 24, 16),
            new THREE.MeshBasicMaterial({
                color: 0x448aff,
                transparent: true,
                opacity: 0.2
            })
        );
        electronGroup.add(wfGlow);

        // Outer probability shell
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0x64b5f6,
            transparent: true,
            opacity: 0.06,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), shellMat);
        electronGroup.add(shell);

        // ─── Gate electrodes (more visible) ────
        gateVisualsGroup = new THREE.Group();
        gateVisualsGroup.position.y = 3;
        scene.add(gateVisualsGroup);

        const gGeo = new THREE.BoxGeometry(0.7, 0.08, 2.0);
        const gColors = [0x78909c, 0xd32f2f, 0x78909c];
        for (let g = 0; g < 3; g++) {
            const mat = new THREE.MeshPhysicalMaterial({
                color: gColors[g],
                roughness: 0.3,
                metalness: 0.7,
                transparent: true,
                opacity: 0.5
            });
            const mesh = new THREE.Mesh(gGeo, mat);
            mesh.position.set([-1.3, 0, 1.3][g], 0, 0);
            gateVisualsGroup.add(mesh);
        }
        gateVisualsGroup.visible = false;

        // ─── 3D potential energy curve ────
        const curvePoints = 300;
        const curveGeo = new THREE.BufferGeometry();
        curveGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(curvePoints * 3), 3));
        potentialCurve = new THREE.Line(curveGeo, new THREE.LineBasicMaterial({
            color: 0xd32f2f,
            transparent: true,
            opacity: 0.7,
            linewidth: 3
        }));
        potentialCurve.position.y = 2;
        potentialCurve.visible = false;
        scene.add(potentialCurve);

        potCanvas = document.getElementById('potential-canvas');
    }

    function ensureCanvas() {
        if (canvasReady) return true;
        if (!potCanvas) return false;
        const w = potCanvas.offsetWidth;
        const h = potCanvas.offsetHeight;
        if (w > 0 && h > 0) {
            potCtx = potCanvas.getContext('2d');
            potCanvas.width = w * 2;
            potCanvas.height = h * 2;
            potCtx.scale(2, 2);
            canvasReady = true;
            return true;
        }
        return false;
    }

    function setGateVoltages(vl, vc, vr) { vLeft = vl; vCenter = vc; vRight = vr; }
    function getGateVoltages() { return { vLeft, vCenter, vRight }; }
    function getIsTrapped() { return isTrapped; }

    function potential(x) {
        const vc = vCenter / 100;
        const vl = vLeft / 100;
        const vr = vRight / 100;
        return -vc * 60 * Math.exp(-x * x / (WELL_SIGMA * WELL_SIGMA))
            + vl * 8 * (x + WELL_SEPARATION) * (x + WELL_SEPARATION)
            + vr * 8 * (x - WELL_SEPARATION) * (x - WELL_SEPARATION);
    }

    function getWellDepth() {
        return Math.min(potential(-WELL_SEPARATION), potential(WELL_SEPARATION)) - potential(0);
    }

    function getWfWidth() {
        const vc = vCenter / 100;
        if (vc < 0.1) return 2.0;
        return Math.max(0.12, WELL_SIGMA / Math.sqrt(vc * 3));
    }

    function update(dt, elapsed, decoState) {
        const vc = vCenter / 100;
        const wellDepth = getWellDepth();
        const wasTrapped = isTrapped;
        isTrapped = wellDepth > trapThreshold && vc > 0.15;

        // ─── Gate opacities respond to voltage (pulsing) ────
        if (gateVisualsGroup.visible) {
            const g = gateVisualsGroup.children;
            if (g[0]) {
                g[0].material.opacity = 0.2 + (vLeft / 100) * 0.7;
                g[0].material.emissive = new THREE.Color(0x448aff);
                g[0].material.emissiveIntensity = (vLeft / 100) * 0.3;
            }
            if (g[1]) {
                g[1].material.opacity = 0.2 + vc * 0.7;
                g[1].material.emissive = new THREE.Color(0xff5252);
                g[1].material.emissiveIntensity = vc * 0.5;
                // Center gate physically moves down with voltage (pushing potential)
                g[1].position.y = -vc * 0.5;
            }
            if (g[2]) {
                g[2].material.opacity = 0.2 + (vRight / 100) * 0.7;
                g[2].material.emissive = new THREE.Color(0x448aff);
                g[2].material.emissiveIntensity = (vRight / 100) * 0.3;
            }
        }

        // ─── Electron wavefunction ────
        electronAlpha = isTrapped
            ? Math.min(1, electronAlpha + dt * 3)
            : Math.max(0, electronAlpha - dt * 2);
        electronGroup.visible = electronAlpha > 0.01;

        if (electronGroup.visible) {
            wavefunctionPhase += dt * 2;
            const wfWidth = getWfWidth();
            const spinState = SpinPhysics.getState();
            const p1 = spinState.probUp;
            const noiseLevel = decoState ? decoState.noiseLevel : 0;
            const thermalBroad = 1 + noiseLevel * 0.8;

            // ─── Particle cloud: SMOOTHLY animated, physics-responsive ────
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const pp = particlePhases[i];
                const t = elapsed * pp.speed;

                // Gaussian-distributed positions with smooth motion
                const u1 = Math.abs(Math.sin(t + pp.px)) * 0.999 + 0.001;
                const r = wfWidth * thermalBroad * Math.sqrt(-2 * Math.log(u1)) * 0.6;
                const theta = t * 0.3 + pp.py + i * 0.01;
                const phi = t * 0.15 + pp.pz;

                // Orbital motion — particles orbit the center
                wfPositions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
                wfPositions[i * 3 + 1] = r * Math.cos(theta) * 0.4 + Math.sin(t * 0.7 + i) * wfWidth * 0.08;
                wfPositions[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);

                // Add potential well offset (electron pulled toward gate center)
                const vBias = (vRight - vLeft) / 200; // asymmetry shifts electron
                wfPositions[i * 3] += vBias * 0.5;

                // ─── Color: |0⟩ blue → |1⟩ red ────
                wfColors[i * 3] = 0.1 + p1 * 0.85;
                wfColors[i * 3 + 1] = 0.5 - p1 * 0.3;
                wfColors[i * 3 + 2] = 0.95 - p1 * 0.75;

                // Temperature noise jitter
                if (noiseLevel > 0.1) {
                    wfPositions[i * 3] += (Math.random() - 0.5) * noiseLevel * 0.3;
                    wfPositions[i * 3 + 1] += (Math.random() - 0.5) * noiseLevel * 0.3;
                    wfPositions[i * 3 + 2] += (Math.random() - 0.5) * noiseLevel * 0.3;
                }
            }
            wfParticles.geometry.attributes.position.needsUpdate = true;
            wfParticles.geometry.attributes.color.needsUpdate = true;
            wfParticles.material.opacity = electronAlpha * 0.65;

            // Glow
            const glowColor = new THREE.Color();
            glowColor.setRGB(0.1 + p1 * 0.85, 0.5 - p1 * 0.2, 0.95 - p1 * 0.75);
            wfGlow.material.color.copy(glowColor);
            wfGlow.material.opacity = electronAlpha * (0.15 + Math.sin(elapsed * 2.5) * 0.04);
            wfGlow.scale.setScalar(wfWidth * thermalBroad * 1.8 * (1 + Math.sin(elapsed * 2) * 0.04));

            // Shift glow with gate bias
            const vBias = (vRight - vLeft) / 200;
            wfGlow.position.x = vBias * 0.5;

            // Decoherence flicker
            if (decoState && decoState.flicker > 0.1) {
                wfGlow.material.opacity *= (1 - decoState.flicker * Math.sin(elapsed * 15) * 0.4);
            }
        }

        drawPotentialGraph();
        updatePotentialCurve();

        // ─── Status change ────
        if (isTrapped !== wasTrapped) {
            const sc = document.getElementById('electron-status');
            const tl = document.getElementById('trap-label');
            if (sc && tl) {
                if (isTrapped) {
                    sc.classList.add('trapped');
                    tl.textContent = 'Electron Trapped ✓';
                    const b3 = document.getElementById('btn-next-3');
                    if (b3) b3.classList.remove('disabled');
                    Lattice.showQuantumDot(true);
                    if (typeof AudioFeedback !== 'undefined') AudioFeedback.playTrapped();
                } else {
                    sc.classList.remove('trapped');
                    tl.textContent = 'Electron Unbound';
                    Lattice.showQuantumDot(false);
                }
            }
        }
    }

    // ─── Potential Graph — thick, responsive ────
    function drawPotentialGraph() {
        if (!ensureCanvas()) return;
        const w = potCanvas.offsetWidth;
        const h = potCanvas.offsetHeight;
        if (w <= 0 || h <= 0) return;

        potCtx.clearRect(0, 0, w, h);

        // Background
        potCtx.fillStyle = '#f8f9fa';
        potCtx.fillRect(0, 0, w, h);

        // Fine grid
        potCtx.strokeStyle = '#e8eaed';
        potCtx.lineWidth = 0.5;
        for (let gy = 0; gy < h; gy += 20) {
            potCtx.beginPath(); potCtx.moveTo(0, gy); potCtx.lineTo(w, gy); potCtx.stroke();
        }
        for (let gx = 0; gx < w; gx += 20) {
            potCtx.beginPath(); potCtx.moveTo(gx, 0); potCtx.lineTo(gx, h); potCtx.stroke();
        }

        // Zero line
        const zeroY = h * 0.35;
        potCtx.strokeStyle = '#bdc1c6';
        potCtx.lineWidth = 1;
        potCtx.setLineDash([6, 4]);
        potCtx.beginPath(); potCtx.moveTo(0, zeroY); potCtx.lineTo(w, zeroY); potCtx.stroke();
        potCtx.setLineDash([]);

        // ─── Potential curve ────
        const xRange = 3;
        potCtx.beginPath();
        potCtx.strokeStyle = '#1a73e8';
        potCtx.lineWidth = 3.5;
        potCtx.lineJoin = 'round';
        potCtx.lineCap = 'round';

        for (let px = 0; px < w; px++) {
            const x = ((px / w) - 0.5) * 2 * xRange;
            const v = potential(x);
            const py = zeroY - v * 1.8;
            px === 0 ? potCtx.moveTo(px, py) : potCtx.lineTo(px, py);
        }
        potCtx.stroke();

        // Fill under curve
        potCtx.lineTo(w, h); potCtx.lineTo(0, h); potCtx.closePath();
        potCtx.fillStyle = 'rgba(26,115,232,0.08)';
        potCtx.fill();

        // ─── Wavefunction overlay ────
        if (isTrapped) {
            const wfSigma = getWfWidth();
            const vBias = (vRight - vLeft) / 200;
            potCtx.beginPath();
            potCtx.strokeStyle = 'rgba(234,67,53,0.7)';
            potCtx.lineWidth = 2.5;
            potCtx.setLineDash([3, 3]);
            for (let px = 0; px < w; px++) {
                const x = ((px / w) - 0.5) * 2 * xRange;
                const psi2 = Math.exp(-(x - vBias) * (x - vBias) / (wfSigma * wfSigma));
                const vAtX = potential(x);
                const base = zeroY - vAtX * 1.8;
                const wfHeight = psi2 * 30;
                const py = base - wfHeight;
                px === 0 ? potCtx.moveTo(px, py) : potCtx.lineTo(px, py);
            }
            potCtx.stroke();
            potCtx.setLineDash([]);

            // Electron dot
            const ex = w / 2 + (vBias / xRange) * w;
            const ey = zeroY - potential(vBias) * 1.8;
            potCtx.beginPath();
            potCtx.arc(ex, ey - 3, 6, 0, Math.PI * 2);
            potCtx.fillStyle = '#ea4335';
            potCtx.fill();
            potCtx.beginPath();
            potCtx.arc(ex, ey - 3, 10, 0, Math.PI * 2);
            potCtx.strokeStyle = 'rgba(234,67,53,0.3)';
            potCtx.lineWidth = 2;
            potCtx.stroke();
        }

        // Axis labels
        potCtx.fillStyle = '#5f6368';
        potCtx.font = '11px Inter, sans-serif';
        potCtx.fillText('Position x →', w - 80, h - 8);
        potCtx.fillText('U(x)', 4, 14);
        potCtx.fillText('E = 0', w - 36, zeroY - 4);

        // Gate voltage labels
        potCtx.font = '10px Inter, sans-serif';
        potCtx.fillStyle = '#1a73e8';
        potCtx.fillText('Vc=' + vCenter.toFixed(0), w / 2 - 15, 14);
        potCtx.fillStyle = '#78909c';
        potCtx.fillText('Vl=' + vLeft.toFixed(0), 4, h - 8);
        potCtx.fillText('Vr=' + vRight.toFixed(0), w - 45, h - 8);

        // Well depth indicator
        if (vCenter > 5) {
            const depth = getWellDepth();
            potCtx.fillStyle = depth > trapThreshold ? '#34a853' : '#ea4335';
            potCtx.fillText('Depth: ' + depth.toFixed(1) + (depth > trapThreshold ? ' ✓' : ' (need >' + trapThreshold + ')'), w / 2 - 40, h - 8);
        }
    }

    function updatePotentialCurve() {
        if (!potentialCurve || !potentialCurve.visible) return;
        const pts = potentialCurve.geometry.attributes.position.array;
        const count = pts.length / 3;
        const xRange = 3;
        for (let i = 0; i < count; i++) {
            const x = ((i / (count - 1)) - 0.5) * 2 * xRange;
            pts[i * 3] = x * 1.5;
            pts[i * 3 + 1] = potential(x) * 0.04;
            pts[i * 3 + 2] = 0;
        }
        potentialCurve.geometry.attributes.position.needsUpdate = true;
    }

    function showGates(vis) {
        if (gateVisualsGroup) gateVisualsGroup.visible = vis;
        if (potentialCurve) potentialCurve.visible = vis;
    }

    return { init, update, setGateVoltages, getGateVoltages, getIsTrapped, showGates };
})();
