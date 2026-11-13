import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const MODEL_URL =
  'https://raw.githubusercontent.com/nonchasd/dniproges_vr/main/assets/dniproges_map_fix.glb';

async function init() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50000);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Controls for Non-VR
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

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

  // VR Vignette (Physical approach for XR)
  // We place a plane 0.1m in front of the camera.
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
        // Harder mask for better nausea reduction
        float mask = smoothstep(0.2, 0.6, dist);
        gl_FragColor = vec4(0.0, 0.0, 0.0, mask * uOpacity);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const vignetteMesh = new THREE.Mesh(vignetteGeometry, vignetteMaterial);
  vignetteMesh.position.z = -0.1; // 10cm in front of eyes
  vignetteMesh.frustumCulled = false;
  vignetteMesh.renderOrder = 9999;
  camera.add(vignetteMesh);

  // Movement State
  const clock = new THREE.Clock();
  const moveDirection = new THREE.Vector3();
  const glideSpeed = 8.0;
  const rotationSpeed = 1.5;

  // Model Loading
  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      scene.add(gltf.scene);

      let modelCamera: THREE.Camera | null = null;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Camera) modelCamera = child;
      });

      if (modelCamera) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        (modelCamera as THREE.Object3D).getWorldPosition(worldPos);
        (modelCamera as THREE.Object3D).getWorldQuaternion(worldQuat);

        userGroup.position.copy(worldPos);
        userGroup.quaternion.copy(worldQuat);

        controls.target.addVectors(worldPos, new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat));
        camera.position.set(0, 0, 0.1);
      }
    },
    (xhr) => {
      if (xhr.total > 0) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        console.log(`Loading model: ${percent}%`);
      }
    },
    (error) => {
      console.error('Failed to load GLTF model from GitHub:', error);
    }
  );

  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    let isRotating = false;

    if (renderer.xr.isPresenting) {
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

                moveDirection.set(0, 0, 0);
                moveDirection.addScaledVector(forward, -stickY);
                moveDirection.addScaledVector(right, stickX);

                userGroup.position.addScaledVector(moveDirection, glideSpeed * delta);
              }
            }

            if (source.handedness === 'right') {
              if (Math.abs(stickX) > 0.1) {
                userGroup.rotation.y -= stickX * rotationSpeed * delta;
                isRotating = true;
              }
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

    controls.update();
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

init();
