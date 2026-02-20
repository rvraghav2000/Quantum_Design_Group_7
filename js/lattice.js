/**
 * lattice.js — Immersive Silicon-28 Diamond Cubic Lattice
 *
 * Smooth, beautiful dots with soft glow halos.
 * Quantum dot is proportionally larger (5x atom radius).
 * Real diamond cubic structure with thermal vibration from physics.
 */

const Lattice = (() => {
    const LATTICE_CONSTANT = 5.43; // Angstroms
    const SCALE = 2.0;
    const GRID = 1; // ±1 unit cells
    const ATOM_RADIUS = 0.06; // small, smooth dots
    const QD_RADIUS = 0.35;  // quantum dot — 5x larger
    let group;
    const atoms = [];
    const bonds = [];
    let qdMarker; // center quantum dot marker

    // Soft material palette
    const ATOM_COLOR = 0x78909c;   // blue-grey 400
    const BOND_COLOR = 0xcfd8dc;   // blue-grey 100
    const QD_COLOR = 0x1a73e8;     // Google blue
    const HALO_COLOR = 0xbbdefb;   // light blue 100

    function init(scene) {
        group = new THREE.Group();

        // Diamond cubic basis (fractional coordinates)
        const basis = [
            [0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5],
            [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]
        ];

        const positions = [];
        for (let ix = -GRID; ix <= GRID; ix++) {
            for (let iy = -GRID; iy <= GRID; iy++) {
                for (let iz = -GRID; iz <= GRID; iz++) {
                    for (const b of basis) {
                        positions.push({
                            x: (ix + b[0]) * SCALE,
                            y: (iy + b[1]) * SCALE,
                            z: (iz + b[2]) * SCALE
                        });
                    }
                }
            }
        }

        // Smooth atom spheres — higher segment count for silky look
        const sGeo = new THREE.SphereGeometry(ATOM_RADIUS, 16, 12);
        const sMat = new THREE.MeshPhysicalMaterial({
            color: ATOM_COLOR,
            roughness: 0.8,
            metalness: 0.0,
            transparent: true,
            opacity: 0.85
        });

        // Subtle halo for each atom (soft glow)
        const hGeo = new THREE.SphereGeometry(ATOM_RADIUS * 2.5, 8, 6);
        const hMat = new THREE.MeshBasicMaterial({
            color: HALO_COLOR,
            transparent: true,
            opacity: 0.08,
            depthWrite: false
        });

        for (const p of positions) {
            // Main atom dot
            const m = new THREE.Mesh(sGeo, sMat);
            m.position.set(p.x, p.y, p.z);
            group.add(m);

            // Soft halo
            const h = new THREE.Mesh(hGeo, hMat);
            h.position.set(p.x, p.y, p.z);
            group.add(h);

            atoms.push({ mesh: m, halo: h, bx: p.x, by: p.y, bz: p.z });
        }

        // Bonds — thin, elegant lines connecting nearest neighbors
        const nnDist = SCALE * 0.435; // nearest neighbor in diamond cubic
        const cGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 4);
        const cMat = new THREE.MeshBasicMaterial({
            color: BOND_COLOR,
            transparent: true,
            opacity: 0.35
        });
        const up = new THREE.Vector3(0, 1, 0);

        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const dx = positions[i].x - positions[j].x;
                const dy = positions[i].y - positions[j].y;
                const dz = positions[i].z - positions[j].z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < nnDist && d > 0.01) {
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

                    const bond = new THREE.Mesh(cGeo, cMat);
                    bond.position.copy(mid);
                    bond.scale.set(1, len, 1);
                    bond.quaternion.setFromUnitVectors(up, dir);
                    group.add(bond);
                    bonds.push(bond);
                }
            }
        }

        // Central quantum dot marker — proportionally larger
        const qdGeo = new THREE.SphereGeometry(QD_RADIUS, 32, 24);
        const qdMat = new THREE.MeshPhysicalMaterial({
            color: QD_COLOR,
            roughness: 0.3,
            metalness: 0.1,
            transparent: true,
            opacity: 0.0, // starts invisible, fades in at stage 2
            emissive: QD_COLOR,
            emissiveIntensity: 0.1
        });
        qdMarker = new THREE.Mesh(qdGeo, qdMat);
        qdMarker.position.set(0, 0, 0);
        group.add(qdMarker);

        // Quantum dot halo
        const qdHaloGeo = new THREE.SphereGeometry(QD_RADIUS * 2, 16, 12);
        const qdHaloMat = new THREE.MeshBasicMaterial({
            color: QD_COLOR,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        qdMarker._halo = new THREE.Mesh(qdHaloGeo, qdHaloMat);
        qdMarker._halo.position.set(0, 0, 0);
        group.add(qdMarker._halo);

        scene.add(group);
        console.log(`[Lattice] ${atoms.length} atoms, ${bonds.length} bonds, QD marker at origin`);
    }

    function update(dt, elapsed, decoState) {
        if (!group) return;

        // Thermal vibration — real physics: <u²> ∝ kBT / (mω²)
        // We use jitter from decoherence module (already physics-calibrated)
        const jitter = decoState ? decoState.jitter : 0;

        // Gentle breathing for aesthetic
        const breathe = 1 + Math.sin(elapsed * 0.3) * 0.002;

        for (const a of atoms) {
            let jx = 0, jy = 0, jz = 0;
            if (jitter > 0.001) {
                // Brownian-like thermal motion
                jx = (Math.random() - 0.5) * jitter;
                jy = (Math.random() - 0.5) * jitter;
                jz = (Math.random() - 0.5) * jitter;
            }
            a.mesh.position.set(
                a.bx * breathe + jx,
                a.by * breathe + jy,
                a.bz * breathe + jz
            );
            a.halo.position.copy(a.mesh.position);
        }

        // QD marker pulsing
        if (qdMarker && qdMarker.material.opacity > 0.01) {
            const pulse = 1 + Math.sin(elapsed * 2) * 0.05;
            qdMarker.scale.setScalar(pulse);
            if (qdMarker._halo) {
                qdMarker._halo.scale.setScalar(pulse * 1.2);
                qdMarker._halo.material.opacity = qdMarker.material.opacity * 0.15 * (0.8 + Math.sin(elapsed * 3) * 0.2);
            }
        }
    }

    function showQuantumDot(visible, fadeTime) {
        if (!qdMarker) return;
        const targetOpacity = visible ? 0.25 : 0.0;
        // Simple immediate set (animation handled in update loop)
        qdMarker.material.opacity = targetOpacity;
        if (qdMarker._halo) {
            qdMarker._halo.material.opacity = visible ? 0.06 : 0.0;
        }
    }

    return { init, update, showQuantumDot };
})();
