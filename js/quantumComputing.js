/**
 * quantumComputing.js — Quantum Computing I/O Panel
 *
 * Provides input/output for quantum gate operations:
 *   - Gate sequence input (click buttons or type circuit)
 *   - State vector output (amplitudes, probabilities, Bloch angles)
 *   - Measurement with wavefunction collapse
 *   - Gate operation history log
 *   - Circuit diagram display
 */

const QuantumComputing = (() => {
    let panel;
    let circuitDisplay;
    let stateOutput;
    let historyLog;
    let isVisible = false;

    function init() {
        panel = document.getElementById('qc-panel');
        circuitDisplay = document.getElementById('qc-circuit');
        stateOutput = document.getElementById('qc-state-output');
        historyLog = document.getElementById('qc-history');

        if (!panel) return;

        // Wire gate buttons
        document.querySelectorAll('.qc-gate-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gate = btn.getAttribute('data-gate');
                const param = btn.getAttribute('data-param');
                applyGate(gate, param ? parseFloat(param) : undefined);
            });
        });

        // Measure button
        const measureBtn = document.getElementById('qc-measure-btn');
        if (measureBtn) {
            measureBtn.addEventListener('click', () => {
                const result = SpinPhysics.measure();
                addToHistory(`MEASURE → |${result}⟩`, result === 0 ? '#1a73e8' : '#ea4335');
                updateDisplay();
            });
        }

        // Reset button
        const resetBtn = document.getElementById('qc-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                SpinPhysics.reset();
                SpinPhysics.clearGateLog();
                if (circuitDisplay) circuitDisplay.innerHTML = '<span class="qc-wire-label">|0⟩ ──</span>';
                if (historyLog) historyLog.innerHTML = '';
                updateDisplay();
            });
        }

        // Run circuit button
        const runBtn = document.getElementById('qc-run-btn');
        if (runBtn) {
            runBtn.addEventListener('click', runCircuit);
        }
    }

    function applyGate(gateName, param) {
        SpinPhysics.applyGate(gateName, param);

        // Update circuit diagram
        if (circuitDisplay) {
            const gateEl = document.createElement('span');
            gateEl.className = 'qc-gate-block';
            gateEl.textContent = param ? `${gateName}(${(param / Math.PI).toFixed(1)}π)` : gateName;
            circuitDisplay.appendChild(gateEl);

            const wire = document.createElement('span');
            wire.className = 'qc-wire';
            wire.textContent = '──';
            circuitDisplay.appendChild(wire);
        }

        addToHistory(`${gateName}${param ? '(' + (param / Math.PI).toFixed(2) + 'π)' : ''}`, '#1a73e8');
        updateDisplay();
    }

    function addToHistory(text, color) {
        if (!historyLog) return;
        const entry = document.createElement('div');
        entry.className = 'qc-log-entry';
        entry.innerHTML = `<span style="color:${color}">●</span> ${text} → P(|1⟩) = ${(SpinPhysics.getP1() * 100).toFixed(1)}%`;
        historyLog.prepend(entry);

        // Keep only last 20 entries
        while (historyLog.children.length > 20) {
            historyLog.removeChild(historyLog.lastChild);
        }
    }

    function updateDisplay() {
        if (!stateOutput) return;
        const sv = SpinPhysics.getStateVector();
        const p0 = SpinPhysics.getP0();
        const p1 = SpinPhysics.getP1();
        const angles = SpinPhysics.getBlochAngles();

        stateOutput.innerHTML = `
            <div class="qc-sv-row">
                <span class="qc-sv-label">α (|0⟩):</span>
                <span class="qc-sv-val">${sv.alpha.re.toFixed(4)} ${sv.alpha.im >= 0 ? '+' : '−'} ${Math.abs(sv.alpha.im).toFixed(4)}i</span>
            </div>
            <div class="qc-sv-row">
                <span class="qc-sv-label">β (|1⟩):</span>
                <span class="qc-sv-val">${sv.beta.re.toFixed(4)} ${sv.beta.im >= 0 ? '+' : '−'} ${Math.abs(sv.beta.im).toFixed(4)}i</span>
            </div>
            <div class="qc-sv-row">
                <span class="qc-sv-label">P(|0⟩):</span>
                <span class="qc-sv-val">${(p0 * 100).toFixed(2)}%</span>
            </div>
            <div class="qc-sv-row">
                <span class="qc-sv-label">P(|1⟩):</span>
                <span class="qc-sv-val">${(p1 * 100).toFixed(2)}%</span>
            </div>
            <div class="qc-sv-row">
                <span class="qc-sv-label">θ (Bloch):</span>
                <span class="qc-sv-val">${(angles.theta / Math.PI).toFixed(4)}π = ${(angles.theta * 180 / Math.PI).toFixed(1)}°</span>
            </div>
            <div class="qc-sv-row">
                <span class="qc-sv-label">φ (Bloch):</span>
                <span class="qc-sv-val">${(angles.phi / Math.PI).toFixed(4)}π = ${(angles.phi * 180 / Math.PI).toFixed(1)}°</span>
            </div>
        `;
    }

    // Run a pre-built circuit sequence
    function runCircuit() {
        const input = document.getElementById('qc-circuit-input');
        if (!input) return;
        const circuit = input.value.trim().toUpperCase();
        if (!circuit) return;

        SpinPhysics.reset();
        SpinPhysics.clearGateLog();
        if (circuitDisplay) circuitDisplay.innerHTML = '<span class="qc-wire-label">|0⟩ ──</span>';
        if (historyLog) historyLog.innerHTML = '';

        // Parse: H X Z MEASURE, or Rx(0.5pi)
        const gates = circuit.split(/\s+/);
        let delay = 0;
        for (const g of gates) {
            const match = g.match(/^(RX|RY|RZ)\(([^)]+)\)$/i);
            if (match) {
                const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
                let angle = parseFloat(match[2]);
                if (match[2].toLowerCase().includes('pi')) {
                    angle = parseFloat(match[2]) * Math.PI;
                }
                setTimeout(() => applyGate(name, angle), delay);
            } else if (g === 'MEASURE' || g === 'M') {
                setTimeout(() => {
                    const result = SpinPhysics.measure();
                    addToHistory(`MEASURE → |${result}⟩`, result === 0 ? '#1a73e8' : '#ea4335');
                    updateDisplay();
                }, delay);
            } else if (['X', 'Y', 'Z', 'H', 'S', 'T'].includes(g)) {
                setTimeout(() => applyGate(g), delay);
            }
            delay += 200;
        }
    }

    return { init, updateDisplay };
})();
