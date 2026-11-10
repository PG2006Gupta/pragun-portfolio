/* ============================================================
   POLYGON GATE — geodesic polyhedron with face-by-face loading
   Hand-written WebGL2 (no libraries, no CDN, offline-safe).
   Every triangle is a real mesh face with its own load threshold,
   so progress is expressed by the geometry itself — never a bar.
   ============================================================ */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
     MATH
     ------------------------------------------------------------------ */
  const norm3 = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function mul(a, b) {
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

  function rotation(rx, ry, s) {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    // R = Rx * Ry, then uniform scale
    const m = new Float32Array(16);
    m[0] = cy * s;      m[1] = 0;     m[2] = -sy * s;     m[3] = 0;
    m[4] = sx * sy * s; m[5] = cx * s; m[6] = sx * cy * s; m[7] = 0;
    m[8] = cx * sy * s; m[9] = -sx * s; m[10] = cx * cy * s; m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    return m;
  }

  function viewMatrix(eye) {
    // camera always looks at the origin from +z
    const m = new Float32Array(16);
    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    m[14] = -eye[2];
    m[13] = -eye[1];
    m[12] = -eye[0];
    return m;
  }

  /* ------------------------------------------------------------------
     GEOMETRY — icosphere, subdivided, with a deterministic load order
     ------------------------------------------------------------------ */
  function buildGeodesic(detail) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ].map(norm3);

    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    for (let d = 0; d < detail; d++) {
      const cache = new Map();
      const added = [];
      const mid = (i, j) => {
        const key = i < j ? i + ':' + j : j + ':' + i;
        if (cache.has(key)) return cache.get(key);
        const a = verts[i], b = verts[j];
        added.push(norm3([a[0] + b[0], a[1] + b[1], a[2] + b[2]]));
        const idx = verts.length + added.length - 1;
        cache.set(key, idx);
        return idx;
      };
      const next = [];
      faces.forEach(([a, b, c]) => {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      });
      verts = verts.concat(added);
      faces = next;
    }

    // ---- flat faces, normals forced outward, deterministic load order ----
    const n = faces.length;
    const centroids = faces.map(([a, b, c]) => {
      const A = verts[a], B = verts[b], C = verts[c];
      return [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    });

    // sweep: light opens from a seed point on the surface (aligned with the
    // key light) and spreads outward as an uneven wavefront, so the lit area
    // grows at a steady, readable rate and never jumps
    const seed = norm3([-0.34, 0.66, 0.67]);
    const keyOf = (c) => {
      const u = norm3(c);
      const capT = (1 - (u[0] * seed[0] + u[1] * seed[1] + u[2] * seed[2])) / 2; // 0 at seed, 1 opposite
      const angT = (Math.atan2(u[2], u[0]) + Math.PI) / (Math.PI * 2);
      return 0.88 * capT + 0.12 * angT;
    };
    const order = faces.map((_, i) => i).sort((i, j) => keyOf(centroids[i]) - keyOf(centroids[j]));

    const threshold = new Float32Array(n);
    order.forEach((faceIndex, rank) => {
      threshold[faceIndex] = 0.04 + 0.9 * (rank / Math.max(n - 1, 1));
    });

    const facePos = new Float32Array(n * 9);
    const faceNor = new Float32Array(n * 9);
    const faceT = new Float32Array(n * 3);

    faces.forEach(([a, b, c], i) => {
      const A = verts[a], B = verts[b], C = verts[c];
      let nn = [
        (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]),
        (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]),
        (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])
      ];
      nn = norm3(nn);
      const cd = centroids[i];
      if (nn[0] * cd[0] + nn[1] * cd[1] + nn[2] * cd[2] < 0) nn = [-nn[0], -nn[1], -nn[2]];

      const p = [A, B, C];
      for (let v = 0; v < 3; v++) {
        facePos.set(p[v], i * 9 + v * 3);
        faceNor.set(nn, i * 9 + v * 3);
        faceT[i * 3 + v] = threshold[i];
      }
    });

    // ---- unique edges for the wireframe pass ----
    const edgeMap = new Map();
    faces.forEach(([a, b, c], fi) => {
      [[a, b], [b, c], [c, a]].forEach(([i, j]) => {
        const key = i < j ? i + ':' + j : j + ':' + i;
        if (!edgeMap.has(key)) edgeMap.set(key, { i, j, t: [] });
        edgeMap.get(key).t.push(threshold[fi]);
      });
    });

    const edges = Array.from(edgeMap.values());
    const edgePos = new Float32Array(edges.length * 6);
    const edgeT = new Float32Array(edges.length * 2);
    edges.forEach((e, k) => {
      edgePos.set(verts[e.i], k * 6);
      edgePos.set(verts[e.j], k * 6 + 3);
      const avg = e.t.reduce((s, v) => s + v, 0) / e.t.length;
      edgeT[k * 2] = avg;
      edgeT[k * 2 + 1] = avg;
    });

    return { facePos, faceNor, faceT, count: n, edgePos, edgeT, edgeCount: edges.length, verts, faces };
  }

  /* ------------------------------------------------------------------
     SHADERS
     ------------------------------------------------------------------ */
  const VS_FACE = `#version 300 es
  precision highp float;
  in vec3 aPos;
  in vec3 aNor;
  in float aT;
  uniform mat4 uProj;
  uniform mat4 uMV;
  uniform float uProgress;
  uniform float uExit;
  out vec3 vNor;
  out vec3 vView;
  out float vFill;

  void main(){
    float fill = smoothstep(aT, aT + 0.085, uProgress);
    vFill = fill;

    // lit faces lift a fraction off the shell — the structure "assembles"
    vec3 p = aPos * (1.0 + fill * 0.012 + uExit * 0.75 * (0.35 + aT * 1.1));
    vec4 vp = uMV * vec4(p, 1.0);

    vNor  = mat3(uMV) * aNor;
    vView = vp.xyz;
    gl_Position = uProj * vp;
  }`;

  const FS_FACE = `#version 300 es
  precision highp float;
  in vec3 vNor;
  in vec3 vView;
  in float vFill;
  uniform float uComplete;
  uniform float uExit;
  uniform vec3 uAccent;
  out vec4 fragColor;

  void main(){
    vec3 n = normalize(vNor);
    vec3 V = normalize(-vView);

    vec3 keyDir  = normalize(vec3(-0.45, 0.72, 0.55));
    vec3 fillDir = normalize(vec3(0.70, -0.15, 0.35));

    float key  = max(dot(n, keyDir), 0.0);
    float fill = max(dot(n, fillDir), 0.0);
    float rim  = pow(1.0 - max(dot(n, V), 0.0), 2.4);

    // cheap studio reflection: a soft vertical gradient sampled by the
    // reflection vector, so faces read as glass rather than flat polygons
    vec3 R = reflect(-V, n);
    float env = smoothstep(-0.55, 0.95, R.y);
    vec3 glass = mix(vec3(0.045, 0.048, 0.082), vec3(0.170, 0.180, 0.300), env);

    vec3 lit = glass * (0.60 + key * 0.95);
    lit += vec3(0.26, 0.25, 0.48) * fill * 0.26;
    lit += uAccent * rim * 0.42;

    // the unlit state: near-black facets with a whisper of rim light
    vec3 dark = vec3(0.017, 0.018, 0.032) + uAccent * rim * 0.10;

    vec3 col = mix(dark, lit + uAccent * (0.22 + key * 0.31), vFill);

    // illuminated faces emit — plus the completion bloom
    col += uAccent * vFill * (0.08 + uComplete * 0.26) * (0.45 + rim * 1.15);
    col += vec3(0.55, 0.53, 0.85) * vFill * pow(key, 3.0) * 0.16;

    // keep the palette in range — bright facets should glow, never blow out
    col = min(col, vec3(0.90, 0.89, 0.99));

    col = mix(col, vec3(0.031, 0.031, 0.047), clamp(uExit * 0.9, 0.0, 1.0));

    fragColor = vec4(col, 1.0);
  }`;

  const VS_EDGE = `#version 300 es
  precision highp float;
  in vec3 aPos;
  in float aT;
  uniform mat4 uProj;
  uniform mat4 uMV;
  uniform float uProgress;
  uniform float uExit;
  out float vFill;
  out float vRim;
  void main(){
    vFill = smoothstep(aT, aT + 0.085, uProgress);
    vec3 p = aPos * (1.0009 + uExit * 0.75 * (0.35 + aT * 1.1));
    vec4 vp = uMV * vec4(p, 1.0);
    vRim = 1.0;
    gl_Position = uProj * vp;
  }`;

  const FS_EDGE = `#version 300 es
  precision highp float;
  in float vFill;
  uniform vec3 uAccent;
  uniform float uExit;
  uniform float uComplete;
  out vec4 fragColor;
  void main(){
    vec3 base = vec3(0.13, 0.13, 0.21);
    vec3 col = mix(base, uAccent * 1.25, vFill);
    col += uAccent * vFill * uComplete * 0.9;
    // edges burn away early in the exit so the object reads as dissolving
    float a = mix(0.16, 0.95, vFill) * max(0.0, 1.0 - uExit * 2.2);
    fragColor = vec4(col, max(a, 0.0));
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[polygon] shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(gl, vs, fs) {
    const v = compile(gl, gl.VERTEX_SHADER, vs);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[polygon] link:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  /* ------------------------------------------------------------------
     WEBGL RENDERER
     ------------------------------------------------------------------ */
  function createWebGL(canvas, options) {
    const opts = options || {};
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      depth: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;

    const detail = opts.detail != null ? opts.detail : 2;
    const geo = buildGeodesic(detail);

    const pFace = program(gl, VS_FACE, FS_FACE);
    const pEdge = program(gl, VS_EDGE, FS_EDGE);
    if (!pFace || !pEdge) return null;

    function buffer(data, target) {
      const b = gl.createBuffer();
      gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
      gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }

    const bFacePos = buffer(geo.facePos);
    const bFaceNor = buffer(geo.faceNor);
    const bFaceT = buffer(geo.faceT);
    const bEdgePos = buffer(geo.edgePos);
    const bEdgeT = buffer(geo.edgeT);

    const L = {
      face: {
        aPos: gl.getAttribLocation(pFace, 'aPos'),
        aNor: gl.getAttribLocation(pFace, 'aNor'),
        aT: gl.getAttribLocation(pFace, 'aT'),
        uProj: gl.getUniformLocation(pFace, 'uProj'),
        uMV: gl.getUniformLocation(pFace, 'uMV'),
        uProgress: gl.getUniformLocation(pFace, 'uProgress'),
        uComplete: gl.getUniformLocation(pFace, 'uComplete'),
        uExit: gl.getUniformLocation(pFace, 'uExit'),
        uAccent: gl.getUniformLocation(pFace, 'uAccent')
      },
      edge: {
        aPos: gl.getAttribLocation(pEdge, 'aPos'),
        aT: gl.getAttribLocation(pEdge, 'aT'),
        uProj: gl.getUniformLocation(pEdge, 'uProj'),
        uMV: gl.getUniformLocation(pEdge, 'uMV'),
        uProgress: gl.getUniformLocation(pEdge, 'uProgress'),
        uExit: gl.getUniformLocation(pEdge, 'uExit'),
        uAccent: gl.getUniformLocation(pEdge, 'uAccent'),
        uComplete: gl.getUniformLocation(pEdge, 'uComplete')
      }
    };

    const state = {
      progress: 0,
      complete: 0,
      exit: 0,
      spin: opts.startAngle != null ? opts.startAngle : -0.6,
      tilt: 0.32,
      px: 0,
      py: 0,
      sx: 0,
      sy: 0,
      running: true
    };

    const ACCENT = new Float32Array([0.62, 0.59, 1.0]);
    let W = 1, H = 1, dpr = 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(rect.width, 1);
      H = Math.max(rect.height, 1);
      // small screens get a lighter framebuffer — the object still looks crisp
      const cap = rect.width < 420 ? 1.5 : 1.75;
      dpr = Math.min(global.devicePixelRatio || 1, cap);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function frame(now) {
      if (!state.running) return;
      requestAnimationFrame(frame);

      const aspect = W / H;
      // pull the camera back on narrow screens so the object always fits
      const dist = aspect < 0.9 ? 5.4 : 4.55;

      if (!opts.reduceMotion) {
        const t = now * 0.001;
        state.spin += 0.00075 + state.complete * 0.0002;
        state.tilt = 0.30 + Math.sin(t * 0.35) * 0.06;
        state.sx += (state.px - state.sx) * 0.045;
        state.sy += (state.py - state.sy) * 0.045;
      }

      const proj = perspective(38 * Math.PI / 180, aspect, 0.1, 60);
      const model = rotation(
        state.tilt + state.sy * 0.16,
        state.spin + state.sx * 0.22,
        1.0
      );
      const mv = mul(viewMatrix([0, 0, dist]), model);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      /* ---- illuminated faces ---- */
      gl.useProgram(pFace);
      gl.uniformMatrix4fv(L.face.uProj, false, proj);
      gl.uniformMatrix4fv(L.face.uMV, false, mv);
      gl.uniform1f(L.face.uProgress, state.progress);
      gl.uniform1f(L.face.uComplete, state.complete);
      gl.uniform1f(L.face.uExit, state.exit);
      gl.uniform3fv(L.face.uAccent, ACCENT);

      gl.bindBuffer(gl.ARRAY_BUFFER, bFacePos);
      gl.enableVertexAttribArray(L.face.aPos);
      gl.vertexAttribPointer(L.face.aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bFaceNor);
      gl.enableVertexAttribArray(L.face.aNor);
      gl.vertexAttribPointer(L.face.aNor, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bFaceT);
      gl.enableVertexAttribArray(L.face.aT);
      gl.vertexAttribPointer(L.face.aT, 1, gl.FLOAT, false, 0, 0);

      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, geo.count * 3);

      /* ---- wireframe ---- */
      gl.useProgram(pEdge);
      gl.uniformMatrix4fv(L.edge.uProj, false, proj);
      gl.uniformMatrix4fv(L.edge.uMV, false, mv);
      gl.uniform1f(L.edge.uProgress, state.progress);
      gl.uniform1f(L.edge.uExit, state.exit);
      gl.uniform1f(L.edge.uComplete, state.complete);
      gl.uniform3fv(L.edge.uAccent, ACCENT);

      gl.bindBuffer(gl.ARRAY_BUFFER, bEdgePos);
      gl.enableVertexAttribArray(L.edge.aPos);
      gl.vertexAttribPointer(L.edge.aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bEdgeT);
      gl.enableVertexAttribArray(L.edge.aT);
      gl.vertexAttribPointer(L.edge.aT, 1, gl.FLOAT, false, 0, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.LINES, 0, geo.edgeCount * 2);
      gl.disable(gl.BLEND);
    }

    resize();
    requestAnimationFrame(frame);

    return {
      mode: 'webgl',
      faceCount: geo.count,
      resize,
      setProgress(p) { state.progress = Math.max(0, Math.min(1, p)); },
      setComplete(v) { state.complete = v; },
      setExit(v) { state.exit = v; },
      setPointer(x, y) { state.px = x; state.py = y; },
      stop() { state.running = false; }
    };
  }

  /* ------------------------------------------------------------------
     SVG FALLBACK — same concept, drawn as flat polygons
     ------------------------------------------------------------------ */
  function createFallback(host, options) {
    const opts = options || {};
    const detail = opts.detail != null ? opts.detail : 0;
    const geo = buildGeodesic(detail);
    const ns = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-1.18 -1.18 2.36 2.36');
    svg.setAttribute('class', 'poly-fallback');
    host.appendChild(svg);

    const KEY = norm3([-0.45, 0.72, 0.55]);

    // one polygon per real mesh face, shaded by its own normal and painted
    // back-to-front so the object still reads as a solid 3D body
    const faces = geo.faces.map(([a, b, c], i) => {
      const cd = norm3([0, 1, 2].map((k) => (geo.verts[a][k] + geo.verts[b][k] + geo.verts[c][k]) / 3));
      const key = Math.max(0, cd[0] * KEY[0] + cd[1] * KEY[1] + cd[2] * KEY[2]);
      const rim = Math.pow(1 - Math.max(0, cd[2]), 2.2);         // faces near the silhouette
      const fill = Math.max(0, Math.min(1, (geo.verts[a][1] + geo.verts[b][1] + geo.verts[c][1]) / 3));
      return { i, z: cd[2], key, rim, fill };
    }).sort((p, q) => p.z - q.z);

    const polys = faces.map((f) => {
      const [a, b, c] = geo.faces[f.i];
      const poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', [geo.verts[a], geo.verts[b], geo.verts[c]]
        .map((v) => `${v[0].toFixed(4)},${(-v[1]).toFixed(4)}`).join(' '));
      poly.setAttribute('stroke-width', '0.005');
      poly.setAttribute('stroke-linejoin', 'round');
      poly._shade = f;
      svg.appendChild(poly);
      return poly;
    });

    // same load order as the WebGL version: a cap that opens from a seed point
    const seed = norm3([-0.34, 0.66, 0.67]);
    const order = geo.faces.map(([a, b, c], i) => {
      const cd = norm3([0, 1, 2].map((k) => (geo.verts[a][k] + geo.verts[b][k] + geo.verts[c][k]) / 3));
      const capT = (1 - (cd[0] * seed[0] + cd[1] * seed[1] + cd[2] * seed[2])) / 2;
      const angT = (Math.atan2(cd[2], cd[0]) + Math.PI) / (Math.PI * 2);
      return { i, k: 0.88 * capT + 0.12 * angT };
    }).sort((p, q) => p.k - q.k);
    const threshold = new Array(geo.faces.length);
    order.forEach((f, rank) => { threshold[f.i] = 0.04 + 0.9 * (rank / Math.max(order.length - 1, 1)); });

    let progress = 0;
    function paint() {
      polys.forEach((poly) => {
        const s = poly._shade;
        const t = threshold[s.i];
        const f = Math.max(0, Math.min(1, (progress - t) / 0.085));
        if (f > 0.02) {
          const glow = 0.55 + 0.45 * s.key;
          const r = Math.round(Math.min(255, 96 + 90 * s.key + 62 * glow));
          const g = Math.round(Math.min(255, 92 + 88 * s.key + 58 * glow));
          const b = Math.round(Math.min(255, 150 + 70 * s.key + 66 * glow));
          poly.setAttribute('fill', `rgba(${r},${g},${b},${0.55 + 0.45 * f})`);
          poly.setAttribute('stroke', `rgba(206,203,255,${0.30 + 0.45 * f})`);
        } else {
          const base = 10 + Math.round(14 * s.key);
          poly.setAttribute('fill', `rgba(${base + 4},${base + 6},${base + 16},0.94)`);
          poly.setAttribute('stroke', `rgba(150,148,200,${0.22 + 0.2 * s.rim})`);
        }
      });
    }
    paint();

    return {
      mode: 'svg',
      faceCount: geo.faces.length,
      resize() {},
      setProgress(p) { progress = Math.max(0, Math.min(1, p)); paint(); },
      setComplete(v) {
        if (v) polys.forEach((poly) => {
          const s = poly._shade;
          const boost = Math.round(26 * s.key + 20 * s.rim);
          poly.setAttribute('fill', `rgba(${Math.min(255, 150 + boost)},${Math.min(255, 146 + boost)},${Math.min(255, 224 + boost * 0.4)},0.96)`);
          poly.setAttribute('stroke', 'rgba(220,217,255,0.62)');
        });
      },
      setExit(v) { host.style.opacity = String(1 - v); host.style.transform = `scale(${1 + v * 0.45})`; },
      setPointer() {},
      stop() {}
    };
  }

  /* ------------------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------------------ */
  global.PolygonGate = {
    create(canvas, options) {
      try {
        const webgl = createWebGL(canvas, options);
        if (webgl) return webgl;
      } catch (err) {
        console.warn('[polygon] WebGL failed, using fallback:', err);
      }
      const host = canvas.parentElement;
      canvas.style.display = 'none';
      return createFallback(host, options);
    },
    geometry: buildGeodesic
  };
})(window);
