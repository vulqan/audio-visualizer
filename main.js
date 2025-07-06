import * as THREE from 'https://cdn.skypack.dev/three@0.150.1';

let camera, scene, renderer, analyser, uniforms;
let particleCount = 10000;
let geometry, material, points;
let dataArray;
let bassLevel = 0;
let shapeIndex = 0;
let lastShapeChange = 0;
let frequencyBand = 'bass';
let audio;
let audioContext;

let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let groupRotation = { x: 0, y: 0 };
let autoRotate = false;
let autoRotateTimeout;
let dragMoved = false;

const TOTAL_SHAPES = 15;
const shapePositions = [];

const startButton = document.getElementById('startButton');
startButton.style.display = 'block';

const uiContainer = document.getElementById('uiContainer');
const bandSelectorContainer = document.createElement('div');
bandSelectorContainer.innerHTML = `
  <label>
    Frequency Trigger:
    <select id="bandSelector">
      <option value="bass">Bass</option>
      <option value="mid">Mid</option>
      <option value="treble">Treble</option>
    </select>
  </label>
`;
uiContainer.appendChild(bandSelectorContainer);

document.getElementById('bandSelector').addEventListener('change', (e) => {
  frequencyBand = e.target.value;
});

startButton.addEventListener('click', async () => {
  startButton.style.display = 'none';
  await init();
  animate();
  uiContainer.style.display = 'flex';
});

document.getElementById('playBtn').addEventListener('click', () => {
  if (audio.paused) {
    audio.play();
    audioContext.resume();
  }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
  if (!audio.paused) {
    audio.pause();
  }
});

function generateShape(shapeIdx) {
  const arr = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const id = i * 0.01;
    let pos = [0, 0, 0];
    if (shapeIdx < 1) pos = [Math.cos(id) * Math.sin(id), Math.sin(id), Math.cos(id)];
    else if (shapeIdx < 2) pos = [Math.sin(id) * 0.5, Math.cos(id * 2) * 0.3, Math.sin(id * 3)];
    else if (shapeIdx < 3) pos = [Math.cos(id * 2) * Math.sin(id), Math.sin(id * 1.5), Math.cos(id * 3)];
    else if (shapeIdx < 4) pos = [Math.sin(id * 3), Math.sin(id * 0.5), Math.cos(id * 1.5)];
    else if (shapeIdx < 5) pos = [Math.sin(id * 5), Math.sin(id * 2), Math.cos(id * 3)];
    else if (shapeIdx < 6) pos = [Math.sin(id) + Math.cos(id * 1.3), Math.cos(id * 1.7), Math.sin(id * 2.5)];
    else if (shapeIdx < 7) pos = [Math.sin(id * 1.2) * Math.cos(id), Math.sin(id), Math.sin(id * 2.2)];
    else if (shapeIdx < 8) pos = [Math.cos(id * 1.5) * Math.cos(id), Math.sin(id * 2.5), Math.sin(id * 1.3)];
    else if (shapeIdx < 9) pos = [Math.cos(id * 3.5), Math.sin(id * 1.1), Math.sin(id)];
    else if (shapeIdx < 10) pos = [Math.sin(id * 0.9), Math.sin(id * 3), Math.cos(id * 4)];
    else if (shapeIdx < 11) pos = [Math.sin(id * 6) * 0.3, Math.cos(id * 3), Math.sin(id * 2)];
    else if (shapeIdx < 12) pos = [Math.sin(id * 2), Math.cos(id * 4), Math.cos(id * 0.5)];
    else if (shapeIdx < 13) pos = [Math.sin(id) * Math.cos(id * 1.1), Math.cos(id) * Math.sin(id), Math.sin(id * 1.7)];
    else if (shapeIdx < 14) pos = [Math.cos(id * 1.8), Math.sin(id * 1.4), Math.sin(id * 2.6)];
    else pos = [Math.sin(id * 0.6), Math.cos(id * 2.3), Math.sin(id * 1.2)];

    arr[i * 3 + 0] = pos[0] * 0.7;
    arr[i * 3 + 1] = pos[1] * 0.7;
    arr[i * 3 + 2] = pos[2] * 0.7;
  }
  return arr;
}

function setMorphTarget(fromIdx, toIdx) {
  geometry.attributes.startPos.copyArray(shapePositions[fromIdx]);
  geometry.attributes.endPos.copyArray(shapePositions[toIdx]);
  geometry.attributes.startPos.needsUpdate = true;
  geometry.attributes.endPos.needsUpdate = true;
  uniforms.u_morphProgress.value = 0.0;
}

