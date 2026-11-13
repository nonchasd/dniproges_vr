import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// In local dev/testing, read directly from the local assets folder.
// In production builds (GitHub Pages), fetch dynamically from GitHub raw without bundling the 55MB GLB.
const IS_DEV = process.env.NODE_ENV === 'development' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const REMOTE_MODEL_URL =
  'https://raw.githubusercontent.com/nonchasd/dniproges_vr/main/assets/dniproges_map_fix.glb';
const LOCAL_MODEL_URL = './dniproges_map_fix.glb';

const MODEL_URL = IS_DEV ? LOCAL_MODEL_URL : REMOTE_MODEL_URL;

async function init() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    50000
  );
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // FPS Mouse Look State (Non-VR)
  let isPointerLocked = false;
  let isMouseDown = false;
  let yaw = 0;
  let pitch = 0;
  const mouseSensitivity = 0.0022;

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    const statusEl = document.getElementById('lock-status');
    if (statusEl) {
      statusEl.textContent = isPointerLocked
        ? '🟢 Mouse Locked (Move mouse to look • Esc to release)'
        : 'Click canvas to lock mouse • Esc to release';
      statusEl.style.color = isPointerLocked ? '#00e676' : '#ffcc00';
    }
  });

  renderer.domElement.addEventListener('click', () => {
    if (!renderer.xr.isPresenting && !isPointerLocked) {
      renderer.domElement.requestPointerLock();
    }
  });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0 || e.button === 2) {
      isMouseDown = true;
    }
  });

  window.addEventListener('mouseup', () => {
    isMouseDown = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (renderer.xr.isPresenting) return;
    if (!isPointerLocked && !isMouseDown) return;

    const movementX = e.movementX || 0;
    const movementY = e.movementY || 0;

    yaw -= movementX * mouseSensitivity;
    pitch -= movementY * mouseSensitivity;

    // Clamp pitch to avoid gimbal flip
    const maxPitch = Math.PI / 2 - 0.02;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

    camera.rotation.set(pitch, yaw, 0);
  });

  // Dynamic Fly Speed adjustment with mouse wheel
  let flyBaseSpeed = 40.0;
  const speedValEl = document.getElementById('speed-val');

  window.addEventListener('wheel', (e) => {
    if (renderer.xr.isPresenting) return;
    if (e.deltaY < 0) {
      flyBaseSpeed = Math.min(flyBaseSpeed * 1.15, 300);
    } else if (e.deltaY > 0) {
      flyBaseSpeed = Math.max(flyBaseSpeed * 0.85, 5);
    }
    if (speedValEl) {
      speedValEl.textContent = Math.round(flyBaseSpeed).toString();
    }
  });

  // Keyboard state for flying
  const keys: Record<string, boolean> = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
  directionalLight.position.set(100, 200, 100);
  scene.add(directionalLight);

  // User hierarchy for XR movement
  const userGroup = new THREE.Group();
  scene.add(userGroup);
  userGroup.add(camera);

  // Controller Visuals
  const controllerModelFactory = new XRControllerModelFactory();
  const controllerGripLeft = renderer.xr.getControllerGrip(0);
  controllerGripLeft.add(controllerModelFactory.createControllerModel(controllerGripLeft));
  userGroup.add(controllerGripLeft);

  const controllerGripRight = renderer.xr.getControllerGrip(1);
  controllerGripRight.add(controllerModelFactory.createControllerModel(controllerGripRight));
  userGroup.add(controllerGripRight);

  // VR Vignette (Physical approach for XR comfort)
  const vignetteGeometry = new THREE.PlaneGeometry(1, 1);
  const vignetteMaterial = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      void main() {
        float dist = distance(vUv, vec2(0.5));
        float mask = smoothstep(0.2, 0.6, dist);
        gl_FragColor = vec4(0.0, 0.0, 0.0, mask * uOpacity);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const vignetteMesh = new THREE.Mesh(vignetteGeometry, vignetteMaterial);
  vignetteMesh.position.z = -0.1;
  vignetteMesh.frustumCulled = false;
  vignetteMesh.renderOrder = 9999;
  camera.add(vignetteMesh);

  // VR Session Handlers
  const hud = document.getElementById('hud');

  renderer.xr.addEventListener('sessionstart', () => {
    if (hud) hud.style.display = 'none';
    if (document.pointerLockElement) document.exitPointerLock();

    // Hand-off camera position & yaw to VR user rig
    userGroup.position.copy(camera.position);
    userGroup.rotation.y = yaw;
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
  });

  renderer.xr.addEventListener('sessionend', () => {
    if (hud) hud.style.display = 'block';

    // Hand-off VR rig position back to FPS camera
    camera.position.copy(userGroup.position);
    yaw = userGroup.rotation.y;
    pitch = 0;
    camera.rotation.set(pitch, yaw, 0);

    userGroup.position.set(0, 0, 0);
    userGroup.quaternion.identity();
    vignetteMaterial.uniforms.uOpacity.value = 0.0;
  });

  // Speeds & State
  const clock = new THREE.Clock();
  const vrMoveDirection = new THREE.Vector3();
  const vrGlideSpeed = 8.0;
  const vrRotationSpeed = 1.5;

  // Model Loading
  const loadingStatusEl = document.getElementById('loading-status');
  console.log(`[dniproges_vr] Loading model from: ${MODEL_URL} (IS_DEV=${IS_DEV})`);
  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      scene.add(gltf.scene);

      if (loadingStatusEl) {
        loadingStatusEl.textContent = `✅ Model loaded (${IS_DEV ? 'Local Debug' : 'Remote'})`;
        loadingStatusEl.style.color = '#00e676';
        setTimeout(() => {
          loadingStatusEl.style.display = 'none';
        }, 3000);
      }

      let modelCamera: THREE.Camera | null = null;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Camera) modelCamera = child;
      });

      if (modelCamera) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        (modelCamera as THREE.Object3D).getWorldPosition(worldPos);
        (modelCamera as THREE.Object3D).getWorldQuaternion(worldQuat);

        camera.position.copy(worldPos);
        const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
        yaw = euler.y;
        pitch = euler.x;
        camera.rotation.set(pitch, yaw, 0);
      } else {
        camera.position.set(-200, 100, 200);
        yaw = 0;
        pitch = 0;
        camera.rotation.set(0, 0, 0);
      }
    },
    (xhr) => {
      if (xhr.total > 0) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        if (loadingStatusEl) {
          loadingStatusEl.textContent = `⏳ Loading 3D model (${IS_DEV ? 'Local' : 'Remote'}): ${percent}%`;
        }
      }
    },
    (error) => {
      console.error(`Failed to load GLTF model from ${MODEL_URL}:`, error);
      if (loadingStatusEl) {
        loadingStatusEl.textContent = `❌ Failed to load 3D model (${IS_DEV ? 'Local' : 'Remote'})`;
        loadingStatusEl.style.color = '#ff4d4d';
      }
    }
  );

  // Main Render Loop
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();

    if (renderer.xr.isPresenting) {
      // VR Mode Movement
      let isRotating = false;
      const session = renderer.xr.getSession();
      if (session) {
        for (const source of session.inputSources) {
          if (source.gamepad) {
            const axes = source.gamepad.axes;
            const stickX = axes.length > 2 ? axes[2] : axes[0];
            const stickY = axes.length > 2 ? axes[3] : axes[1];

            if (source.handedness === 'left') {
              if (Math.abs(stickX) > 0.1 || Math.abs(stickY) > 0.1) {
                const worldQuat = new THREE.Quaternion();
                camera.getWorldQuaternion(worldQuat);

                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat);
                right.y = 0;
                right.normalize();

                vrMoveDirection.set(0, 0, 0);
                vrMoveDirection.addScaledVector(forward, -stickY);
                vrMoveDirection.addScaledVector(right, stickX);

                userGroup.position.addScaledVector(vrMoveDirection, vrGlideSpeed * delta);
              }
            }

            if (source.handedness === 'right') {
              if (Math.abs(stickX) > 0.1) {
                userGroup.rotation.y -= stickX * vrRotationSpeed * delta;
                isRotating = true;
              }
            }
          }
        }
      }

      const targetOpacity = isRotating ? 1.0 : 0.0;
      vignetteMaterial.uniforms.uOpacity.value = THREE.MathUtils.lerp(
        vignetteMaterial.uniforms.uOpacity.value,
        targetOpacity,
        delta * 5
      );
    } else {
      // Non-VR FPS Flying Camera
      vignetteMaterial.uniforms.uOpacity.value = 0.0;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      const up = new THREE.Vector3(0, 1, 0);
      const moveDelta = new THREE.Vector3();

      let currentSpeed = flyBaseSpeed;
      if (keys['ShiftLeft'] || keys['ShiftRight']) {
        currentSpeed *= 3.5;
      }

      if (keys['KeyW'] || keys['ArrowUp']) moveDelta.add(forward);
      if (keys['KeyS'] || keys['ArrowDown']) moveDelta.sub(forward);
      if (keys['KeyD'] || keys['ArrowRight']) moveDelta.add(right);
      if (keys['KeyA'] || keys['ArrowLeft']) moveDelta.sub(right);
      if (keys['Space'] || keys['KeyE'] || keys['PageUp']) moveDelta.add(up);
      if (keys['KeyC'] || keys['KeyQ'] || keys['PageDown']) moveDelta.sub(up);

      if (moveDelta.lengthSq() > 0) {
        moveDelta.normalize().multiplyScalar(currentSpeed * delta);
        camera.position.add(moveDelta);
      }
    }

    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

init();
