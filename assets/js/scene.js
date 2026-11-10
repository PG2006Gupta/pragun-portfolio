/* ============================================================
   SCENE — a hand-written WebGL2 environment
   Layered architectural volumes · floating shards · drifting dust
   Soft studio lighting · exponential depth fog · gentle parallax
   No libraries. No CDN. Runs entirely from this file.
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('scene');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: true,
    depth: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: false
  });

  if (!gl) {
    document.documentElement.classList.add('no-webgl');
    return;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- math ---------------- */
  const M = {
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    },
    lookAt(eye, center, up) {
      let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
      let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
        1
      ]);
    },
    multiply(a, b) {
      const o = new Float32Array(16);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
          o[i * 4 + j] = s;
        }
      }
      return o;
    }
  };

  const rng = (function (seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })(20261109);

  /* ---------------- shaders ---------------- */
  const vsBox = `#version 300 es
  precision highp float;
  in vec3 aPos;
  in vec3 aNormal;
  in vec3 iPos;
  in vec3 iScale;
  in vec3 iRot;
  uniform mat4 uProj;
  uniform mat4 uView;
  uniform float uTime;
  out vec3 vNormal;
  out vec3 vWorld;
  out float vDepthSeed;

  vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
  vec3 rotX(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }

  void main(){
    vec3 p = aPos * iScale;
    vec3 n = aNormal;
    p = rotY(p, iRot.x);  n = rotY(n, iRot.x);
    p = rotX(p, iRot.y);  n = rotX(n, iRot.y);
    p += iPos;
    vNormal = normalize(n);
    vWorld = p;
    vDepthSeed = iRot.z;
    gl_Position = uProj * uView * vec4(p, 1.0);
  }`;

  const fsBox = `#version 300 es
  precision highp float;
  in vec3 vNormal;
  in vec3 vWorld;
  in float vDepthSeed;
  uniform vec3 uCam;
  uniform vec3 uFog;
  uniform vec3 uAccent;
  uniform float uTime;
  out vec4 fragColor;

  void main(){
    vec3 n = normalize(vNormal);
    vec3 V = normalize(uCam - vWorld);

    vec3 keyDir  = normalize(vec3(0.42, 0.92, 0.30));
    vec3 fillDir = normalize(vec3(-0.85, 0.18, -0.45));

    float key  = max(dot(n, keyDir), 0.0);
    float fill = max(dot(n, fillDir), 0.0);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.2);

    vec3 base = vec3(0.014, 0.014, 0.021);
    vec3 col  = base * (0.70 + 1.15 * key);
    col += uAccent * fill * 0.15;
    col += uAccent * fres * 0.40;

    // pale sheen on upward faces
    col += vec3(0.30, 0.29, 0.44) * smoothstep(0.90, 1.0, n.y) * 0.20;
    // ambient vertical light — the space brightens toward the ceiling
    col *= mix(0.55, 1.0, smoothstep(-10.0, 1.5, vWorld.y));
    col *= mix(0.42, 1.30, smoothstep(-14.0, 16.0, vWorld.y));

    float dist = length(uCam - vWorld);
    float fog  = 1.0 - exp(-pow(max(dist - 5.0, 0.0) * 0.085, 1.45));
    col = mix(col, uFog, clamp(fog, 0.0, 1.0));

    fragColor = vec4(col, 1.0);
  }`;

  const vsShard = `#version 300 es
  precision highp float;
  in vec3 aPos;
  in vec3 aNormal;
  in vec3 iPos;
  in vec3 iScale;
  in vec3 iRot;
  in float iPhase;
  uniform mat4 uProj;
  uniform mat4 uView;
  uniform float uTime;
  out vec3 vNormal;
  out vec3 vWorld;

  vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
  vec3 rotX(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }

  void main(){
    float t = uTime * 0.22 + iPhase;
    vec3 p = aPos * iScale;
    vec3 n = aNormal;
    p = rotY(p, iRot.x + t * 0.7);  n = rotY(n, iRot.x + t * 0.7);
    p = rotX(p, iRot.y + t * 0.45); n = rotX(n, iRot.y + t * 0.45);
    p += iPos;
    p.y += sin(t * 1.1) * 0.22;
    p.x += cos(t * 0.8) * 0.14;
    vNormal = normalize(n);
    vWorld = p;
    gl_Position = uProj * uView * vec4(p, 1.0);
  }`;

  const fsShard = `#version 300 es
  precision highp float;
  in vec3 vNormal;
  in vec3 vWorld;
  uniform vec3 uCam;
  uniform vec3 uFog;
  uniform vec3 uAccent;
  out vec4 fragColor;

  void main(){
    vec3 n = normalize(vNormal);
    vec3 V = normalize(uCam - vWorld);
    float key  = max(dot(n, normalize(vec3(0.4, 0.95, 0.35))), 0.0);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 1.7);

    vec3 col = vec3(0.020, 0.020, 0.032) * (0.7 + 1.6 * key);
    col += uAccent * (0.10 + fres * 0.70);
    col += vec3(0.48, 0.46, 0.66) * pow(key, 8.0) * 0.40;

    float dist = length(uCam - vWorld);
    float fog  = 1.0 - exp(-pow(max(dist - 4.0, 0.0) * 0.080, 1.5));
    col = mix(col, uFog, clamp(fog, 0.0, 1.0));
    fragColor = vec4(col, 1.0);
  }`;

  const vsDust = `#version 300 es
  precision highp float;
  in vec3 aPos;
  in float aSeed;
  uniform mat4 uProj;
  uniform mat4 uView;
  uniform float uTime;
  uniform float uPixelRatio;
  out float vAlpha;
  out float vSeed;
  void main(){
    vec3 p = aPos;
    float s = aSeed * 6.283;
    p.x += sin(uTime * 0.11 + s) * 0.9;
    p.y += cos(uTime * 0.09 + s * 1.7) * 0.7 + mod(uTime * 0.09 + aSeed * 12.0, 16.0) * 0.0;
    p.z += sin(uTime * 0.07 + s * 0.7) * 0.7;
    vec4 mv = uView * vec4(p, 1.0);
    gl_Position = uProj * mv;
    float dist = length(mv.xyz);
    gl_PointSize = (1.6 + aSeed * 2.4) * uPixelRatio * (7.0 / max(dist, 1.0));
    vAlpha = smoothstep(40.0, 5.0, dist) * (0.12 + aSeed * 0.34);
    vSeed = aSeed;
  }`;

  const fsDust = `#version 300 es
  precision highp float;
  in float vAlpha;
  in float vSeed;
  uniform vec3 uAccent;
  out vec4 fragColor;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.02, d) * vAlpha;
    if (a < 0.01) discard;
    vec3 col = mix(vec3(0.82, 0.81, 0.95), uAccent, step(0.55, vSeed));
    fragColor = vec4(col, a);
  }`;

  const vsSky = `#version 300 es
  precision highp float;
  in vec2 aPos;
  out vec2 vUv;
  void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const fsSky = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform vec2 uRes;
  uniform float uTime;
  out vec4 fragColor;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main(){
    vec2 uv = vUv;
    vec2 c1 = vec2(0.70, 0.30);
    vec2 c2 = vec2(0.18, 0.85);
    vec2 c3 = vec2(0.52, 0.62);

    float g1 = exp(-pow(length((uv - c1) * vec2(1.0, 0.85)) * 2.1, 2.0));
    float g2 = exp(-pow(length((uv - c2) * vec2(1.3, 0.9)) * 2.6, 2.0));
    float g3 = exp(-pow(length((uv - c3) * vec2(0.85, 1.1)) * 3.4, 2.0));

    vec3 base = vec3(0.027, 0.027, 0.041);
    vec3 col = base;
    col += vec3(0.075, 0.070, 0.155) * g1;
    col += vec3(0.040, 0.052, 0.105) * g2;
    col += vec3(0.055, 0.045, 0.090) * g3;

    // soft horizon band
    col += vec3(0.035, 0.033, 0.060) * smoothstep(0.62, 0.18, uv.y) * smoothstep(0.0, 0.3, uv.y);

    // dither to avoid banding
    float n = hash(uv * uRes * 0.7 + uTime * 0.0001);
    col += (n - 0.5) * 0.006;

    fragColor = vec4(col, 1.0);
  }`;

  /* ---------------- compile helpers ---------------- */
  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[scene] shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  function program(vsSrc, fsSrc) {
    const v = shader(gl.VERTEX_SHADER, vsSrc);
    const f = shader(gl.FRAGMENT_SHADER, fsSrc);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[scene] link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  /* ---------------- geometry ---------------- */
  function boxGeometry() {
    const faces = [
      { n: [0, 0, 1], v: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
      { n: [0, 0, -1], v: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
      { n: [1, 0, 0], v: [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]] },
      { n: [-1, 0, 0], v: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]] },
      { n: [0, 1, 0], v: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
      { n: [0, -1, 0], v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]] }
    ];
    const pos = [], nor = [];
    faces.forEach(f => {
      const [a, b, c, d] = f.v;
      [[a, b, c], [a, c, d]].forEach(tri => tri.forEach(v => {
        pos.push(v[0], v[1], v[2]);
        nor.push(f.n[0], f.n[1], f.n[2]);
      }));
    });
    return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
  }

  function octaGeometry() {
    const t = 1 / Math.sqrt(3);
    const verts = [
      [0, 1, 0], [t, t, t], [t, t, -t],
      [0, 1, 0], [t, t, -t], [-t, t, -t],
      [0, 1, 0], [-t, t, -t], [-t, t, t],
      [0, 1, 0], [-t, t, t], [t, t, t],
      [0, -1, 0], [t, -t, t], [t, -t, -t],
      [0, -1, 0], [-t, -t, t], [t, -t, t],
      [0, -1, 0], [-t, -t, -t], [-t, -t, t],
      [0, -1, 0], [t, -t, -t], [-t, -t, -t]
    ];
    const pos = [], nor = [];
    for (let i = 0; i < verts.length; i += 3) {
      const a = verts[i], b = verts[i + 1], c = verts[i + 2];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1;
      n = n.map(x => x / l);
      [a, b, c].forEach(p => { pos.push(...p); nor.push(...n); });
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
  }

  /* ---------------- instance data ---------------- */
  const volumes = [];

  // far gallery walls — deep, quiet planes that frame the space
  volumes.push({ pos: [-19, 5.5, -34], scale: [0.5, 26, 26], rot: [0.05, 0.04, 0] });
  volumes.push({ pos: [19.5, 5.5, -36], scale: [0.5, 26, 26], rot: [-0.05, -0.04, 0] });

  // monoliths — kept to the outer thirds so the centre stays open
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -13 - i * 3.6 - rng() * 3.0;
    const x = side * (8.4 + rng() * 7.0);
    const h = 5 + rng() * 12;
    const w = 0.7 + rng() * 1.5;
    const d = 0.6 + rng() * 1.8;
    volumes.push({
      pos: [x, h * 0.5 - 4.2 + rng() * 1.2, z],
      scale: [w, h, d],
      rot: [(rng() - 0.5) * 0.26, (rng() - 0.5) * 0.10, rng()]
    });
  }
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    volumes.push({
      pos: [side * (12 + rng() * 6), 2 + rng() * 11, -10 - rng() * 20],
      scale: [0.5 + rng() * 0.9, 10 + rng() * 14, 0.5 + rng() * 1.2],
      rot: [(rng() - 0.5) * 0.2, rng() * 0.4, rng()]
    });
  }

  // floating mezzanine planes — thin horizontal shelves of light
  for (let i = 0; i < 7; i++) {
    volumes.push({
      pos: [(rng() - 0.5) * 15, 4.5 + rng() * 5.5, -16 - rng() * 26],
      scale: [4 + rng() * 9, 0.07 + rng() * 0.10, 1.4 + rng() * 2.6],
      rot: [(rng() - 0.5) * 0.10, rng() * 0.55, rng()]
    });
  }

  // distant silhouettes, dissolving in the fog
  for (let i = 0; i < 11; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    volumes.push({
      pos: [side * (5 + rng() * 22), 4 + rng() * 16, -42 - rng() * 26],
      scale: [2 + rng() * 6, 8 + rng() * 22, 2 + rng() * 6],
      rot: [(rng() - 0.5) * 0.2, rng() * 0.9, rng()]
    });
  }

  const shards = [];
  for (let i = 0; i < 15; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    shards.push({
      pos: [side * (2.6 + rng() * 8.5), -1.0 + rng() * 6.5, -5 - rng() * 24],
      scale: [0.10 + rng() * 0.26, 0.10 + rng() * 0.26, 0.10 + rng() * 0.26],
      rot: [rng() * 6.28, rng() * 6.28, 0],
      phase: rng() * 6.28
    });
  }

  const DUST_COUNT = 520;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustSeed = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = (rng() - 0.5) * 30;
    dustPos[i * 3 + 1] = -4 + rng() * 14;
    dustPos[i * 3 + 2] = 1 - rng() * 34;
    dustSeed[i] = rng();
  }

  /* ---------------- buffers ---------------- */
  const box = boxGeometry();
  const octa = octaGeometry();

  function staticBuffer(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  const boxPosBuf = staticBuffer(box.pos);
  const boxNorBuf = staticBuffer(box.nor);
  const octaPosBuf = staticBuffer(octa.pos);
  const octaNorBuf = staticBuffer(octa.nor);

  function instanceBuffers(list, withPhase) {
    const pos = [], scale = [], rot = [], phase = [];
    list.forEach(o => {
      pos.push(...o.pos); scale.push(...o.scale); rot.push(...o.rot);
      if (withPhase) phase.push(o.phase || 0);
    });
    return {
      pos: staticBuffer(new Float32Array(pos)),
      scale: staticBuffer(new Float32Array(scale)),
      rot: staticBuffer(new Float32Array(rot)),
      phase: withPhase ? staticBuffer(new Float32Array(phase)) : null,
      count: list.length
    };
  }

  const volBuf = instanceBuffers(volumes, false);
  const shardBuf = instanceBuffers(shards, true);

  const dustPosBuf = staticBuffer(dustPos);
  const dustSeedBuf = staticBuffer(dustSeed);
  const quadBuf = staticBuffer(new Float32Array([-1, -1, 3, -1, -1, 3]));

  /* ---------------- programs ---------------- */
  const pSky = program(vsSky, fsSky);
  const pBox = program(vsBox, fsBox);
  const pShard = program(vsShard, fsShard);
  const pDust = program(vsDust, fsDust);

  if (!pSky || !pBox || !pShard || !pDust) return;

  const loc = (p, name) => gl.getAttribLocation(p, name);
  const uni = (p, name) => gl.getUniformLocation(p, name);

  // cache attribute/uniform locations
  const skyLoc = {
    aPos: loc(pSky, 'aPos'),
    uRes: uni(pSky, 'uRes'), uTime: uni(pSky, 'uTime')
  };
  const boxLoc = {
    aPos: loc(pBox, 'aPos'), aNormal: loc(pBox, 'aNormal'),
    iPos: loc(pBox, 'iPos'), iScale: loc(pBox, 'iScale'), iRot: loc(pBox, 'iRot'),
    uProj: uni(pBox, 'uProj'), uView: uni(pBox, 'uView'), uTime: uni(pBox, 'uTime'),
    uCam: uni(pBox, 'uCam'), uFog: uni(pBox, 'uFog'), uAccent: uni(pBox, 'uAccent')
  };
  const shardLoc = {
    aPos: loc(pShard, 'aPos'), aNormal: loc(pShard, 'aNormal'),
    iPos: loc(pShard, 'iPos'), iScale: loc(pShard, 'iScale'), iRot: loc(pShard, 'iRot'), iPhase: loc(pShard, 'iPhase'),
    uProj: uni(pShard, 'uProj'), uView: uni(pShard, 'uView'), uTime: uni(pShard, 'uTime'),
    uCam: uni(pShard, 'uCam'), uFog: uni(pShard, 'uFog'), uAccent: uni(pShard, 'uAccent')
  };
  const dustLoc = {
    aPos: loc(pDust, 'aPos'), aSeed: loc(pDust, 'aSeed'),
    uProj: uni(pDust, 'uProj'), uView: uni(pDust, 'uView'), uTime: uni(pDust, 'uTime'),
    uPixelRatio: uni(pDust, 'uPixelRatio'), uAccent: uni(pDust, 'uAccent')
  };

  /* ---------------- camera state ---------------- */
  const cam = {
    eye: [0, 1.0, 7.4],
    target: [0, 0.2, -8],
    mouseX: 0, mouseY: 0,
    scroll: 0,
    smoothX: 0, smoothY: 0, smoothScroll: 0
  };

  let dpr = 1, W = 1, H = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  window.addEventListener('pointermove', (e) => {
    cam.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    cam.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  let scrollY = window.scrollY || 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY || 0; }, { passive: true });

  /* ---------------- draw helpers ---------------- */
  function bindAttr(buffer, loc, size, divisor) {
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, divisor || 0);
  }

  const FOG = [0.028, 0.028, 0.042];
  const ACCENT = [0.50, 0.48, 0.86];

  let time = 0;
  let running = true;
  let rafId = 0;
  const start = performance.now();

  function frame(now, once) {
    if (!running) return;
    if (!once) rafId = requestAnimationFrame(frame);

    time = (now - start) / 1000;

    // easing towards pointer / scroll targets
    cam.smoothX += (cam.mouseX - cam.smoothX) * 0.035;
    cam.smoothY += (cam.mouseY - cam.smoothY) * 0.035;
    const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
    const sTarget = Math.min(scrollY / maxScroll, 1);
    cam.smoothScroll += (sTarget - cam.smoothScroll) * 0.05;

    const eye = [
      cam.smoothX * 1.0,
      1.0 - cam.smoothY * 0.45 - cam.smoothScroll * 0.35,
      7.4 - cam.smoothScroll * 1.2
    ];
    const target = [
      cam.smoothX * 0.5,
      0.35 - cam.smoothY * 0.28 - cam.smoothScroll * 0.9,
      -10
    ];

    const proj = M.perspective(40 * Math.PI / 180, W / H, 0.1, 160);
    const view = M.lookAt(eye, target, [0, 1, 0]);

    gl.clearColor(0.027, 0.027, 0.041, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    /* sky */
    gl.useProgram(pSky);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(skyLoc.aPos);
    gl.vertexAttribPointer(skyLoc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(skyLoc.uRes, W, H);
    gl.uniform1f(skyLoc.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    /* architectural volumes */
    gl.useProgram(pBox);
    gl.uniformMatrix4fv(boxLoc.uProj, false, proj);
    gl.uniformMatrix4fv(boxLoc.uView, false, view);
    gl.uniform1f(boxLoc.uTime, time);
    gl.uniform3fv(boxLoc.uCam, new Float32Array(eye));
    gl.uniform3fv(boxLoc.uFog, new Float32Array(FOG));
    gl.uniform3fv(boxLoc.uAccent, new Float32Array(ACCENT));

    bindAttr(boxPosBuf, boxLoc.aPos, 3);
    bindAttr(boxNorBuf, boxLoc.aNormal, 3);
    bindAttr(volBuf.pos, boxLoc.iPos, 3, 1);
    bindAttr(volBuf.scale, boxLoc.iScale, 3, 1);
    bindAttr(volBuf.rot, boxLoc.iRot, 3, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, box.pos.length / 3, volBuf.count);

    /* floating shards */
    gl.useProgram(pShard);
    gl.uniformMatrix4fv(shardLoc.uProj, false, proj);
    gl.uniformMatrix4fv(shardLoc.uView, false, view);
    gl.uniform1f(shardLoc.uTime, time);
    gl.uniform3fv(shardLoc.uCam, new Float32Array(eye));
    gl.uniform3fv(shardLoc.uFog, new Float32Array(FOG));
    gl.uniform3fv(shardLoc.uAccent, new Float32Array(ACCENT));

    bindAttr(octaPosBuf, shardLoc.aPos, 3);
    bindAttr(octaNorBuf, shardLoc.aNormal, 3);
    bindAttr(shardBuf.pos, shardLoc.iPos, 3, 1);
    bindAttr(shardBuf.scale, shardLoc.iScale, 3, 1);
    bindAttr(shardBuf.rot, shardLoc.iRot, 3, 1);
    bindAttr(shardBuf.phase, shardLoc.iPhase, 1, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, octa.pos.length / 3, shardBuf.count);

    /* dust */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(pDust);
    gl.uniformMatrix4fv(dustLoc.uProj, false, proj);
    gl.uniformMatrix4fv(dustLoc.uView, false, view);
    gl.uniform1f(dustLoc.uTime, time);
    gl.uniform1f(dustLoc.uPixelRatio, dpr);
    gl.uniform3fv(dustLoc.uAccent, new Float32Array(ACCENT));

    bindAttr(dustPosBuf, dustLoc.aPos, 3);
    bindAttr(dustSeedBuf, dustLoc.aSeed, 1);
    gl.drawArrays(gl.POINTS, 0, DUST_COUNT);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /* reset divisors after first bind is handled inside bindAttr */

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(rafId);
    } else if (!reduceMotion) {
      running = true;
      rafId = requestAnimationFrame(frame);
    }
  });

  if (reduceMotion) {
    // render a single, composed still frame
    running = true;
    frame(start + 1200, true);
    running = false;
  } else {
    rafId = requestAnimationFrame(frame);
  }
})();
