/**
 * quantumDot.js — Wavefunction Visualization & Quantum Dot (v3)
 *
 * The electron wavefunction is visualized as a |ψ|² probability density cloud,
 * not just a blob — it actually responds to the confining potential shape.
 *
 * Gate voltages shape the potential U(x) = -Vc·exp(-x²/σ²) + Vl(x+d)² + Vr(x-d)²
 * The wavefunction ground state is approximated as a Gaussian centered in the well.
 *
 * Potential graph: thick visible lines, proper axis labels.
 */

const QuantumDot = (() => {
    // Gate voltages (mV, 0-100 slider range)
    let vLeft = 0, vCenter = 0, vRight = 0;
    const WELL_SIGMA = 0.5;       // width of Gaussian well (a.u.)
    const WELL_SEPARATION = 1.2;  // barrier separation

    let isTrapped = false;
    const trapThreshold = 12;
    let electronAlpha = 0;  // fade in/out
    let wavefunctionPhase = 0;

    // 3D objects
    let electronGroup, wfParticles, wfGlow, gateVisualsGroup;
    let wfPositions, wfColors;
    const PARTICLE_COUNT = 400;  // more particles for denser cloud

    // 3D potential curve
    let potentialCurve;

    // 2D canvas
    let potCanvas, potCtx;
    let canvasReady = false;

    function init(scene) {
        electronGroup = new THREE.Group();
        electronGroup.visible = false;
        scene.add(electronGroup);

        // ─── Wavefunction particle cloud ────
        const pGeo = new THREE.BufferGeometry();
        wfPositions = new Float32Array(PARTICLE_COUNT * 3);
        wfColors = new Float32Array(PARTICLE_COUNT * 3);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            wfPositions[i * 3] = (Math.random() - 0.5) * 1.5;
            wfPositions[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
            wfPositions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
            // Blue gradient
            wfColors[i * 3] = 0.1 + Math.random() * 0.1;
            wfColors[i * 3 + 1] = 0.4 + Math.random() * 0.15;
            wfColors[i * 3 + 2] = 0.85 + Math.random() * 0.1;
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(wfPositions, 3));
        pGeo.setAttribute('color', new THREE.BufferAttribute(wfColors, 3));

        wfParticles = new THREE.Points(pGeo, new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        }));
        electronGroup.add(wfParticles);

        // Central wavefunction glow sphere
        wfGlow = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 24, 16),
            new THREE.MeshBasicMaterial({
                color: 0x1a73e8,
                transparent: true,
                opacity: 0.15
            })
        );
        electronGroup.add(wfGlow);

        // Outer probability shell
        const shellGeo = new THREE.SphereGeometry(0.7, 16, 12);
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0x64b5f6,
            transparent: true,
            opacity: 0.04,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        electronGroup.add(shell);

        // ─── Gate electrodes ────
        gateVisualsGroup = new THREE.Group();
        gateVisualsGroup.position.y = 3;
        scene.add(gateVisualsGroup);

        const gGeo = new THREE.BoxGeometry(0.6, 0.06, 1.8);
        const gColors = [0x78909c, 0xd32f2f, 0x78909c]; // gray, red, gray
        const gNames = ['Left Gate', 'Center Gate', 'Right Gate'];
        for (let g = 0; g < 3; g++) {
            const mat = new THREE.MeshPhysicalMaterial({
                color: gColors[g],
                roughness: 0.4,
                metalness: 0.6,
                transparent: true,
                opacity: 0.4
            });
            const mesh = new THREE.Mesh(gGeo, mat);
            mesh.position.set([-1.2, 0, 1.2][g], 0, 0);
            gateVisualsGroup.add(mesh);
        }
        gateVisualsGroup.visible = false;

        // ─── 3D potential energy curve (thick line) ────
        const curvePoints = 300;
        const curveGeo = new THREE.BufferGeometry();
        curveGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(curvePoints * 3), 3));
        potentialCurve = new THREE.Line(curveGeo, new THREE.LineBasicMaterial({
            color: 0xd32f2f,
            transparent: true,
            opacity: 0.7,
            linewidth: 3  // Note: linewidth > 1 only works on some WebGL implementations
        }));
        potentialCurve.position.y = 2;
        potentialCurve.visible = false;
        scene.add(potentialCurve);

        // Canvas reference (lazy init)
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

    // ─── Potential energy function ────
    // U(x) = -Vc · exp(-x²/σ²) + Vl·(x+d)² + Vr·(x−d)²
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

    // Ground state wavefunction width (harmonic approximation)
    function getWfWidth() {
        const vc = vCenter / 100;
        if (vc < 0.1) return 2.0;
        // ψ ∝ exp(-x²/(2σ_wf²)), σ_wf ∝ 1/√(vc)
        return Math.max(0.15, WELL_SIGMA / Math.sqrt(vc * 3));
    }

    function update(dt, elapsed, decoState) {
        const vc = vCenter / 100;
        const wellDepth = getWellDepth();
        const wasTrapped = isTrapped;
        isTrapped = wellDepth > trapThreshold && vc > 0.2;

        // ─── Gate opacities respond to voltage ────
        if (gateVisualsGroup.visible) {
            const g = gateVisualsGroup.children;
            if (g[0]) g[0].material.opacity = 0.2 + (vLeft / 100) * 0.6;
            if (g[1]) g[1].material.opacity = 0.2 + vc * 0.6;
            if (g[2]) g[2].material.opacity = 0.2 + (vRight / 100) * 0.6;
        }

        // ─── Electron wavefunction fade ────
        electronAlpha = isTrapped
            ? Math.min(1, electronAlpha + dt * 3)
            : Math.max(0, electronAlpha - dt * 2);
        electronGroup.visible = electronAlpha > 0.01;

        if (electronGroup.visible) {
            wavefunctionPhase += dt * 1.5;
            const wfWidth = getWfWidth();
            const spinState = SpinPhysics.getState();
            const p1 = spinState.probUp;

            // ─── |ψ|² cloud: sample from Gaussian distribution ────
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                // Gaussian random in 3D (Box-Muller approx)
                const u1 = Math.random();
                const u2 = Math.random();
                const r = wfWidth * Math.sqrt(-2 * Math.log(u1 + 0.001));
                const theta = 2 * Math.PI * u2;

                // Orbital-like distribution with slow phase rotation
                const phase = wavefunctionPhase * 0.3 + i * 0.015;
                wfPositions[i * 3] = r * Math.cos(theta + phase) * 0.5;
                wfPositions[i * 3 + 1] = r * Math.sin(theta) * 0.3 + Math.sin(phase * 0.7 + i) * wfWidth * 0.15;
                wfPositions[i * 3 + 2] = r * Math.sin(theta + phase * 0.5) * 0.5;

                // Color: Blue (|0⟩) → Red (|1⟩) based on spin state
                wfColors[i * 3] = 0.1 + p1 * 0.8;
                wfColors[i * 3 + 1] = 0.45 - p1 * 0.25;
                wfColors[i * 3 + 2] = 0.9 - p1 * 0.7;
            }
            wfParticles.geometry.attributes.position.needsUpdate = true;
            wfParticles.geometry.attributes.color.needsUpdate = true;
            wfParticles.material.opacity = electronAlpha * 0.5;

            // Glow color and breathing
            const glowColor = new THREE.Color();
            glowColor.setRGB(0.1 + p1 * 0.8, 0.45 - p1 * 0.15, 0.9 - p1 * 0.7);
            wfGlow.material.color.copy(glowColor);
            wfGlow.material.opacity = electronAlpha * (0.12 + Math.sin(elapsed * 2.5) * 0.03);
            wfGlow.scale.setScalar(wfWidth * 1.5 * (1 + Math.sin(elapsed * 2) * 0.03));

            // Decoherence flicker
            if (decoState && decoState.flicker > 0) {
                wfGlow.material.opacity *= (1 - decoState.flicker * Math.random() * 0.4);
                // Thermal broadening of wavefunction
                const thermalBroad = 1 + decoState.noiseLevel * 0.5;
                wfGlow.scale.multiplyScalar(thermalBroad);
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
                    tl.textContent = 'Electron Trapped';
                    const b3 = document.getElementById('btn-next-3');
                    if (b3) b3.classList.remove('disabled');
                    // Show QD marker in lattice
                    Lattice.showQuantumDot(true);
                } else {
                    sc.classList.remove('trapped');
                    tl.textContent = 'Electron Unbound';
                    Lattice.showQuantumDot(false);
                }
            }
        }
    }

    // ─── 2D Potential Energy Graph (thick, visible lines) ────
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
            potCtx.beginPath();
            potCtx.moveTo(0, gy);
            potCtx.lineTo(w, gy);
            potCtx.stroke();
        }
        for (let gx = 0; gx < w; gx += 20) {
            potCtx.beginPath();
            potCtx.moveTo(gx, 0);
            potCtx.lineTo(gx, h);
            potCtx.stroke();
        }

        // Zero energy reference line
        const zeroY = h * 0.35;
        potCtx.strokeStyle = '#bdc1c6';
        potCtx.lineWidth = 1;
        potCtx.setLineDash([6, 4]);
        potCtx.beginPath();
        potCtx.moveTo(0, zeroY);
        potCtx.lineTo(w, zeroY);
        potCtx.stroke();
        potCtx.setLineDash([]);

        // ─── Potential curve — THICK and visible ────
        const xRange = 3;
        potCtx.beginPath();
        potCtx.strokeStyle = '#1a73e8';
        potCtx.lineWidth = 3.5; // ← THICK line
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
        potCtx.lineTo(w, h);
        potCtx.lineTo(0, h);
        potCtx.closePath();
        potCtx.fillStyle = 'rgba(26,115,232,0.08)';
        potCtx.fill();

        // ─── Wavefunction overlay in the well ────
        if (isTrapped) {
            const wfSigma = getWfWidth();
            potCtx.beginPath();
            potCtx.strokeStyle = 'rgba(234,67,53,0.6)';
            potCtx.lineWidth = 2;
            potCtx.setLineDash([3, 3]);
            for (let px = 0; px < w; px++) {
                const x = ((px / w) - 0.5) * 2 * xRange;
                const psi2 = Math.exp(-x * x / (wfSigma * wfSigma));
                const vAtX = potential(x);
                const base = zeroY - vAtX * 1.8;
                const wfHeight = psi2 * 25;
                const py = base - wfHeight;
                px === 0 ? potCtx.moveTo(px, py) : potCtx.lineTo(px, py);
            }
            potCtx.stroke();
            potCtx.setLineDash([]);

            // Electron position marker
            const ex = w / 2;
            const ey = zeroY - potential(0) * 1.8;
            potCtx.beginPath();
            potCtx.arc(ex, ey - 3, 5, 0, Math.PI * 2);
            potCtx.fillStyle = '#ea4335';
            potCtx.fill();
            // Glow ring
            potCtx.beginPath();
            potCtx.arc(ex, ey - 3, 9, 0, Math.PI * 2);
            potCtx.strokeStyle = 'rgba(234,67,53,0.25)';
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
