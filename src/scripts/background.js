/**
 * Celestial wavy-gradient background.
 *
 * Renders a single full-screen WebGL fragment shader: domain-warped fractal
 * noise drives a flowing multi-stop gradient (indigo -> violet -> teal -> rose),
 * with a soft aurora band and a twinkling starfield composited on top.
 *
 * Gracefully degrades:
 *   - No WebGL            -> hide canvas, reveal CSS gradient fallback.
 *   - prefers-reduced-motion -> render a single static frame, no RAF loop.
 *   - tab hidden          -> pause the RAF loop, resume on return.
 */

const VERTEX_SRC = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SRC = `
  precision highp float;

  uniform vec2  u_resolution;
  uniform float u_time;

  // Celestial palette (linear-ish, tuned by eye).
  const vec3 C_DEEP   = vec3(0.043, 0.031, 0.129); // near-black indigo
  const vec3 C_INDIGO = vec3(0.180, 0.118, 0.416); // indigo
  const vec3 C_VIOLET = vec3(0.435, 0.216, 0.635); // violet
  const vec3 C_TEAL   = vec3(0.153, 0.502, 0.545); // teal
  const vec3 C_ROSE   = vec3(0.945, 0.596, 0.678); // soft rose highlight

  // --- hash / value noise ---------------------------------------------------
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // smootherstep
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash(i + vec2(0.0, 0.0));
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Fractal Brownian motion.
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 6; i++) {
      v += amp * noise(p);
      p = rot * p * 2.0 + 0.03;
      amp *= 0.5;
    }
    return v;
  }

  // Starfield: sparse twinkling points on a grid.
  float stars(vec2 uv, float t) {
    float total = 0.0;
    // two layers at different scales for depth
    for (int layer = 0; layer < 2; layer++) {
      float scale = 120.0 + float(layer) * 90.0;
      vec2 gv = uv * scale;
      vec2 id = floor(gv);
      vec2 f  = fract(gv) - 0.5;
      float rnd = hash(id + float(layer) * 37.0);
      // only a fraction of cells hold a star
      if (rnd > 0.955) {
        float d = length(f);
        float twinkle = 0.55 + 0.45 * sin(t * 2.2 + rnd * 42.0);
        float star = smoothstep(0.12, 0.0, d) * twinkle;
        total += star * (0.6 + 0.4 * float(layer));
      }
    }
    return total;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    // aspect-correct coords centered at 0
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

    float t = u_time * 0.06;

    // Domain warp: fbm of fbm -> slow flowing waves.
    vec2 q = vec2(fbm(p * 1.6 + vec2(0.0, t)),
                  fbm(p * 1.6 + vec2(5.2, 1.3 - t)));
    vec2 r = vec2(fbm(p * 1.6 + 3.0 * q + vec2(1.7, 9.2) + 0.15 * t),
                  fbm(p * 1.6 + 3.0 * q + vec2(8.3, 2.8) - 0.12 * t));
    float f = fbm(p * 1.6 + 3.5 * r);

    // Map the field through the palette.
    vec3 col = C_DEEP;
    col = mix(col, C_INDIGO, smoothstep(0.0, 0.55, f));
    col = mix(col, C_VIOLET, smoothstep(0.35, 0.75, f));
    col = mix(col, C_TEAL,   smoothstep(0.55, 0.95, length(r)));
    col = mix(col, C_ROSE,   smoothstep(0.75, 1.05, f + 0.25 * length(q)));

    // Aurora band — a soft luminous ribbon that drifts vertically.
    float band = exp(-8.0 * pow(p.y - 0.18 * sin(p.x * 1.5 + t * 3.0) - 0.05, 2.0));
    col += band * mix(C_TEAL, C_ROSE, 0.5 + 0.5 * sin(t * 2.0)) * 0.35;

    // Vignette to sink the edges and lift the center.
    float vig = smoothstep(1.25, 0.25, length(p));
    col *= 0.65 + 0.35 * vig;

    // Stars over the darker regions.
    float darkMask = smoothstep(0.55, 0.15, f);
    col += stars(uv, u_time) * darkMask * vec3(0.9, 0.93, 1.0);

    // Subtle grain to avoid banding on gradients.
    col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.02;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function initCelestialBackground(canvas) {
  const gl =
    canvas.getContext('webgl', { antialias: false, alpha: false }) ||
    canvas.getContext('experimental-webgl', { antialias: false, alpha: false });

  if (!gl) {
    // No WebGL — let the CSS fallback show through.
    canvas.classList.add('is-unavailable');
    document.body.classList.add('bg-fallback');
    return;
  }

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  if (!vs || !fs) {
    canvas.classList.add('is-unavailable');
    document.body.classList.add('bg-fallback');
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    canvas.classList.add('is-unavailable');
    document.body.classList.add('bg-fallback');
    return;
  }
  gl.useProgram(program);

  // Full-screen triangle pair.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, 'u_resolution');
  const uTime = gl.getUniformLocation(program, 'u_time');

  // Cap device pixel ratio for perf; noise fill is fragment-heavy.
  const DPR_CAP = 1.5;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function render(timeMs) {
    resize();
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, timeMs * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  let rafId = null;
  let running = false;
  const startTime = performance.now();

  function loop(now) {
    render(now - startTime);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function applyMotionPreference() {
    if (reduceMotion.matches) {
      stop();
      // Single static frame at a pleasant moment in the animation.
      resize();
      render(8000);
    } else {
      start();
    }
  }

  // React to preference changes live.
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', applyMotionPreference);
  } else if (reduceMotion.addListener) {
    reduceMotion.addListener(applyMotionPreference); // older Safari
  }

  // Pause when the tab is hidden to save the battery.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      applyMotionPreference();
    }
  });

  window.addEventListener('resize', () => {
    if (!running) render(reduceMotion.matches ? 8000 : performance.now() - startTime);
  });

  applyMotionPreference();
}
