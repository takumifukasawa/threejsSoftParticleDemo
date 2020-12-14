

console.log("run");

let width, height;
let particleMesh, foxMesh;
let foxMixer;

const params = {
  enable: true,
  enableFadeBit: 1,
  depthFade: 0.05,
  color: {
    r: 254,
    g: 255,
    b: 234,
    a: 0.08
  }
};

const pane = new Tweakpane();
pane
  .addInput(params, "enable")
  .on("change", (value) => {
    params.enableFadeBit = value ? 1 : 0
  });
pane.addInput(params, "depthFade", {
  min: 0,
  max: 0.2,
  step: 0.0001
});
pane.addInput(params, "color");

async function loadTexture(path) {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    const onLoad = (texture) => resolve(texture);
    const onError = (err) => {
      console.error(err);
      reject();
    }
    loader.load(path, onLoad, undefined, onError);
  });
}

async function loadGLTF(path) {
  const loader = new THREE.GLTFLoader();
  return new Promise((resolve, reject) => {
    const onLoad = (gltf) => resolve(gltf);
    const onError = (err) => {
      console.error(err);
      reject();
    }
    loader.load(path, onLoad, undefined, onError);
  });
}


async function createParticle() {
  const vertexShader = `
  attribute vec3 position;
  attribute vec2 uv;
  attribute float index;
  attribute vec2 offset;
  attribute vec2 size;
  attribute vec3 color;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec4 vViewPosition;
  varying float vFade;
  varying float vIndex;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;

  mat2 rotMat(float rad) {
    return mat2(
      cos(rad), sin(rad),
      -sin(rad), cos(rad)
    );
  }

  void main() {
    vUv = uv;
    vColor = color;
    vIndex = index;

    vec3 vertexPosition = position;

    float moveSpeed = .9;
    float moveAnim = mod((uTime + index * 200.) / (1000. / moveSpeed), 1.);
    float moveFade = smoothstep(0., .7, moveAnim) * (1. - smoothstep(.3, 1., moveAnim));

    vFade = moveFade;

    vec3 positionOffset = vec3(
      0,
      0,
      mix(2., -2., moveAnim)
    );
    vertexPosition += positionOffset;

    vec4 mvPosition = modelViewMatrix * vec4(vertexPosition, 1.);

    vViewPosition = mvPosition;

    // float anim = sin((uTime * 2. + index * 100.) / 1000.) * .5 + .5;
    // anim = 1.;
    // mvPosition.xy += offset * vec2(size.x, size.y) * anim;

    // mvPosition.xy += rotMat(index + uTime / 5000.) * offset * vec2(size.x, size.y);
    mvPosition.xy += offset * vec2(size.x, size.y);
    gl_Position = projectionMatrix * mvPosition;
  }
  `;

  const fragmentShader = `
  precision highp float;

  #include <packing>
  #include <fog_pars_fragment>

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec4 vViewPosition;
  varying float vFade;
  varying float vIndex;

  uniform float uTime;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform vec2 uResolution;
  uniform sampler2D uDepthTexture;
  uniform float uDepthFade;
  uniform sampler2D uMaskTexture;
  uniform float uEnableFade;
  uniform vec2 uSpriteGrid;
  uniform vec4 uColor;

  float readDepth(sampler2D depthSampler, vec2 coord) {
    float fragCoordZ = texture2D(depthSampler, coord).x;
    float viewZ = perspectiveDepthToViewZ(fragCoordZ, uCameraNear, uCameraFar);
    return viewZToOrthographicDepth(viewZ, uCameraNear, uCameraFar);
  }

  void main() {
    // vec4 diffuseColor = vec4(vColor, 1.);
    // vec2 p = vUv * 2. - 1.;
    // diffuseColor.a = 1. - smoothstep(length(p), 0., .05);
    // diffuseColor.a = clamp(diffuseColor.a, 0., 1.);
    // gl_FragColor = diffuseColor;

    vec4 diffuseColor = vec4(vec3(0.), 1.);

    vec2 uv = vUv;
    uv /= uSpriteGrid;
    float spriteCellNum = uSpriteGrid.x * uSpriteGrid.y;
    vec2 gridSize = vec2(
      1. / uSpriteGrid.x, // row
      1. / uSpriteGrid.y // col
    );

    // float cellIndex = floor(mod(vIndex + (uTime / 1000.) * spriteCellNum, spriteCellNum));
    // float cellIndex = floor(mod(0. + (uTime / 1000.) * spriteCellNum, spriteCellNum));
    float cellIndex = floor(mod(vIndex, spriteCellNum));
    cellIndex += .001;
    // cellIndex = clamp(cellIndex, 0., spriteCellNum - 30.);
    // cellIndex = 6. + .01;
    // float cellIndex = floor(mod(vIndex, spriteCellNum));

    float rowPos = mod(cellIndex, uSpriteGrid.x);
    float colPos = floor(cellIndex / uSpriteGrid.y);
    // rowPos = 1.;
    // colPos = 1.;
    uv.x += rowPos * gridSize.x;
    // uv.y -= (colPos * gridSize.y - .75);
    uv.y += (uSpriteGrid.y - 1.) * gridSize.y;
    uv.y -= colPos * gridSize.y;
    // uv.y -= colPos * gridSize.y;

      // uv = vUv;

    float mask = texture2D(uMaskTexture, uv).r;

    diffuseColor = uColor;

    vec2 screenCoord = vec2(
      gl_FragCoord.x / uResolution.x,
      gl_FragCoord.y / uResolution.y
    );

    float sceneDepth = readDepth(uDepthTexture, screenCoord);

    float viewZ = vViewPosition.z;
    float currentDepth = viewZToOrthographicDepth(viewZ, uCameraNear, uCameraFar);
    float depthFade = mix(
      1.,
      clamp(abs(currentDepth - sceneDepth) / max(uDepthFade, .0001), 0., 1.),
      uEnableFade
    );

    diffuseColor.a *= vFade * depthFade * mask;

    gl_FragColor = diffuseColor;

    // // debug
    // gl_FragColor.rgb = texture2D(uMaskTexture, uv).xyz;
    // gl_FragColor.a = 1.;

    #include <alphatest_fragment>
    #include <fog_fragment>
    // gl_FragColor = vec4(vec3(currentDepth), 1.);
    // gl_FragColor = vec4(vec3(1.), fade);
  }
  `;

  const texture = await loadTexture("./smoke_sprite.png");
  // const texture = await loadTexture("./smoke_sprite_2.png");
  // const texture = await loadTexture("./uv-texture.png");

  const geometry = new THREE.BufferGeometry();

  // polygon indexes
  // 3 -- 2
  // |    |
  // 0 -- 1
  const index = [];
  const vertices = [];
  const uvs = [];
  const offsets = [];
  const indices = [];
  const sizes = [];
  const colors = [];

  const particleNum = 100;
  const randomOffsetRange = 12;
  const sizeRange = 2.0;
  const sizeMin = 1.2;

  for(let i = 0; i < particleNum; i++) {
    const px = Math.random() * randomOffsetRange - randomOffsetRange * 0.5;
    const py = -Math.random() * 0.4 - 0.1;
    const pz = Math.random() * randomOffsetRange - randomOffsetRange * 0.5;
    const size = Math.random() * sizeRange + sizeMin;
    const color = {
      x: Math.random() * .4 + .6,
      y: Math.random() * .4 + .4,
      z: Math.random() * .2 + .2,
    };

    for(let j = 0; j < 4; j++) {
      index.push(i);
      vertices.push(px, py, pz);
      sizes.push(size, size);
      colors.push(color.x, color.y, color.z);
    }
    uvs.push(
      0, 0,
      1, 0,
      1, 1,
      0, 1
    );
    offsets.push(
      -1, -1,
      1, -1,
      1, 1,
      -1, 1
    );
    const vertexIndex = i * 4;
    indices.push(
      vertexIndex + 0, vertexIndex + 1, vertexIndex + 2,
      vertexIndex + 2, vertexIndex + 3, vertexIndex + 0
    );
  }
  geometry.setIndex(indices);
  geometry.setAttribute('index', new THREE.Uint16BufferAttribute(index, 1));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Uint16BufferAttribute(uvs, 2));
  geometry.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 2));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.1,
    depthWrite: false,
    uniforms: {
      uMaskTexture: {
        value: texture,
      },
      uTime: {
        value: 0,
      },
      uCameraNear: {
        value: 0,
      },
      uCameraFar: {
        value: 0,
      },
      uDepthFade: {
        value: 0,
      },
      uResolution: {
        value: new THREE.Vector2(),
      },
      uDepthTexture: {
        value: null,
      },
      uEnableFade: {
        value: params.enableFadeBit,
      },
      uSpriteGrid: {
        value: new THREE.Vector2(4, 4),
      },
      uColor: {
        value: params.color
      },
    },
  });

  return new THREE.Mesh(geometry, material);
}

