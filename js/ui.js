/**
 * ui.js — Stage Controller, Parameter Wiring, Readouts (v3)
 *
 * ALL parameters are properly wired:
 *   - Gate voltages → QuantumDot potential
 *   - Temperature → Decoherence physics (T1, T2, thermal excitation)
 *   - B-field → SpinPhysics Larmor frequency + Decoherence Zeeman
 *   - Pulse → Rabi oscillations
 *   - Decoherence → SpinPhysics state decay
 */

const UI = (() => {
    const els = {};

    function init() {
        // Cache DOM
        els.sidebar = document.getElementById('sidebar');
        els.stages = document.querySelectorAll('.stage-content');
        els.tabs = document.querySelectorAll('.stage-tab');
        els.connectors = [
            document.getElementById('conn-1'),
            document.getElementById('conn-2'),
            document.getElementById('conn-3')
        ];

        // Stage 2 — Gate Voltages
        els.sliderVl = document.getElementById('slider-vl');
        els.sliderVc = document.getElementById('slider-vc');
        els.sliderVr = document.getElementById('slider-vr');
        els.vlVal = document.getElementById('vl-value');
        els.vcVal = document.getElementById('vc-value');
        els.vrVal = document.getElementById('vr-value');

        // Stage 3 — Environment
        els.sliderTemp = document.getElementById('slider-temp');
        els.tempVal = document.getElementById('temp-value');
        els.headerTemp = document.getElementById('header-temp');
        els.headerBfield = document.getElementById('header-bfield');
        els.hudT2 = document.getElementById('hud-t2');
        els.hudCoherence = document.getElementById('hud-coherence');
        els.larmorVal = document.getElementById('larmor-value');

        // Physics readouts
        els.t1Val = document.getElementById('t1-value');
        els.t2Val = document.getElementById('t2-value');
        els.t2starVal = document.getElementById('t2star-value');
        els.thermalVal = document.getElementById('thermal-value');
        els.zeemanVal = document.getElementById('zeeman-value');
        els.kbtVal = document.getElementById('kbt-value');

        // Stage 4 — Spin Control
        els.sliderBfield = document.getElementById('slider-bfield');
        els.bfieldSliderVal = document.getElementById('bfield-slider-val');
        els.bfieldVal = document.getElementById('bfield-value');
        els.thetaVal = document.getElementById('theta-value');
        els.phiVal = document.getElementById('phi-value');
        els.p1Val = document.getElementById('p1-value');
        els.probBar0 = document.getElementById('prob-bar-0');
        els.probBar1 = document.getElementById('prob-bar-1');
        els.probText0 = document.getElementById('prob-0-text');
        els.probText1 = document.getElementById('prob-1-text');
        els.stateLabel = document.getElementById('footer-state-label');
        els.rabiVal = document.getElementById('rabi-value');

        // Pulse
        els.pulseBtn = document.getElementById('pulse-button');
        els.pulseRingFg = document.getElementById('pulse-ring-fg');

        // Audio
        els.audioToggle = document.getElementById('audio-toggle');

        // Navigation buttons
        els.btnNext1 = document.getElementById('btn-next-1');
        els.btnNext2 = document.getElementById('btn-next-2');
        els.btnNext3 = document.getElementById('btn-next-3');

        wireSliders();
        wireButtons();
        wireToggles();
        wirePulse();

        // Init quantum computing
        try { QuantumComputing.init(); } catch (e) { console.warn('QC init:', e); }
    }

    // ─── Slider Wiring ────
    function wireSliders() {
        // Gate voltages
        const wireGate = (slider, valEl) => {
            if (!slider) return;
            slider.addEventListener('input', () => {
                const v = parseFloat(slider.value);
                if (valEl) valEl.innerHTML = v.toFixed(1) + '<small> mV</small>';
                syncGateVoltages();
            });
        };
        wireGate(els.sliderVl, els.vlVal);
        wireGate(els.sliderVc, els.vcVal);
        wireGate(els.sliderVr, els.vrVal);

        // Temperature → physics-accurate decoherence
        if (els.sliderTemp) {
            els.sliderTemp.addEventListener('input', () => {
                const t = parseInt(els.sliderTemp.value);
                if (els.tempVal) els.tempVal.innerHTML = t + '<small> mK</small>';
                if (els.headerTemp) els.headerTemp.textContent = t + ' mK';
                Decoherence.setTemperature(t);
            });
        }

        // B-field → Larmor + Zeeman + decoherence
        if (els.sliderBfield) {
            els.sliderBfield.addEventListener('input', () => {
                const b = parseFloat(els.sliderBfield.value);
                if (els.bfieldSliderVal) els.bfieldSliderVal.innerHTML = b.toFixed(2) + '<small> T</small>';
                if (els.bfieldVal) els.bfieldVal.textContent = b.toFixed(2) + ' T';
                if (els.headerBfield) els.headerBfield.textContent = b.toFixed(1) + ' T';
                SpinPhysics.setBField(b);
            });
        }
    }

    function syncGateVoltages() {
        const vl = parseFloat(els.sliderVl?.value || 0);
        const vc = parseFloat(els.sliderVc?.value || 0);
        const vr = parseFloat(els.sliderVr?.value || 0);
        QuantumDot.setGateVoltages(vl, vc, vr);
    }

    // ─── Button Wiring ────
    function wireButtons() {
        // Theory detail toggles
        document.querySelectorAll('.detail-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const tgt = btn.getAttribute('data-target');
                const panel = document.getElementById(tgt);
                if (panel) panel.classList.toggle('open');
            });
        });

        // Stage navigation
        if (els.btnNext1) {
            els.btnNext1.addEventListener('click', () => {
                StageManager.unlock(2);
                QuantumDot.showGates(true);
                Lattice.showQuantumDot(true);
            });
        }
        if (els.btnNext2) {
            els.btnNext2.addEventListener('click', () => {
                if (els.btnNext2.classList.contains('disabled')) return;
                StageManager.unlock(3);
            });
        }
        if (els.btnNext3) {
            els.btnNext3.addEventListener('click', () => {
                if (els.btnNext3.classList.contains('disabled')) return;
                StageManager.unlock(4);
                if (els.pulseBtn) els.pulseBtn.disabled = false;
            });
        }

        // Stage tab clicks
        els.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const stage = parseInt(tab.getAttribute('data-stage'));
                if (!tab.classList.contains('locked')) {
                    StageManager.goTo(stage);
                }
            });
        });
    }

    function wireToggles() {
        if (els.audioToggle) {
            els.audioToggle.addEventListener('click', () => {
                els.audioToggle.classList.toggle('active');
                AudioFeedback.toggle();
            });
        }
    }

    function wirePulse() {
        if (!els.pulseBtn) return;
        PulseController.init(els.pulseBtn, els.pulseRingFg);
    }

    // ─── Stage Management ────
    function updateStageNav(unlocked) {
        els.tabs.forEach(tab => {
            const s = parseInt(tab.getAttribute('data-stage'));
            tab.classList.remove('active', 'completed', 'locked');
            if (s < unlocked) tab.classList.add('completed');
            else if (s === unlocked) tab.classList.add('active');
            else tab.classList.add('locked');
        });
        els.connectors.forEach((conn, i) => {
            if (conn) conn.style.width = (i + 1 < unlocked) ? '100%' : '0';
        });
    }

    function showStageContent(stage) {
        els.stages.forEach(s => {
            const ds = parseInt(s.getAttribute('data-stage'));
            s.classList.toggle('hidden', ds !== stage);
        });
    }

    function highlightStageTab(stage) {
        els.tabs.forEach(tab => {
            const s = parseInt(tab.getAttribute('data-stage'));
            tab.classList.toggle('active', s === stage);
        });
    }

    // ─── Readout Updates (called every frame) ────
    function updateReadouts() {
        const p0 = SpinPhysics.getP0();
        const p1 = SpinPhysics.getP1();
        const angles = SpinPhysics.getBlochAngles();
        const deco = Decoherence.getState();

        // Spin probabilities
        if (els.probBar0) els.probBar0.style.width = (p0 * 100) + '%';
        if (els.probBar1) els.probBar1.style.width = (p1 * 100) + '%';
        if (els.probText0) els.probText0.textContent = Math.round(p0 * 100) + '%';
        if (els.probText1) els.probText1.textContent = Math.round(p1 * 100) + '%';
        if (els.thetaVal) els.thetaVal.textContent = (angles.theta / Math.PI).toFixed(3) + 'π';
        if (els.phiVal) els.phiVal.textContent = (angles.phi / Math.PI).toFixed(3) + 'π';
        if (els.p1Val) els.p1Val.textContent = p1.toFixed(4);

        // Larmor & Rabi
        if (els.larmorVal) els.larmorVal.textContent = SpinPhysics.getLarmorGHz().toFixed(2) + ' GHz';
        if (els.rabiVal) els.rabiVal.textContent = SpinPhysics.getRabiMHz().toFixed(1) + ' MHz';

        // Physics readouts
        if (els.t1Val) els.t1Val.textContent = Decoherence.getT1String();
        if (els.t2Val) els.t2Val.textContent = Decoherence.getT2String();
        if (els.t2starVal) els.t2starVal.textContent = Decoherence.getT2StarString();
        if (els.thermalVal) els.thermalVal.textContent = (deco.thermalExcitation * 100).toFixed(4) + '%';
        if (els.zeemanVal) els.zeemanVal.textContent = deco.zeemanMeV.toFixed(3) + ' meV';
        if (els.kbtVal) els.kbtVal.textContent = deco.kBT_meV.toFixed(4) + ' meV';

        // HUD coherence
        if (els.hudT2) els.hudT2.textContent = 'T₂ = ' + Decoherence.getT2String();
        if (els.hudCoherence) els.hudCoherence.textContent = 'T₂ = ' + Decoherence.getT2String();

        // State label
        if (els.stateLabel) els.stateLabel.textContent = SpinPhysics.getStateLabel();
    }

    return {
        init, updateStageNav, showStageContent,
        highlightStageTab, updateReadouts
    };
})();
