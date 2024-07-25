let scene, camera, renderer, audioContext, analyser, dataArray;
let blob;
let audioSource;
let particles;
let raycaster, mouse;
let isDragging = false;
let canvas2D, ctx2D;

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Create blob-like shape
  const geometry = new THREE.SphereGeometry(1, 64, 64);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      audioFrequency: { value: 0 },
    },
    vertexShader: `
      uniform float time;
      uniform float audioFrequency;
      varying vec2 vUv;
      varying vec3 vNormal;
      
      //	Simplex 3D Noise 
      //	by Ian McEwan, Ashima Arts
      vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

      float snoise(vec3 v){ 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 =   v - i + dot(i, C.xxx) ;

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;

        i = mod(i, 289.0 );
        vec4 p = permute( permute( permute( 
                  i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

        float n_ = 1.0/7.0;
        vec3  ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z *ns.z);

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );

        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                      dot(p2,x2), dot(p3,x3) ) );
      }

      void main() {
        vUv = uv;
        vNormal = normal;
        vec3 pos = position;
        
        // Create blob-like deformation
        float noiseFreq = 2.0;
        float noiseAmp = 0.2 + audioFrequency * 0.3;
        vec3 noisePos = vec3(pos.x * noiseFreq + time, pos.y * noiseFreq + time, pos.z * noiseFreq + time);
        pos += normal * snoise(noisePos) * noiseAmp;
        
        // Add bouncy effect
        pos.y += sin(time * 3.0) * 0.1;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float audioFrequency;
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vec3 color1 = vec3(0.1, 0.4, 0.8);  // Blue
        vec3 color2 = vec3(0.8, 0.1, 0.5);  // Pink
        vec3 color = mix(color1, color2, audioFrequency);
        
        // Add shiny effect
        float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        color = mix(color, vec3(1.0), fresnel * 0.5);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  blob = new THREE.Mesh(geometry, material);
  scene.add(blob);

  // Create particles
  particles = new THREE.Group();
  const particleGeometry = new THREE.BufferGeometry();
  const particleCount = 1000;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 10;
  }
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.05,
    color: 0xffffff,
  });
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particles.add(particleSystem);
  scene.add(particles);

  camera.position.z = 5;

  // Setup raycaster for interactivity
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Setup 2D canvas
  canvas2D = document.getElementById("overlay2D");
  ctx2D = canvas2D.getContext("2d");
  resizeCanvas();

  // Event listeners
  window.addEventListener("resize", onWindowResize, false);
  renderer.domElement.addEventListener("mousedown", onMouseDown, false);
  renderer.domElement.addEventListener("mousemove", onMouseMove, false);
  renderer.domElement.addEventListener("mouseup", onMouseUp, false);

  animate();
}

function setupAudio(audioBuffer) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  dataArray = new Uint8Array(analyser.frequencyBinCount);

  audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(analyser);
  analyser.connect(audioContext.destination);
  audioSource.start(0);
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  if (analyser) {
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedAverage = average / 256;

    blob.material.uniforms.time.value = time;
    blob.material.uniforms.audioFrequency.value = normalizedAverage;

    particles.children[0].material.color.setHSL(normalizedAverage, 1, 0.5);
    particles.rotation.y = time * 0.1;
  }

  // Update 2D canvas
  updateCanvas2D();

  renderer.render(scene, camera);
}

function updateCanvas2D() {
  ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);

  if (analyser) {
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedAverage = average / 256;

    // Draw circular audio visualizer
    const centerX = canvas2D.width / 2;
    const centerY = canvas2D.height / 2;
    const maxRadius = Math.min(canvas2D.width, canvas2D.height) / 4;

    // Create gradient for circular visualizer
    const gradient = ctx2D.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      maxRadius
    );
    gradient.addColorStop(0, `hsl(${normalizedAverage * 360}, 100%, 50%)`);
    gradient.addColorStop(
      0.5,
      `hsl(${(normalizedAverage * 360 + 120) % 360}, 100%, 50%)`
    );
    gradient.addColorStop(
      1,
      `hsl(${(normalizedAverage * 360 + 240) % 360}, 100%, 50%)`
    );

    ctx2D.beginPath();
    ctx2D.arc(centerX, centerY, maxRadius * normalizedAverage, 0, Math.PI * 2);
    ctx2D.strokeStyle = gradient;
    ctx2D.lineWidth = 10;
    ctx2D.stroke();

    // Draw frequency bars
    const barWidth = canvas2D.width / analyser.frequencyBinCount;
    for (let i = 0; i < analyser.frequencyBinCount; i++) {
      const barHeight = ((dataArray[i] / 256) * canvas2D.height) / 2;

      // Calculate hue based on frequency and volume
      const hue = (i / analyser.frequencyBinCount) * 360;
      const lightness = 50 + (dataArray[i] / 256) * 50;

      ctx2D.fillStyle = `hsl(${hue}, 100%, ${lightness}%)`;
      ctx2D.fillRect(
        i * barWidth,
        canvas2D.height - barHeight,
        barWidth - 1,
        barHeight
      );
    }

    // Add text display for current frequency
    ctx2D.font = "24px Arial";
    ctx2D.fillStyle = "white";
    ctx2D.textAlign = "center";
    ctx2D.fillText(
      `Frequency: ${Math.round(normalizedAverage * 1000)} Hz`,
      centerX,
      30
    );
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeCanvas();
}

function resizeCanvas() {
  canvas2D.width = window.innerWidth;
  canvas2D.height = window.innerHeight;
}

function onMouseDown(event) {
  event.preventDefault();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(blob);
  if (intersects.length > 0) {
    isDragging = true;
    renderer.domElement.style.cursor = "grabbing";
  }
}

function onMouseMove(event) {
  if (isDragging) {
    const deltaX = event.movementX * 0.01;
    const deltaY = event.movementY * 0.01;
    blob.rotation.y += deltaX;
    blob.rotation.x += deltaY;
  }
}

function onMouseUp() {
  isDragging = false;
  renderer.domElement.style.cursor = "default";
}

init();

// Handle window resizing
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Setup audio file input
const audioInput = document.getElementById("audioInput");
const startButton = document.getElementById("startButton");

audioInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.decodeAudioData(
        arrayBuffer,
        (buffer) => {
          startButton.disabled = false;
          startButton.onclick = () => {
            if (audioSource) {
              audioSource.stop();
            }
            setupAudio(buffer);
          };
        },
        (error) => {
          console.error("Error decoding audio data:", error);
        }
      );
    };
    reader.readAsArrayBuffer(file);
  }
});