async function createFox() {
  const gltfData = await loadGLTF("./Fox.glb");
  const {animations, scene: model } = gltfData;
  model.children[0].children[0].castShadow = true;
  model.children[0].children[1].castShadow = true;
  foxMixer = new THREE.AnimationMixer(model);
  // for(let i = 0; i < animations.length; i++) {
  //   const animation = animations[i];
  //   const action = foxMixer.clipAction(animation);
  //   action.play();
  // }
  foxMixer.timeScale = 1.3;
  const action = foxMixer.clipAction(animations[2]);
  action.play();
  const s = 0.01;
  model.scale.set(s, s, s);
  return model;
}


const wrapper = document.querySelector(".js-wrapper");
const canvas = document.querySelector(".js-canvas");

const renderer = new THREE.WebGLRenderer({ canvas });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ratio = Math.min(window.devicePixelRatio, 1);

renderer.setPixelRatio(ratio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);
scene.fog = new THREE.FogExp2(0xcccccc, 0.12);
// scene.background = new THREE.Color(0x68686b);
// scene.fog = new THREE.FogExp2(0x68686b, 0.1);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
camera.fov = 50;
camera.position.set(1.2, 1.2, 3);
camera.lookAt(new THREE.Vector3(0, 0.8, 0));

const renderTarget = new THREE.WebGLRenderTarget(1, 1);
renderTarget.texture.format = THREE.RGBFormat;
renderTarget.texture.minFilter = THREE.NearestFilter;
renderTarget.texture.magFilter = THREE.NearestFilter;
renderTarget.texture.generateMipmaps = false;
renderTarget.stencilBuffer = false;
renderTarget.depthBuffer = true;
renderTarget.depthTexture = new THREE.DepthTexture();
renderTarget.depthTexture.type = THREE.UnsignedShortType;
renderTarget.depthTexture.format = THREE.DepthFormat;

