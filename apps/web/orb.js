// A single hand-rolled WebGL shader (no library) rendering a soft, slowly drifting gradient
// orb behind the hero - domain-warped simplex noise, not a canned particle/blob library.
// Falls back to doing nothing (canvas stays empty, hero still reads fine) if WebGL is
// unavailable - never fakes the effect with a static image.

const canvas = document.getElementById("orb");
const gl = canvas && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
if (gl) start(gl);

function start(gl) {
  const vertexSrc = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  // Simplex noise: Ashima Arts' widely-reused public implementation, not written from
  // scratch here - the domain warp and orb shaping around it is.
  const fragmentSrc = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uAlpha;

    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      float t = uTime * 0.045;
      vec2 warp = vec2(snoise(uv * 1.1 + t), snoise(uv * 1.1 - t + 5.0)) * 0.55;
      float n = snoise((uv + warp) * 1.4 + t);
      float dist = length(uv);
      float falloff = smoothstep(0.72, 0.05, dist);
      float orb = falloff * (0.55 + 0.45 * n);
      vec3 color = mix(uColorB, uColorA, clamp(orb, 0.0, 1.0));
      float alpha = pow(falloff, 1.6) * uAlpha * (0.6 + 0.4 * n);
      gl_FragColor = vec4(color, max(alpha, 0.0));
    }
  `;

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uColorA = gl.getUniformLocation(program, "uColorA");
  const uColorB = gl.getUniformLocation(program, "uColorB");
  const uAlpha = gl.getUniformLocation(program, "uAlpha");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const PALETTE = {
    dark: { a: [0.7569, 0.3765, 0.1843], b: [0.102, 0.059, 0.039], alpha: 0.95 },
    light: { a: [0.68, 0.32, 0.14], b: [0.941, 0.867, 0.816], alpha: 0.8 },
  };

  function currentTheme() {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startTime = performance.now();

  function frame(now) {
    resize();
    const palette = PALETTE[currentTheme()];
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, reducedMotion ? 0 : (now - startTime) / 1000);
    gl.uniform3fv(uColorA, palette.a);
    gl.uniform3fv(uColorB, palette.b);
    gl.uniform1f(uAlpha, palette.alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reducedMotion) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.addEventListener("resize", resize);
}
