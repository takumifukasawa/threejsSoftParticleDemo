

console.log("run");

let width, height;

function createParticle() {
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

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;


  void main() {
    vUv = uv;
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
    vViewPosition = mvPosition;
    float anim = sin((uTime * 2. + index * 100.) / 1000.) * .5 + .5;
    anim = 1.;
    mvPosition.xy += offset * vec2(size.x, size.y) * anim;
    gl_Position = projectionMatrix * mvPosition;
  }
  `;

  const fragmentShader = `
  precision highp float;
  #include <packing>

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec4 vViewPosition;

  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform vec2 uResolution;
  uniform sampler2D uDepthTexture;
  uniform float uDepthFade;

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
    // #include <alphatest_fragment>
    // gl_FragColor = diffuseColor;

    vec2 screenCoord = vec2(
      gl_FragCoord.x / uResolution.x,
      gl_FragCoord.y / uResolution.y
    );

    float sceneDepth = readDepth(uDepthTexture, screenCoord);

    float viewZ = vViewPosition.z;
    float currentDepth = viewZToOrthographicDepth(viewZ, uCameraNear, uCameraFar);
    float fade = clamp(abs(currentDepth - sceneDepth) / max(uDepthFade, .0001), 0., 1.);

    // gl_FragColor = vec4(vec3(currentDepth), 1.);
    gl_FragColor = vec4(vec3(1.), fade);
  }
  `;

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

  const particleNum = 1;
  const randomOffsetRange = 2;
  const sizeRange = 2.;
  const sizeMin = 0.4;

  for(let i = 0; i < particleNum; i++) {
    const px = Math.random() * randomOffsetRange - randomOffsetRange * 0.5;
    const py = Math.random() * 1 - 0.5;
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
    alphaTest: 0.01,
    depthWrite: false,
    uniforms: {
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
    },
  });

  return new THREE.Mesh(geometry, material);

    // material.uniforms.uTime.value = time;
}


const params = {
  depthFade: 0.02,
};

const pane = new Tweakpane();
pane.addInput(params, "depthFade", {
  min: 0,
  max: 0.2,
  step: 0.0001
});

const wrapper = document.querySelector(".js-wrapper");
const canvas = document.querySelector(".js-canvas");

const renderer = new THREE.WebGLRenderer({ canvas });
const ratio = Math.min(window.devicePixelRatio, .5);

renderer.setPixelRatio(ratio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
camera.position.set(0, 0, 5);
camera.lookAt(new THREE.Vector3(0, 0, 0));

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

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({
    color: 0xff0000
  })
);

scene.add(cube);

const particleMesh = createParticle();
scene.add(particleMesh);

// const particleVertexShader = document.querySelector("#particle-vertex").textContent;
// const particleFragmentShader = document.querySelector("#particle-fragment").textContent;
// 
// const testMesh = new THREE.Mesh(
//   new THREE.BoxGeometry(1, 1, 1),
//   new THREE.RawShaderMaterial({
//     vertexShader: particleVertexShader,
//     fragmentShader: particleFragmentShader,
//     uniforms: {
//       tDepth: {
//         value: null
//       },
//       cameraNear: {
//         value: 0
//       },
//       cameraFar: {
//         value: 0
//       },
//       depthFade: {
//         value: 0,
//       },
//       resolution: {
//         value: new THREE.Vector2(),
//       }
//     },
//     transparent: true
//   })
// );

// testMesh.position.copy(new THREE.Vector3(0.5, 0.5, 0.5));
// scene.add(testMesh);

// const postprocessScene = new THREE.Scene();
// const postprocessCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// 
// const postprocessVertexShader = document.querySelector("#postprocess-vertex").textContent;
// const postprocessFragmentShader = document.querySelector("#postprocess-fragment").textContent;
// 
// const postprocessQuad = new THREE.Mesh(
//   new THREE.PlaneBufferGeometry(2, 2),
//   new THREE.RawShaderMaterial({
//     vertexShader: postprocessVertexShader,
//     fragmentShader: postprocessFragmentShader,
//     uniforms: {
//       tDiffuse: {
//         value: null
//       },
//       tDepth: {
//         value: null
//       },
//       cameraNear: {
//         value: 0
//       },
//       cameraFar: {
//         value: 0
//       }
//     }
//   })
// );
// 
// postprocessScene.add(postprocessQuad);

const onWindowResize = () => {
  width = wrapper.offsetWidth;
  height = wrapper.offsetHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderTarget.setSize(width * ratio, height * ratio);
}

onWindowResize();
window.addEventListener("resize", () => onWindowResize());

const tick = (time) => {
  controls.update();

  // testMesh.visible = false;
  particleMesh.visible = false;

  const ctx = renderer.getContext();

  particleMesh.material.uniforms.uTime.value = time;

  renderer.setRenderTarget(renderTarget);

  ctx.colorMask(false, false, false, false);
  renderer.render(scene, camera);

  // postprocessQuad.material.uniforms.tDiffuse.value = renderTarget.texture;
  // postprocessQuad.material.uniforms.tDepth.value = renderTarget.depthTexture;
  // postprocessQuad.material.uniforms.cameraNear.value = camera.near;
  // postprocessQuad.material.uniforms.cameraFar.value = camera.far;

  renderer.setRenderTarget(null);

  // testMesh.visible = true;
  particleMesh.visible = true;

  // testMesh.material.uniforms.tDepth.value = renderTarget.depthTexture;
  // testMesh.material.uniforms.cameraNear.value = camera.near;
  // testMesh.material.uniforms.cameraFar.value = camera.far;
  // testMesh.material.uniforms.depthFade.value = params.depthFade;
  // testMesh.material.uniforms.resolution.value = new THREE.Vector2(
  //   width * ratio, height * ratio
  // );

  particleMesh.material.uniforms.uDepthTexture.value = renderTarget.depthTexture;
  particleMesh.material.uniforms.uCameraNear.value = camera.near;
  particleMesh.material.uniforms.uCameraFar.value = camera.far;
  particleMesh.material.uniforms.uDepthFade.value = params.depthFade;
  particleMesh.material.uniforms.uResolution.value = new THREE.Vector2(
    width * ratio, height * ratio
  );

  ctx.colorMask(true, true, true, true);
  renderer.render(scene, camera);

  // renderer.render(postprocessScene, postprocessCamera);

  requestAnimationFrame(tick);
}


async function main() {
  requestAnimationFrame(tick);
}

main();