const controls = new THREE.OrbitControls(camera, renderer.domElement);

const onWindowResize = () => {
  width = wrapper.offsetWidth;
  height = wrapper.offsetHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderTarget.setSize(width * ratio, height * ratio);
}

let currentTime;

const tick = (time) => {
  // skip first frame
  if(!currentTime) {
    currentTime = time;
    requestAnimationFrame(tick);
    return;
  }

  const deltaTime = time - currentTime;
  currentTime = time;

  controls.update();

  particleMesh.visible = false;

  foxMixer.update(deltaTime / 1000);

  const ctx = renderer.getContext();

  particleMesh.material.uniforms.uTime.value = time;

  renderer.setRenderTarget(renderTarget);

  ctx.colorMask(false, false, false, false);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);

  particleMesh.visible = true;

  particleMesh.material.uniforms.uDepthTexture.value = renderTarget.depthTexture;
  particleMesh.material.uniforms.uCameraNear.value = camera.near;
  particleMesh.material.uniforms.uCameraFar.value = camera.far;
  particleMesh.material.uniforms.uDepthFade.value = params.depthFade;
  particleMesh.material.uniforms.uResolution.value = new THREE.Vector2(
    width * ratio, height * ratio
  );
  particleMesh.material.uniforms.uEnableFade.value = params.enableFadeBit;
  particleMesh.material.uniforms.uColor.value.x = params.color.r / 255;
  particleMesh.material.uniforms.uColor.value.y = params.color.g / 255;
  particleMesh.material.uniforms.uColor.value.z = params.color.b / 255;
  particleMesh.material.uniforms.uColor.value.w = params.color.a;

  ctx.colorMask(true, true, true, true);
  renderer.render(scene, camera);

  requestAnimationFrame(tick);
}

async function main() {
  particleMesh = await createParticle();
  scene.add(particleMesh);

  foxMesh = await createFox();
  // foxMesh.castShadow = true;
  console.log(foxMesh)
  scene.add(foxMesh);

  const directionalLight = new THREE.DirectionalLight();
  directionalLight.intensity = 0.7;
  directionalLight.position.copy(new THREE.Vector3(1, 1, 1));
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 512;
  directionalLight.shadow.mapSize.height = 512;
  directionalLight.shadow.mapSize.near = 0.1;
  directionalLight.shadow.mapSize.far = 5;
  scene.add(directionalLight);

  const ambientLight = new THREE.AmbientLight(0xffffff);
  ambientLight.intensity = 0.7;
  scene.add(ambientLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(50, 50),
    new THREE.MeshStandardMaterial({
      color: 0x68686b,
      // color: 0xcccccc,
      roughness: 1,
      metalness: 0,
      // fog: true,
    }),
  );
  floor.receiveShadow = true;
  floor.rotation.x -= 90 * Math.PI / 180;
  scene.add(floor);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xff0000
    })
  );
  // scene.add(cube);

  onWindowResize();
  window.addEventListener("resize", () => onWindowResize());

  requestAnimationFrame(tick);
}

main();