async function init() {
  audio = new Audio('floating-abstract-reinvention.mp3');
  audio.crossOrigin = 'anonymous';
  audio.loop = true;

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();

  const src = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();
  src.connect(analyser);
  analyser.connect(audioContext.destination);
  analyser.fftSize = 256;
  dataArray = new Uint8Array(analyser.frequencyBinCount);

  await audio.play().catch(e => console.error("Audio play error:", e));

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 3.0;

  for (let i = 0; i < TOTAL_SHAPES; i++) shapePositions.push(generateShape(i));

  geometry = new THREE.InstancedBufferGeometry();
  const baseGeom = new THREE.BufferGeometry();
  baseGeom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute('position', baseGeom.getAttribute('position'));

  const ids = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) ids[i] = i;
  geometry.setAttribute('id', new THREE.InstancedBufferAttribute(ids, 1));

  const startShape = shapePositions[0].slice();
  const endShape = shapePositions[1].slice();

  geometry.setAttribute('startPos', new THREE.InstancedBufferAttribute(startShape, 3));
  geometry.setAttribute('endPos', new THREE.InstancedBufferAttribute(endShape, 3));

  const audioTexture = new THREE.DataTexture(dataArray, dataArray.length, 1, THREE.RedFormat, THREE.UnsignedByteType);
  audioTexture.needsUpdate = true;
  audioTexture.magFilter = THREE.NearestFilter;
  audioTexture.minFilter = THREE.NearestFilter;
  audioTexture.unpackAlignment = 1;

  uniforms = {
    u_time: { value: 0.0 },
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_audio: { value: audioTexture },
    u_morphProgress: { value: 0.0 },
    uColorStart: { value: new THREE.Color(0xff00ff) },
    uColorEnd: { value: new THREE.Color(0x00ffff) }
  };

  material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
    attribute float id;
    attribute vec3 startPos;
    attribute vec3 endPos;
    uniform float u_morphProgress;
    uniform float u_time;
    uniform sampler2D u_audio;
    varying float v_id;

    void main() {
      float audioVal = texture2D(u_audio, vec2(clamp(fract(id / 256.0), 0.0, 0.999), 0.0)).r;
      vec3 pos = mix(startPos, endPos, smoothstep(0.0, 1.0, u_morphProgress));

      float noise = sin(pos.x * 10.0 + u_time * 1.5 + id * 0.1) * 0.05;
      pos += normalize(pos) * noise * (0.3 + audioVal * 1.0);

      vec3 flowOffset = vec3(
        sin(u_time * 1.3 + id * 0.22),
        cos(u_time * 0.7 + id * 0.17),
        sin(u_time * 1.1 + id * 0.27)
      ) * (0.07 + audioVal * 0.12);
      pos += flowOffset;

      float angle = u_time + id * 0.005;
      float vortexR = 0.2 + audioVal * 0.5;
      pos.xz += vec2(sin(angle), cos(angle)) * vortexR * 0.25 * sin(id * 0.05 + u_time);

      pos.y += sin(u_time * 2.0 + id * 0.01) * 0.07 * audioVal;

      float radial = length(pos.xy);
      pos.xy += normalize(pos.xy) * 0.1 * sin(u_time * 6.0 + radial * 12.0 + id * 0.003) * audioVal;

      if (mod(id, 100.0) < 10.0) {
        pos.xy += vec2(sin(u_time * 3.0), cos(u_time * 2.0)) * 0.13 * audioVal;
      }

      v_id = id;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = 2.5 + audioVal * 3.0;
    }
    `,
    fragmentShader: `
    precision highp float;
    uniform float u_time;
    uniform sampler2D u_audio;
    uniform vec3 uColorStart;
    uniform vec3 uColorEnd;
    varying float v_id;

    void main() {
      float audioVal = texture2D(u_audio, vec2(clamp(fract(v_id / 256.0), 0.0, 0.999), 0.0)).r;
      float dist = length(gl_PointCoord - vec2(0.5));
      float trailFade = smoothstep(0.5, 0.0, dist);
      float timeFade = 0.5 + 0.5 * sin(u_time * 2.0 + v_id * 0.01);
      float alpha = trailFade * timeFade;

      vec3 color = mix(uColorStart, uColorEnd, audioVal);
      color += 0.1 * sin(vec3(v_id * 0.005 + u_time, v_id * 0.007 + u_time, v_id * 0.01 + u_time));

      gl_FragColor = vec4(color, alpha * audioVal * 2.0);
    }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
  });

  // Mouse interaction
  renderer.domElement.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragMoved = false;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('mouseup', () => {
    isDragging = false;
    if (!dragMoved) {
      autoRotate = true;
      clearTimeout(autoRotateTimeout);
      autoRotateTimeout = setTimeout(() => {
        autoRotate = false;
      }, 5000);
    }
  });

  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) dragMoved = true;

    previousMousePosition = { x: e.clientX, y: e.clientY };
    groupRotation.y += deltaX * 0.005;
    groupRotation.x += deltaY * 0.005;
  });
}

function animate() {
  requestAnimationFrame(animate);
  analyser.getByteFrequencyData(dataArray);

  let bandStart = 0, bandEnd = 8;
  if (frequencyBand === 'mid') { bandStart = 32; bandEnd = 64; }
  else if (frequencyBand === 'treble') { bandStart = 128; bandEnd = 256; }

  let band = 0;
  for (let i = bandStart; i < bandEnd; i++) band += dataArray[i];
  band /= (bandEnd - bandStart);
  bassLevel = band / 255.0;

  const now = performance.now();
  const morphInterval = 15000;
  if ((bassLevel > 0.5 && now - lastShapeChange > 1500) || (now - lastShapeChange > morphInterval)) {
    const prev = shapeIndex;
    let next = Math.floor(Math.random() * TOTAL_SHAPES);
    while (next === prev) next = Math.floor(Math.random() * TOTAL_SHAPES);
    shapeIndex = next;
    setMorphTarget(prev, next);
    lastShapeChange = now;
  }

  if (uniforms.u_morphProgress.value < 1.0) {
    uniforms.u_morphProgress.value += 0.03;
  }

  uniforms.u_time.value += 0.01;
  const hue = (uniforms.u_time.value * 0.1) % 1.0;
  uniforms.uColorStart.value.setHSL(hue, 0.8, 0.5);
  uniforms.uColorEnd.value.setHSL((hue + 0.3) % 1.0, 0.8, 0.5);
  uniforms.u_audio.value.image.data.set(dataArray);
  uniforms.u_audio.value.needsUpdate = true;

  if (autoRotate) {
    groupRotation.y += 0.01;
  }

  // 🌀 Hier: Rotation anwenden
  points.rotation.y = groupRotation.y;
  points.rotation.x = groupRotation.x;

  camera.lookAt(scene.position);
  renderer.render(scene, camera);
}
