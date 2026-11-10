/* ============================================================
   MAIN — motion, interaction & storytelling
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  /* ------------------------------------------------------------
     1. ARRIVAL
     The 3D gate lives on index.html — this page must never replay
     a loader. It simply lifts its veil and lets the hero come in.
     ------------------------------------------------------------ */
  let arrived = false;
  function arrive() {
    if (arrived) return;
    arrived = true;
    const root = document.documentElement;
    if (!root.classList.contains('is-ready')) {
      root.classList.add('is-ready');
      document.body.classList.add('is-ready');
    }
  }

  // fire as soon as the shell exists — the hero reveal does the rest
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => setTimeout(arrive, 40)));
  } else {
    requestAnimationFrame(() => setTimeout(arrive, 40));
  }
  // safety net: nothing on this page may stay hidden
  setTimeout(arrive, 1400);

  /* ------------------------------------------------------------
     2. PHOTOGRAPH — graceful placeholder fallback
     ------------------------------------------------------------ */
  const photo = $('#profilePhoto');
  if (photo) {
    photo.addEventListener('error', () => {
      const inner = photo.closest('.photo-inner');
      if (!inner) return;
      inner.classList.add('is-empty');
      photo.remove();
      const note = document.createElement('div');
      note.className = 'photo-missing';
      note.innerHTML = '<span>PG</span><b>Your photograph here</b><small>public/images/pragun-profile.png</small>';
      inner.appendChild(note);
    });
  }

  /* ------------------------------------------------------------
     3. NAVIGATION — scrolled state, active section, menu, progress
     ------------------------------------------------------------ */
  const nav = $('#nav');
  const navLinks = $$('.nav__link');
  const progressBar = $('#scrollProgress');
  const sections = $$('main section[id]');

  function onScroll() {
    const y = window.scrollY || 0;
    if (nav) nav.classList.toggle('is-scrolled', y > 42);

    if (progressBar) {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      progressBar.style.width = Math.min(100, (y / max) * 100) + '%';
    }
    const sceneCanvas = document.getElementById('scene');
    if (sceneCanvas) {
      const fade = Math.min(y / (window.innerHeight * 1.5), 1);
      sceneCanvas.style.opacity = String(0.92 - fade * 0.58);
    }
    // The portrait panel must never fade out on scroll — it simply travels
    // with the hero with a whisper of parallax, then leaves with the section.
    if (!reduceMotion && heroVisual) {
      const shift = Math.min(y, 900);
      heroVisual.style.transform = shift > 0 ? `translate3d(0,${(shift * 0.035).toFixed(1)}px,0)` : '';
      if (heroVisual.style.opacity) heroVisual.style.opacity = '';
    }
  }

  const heroVisual = $('.hero__visual');
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        navLinks.forEach((l) => l.classList.toggle('is-active', l.dataset.nav === id));
      });
    }, { rootMargin: '-46% 0px -50% 0px', threshold: 0 });
    sections.forEach((s) => spy.observe(s));
  }

  // mobile menu
  const navToggle = $('#navToggle');
  const menu = $('#menu');
  function closeMenu() {
    document.body.classList.remove('menu-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    if (menu) menu.setAttribute('aria-hidden', 'true');
  }
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const open = !document.body.classList.contains('menu-open');
      document.body.classList.toggle('menu-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      if (menu) menu.setAttribute('aria-hidden', String(!open));
    });
  }
  $$('.menu__link, .menu__foot a').forEach((a) => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // anchor links: close menu, let CSS smooth scrolling handle the rest
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', closeMenu));

  /* ------------------------------------------------------------
     4. SCROLL REVEALS
     ------------------------------------------------------------ */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ------------------------------------------------------------
     5. COUNTERS
     ------------------------------------------------------------ */
  const counters = $$('[data-count]');
  function runCounter(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const final = target + suffix;
    const dur = 1500;
    const t0 = performance.now();
    let done = false;

    function settle() {
      if (done) return;
      done = true;
      el.textContent = final;          // the number must always land on target
    }
    function step(now) {
      if (done) return;
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else settle();
    }
    requestAnimationFrame(step);
    // failsafe: if frames stall (background tab, weak GPU) the value still lands
    setTimeout(settle, dur + 450);
  }
  if ('IntersectionObserver' in window && !reduceMotion) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { runCounter(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach((c) => cio.observe(c));
  } else {
    counters.forEach((c) => { c.textContent = c.dataset.count + (c.dataset.suffix || ''); });
  }

  /* ------------------------------------------------------------
     6. CUSTOM CURSOR
     ------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    document.documentElement.classList.add('has-cursor');
    const cursor = $('#cursor');
    const dot = $('.cursor__dot', cursor);
    const ring = $('.cursor__ring', cursor);
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my, dx = mx, dy = my;

    window.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      cursor.classList.add('is-on');
    }, { passive: true });

    document.addEventListener('mouseover', (e) => {
      const interactive = e.target.closest('a,button,[data-cursor]');
      cursor.classList.toggle('is-hover', !!interactive);
    });

    (function loop() {
      dx += (mx - dx) * 0.55;
      dy += (my - dy) * 0.55;
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${dx}px,${dy}px) translate(-50%,-50%)`;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%) scale(${cursor.classList.contains('is-hover') ? 1.75 : 1})`;
      requestAnimationFrame(loop);
    })();
  }

  /* ------------------------------------------------------------
     7. PHOTOGRAPH TILT + LIGHT
     ------------------------------------------------------------ */
  const stage = $('#photoStage');
  const card = $('#photoCard');
  const glare = $('#photoGlare');
  if (stage && card && finePointer && !reduceMotion) {
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;

    function render() {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      card.style.transform = `rotateX(${cy.toFixed(3)}deg) rotateY(${cx.toFixed(3)}deg)`;
      if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(render);
      else raf = 0;
    }

    stage.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      tx = (px - 0.5) * 13;
      ty = -(py - 0.5) * 11;
      if (glare) {
        glare.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        glare.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      }
      if (!raf) raf = requestAnimationFrame(render);
    });

    stage.addEventListener('pointerleave', () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(render);
    });
  }

  /* ------------------------------------------------------------
     8. MAGNETIC BUTTONS
     ------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width;
        const y = (e.clientY - r.top - r.height / 2) / r.height;
        el.style.transform = `translate(${(x * 7).toFixed(2)}px, ${(y * 5 - 2).toFixed(2)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------
     9. PROJECT FILTERS
     ------------------------------------------------------------ */
  const filters = $('#filters');
  const projectCards = $$('[data-cat]');
  if (filters) {
    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter');
      if (!btn) return;
      const filter = btn.dataset.filter;
      $$('.filter', filters).forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      projectCards.forEach((cardEl) => {
        const match = filter === 'all' || cardEl.dataset.cat === filter;
        if (match) {
          cardEl.style.display = '';
          cardEl.classList.remove('is-in');
          void cardEl.offsetWidth;
          cardEl.classList.add('is-in');
        } else {
          cardEl.style.display = 'none';
        }
      });
    });
  }

  /* ------------------------------------------------------------
     10. SKILLS ACCORDION
     ------------------------------------------------------------ */
  const skillGroups = $$('.skill-group');
  skillGroups.forEach((group) => {
    const head = $('.skill-group__head', group);
    if (!head) return;
    head.addEventListener('click', () => {
      const willOpen = !group.classList.contains('is-open');
      skillGroups.forEach((g) => {
        g.classList.remove('is-open');
        const h = $('.skill-group__head', g);
        if (h) h.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        group.classList.add('is-open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ------------------------------------------------------------
     11. CERTIFICATE MODAL
     ------------------------------------------------------------ */
  const CERTIFICATES = [
    {
      kicker: 'Course certificate',
      title: 'Critical Enquiry and Research Methodology',
      issuer: 'Chandigarh University · Coursera',
      year: '2026', id: 'J65I63WGIR6Q',
      preview: 'public/images/certificates/critical-enquiry.png',
      pdf: 'public/certificates/critical-enquiry-and-research-methodology.pdf',
      verify: 'https://coursera.org/verify/J65I63WGIR6Q',
      alt: 'Chandigarh University Coursera certificate for Critical Enquiry and Research Methodology',
      desc: 'Pragun Gupta completed the online course Critical Enquiry and Research Methodology, authorized by Chandigarh University and offered through Coursera.',
      tags: ['Critical enquiry', 'Research methodology', 'Chandigarh University', 'Coursera']
    },
    {
      kicker: 'Course certificate',
      title: 'Programming Foundations with JavaScript, HTML and CSS',
      issuer: 'Duke University · Coursera',
      year: '2025', id: 'BAM710KLQXMJ',
      preview: 'public/images/certificates/programming-foundations.png',
      pdf: 'public/certificates/programming-foundations-javascript-html-css.pdf',
      verify: 'https://coursera.org/verify/BAM710KLQXMJ',
      alt: 'Duke University Coursera certificate for Programming Foundations with JavaScript, HTML and CSS',
      desc: 'Pragun Gupta completed the online course Programming Foundations with JavaScript, HTML and CSS, authorized by Duke University and offered through Coursera.',
      tags: ['JavaScript', 'HTML', 'CSS', 'Duke University']
    },
    {
      kicker: 'Course certificate',
      title: 'Entrepreneurial Mindset: Build, Grow, & Lead Your Own Venture',
      issuer: 'Chandigarh University · Coursera',
      year: '2026', id: 'F1OTZRFRHTN4',
      preview: 'public/images/certificates/entrepreneurial-mindset.png',
      pdf: 'public/certificates/entrepreneurial-mindset-build-grow-lead.pdf',
      verify: 'https://coursera.org/verify/F1OTZRFRHTN4',
      alt: 'Chandigarh University Coursera certificate for Entrepreneurial Mindset: Build, Grow, and Lead Your Own Venture',
      desc: 'Pragun Gupta completed the online course Entrepreneurial Mindset: Build, Grow, & Lead Your Own Venture, authorized by Chandigarh University and offered through Coursera.',
      tags: ['Entrepreneurship', 'Build', 'Grow', 'Lead']
    },
    {
      kicker: 'Program completion certificate',
      title: 'Spring and Angular Full Stack Developer',
      issuer: 'Infosys Springboard',
      year: '2026', id: '—',
      preview: 'public/images/certificates/spring-angular-full-stack.png',
      pdf: 'public/certificates/spring-and-angular-full-stack-developer.pdf',
      verify: 'https://verify.onwingspan.com',
      alt: 'Infosys Springboard certificate for Spring and Angular Full Stack Developer',
      desc: 'Pragun Gupta completed the Spring and Angular Full Stack Developer program issued through Infosys Springboard on September 26, 2026.',
      tags: ['Spring', 'Angular', 'Full-stack', 'Infosys Springboard']
    }
  ];

  const modal = $('#modal');
  const modalSheet = $('#modalSheet');
  let lastFocused = null;

  function openCert(index) {
    const data = CERTIFICATES[index];
    if (!data || !modal) return;
    lastFocused = document.activeElement;

    modalSheet.innerHTML =
      `<div class="cert__sheet cert__sheet--image">
        <img src="${data.preview}" alt="${data.alt}" />
      </div>`;

    $('#modalKicker').textContent = data.kicker;
    $('#modalTitle').textContent = data.title;
    $('#modalIssuer').textContent = data.issuer;
    $('#modalDesc').textContent = data.desc;
    $('#modalYear').textContent = data.year;
    $('#modalId').textContent = data.id;
    $('#modalTags').innerHTML = data.tags.map((t) => `<li>${t}</li>`).join('');
    const verifyLink = $('#modalVerify');
    if (verifyLink) verifyLink.href = data.verify;
    const pdfLink = $('#modalPdf');
    if (pdfLink) pdfLink.href = data.pdf;

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const closeBtn = $('.modal__close', modal);
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeCert() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused && lastFocused.focus) lastFocused.focus({ preventScroll: true });
  }

  $$('.cert').forEach((btn) => {
    btn.addEventListener('click', () => openCert(Number(btn.dataset.cert)));
  });
  if (modal) {
    $$('[data-close]', modal).forEach((el) => el.addEventListener('click', closeCert));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeCert();
    });
  }

  /* ------------------------------------------------------------
     12. LOCAL TIME (IST)
     ------------------------------------------------------------ */
  const clock = $('#clock');
  if (clock) {
    const tickClock = () => {
      try {
        const t = new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false
        });
        clock.textContent = `${t} IST`;
      } catch (err) { clock.textContent = 'IST · UTC+5:30'; }
    };
    tickClock();
    setInterval(tickClock, 20000);
  }

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------
     13. SUBTLE PARALLAX FOR FLOATING CHIPS
     ------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    const chips = $$('.float-chip');
    if (chips.length) {
      let cx = 0, cy = 0, tx = 0, ty = 0, running = false;
      window.addEventListener('pointermove', (e) => {
        tx = (e.clientX / window.innerWidth - 0.5);
        ty = (e.clientY / window.innerHeight - 0.5);
        if (!running) { running = true; requestAnimationFrame(step); }
      }, { passive: true });
      function step() {
        cx += (tx - cx) * 0.05;
        cy += (ty - cy) * 0.05;
        chips.forEach((chip, i) => {
          const depth = i === 0 ? 16 : -12;
          chip.style.setProperty('--px', (cx * depth).toFixed(2) + 'px');
          chip.style.setProperty('--py', (cy * depth).toFixed(2) + 'px');
        });
        if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) requestAnimationFrame(step);
        else running = false;
      }
    }
  }
})();

