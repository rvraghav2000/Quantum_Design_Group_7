/**
 * lattice.js — Interactive Silicon-28 Multi-Qubit Lattice
 *
 * FULLY INTERACTIVE:
 *   - Tiny dot-like atoms that visibly vibrate with temperature
 *   - Thermal vibration amplitude scales with kBT (physics-accurate)
 *   - Qubit markers pulse, precess, and change color with spin state
 *   - Exchange coupling lines animate between neighboring qubits
 *   - B-field affects qubit precession speed
 *   - Gate voltages affect local potential landscape visually
 */

const Lattice = (() => {
    const SCALE = 1.6;
    const GRID = 4;
    const ATOM_RADIUS = 0.022; // small but visible dots
    const FALLOFF_RADIUS = 5.5;
    const QUBIT_RADIUS = 0.24;
    const INTERACTION_DECAY = 2.5;

    let group;
    const atoms = []; // individual meshes for animation
    const bonds = [];
    let substratePlane;

    // Multi-qubit system
    const qubits = [];
    let qubitIdCounter = 0;
    let interactionGroup;
    const interactionLines = [];
    const QUBIT_SITES = [];

    // Colors — high contrast
    const ATOM_COLOR = 0xb0bec5; // brighter silver
    const BOND_COLOR = 0xd6dee3;
    const QUBIT_COLOR_0 = new THREE.Color(0x00e676); // |0⟩ vivid emerald green
    const QUBIT_COLOR_1 = new THREE.Color(0xff1744); // |1⟩ hot red/magenta
    const QUBIT_GLOW_COLOR = new THREE.Color(0x69f0ae); // green glow
    const INTERACTION_COLOR = new THREE.Color(0x40c4ff);

    let scene_ref;
    let currentDecoState = null;

    // Shared geometries/materials for atoms
    let atomGeo, bondGeo;

    function init(scene) {
        scene_ref = scene;
        group = new THREE.Group();
        interactionGroup = new THREE.Group();

        const basis = [
            [0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5],
            [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]
        ];

        const positions = [];
        for (let ix = -GRID; ix <= GRID; ix++) {
            for (let iy = -GRID; iy <= GRID; iy++) {
                for (let iz = -GRID; iz <= GRID; iz++) {
                    for (const b of basis) {
                        const x = (ix + b[0]) * SCALE;
                        const y = (iy + b[1]) * SCALE;
                        const z = (iz + b[2]) * SCALE;
                        const dist = Math.sqrt(x * x + y * y + z * z);
                        positions.push({ x, y, z, dist });
                    }
                }
            }
        }

        // Generate qubit site candidates
        for (let ix = -3; ix <= 3; ix++) {
            for (let iz = -3; iz <= 3; iz++) {
                const x = ix * SCALE;
                const z = iz * SCALE;
                const dist = Math.sqrt(x * x + z * z);
                if (dist < FALLOFF_RADIUS * 1.2) {
                    QUBIT_SITES.push(new THREE.Vector3(x, 0, z));
                }
            }
        }

        // ─── Individual atom meshes (for per-atom animation) ────
        atomGeo = new THREE.SphereGeometry(ATOM_RADIUS, 6, 4);

        for (const p of positions) {
            const alpha = Math.exp(-(p.dist * p.dist) / (FALLOFF_RADIUS * FALLOFF_RADIUS));
            if (alpha < 0.02) continue; // cull invisible atoms

            const mat = new THREE.MeshBasicMaterial({
                color: ATOM_COLOR,
                transparent: true,
                opacity: alpha * 0.95
            });
            const mesh = new THREE.Mesh(atomGeo, mat);
            mesh.position.set(p.x, p.y, p.z);
            group.add(mesh);

            atoms.push({
                mesh,
                bx: p.x, by: p.y, bz: p.z,
                dist: p.dist,
                alpha,
                // Per-atom random phase for vibration
                phaseX: Math.random() * Math.PI * 2,
                phaseY: Math.random() * Math.PI * 2,
                phaseZ: Math.random() * Math.PI * 2,
                freqX: 2 + Math.random() * 4,
                freqY: 2 + Math.random() * 4,
                freqZ: 2 + Math.random() * 4
            });
        }

        // ─── Bonds ────
        const nnDist = SCALE * 0.435;
        bondGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 3);
        const up = new THREE.Vector3(0, 1, 0);

        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const dx = positions[i].x - positions[j].x;
                const dy = positions[i].y - positions[j].y;
                const dz = positions[i].z - positions[j].z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < nnDist && d > 0.01) {
                    const midDist = (positions[i].dist + positions[j].dist) / 2;
                    const alpha = Math.exp(-(midDist * midDist) / (FALLOFF_RADIUS * FALLOFF_RADIUS));
                    if (alpha < 0.03) continue;

                    const bMat = new THREE.MeshBasicMaterial({
                        color: BOND_COLOR,
                        transparent: true,
                        opacity: alpha * 0.35
                    });
                    const bond = new THREE.Mesh(bondGeo, bMat);

                    const mid = new THREE.Vector3(
                        (positions[i].x + positions[j].x) / 2,
                        (positions[i].y + positions[j].y) / 2,
                        (positions[i].z + positions[j].z) / 2
                    );
                    const dir = new THREE.Vector3(
                        positions[j].x - positions[i].x,
                        positions[j].y - positions[i].y,
                        positions[j].z - positions[i].z
                    );
                    const len = dir.length();
                    dir.normalize();

                    bond.position.copy(mid);
                    bond.scale.set(1, len, 1);
                    bond.quaternion.setFromUnitVectors(up, dir);
                    group.add(bond);
                    bonds.push({ mesh: bond, iIdx: i, jIdx: j, alpha });
                }
            }
        }

        // ─── Translucent Substrate Plane ────
        const planeGeo = new THREE.PlaneGeometry(28, 28);
        const planeMat = new THREE.MeshPhysicalMaterial({
            color: 0xe8eaf6,
            transparent: true,
            opacity: 0.08,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        substratePlane = new THREE.Mesh(planeGeo, planeMat);
        substratePlane.rotation.x = -Math.PI / 2;
        substratePlane.position.y = -0.3;
        group.add(substratePlane);

        scene.add(group);
        scene.add(interactionGroup);

        // Add initial qubits
        const initialPositions = [
            [0, 0, 0], [1.6, 0, 0], [-1.6, 0, 0], [0, 0, 1.6], [0, 0, -1.6],
            [1.6, 0, 1.6], [-1.6, 0, 1.6], [1.6, 0, -1.6], [-1.6, 0, -1.6],
            [3.2, 0, 0], [0, 0, 3.2], [-3.2, 0, 0]
        ];
        for (const p of initialPositions) {
            addQubit(new THREE.Vector3(p[0], p[1], p[2]));
        }

        console.log(`[Lattice] ${atoms.length} atoms, ${bonds.length} bonds, ${qubits.length} qubits`);
    }

    // ─── Qubit Management ────
    function addQubit(position) {
        if (!scene_ref) return null;
        const id = qubitIdCounter++;

        // Qubit core — bright sphere
        const qGeo = new THREE.SphereGeometry(QUBIT_RADIUS, 24, 18);
        const qMat = new THREE.MeshPhysicalMaterial({
            color: QUBIT_COLOR_0,
            roughness: 0.15,
            metalness: 0.1,
            transparent: true,
            opacity: 0.9,
            emissive: QUBIT_COLOR_0,
            emissiveIntensity: 0.5
        });
        const marker = new THREE.Mesh(qGeo, qMat);
        marker.position.copy(position);
        group.add(marker);

        // Halo glow
        const hGeo = new THREE.SphereGeometry(QUBIT_RADIUS * 2.5, 16, 12);
        const hMat = new THREE.MeshBasicMaterial({
            color: QUBIT_GLOW_COLOR,
            transparent: true,
            opacity: 0.15,
            depthWrite: false
        });
        const halo = new THREE.Mesh(hGeo, hMat);
        halo.position.copy(position);
        group.add(halo);

        // Outer diffuse shell
        const gGeo = new THREE.SphereGeometry(QUBIT_RADIUS * 4, 12, 8);
        const gMat = new THREE.MeshBasicMaterial({
            color: QUBIT_GLOW_COLOR,
            transparent: true,
            opacity: 0.05,
            depthWrite: false,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(gGeo, gMat);
        glow.position.copy(position);
        group.add(glow);

        // Spin arrow (small arrow showing spin direction)
        const arrowGeo = new THREE.ConeGeometry(0.06, 0.2, 8);
        const arrowMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.copy(position);
        arrow.position.y += QUBIT_RADIUS * 1.5;
        group.add(arrow);

        const qubit = {
            id, position: position.clone(),
            marker, halo, glow, arrow,
            phase: Math.random() * Math.PI * 2,
            spinAngle: 0 // precession angle
        };
        qubits.push(qubit);
        rebuildInteractions();
        return id;
    }

    function removeQubit(id) {
        const idx = qubits.findIndex(q => q.id === id);
        if (idx === -1) return false;
        const q = qubits[idx];
        group.remove(q.marker); group.remove(q.halo);
        group.remove(q.glow); group.remove(q.arrow);
        q.marker.geometry.dispose(); q.marker.material.dispose();
        q.halo.geometry.dispose(); q.halo.material.dispose();
        q.glow.geometry.dispose(); q.glow.material.dispose();
        q.arrow.geometry.dispose(); q.arrow.material.dispose();
        qubits.splice(idx, 1);
        rebuildInteractions();
        return true;
    }

    function removeLastQubit() {
        if (qubits.length === 0) return false;
        return removeQubit(qubits[qubits.length - 1].id);
    }

    function addQubitAtRandomSite() {
        const occupied = new Set(qubits.map(q => `${q.position.x.toFixed(1)},${q.position.z.toFixed(1)}`));
        const available = QUBIT_SITES.filter(s => !occupied.has(`${s.x.toFixed(1)},${s.z.toFixed(1)}`));
        if (available.length === 0) return null;
        const site = available[Math.floor(Math.random() * available.length)];
        return addQubit(site);
    }

    // ─── Interaction Lines ────
    function rebuildInteractions() {
        for (const line of interactionLines) {
            interactionGroup.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        }
        interactionLines.length = 0;

        for (let i = 0; i < qubits.length; i++) {
            for (let j = i + 1; j < qubits.length; j++) {
                const d = qubits[i].position.distanceTo(qubits[j].position);
                if (d < SCALE * 4) {
                    const strength = Math.exp(-d / INTERACTION_DECAY);
                    if (strength < 0.05) continue;

                    const points = [];
                    const p1 = qubits[i].position;
                    const p2 = qubits[j].position;
                    const segments = 20;
                    for (let s = 0; s <= segments; s++) {
                        const t = s / segments;
                        points.push(new THREE.Vector3(
                            p1.x + (p2.x - p1.x) * t,
                            p1.y + (p2.y - p1.y) * t + Math.sin(t * Math.PI) * 0.12 * strength,
                            p1.z + (p2.z - p1.z) * t
                        ));
                    }

                    const curve = new THREE.CatmullRomCurve3(points);
                    const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.015 + strength * 0.02, 5, false);
                    const tubeMat = new THREE.MeshBasicMaterial({
                        color: INTERACTION_COLOR,
                        transparent: true,
                        opacity: strength * 0.4,
                        depthWrite: false
                    });
                    const tube = new THREE.Mesh(tubeGeo, tubeMat);
                    tube._strength = strength;
                    tube._qi = i;
                    tube._qj = j;
                    interactionGroup.add(tube);
                    interactionLines.push(tube);
                }
            }
        }
    }

    // ─── MAIN UPDATE — Everything animates here ────
    function update(dt, elapsed, decoState) {
        if (!group) return;
        currentDecoState = decoState;

        // ────────────────────────────────────────────────
        // THERMAL VIBRATION — atoms physically move with temperature
        // ────────────────────────────────────────────────
        const jitter = decoState ? decoState.jitter : 0;
        // Amplify vibration so it's clearly visible
        // At 20mK: jitter ≈ 0, at 4000mK: jitter ≈ 0.15
        // We scale up for visibility: 0 → 0, 0.15 → 0.5
        const vibrationAmp = jitter * 3.5;
        const noiseLevel = decoState ? decoState.noiseLevel : 0;

        for (const a of atoms) {
            if (vibrationAmp > 0.001) {
                // Smooth sinusoidal vibration per atom (not random — looks better)
                const jx = Math.sin(elapsed * a.freqX + a.phaseX) * vibrationAmp * (0.5 + a.dist * 0.02);
                const jy = Math.sin(elapsed * a.freqY + a.phaseY) * vibrationAmp * (0.5 + a.dist * 0.02);
                const jz = Math.sin(elapsed * a.freqZ + a.phaseZ) * vibrationAmp * (0.5 + a.dist * 0.02);
                a.mesh.position.set(a.bx + jx, a.by + jy, a.bz + jz);
            } else {
                // Gentle breathing at low temp
                const breathe = 1 + Math.sin(elapsed * 0.3) * 0.001;
                a.mesh.position.set(a.bx * breathe, a.by * breathe, a.bz * breathe);
            }

            // Atoms get warmer-colored at high temperature
            if (noiseLevel > 0.01) {
                const warmth = noiseLevel * 0.6;
                const r = 0.565 + warmth * 0.4; // blue-grey → warm
                const g = 0.643 - warmth * 0.15;
                const b = 0.682 - warmth * 0.3;
                a.mesh.material.color.setRGB(r, g, b);
            }
        }

        // ────────────────────────────────────────────────
        // QUBIT MARKERS — respond to spin state & temperature
        // ────────────────────────────────────────────────
        const spinState = typeof SpinPhysics !== 'undefined' ? SpinPhysics.getState() : null;
        const p1 = spinState ? spinState.probUp : 0;
        const theta = spinState ? spinState.theta : 0;
        const phi = spinState ? spinState.phi : 0;

        for (const q of qubits) {
            // ── Spin-state color blend (|0⟩ blue → |1⟩ red) ──
            const c = new THREE.Color();
            c.lerpColors(QUBIT_COLOR_0, QUBIT_COLOR_1, p1);
            q.marker.material.color.copy(c);
            q.marker.material.emissive.copy(c);

            // ── Precession animation ──
            // Qubits precess around z-axis at Larmor frequency (visible rotation)
            const larmorGHz = typeof SpinPhysics !== 'undefined' ? SpinPhysics.getLarmorGHz() : 28;
            // Map to visible speed: scale down enormously but keep proportional
            const precessionSpeed = larmorGHz * 0.08;
            q.spinAngle += dt * precessionSpeed;

            // Qubit oscillates position slightly (like a trapped particle)
            const wobble = 0.03 + p1 * 0.05;
            const wx = Math.sin(q.spinAngle + q.phase) * wobble;
            const wz = Math.cos(q.spinAngle + q.phase) * wobble;
            q.marker.position.set(q.position.x + wx, q.position.y, q.position.z + wz);
            q.halo.position.copy(q.marker.position);
            q.glow.position.copy(q.marker.position);

            // ── Pulse/breathing ──
            const pulse = 1 + Math.sin(elapsed * 2.5 + q.id * 0.7) * 0.08;
            q.marker.scale.setScalar(pulse);
            q.halo.scale.setScalar(pulse * 1.15);

            // ── Halo brightness responds to coherence ──
            const coherenceFactor = decoState ? Math.max(0.05, 1 - decoState.noiseLevel) : 1;
            q.halo.material.opacity = 0.12 * coherenceFactor + Math.sin(elapsed * 3 + q.id) * 0.04;
            q.glow.material.opacity = 0.04 * coherenceFactor;

            // ── Emissive intensity changes with temperature ──
            q.marker.material.emissiveIntensity = 0.3 + coherenceFactor * 0.4;

            // ── Spin arrow direction ──
            // Arrow tilts based on Bloch sphere angles
            const arrowY = q.position.y + QUBIT_RADIUS * 1.3;
            q.arrow.position.set(
                q.marker.position.x,
                arrowY + Math.cos(theta) * 0.1,
                q.marker.position.z
            );
            q.arrow.rotation.z = theta - Math.PI; // tilt with spin
            q.arrow.rotation.y = q.spinAngle; // precess

            // Arrow color follows spin state
            q.arrow.material.color.copy(c);

            // ── Decoherence flicker ──
            if (decoState && decoState.flicker > 0.1) {
                const flick = 1 - decoState.flicker * Math.sin(elapsed * 20 + q.id * 3) * 0.3;
                q.marker.material.opacity = 0.9 * flick;
            } else {
                q.marker.material.opacity = 0.9;
            }

            // ── Thermal broadening — qubit "smears" at high temp ──
            if (noiseLevel > 0.1) {
                const smear = 1 + noiseLevel * 0.4;
                q.glow.scale.setScalar(pulse * smear * 1.2);
            }
        }

        // ────────────────────────────────────────────────
        // INTERACTION LINES — animate with time
        // ────────────────────────────────────────────────
        for (const line of interactionLines) {
            const s = line._strength || 0.5;
            // Pulsing opacity
            line.material.opacity = s * (0.25 + Math.sin(elapsed * 4 + line._qi * 0.5) * 0.15);

            // Color shifts with spin state
            if (p1 > 0.01) {
                const lineColor = new THREE.Color();
                lineColor.lerpColors(INTERACTION_COLOR, new THREE.Color(0xff4081), p1 * 0.5);
                line.material.color.copy(lineColor);
            }
        }

        // ── Substrate responds to temperature ──
        if (substratePlane) {
            const warmOp = 0.06 + noiseLevel * 0.08;
            substratePlane.material.opacity = warmOp + Math.sin(elapsed * 0.5) * 0.01;
            if (noiseLevel > 0.1) {
                // Warm tint
                substratePlane.material.color.setHex(
                    noiseLevel > 0.5 ? 0xfce4ec : 0xe8eaf6
                );
            } else {
                substratePlane.material.color.setHex(0xe8eaf6);
            }
        }
    }

    function showQuantumDot(visible) {
        // Legacy compat
    }

    function getQubits() { return [...qubits]; }
    function getQubitCount() { return qubits.length; }

    return {
        init, update, showQuantumDot,
        addQubit, removeQubit, removeLastQubit, addQubitAtRandomSite,
        getQubits, getQubitCount, rebuildInteractions
    };
})();
