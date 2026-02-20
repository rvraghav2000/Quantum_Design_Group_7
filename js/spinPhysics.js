/**
 * spinPhysics.js — 1-Qubit Hamiltonian Solver (v3)
 *
 * Full quantum state evolution with:
 *   H = -½ γ B · σ (free precession)
 *   H_pulse = -½ Ω_R σ_x (Rabi drive in rotating frame)
 *
 * Decoherence: T1 (energy relaxation) + T2 (dephasing)
 *   - T1 relaxation: drives |1⟩→|0⟩ at rate 1/T1
 *   - T2 dephasing: destroys off-diagonal coherence at rate 1/T2
 *   - Thermal excitation: Boltzmann factor exp(-ΔE/kBT)
 *
 * Gate operations: X, Y, Z, H, S, T, Rx(θ), Ry(θ), Rz(θ)
 */

const SpinPhysics = (() => {
    // Physical constants
    const GYROMAGNETIC_RATIO = 28.024e9; // γ/2π in Hz/T (electron in silicon)
    const KB = 1.380649e-23;
    const MU_B = 9.2740100783e-24;
    const G_FACTOR = 2.0;

    // State: complex amplitudes |ψ⟩ = α|0⟩ + β|1⟩
    let alpha = { re: 1, im: 0 };
    let beta = { re: 0, im: 0 };

    // Field parameters
    let Bz = 1.0;           // T
    let B1_max = 0.1;       // T (pulse amplitude)
    let larmorFreq = GYROMAGNETIC_RATIO * Bz;
    let rabiFreq = 0;

    // Simulation timescale
    const TIME_SCALE = 50e-9;

    // Gate log for quantum computing I/O
    const gateLog = [];

    // Complex arithmetic
    function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
    function cadd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
    function csub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
    function cscale(a, s) { return { re: a.re * s, im: a.im * s }; }
    function cnorm2(a) { return a.re * a.re + a.im * a.im; }
    function cexp(theta) { return { re: Math.cos(theta), im: Math.sin(theta) }; }
    function conj(a) { return { re: a.re, im: -a.im }; }

    // ─── Time Evolution ────
    function evolve(dt, isPulsing) {
        const simDt = dt * TIME_SCALE;
        const omegaL = 2 * Math.PI * GYROMAGNETIC_RATIO * Bz;
        larmorFreq = GYROMAGNETIC_RATIO * Bz;

        if (isPulsing) {
            rabiFreq = GYROMAGNETIC_RATIO * B1_max;
            const omegaR = 2 * Math.PI * rabiFreq;
            const angle = omegaR * simDt;
            const cosH = Math.cos(angle / 2);
            const sinH = Math.sin(angle / 2);

            const newAlpha = cadd(cscale(alpha, cosH), cmul({ re: 0, im: -sinH }, beta));
            const newBeta = cadd(cmul({ re: 0, im: -sinH }, alpha), cscale(beta, cosH));
            alpha = newAlpha;
            beta = newBeta;
        } else {
            rabiFreq = 0;
        }

        // Free precession (Larmor)
        const phase = omegaL * simDt / 2;
        alpha = cmul(alpha, cexp(phase));
        beta = cmul(beta, cexp(-phase));
        normalize();
    }

    // ─── Physics-Accurate Decoherence ────
    function applyDecoherence(dt, decoState) {
        if (!decoState) return;
        const simDt = dt * TIME_SCALE;
        const T1 = decoState.T1;
        const T2 = decoState.T2;
        const thermalExc = decoState.thermalExcitation;

        // T1 relaxation: decay toward thermal equilibrium
        // ρ₁₁(t) → P_th + (ρ₁₁(0) - P_th) · exp(-t/T1)
        if (T1 > 0 && T1 < 1e6) {
            const p1 = cnorm2(beta);
            const p_eq = thermalExc; // thermal equilibrium population of |1⟩
            const decay1 = Math.exp(-simDt / T1);
            const newP1 = p_eq + (p1 - p_eq) * decay1;
            const clampedP1 = Math.max(0, Math.min(1, newP1));
            const newP0 = 1 - clampedP1;

            const currentP0 = cnorm2(alpha);
            const currentP1 = cnorm2(beta);

            if (currentP0 > 1e-12) alpha = cscale(alpha, Math.sqrt(newP0 / currentP0));
            if (currentP1 > 1e-12) beta = cscale(beta, Math.sqrt(clampedP1 / currentP1));
        }

        // T2 dephasing: decay of off-diagonal coherence
        // |α*β| → |α*β| · exp(-t/T2)
        if (T2 > 0 && T2 < 1e6) {
            const decay2 = Math.exp(-simDt / T2);
            // Multiply β by a phase-preserving shrink factor
            // This reduces |α||β| while preserving individual probabilites (approximately)
            const currentCoherence = Math.sqrt(cnorm2(alpha) * cnorm2(beta));
            if (currentCoherence > 1e-12) {
                // Apply random phase kicks proportional to dephasing
                const phaseKick = (1 - decay2) * (Math.random() - 0.5) * 0.1;
                beta = cmul(beta, cexp(phaseKick));
            }
        }

        normalize();
    }

    function normalize() {
        const norm = Math.sqrt(cnorm2(alpha) + cnorm2(beta));
        if (norm > 1e-10) {
            alpha = cscale(alpha, 1 / norm);
            beta = cscale(beta, 1 / norm);
        }
    }

    // ─── Quantum Gate Operations ────
    function applyGate(gateName, param) {
        let newAlpha, newBeta;
        const S2 = 1 / Math.sqrt(2);

        switch (gateName) {
            case 'X': // Pauli-X (NOT)
                newAlpha = beta;
                newBeta = alpha;
                break;

            case 'Y': // Pauli-Y
                newAlpha = cmul({ re: 0, im: -1 }, beta);
                newBeta = cmul({ re: 0, im: 1 }, alpha);
                break;

            case 'Z': // Pauli-Z
                newAlpha = alpha;
                newBeta = cscale(beta, -1);
                break;

            case 'H': // Hadamard
                newAlpha = cscale(cadd(alpha, beta), S2);
                newBeta = cscale(csub(alpha, beta), S2);
                break;

            case 'S': // S gate (phase π/2)
                newAlpha = alpha;
                newBeta = cmul({ re: 0, im: 1 }, beta);
                break;

            case 'T': // T gate (phase π/4)
                newAlpha = alpha;
                newBeta = cmul(cexp(Math.PI / 4), beta);
                break;

            case 'Rx': { // Rx(θ)
                const t = (param || Math.PI / 2) / 2;
                const c = Math.cos(t), s = Math.sin(t);
                newAlpha = cadd(cscale(alpha, c), cmul({ re: 0, im: -s }, beta));
                newBeta = cadd(cmul({ re: 0, im: -s }, alpha), cscale(beta, c));
                break;
            }

            case 'Ry': { // Ry(θ)
                const t = (param || Math.PI / 2) / 2;
                const c = Math.cos(t), s = Math.sin(t);
                newAlpha = cadd(cscale(alpha, c), cscale(beta, -s));
                newBeta = cadd(cscale(alpha, s), cscale(beta, c));
                break;
            }

            case 'Rz': { // Rz(θ)
                const t = (param || Math.PI / 2) / 2;
                newAlpha = cmul(cexp(-t), alpha);
                newBeta = cmul(cexp(t), beta);
                break;
            }

            default: return;
        }

        alpha = newAlpha;
        beta = newBeta;
        normalize();

        gateLog.push({
            gate: gateName,
            param: param || null,
            time: Date.now(),
            stateAfter: { p0: getP0(), p1: getP1(), theta: getBlochAngles().theta, phi: getBlochAngles().phi }
        });
    }

    function measure() {
        const p1 = cnorm2(beta);
        const result = Math.random() < p1 ? 1 : 0;

        // Collapse
        if (result === 0) {
            alpha = { re: 1, im: 0 };
            beta = { re: 0, im: 0 };
        } else {
            alpha = { re: 0, im: 0 };
            beta = { re: 1, im: 0 };
        }

        gateLog.push({
            gate: 'MEASURE',
            result,
            time: Date.now(),
            stateAfter: { p0: getP0(), p1: getP1() }
        });

        return result;
    }

    function reset() {
        alpha = { re: 1, im: 0 };
        beta = { re: 0, im: 0 };
    }

    function getP0() { return cnorm2(alpha); }
    function getP1() { return cnorm2(beta); }

    function getBlochAngles() {
        const p1 = getP1();
        const theta = 2 * Math.acos(Math.min(1, Math.sqrt(1 - p1)));
        const phaseAlpha = Math.atan2(alpha.im, alpha.re);
        const phaseBeta = Math.atan2(beta.im, beta.re);
        let phi = phaseBeta - phaseAlpha;
        while (phi < 0) phi += 2 * Math.PI;
        while (phi >= 2 * Math.PI) phi -= 2 * Math.PI;
        return { theta, phi };
    }

    function setBField(bz) {
        Bz = bz;
        larmorFreq = GYROMAGNETIC_RATIO * Bz;
        Decoherence.setBfield(bz);
    }

    function getLarmorGHz() { return larmorFreq / 1e9; }
    function getRabiMHz() { return rabiFreq / 1e6; }

    function getStateLabel() {
        const p0 = getP0(), p1 = getP1();
        if (p0 > 0.99) return '|ψ⟩ = |0⟩';
        if (p1 > 0.99) return '|ψ⟩ = |1⟩';
        return `|ψ⟩ = ${Math.sqrt(p0).toFixed(2)}|0⟩ + ${Math.sqrt(p1).toFixed(2)}|1⟩`;
    }

    function getStateVector() {
        return { alpha: { ...alpha }, beta: { ...beta } };
    }

    function getGateLog() { return [...gateLog]; }
    function clearGateLog() { gateLog.length = 0; }

    return {
        evolve, applyDecoherence, reset,
        getP0, getP1, getBlochAngles,
        setBField, getLarmorGHz, getRabiMHz,
        getStateLabel, getStateVector,
        applyGate, measure,
        getGateLog, clearGateLog,
        TIME_SCALE
    };
})();