/* ------------------------------------------------------------
   14. EXTERNAL LINKS INSIDE A PREVIEW FRAME
   The in-app preview shows the page in a sandboxed iframe that
   blocks new tabs, so every external link looks dead. In a normal
   browser tab this whole block is skipped and links behave
   natively. Inside a frame we open the link ourselves; if the
   popup is refused we surface the URL with a copy button, so a
   click always produces something visible.
   ------------------------------------------------------------ */
(function () {
  if (window.self === window.top) return;

  const bar = document.createElement('div');
  bar.className = 'link-toast';
  bar.setAttribute('role', 'status');
  bar.innerHTML =
    '<span class="link-toast__label">Preview blocks new tabs</span>' +
    '<code class="link-toast__url"></code>' +
    '<button type="button" class="link-toast__copy">Copy link</button>';
  const urlEl = bar.querySelector('.link-toast__url');
  const copyBtn = bar.querySelector('.link-toast__copy');
  let hideTimer = null;

  function show(url) {
    urlEl.textContent = url;
    bar.classList.add('is-open');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => bar.classList.remove('is-open'), 10000);
  }

  function flash(msg) {
    copyBtn.textContent = msg;
    setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1700);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => flash('Copied'), () => flash('Select it'));
    } else {
      flash('Select it');
    }
  }

  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href^="http"], a[target="_blank"]') : null;
    if (!a) return;
    e.preventDefault();
    let win = null;
    try { win = window.open(a.href, '_blank'); } catch (err) { win = null; }
    if (win) { try { win.opener = null; } catch (err) {} }
    else show(a.href);
  });

  copyBtn.addEventListener('click', () => copy(urlEl.textContent));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
  } else {
    document.body.appendChild(bar);
  }
})();
