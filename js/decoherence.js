/**
 * decoherence.js — Physics-Accurate Temperature Model
 *
 * Real silicon-28 spin qubit decoherence physics:
 *
 * T1 (spin-lattice relaxation):
 *   - Low T (<1K): dominated by Johnson noise, T1 ~ T^-5
 *   - High T (>2K): Orbach mechanism, 1/T1 ~ exp(-ΔE/kBT) + Raman T^7
 *   - Reference: T1 ~ 1s at 20mK, drops to ~1ms at 1K, ~1μs at 4K
 *
 * T2 (spin coherence / dephasing):
 *   - T2 <= 2*T1 always (fundamental bound)
 *   - Hahn echo: T2_Hahn ~ T^-3 (phonon-mediated)
 *   - Ramsey: T2* ~ T^-1 (charge noise + phonon)
 *   - In 28Si at 20mK: T2 ~ 28ms (world record), T1 ~ 6s
 *
 * Thermal occupation:
 *   - P_excited = 1/(1 + exp(ΔE/kBT)) where ΔE = g*μB*B
 *   - At 20mK, 1T: ΔE/kBT ~ 33 → P_exc ~ 10^-15 (negligible)
 *   - At 1K: ΔE/kBT ~ 0.67 → P_exc ~ 0.34 (significant!)
 */

const Decoherence = (() => {
    // Physical constants
    const KB = 1.380649e-23;      // Boltzmann constant (J/K)
    const MU_B = 9.2740100783e-24; // Bohr magneton (J/T)
    const G_FACTOR = 2.0;         // electron g-factor in silicon
    const HBAR = 1.0545718e-34;

    // State
    let temperature = 20;   // mK
    let Bfield = 1.0;       // Tesla

    // Computed values
    let T1 = 6.0;           // seconds at base temp
    let T2 = 0.028;         // seconds (28ms Hahn echo)
    let T2star = 0.001;     // seconds (1ms Ramsey)
    let thermalExcitation = 0;
    let zeemanSplitting = 0; // eV

    // Reference values from experiments (28Si at 20mK, 1T)
    const T1_REF = 6.0;     // seconds (Muhonen et al. 2014)
    const T2_REF = 0.028;   // seconds 28ms (Veldhorst et al. 2014)
    const T_REF = 0.020;    // 20 mK reference temperature
    const T2STAR_REF = 0.00012; // 120 μs Ramsey

    function computePhysics() {
        const T_kelvin = temperature / 1000; // mK → K
        const T_k = Math.max(T_kelvin, 0.001); // avoid division by zero

        // Zeeman splitting: ΔE = g · μ_B · B
        zeemanSplitting = G_FACTOR * MU_B * Bfield;
        const deltaE_eV = zeemanSplitting / 1.602e-19;

        // ──────────────────────────────────────────────
        // T1: Spin-lattice relaxation
        // ──────────────────────────────────────────────
        // Multi-mechanism model:
        //   1/T1 = 1/T1_johnson + 1/T1_phonon + 1/T1_orbach
        //
        // Johnson noise (low T): 1/T1 ∝ T (linear, weak)
        // Direct phonon (1-phonon): 1/T1 ∝ T · B^4  
        // Raman (2-phonon): 1/T1 ∝ T^7
        // Orbach: 1/T1 ∝ exp(-ΔE_valley/kBT)

        const ratio_T = T_k / T_REF;

        // Johnson noise contribution (dominant at very low T)
        const rate_johnson = (1 / T1_REF) * ratio_T;

        // Direct one-phonon process: scales as T * B^4
        const rate_direct = 0.001 * ratio_T * Math.pow(Bfield, 4);

        // Raman two-phonon: scales as T^7
        const rate_raman = 1e-8 * Math.pow(ratio_T, 7);

        // Orbach mechanism (valley splitting ~0.1 meV in Si/SiGe)
        const deltaE_valley = 0.1e-3 * 1.602e-19; // 0.1 meV
        const orbach_exp = -deltaE_valley / (KB * T_k);
        const rate_orbach = orbach_exp > -500 ? 1e3 * Math.exp(orbach_exp) : 0;

        const total_rate_T1 = rate_johnson + rate_direct + rate_raman + rate_orbach;
        T1 = Math.min(100, Math.max(1e-9, 1 / total_rate_T1));

        // ──────────────────────────────────────────────
        // T2: Spin coherence (dephasing)
        // ──────────────────────────────────────────────
        // T2_Hahn ∝ T^-3 (phonon-mediated dephasing)
        // T2* ∝ T^-1 (charge noise + phonon)
        // T2 ≤ 2*T1 (fundamental bound)

        const T2_phonon = T2_REF * Math.pow(T_REF / T_k, 3);
        const T2_bound = 2 * T1;
        T2 = Math.min(T2_phonon, T2_bound);
        T2 = Math.max(1e-9, T2);

        // Ramsey T2*
        const T2star_phonon = T2STAR_REF * Math.pow(T_REF / T_k, 1);
        T2star = Math.min(T2star_phonon, T2);
        T2star = Math.max(1e-10, T2star);

        // ──────────────────────────────────────────────
        // Thermal excitation probability
        // ──────────────────────────────────────────────
        // P_exc = 1/(1 + exp(ΔE/kBT))
        const beta = zeemanSplitting / (KB * T_k);
        thermalExcitation = beta > 500 ? 0 : 1 / (1 + Math.exp(beta));
    }

    function setTemperature(t) {
        temperature = t;
        computePhysics();
    }

    function setBfield(b) {
        Bfield = b;
        computePhysics();
    }

    function getState() {
        const T_k = Math.max(temperature / 1000, 0.001);
        // Noise level: maps temperature to visual effects
        // At 20mK → 0, at 4K → 1
        const noiseLevel = Math.min(1, Math.max(0, Math.log10(T_k / T_REF) / Math.log10(4 / T_REF)));

        return {
            temperature,         // mK
            T_kelvin: T_k,
            T1,                 // seconds
            T2,                 // seconds (Hahn echo)
            T2star,             // seconds (Ramsey)
            thermalExcitation,  // probability of thermal |1⟩
            zeemanSplitting,    // Joules
            zeemanMeV: zeemanSplitting / 1.602e-22,  // meV (for display)
            noiseLevel,
            jitter: noiseLevel * 0.15,        // lattice thermal vibration
            flicker: noiseLevel * 0.6,        // electron wavefunction flicker
            desaturation: noiseLevel * 0.4,   // color wash
            kBT_meV: KB * (temperature / 1000) / 1.602e-22  // thermal energy in meV
        };
    }

    function formatTime(t) {
        if (t >= 1) return t.toFixed(1) + ' s';
        if (t >= 1e-3) return (t * 1e3).toFixed(1) + ' ms';
        if (t >= 1e-6) return (t * 1e6).toFixed(1) + ' μs';
        if (t >= 1e-9) return (t * 1e9).toFixed(1) + ' ns';
        return (t * 1e12).toFixed(0) + ' ps';
    }

    function getT1String() { return formatTime(T1); }
    function getT2String() { return formatTime(T2); }
    function getT2StarString() { return formatTime(T2star); }

    // Initialize
    computePhysics();

    return {
        setTemperature, setBfield, getState,
        getT1String, getT2String, getT2StarString, formatTime
    };
})();
