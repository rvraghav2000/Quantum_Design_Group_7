/**
 * main.js — Application Bootstrap & Animation Loop (v3)
 *
 * Clean white scene, cursor parallax, stage management,
 * smooth orbit, decoherence-driven physics loop.
 */

(function () {
    'use strict';

    let scene, camera, renderer;
    let clock;
    let viewportW, viewportH;

    // Orbit controls
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let cameraTheta = Math.PI * 0.25;
    let cameraPhi = Math.PI * 0.35;
    let cameraRadius = 20;
    let targetTheta = cameraTheta;
    let targetPhi = cameraPhi;
    let targetRadius = cameraRadius;

    // Cursor parallax
    let cursorNorm = { x: 0, y: 0 };
    let parallax = { x: 0, y: 0 };

    // Stage
    let currentStage = 1;

    // FPS counter
    let frameCount = 0;
    let fpsTime = 0;
    const fpsEl = document.getElementById('hud-fps');

    const cursorGlow = document.getElementById('cursor-glow');

    function init() {
        const container = document.getElementById('three-canvas-container');
        if (!container) { console.error('No canvas container'); return; }

        viewportW = container.clientWidth;
        viewportH = container.clientHeight;
        if (viewportW === 0 || viewportH === 0) {
            viewportW = 800; viewportH = 600;
        }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8f9fa);

        camera = new THREE.PerspectiveCamera(40, viewportW / viewportH, 0.1, 200);
        updateCamera();

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(viewportW, viewportH);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0xf8f9fa, 1);
        container.appendChild(renderer.domElement);

        // Expose for debug
        window._scene = scene;
        window._camera = camera;
        window._renderer = renderer;

        // Soft lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.5);
        dir.position.set(5, 10, 7);
        scene.add(dir);

        // Subtle back light for depth
        const backLight = new THREE.DirectionalLight(0xbbdefb, 0.3);
        backLight.position.set(-5, -3, -7);
        scene.add(backLight);

        // Subtle grid
        const grid = new THREE.GridHelper(30, 30, 0xe0e0e0, 0xeeeeee);
        grid.position.y = -5;
        scene.add(grid);

        clock = new THREE.Clock();

        // Init modules
        try { Lattice.init(scene); } catch (e) { console.error('Lattice init:', e); }
        try { QuantumDot.init(scene); } catch (e) { console.error('QuantumDot init:', e); }
        try { UI.init(); } catch (e) { console.error('UI init:', e); }

        setupEvents(container);
        wireQubitToolbar();
        animate();
        console.log('[main] Silicon Pulse v3 initialized');
    }

    function updateCamera() {
        camera.position.set(
            cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta),
            cameraRadius * Math.cos(cameraPhi),
            cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta)
        );
        camera.lookAt(0, 0, 0);
    }

    function setupEvents(container) {
        container.addEventListener('mousedown', e => {
            isDragging = true;
            prevMouse = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mousemove', e => {
            if (cursorGlow) {
                cursorGlow.style.left = e.clientX + 'px';
                cursorGlow.style.top = e.clientY + 'px';
                cursorGlow.classList.add('active');
            }
            cursorNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
            cursorNorm.y = (e.clientY / window.innerHeight) * 2 - 1;

            if (!isDragging) return;
            targetTheta -= (e.clientX - prevMouse.x) * 0.005;
            targetPhi -= (e.clientY - prevMouse.y) * 0.005;
            targetPhi = Math.max(0.15, Math.min(Math.PI - 0.15, targetPhi));
            prevMouse = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', () => isDragging = false);

        container.addEventListener('wheel', e => {
            e.preventDefault();
            targetRadius = Math.max(5, Math.min(50, targetRadius + e.deltaY * 0.015));
        }, { passive: false });

        window.addEventListener('resize', () => {
            viewportW = container.clientWidth;
            viewportH = container.clientHeight;
            if (viewportW > 0 && viewportH > 0) {
                camera.aspect = viewportW / viewportH;
                camera.updateProjectionMatrix();
                renderer.setSize(viewportW, viewportH);
            }
        });

        // Touch controls
        let ts = null;
        container.addEventListener('touchstart', e => {
            if (e.touches.length === 1) ts = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        container.addEventListener('touchmove', e => {
            if (!ts || e.touches.length !== 1) return;
            targetTheta -= (e.touches[0].clientX - ts.x) * 0.005;
            targetPhi -= (e.touches[0].clientY - ts.y) * 0.005;
            targetPhi = Math.max(0.15, Math.min(Math.PI - 0.15, targetPhi));
            ts = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
    }

    // Stage Manager (global)
    window.StageManager = {
        getCurrent: () => currentStage,
        unlock(stage) {
            if (stage > 4) return;
            currentStage = stage;
            UI.updateStageNav(stage);
            UI.showStageContent(stage);
        },
        goTo(stage) {
            if (stage < 1 || stage > 4) return;
            UI.showStageContent(stage);
            UI.highlightStageTab(stage);
        }
    };

    // Qubit toolbar wiring
    function wireQubitToolbar() {
        const addBtn = document.getElementById('btn-add-qubit');
        const delBtn = document.getElementById('btn-delete-qubit');
        const countNum = document.getElementById('qubit-count-num');

        if (addBtn) {
            addBtn.addEventListener('click', () => {
                Lattice.addQubitAtRandomSite();
                if (countNum) countNum.textContent = Lattice.getQubitCount();
            });
        }
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                Lattice.removeLastQubit();
                if (countNum) countNum.textContent = Lattice.getQubitCount();
            });
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.getElapsedTime();

        // FPS counter
        frameCount++;
        fpsTime += dt;
        if (fpsTime >= 1.0) {
            if (fpsEl) fpsEl.textContent = Math.round(frameCount / fpsTime) + ' fps';
            frameCount = 0;
            fpsTime = 0;
        }

        // Smooth orbit
        cameraTheta += (targetTheta - cameraTheta) * 0.08;
        cameraPhi += (targetPhi - cameraPhi) * 0.08;
        cameraRadius += (targetRadius - cameraRadius) * 0.08;

        // Subtle parallax
        if (!isDragging) {
            parallax.x += (cursorNorm.x * 0.2 - parallax.x) * 0.03;
            parallax.y += (cursorNorm.y * 0.15 - parallax.y) * 0.03;
        }

        updateCamera();
        camera.position.x += parallax.x;
        camera.position.y += parallax.y * 0.4;
        camera.lookAt(0, 0, 0);

        // Physics
        const decoState = Decoherence.getState();

        try { Lattice.update(dt, elapsed, decoState); } catch (e) { }
        try { QuantumDot.update(dt, elapsed, decoState); } catch (e) { }

        try {
            const isPulsing = PulseController.getIsPulsing();
            SpinPhysics.evolve(dt, isPulsing);
            SpinPhysics.applyDecoherence(dt, decoState);
            PulseController.update(dt);
        } catch (e) { }

        try { UI.updateReadouts(); } catch (e) { }

        // Audio feedback
        if (typeof AudioFeedback !== 'undefined' && AudioFeedback.isEnabled()) {
            try {
                AudioFeedback.updateSpinTone(SpinPhysics.getState());
                AudioFeedback.updateNoise(decoState.noiseLevel);
            } catch (e) { }
        }

        renderer.render(scene, camera);
    }

    window.addEventListener('DOMContentLoaded', init);
})();
