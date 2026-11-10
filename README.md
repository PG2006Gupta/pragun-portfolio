# Pragun Gupta — Personal Portfolio

Live website
Open the live portfolio →

The site includes an animated entrance screen, project showcases, education, certificates, skills and contact information.

A two-page, premium 3D portfolio: editorial typography, hand-written WebGL
atmosphere, and interaction design built to feel alive without overwhelming the
visitor. No frameworks, no build step, no external dependencies — open
`index.html` or serve the folder and it runs.

**Page 1 — `index.html` (the entrance).** A geodesic polyhedron builds itself
face by face, turns slowly, then settles while the name, identity line and
tagline reveal. Scroll down, swipe up, or press Enter/Space to pass through
to the portfolio. A fresh visit keeps the loading sequence visible for several
seconds, then waits for a real downward scroll/swipe or keyboard command.

**Page 2 — `portfolio.html` (the portfolio).** The complete site: hero, about,
projects, education, certifications, skills, future vision and contact. It is
entered after the deliberate gate transition, and the footer links back to the
entrance.

---

## 1. Add your photograph (the only thing you must change)

Drop your portrait over this file:

```
public/images/pragun-profile.png
```

- **Portrait crop:** 4:5 (e.g. `1200 × 1500 px`), subject centred, head in the top third.
- **Formats:** `.png` works as-is. For `.jpg`/`.webp`, either rename to `.png`,
  or change the `src` in `portfolio.html` (search for `REPLACE THIS FILE`).
- The image is `object-fit: cover`, so the frame always fills correctly.
- If the file is missing, the page automatically falls back to an elegant
  monogram placeholder — nothing breaks.

## 2. Update content

Everything lives in `portfolio.html`, in reading order (site copy only — the
entrance page carries just the name, identity line and tagline, in `index.html`):

| Section | What to edit |
|---|---|
| Hero | name, roles, tagline, intro, socials, stat counters (`data-count`) |
| About | paragraphs, ID card, "currently exploring" list, three principles |
| Projects | four supplied live projects with locally captured screenshots and live links |
| Education | current B.E. Information Technology timeline plus prior school entry |
| Certificates | four supplied certificate previews, PDFs, verification links and modal details |
| Skills | 6 accordion groups with proficiency bars (`--w: 92%`) |
| Future vision | 3 cards |
| Contact / footer | email, links, résumé path |

Replace `public/Pragun-Gupta-Resume.pdf` with your real résumé — both
"Download Résumé" buttons point at it.

## 3. Links & project captures

- GitHub: search for `github.com/PG2006Gupta`. LinkedIn: search for `linkedin.com/in/pragungupta`
  (still a placeholder — send me the real profile URL and I'll swap it).
- Email: search for `pragun06gupta@gmail.com` (appears 4×: nav, hero socials, contact block).
- The project cards use the supplied live URLs and local captures in `public/images/projects/`:

| Project | Live URL | Capture |
|---|---|---|
| Shop Zone | `https://pg2006gupta.github.io/shop-zone/` | `shop-zone.png` |
| FormShield | `https://pg2006gupta.github.io/Form-Shield/` | `form-shield.png` |
| City Care Hospital | `https://pg2006gupta.github.io/CityCare-Hospital-DBMS/` | `citycare-hospital.png` |
| Smart Attendance Portal | `https://smart-attendance-portal-7yh1.onrender.com/` | `smart-attendance.png` |

The captures were taken from the working live pages so the portfolio preview remains visual
without depending on remote assets inside its sandboxed iframe. The City Care link redirects
to its public PythonAnywhere application before the capture is taken.
- Certificate PDFs are stored in `public/certificates/` and their preview images in
  `public/images/certificates/`. The three Coursera verification links and the Infosys
  Springboard verification page are wired into the certificate modal.
- Local clock in the contact card reads real IST time.

## 4. Layout gutters

Page inset is controlled by one variable in `assets/css/styles.css`:

```css
--gutter: clamp(24px, 6vw, 80px);   /* space between content and the window edge */
--shell:  min(1280px, calc(100% - var(--gutter) * 2));
```

Raise the minimum (e.g. `clamp(32px, 6vw, 80px)`) for more breathing room on small screens.

**Hero layout.** The portrait sits to the **right** of the introduction at every
width down to 561px — desktop, laptop, tablet, and split-screen/narrow panes:

| Range | Rule |
| --- | --- |
| 1081px+ | default two-column grid, full-size portrait |
| 861–1080px | `@media(max-width:1080px) and (min-width:861px)` — portrait scaled to `clamp(230px, 29vw, 340px)` |
| 641–860px | `@media(max-width:860px) and (min-width:641px)` — tighter type, portrait `clamp(168px, 25vw, 252px)` |
| 561–640px | `@media(max-width:640px) and (min-width:561px)` — compact two-column, portrait `clamp(132px, 23vw, 168px)` |
| ≤560px | single column — the portrait drops below the copy, because a second column at phone width would crush the type |

These blocks live at the end of the responsive section in `styles.css`, **after**
the general `max-width:640px` rules, so they win the cascade. To keep the
portrait beside the copy on phones too, lower the `561px` value — expect very
narrow text columns.

## 5. Run it

```bash
# recommended: the bundled no-cache server (always shows the latest files)
python3 serve.py 8001
# → http://localhost:8001/                 the 3D entrance
# → http://localhost:8001/portfolio.html   the portfolio

# Keep this single managed preview on port 8001 so edits are always visible.
```

`serve.py` is a ~40-line static server that sends
`Cache-Control: no-store, no-cache, must-revalidate` on every response. Use it
while editing: without those headers a browser can keep showing an old copy of a
page you have already changed (hard-reload with Ctrl/Cmd+Shift+R if you ever see
stale content).

Deploy the folder to Vercel, Netlify, GitHub Pages or any static host — no
build configuration required.

## 6. Structure

```
index.html                    entrance page — 3D gate, name reveal, "scroll down to enter"
portfolio.html                the portfolio itself (all sections)

assets/css/loader.css         entrance-only design system (gate, identity, enter cue)
assets/css/styles.css         portfolio design system, layout, motion, responsive rules

assets/js/polygon.js          hand-written WebGL2 geodesic loader (+ SVG fallback)
assets/js/loader.js           gate orchestration: preload, progress, reveal, exit
assets/js/scene.js            WebGL2 portfolio environment (architecture, shards, dust, fog)
assets/js/main.js             arrival fade, nav spy, reveals, tilt, filters, modal, cursor

assets/fonts/*.woff2          self-hosted Inter Tight · Instrument Serif · JetBrains Mono
public/images/                your photograph and captured project screenshots
public/images/projects/         shop-zone.png · form-shield.png · citycare-hospital.png · smart-attendance.png
public/images/certificates/     four rendered certificate previews
public/certificates/             four supplied certificate PDFs
public/Pragun-Gupta-Resume.pdf
```

### How the two pages talk to each other

| Step | What happens |
| --- | --- |
| Load `index.html` | `loader.js` preloads `portfolio.html`, the photograph, the fonts and the portfolio stylesheet while the geometry builds. Progress is the geometry: faces illuminate in a steady wavefront. |
| Gate completes | A minimum of ~4.2 s is guaranteed (so the build-up can be appreciated) and a ceiling of ~6.5 s makes a stall impossible. On completion the object blooms and the name reveals letter by letter. |
| Enter | Wheel-down (not up), touch swipe-up, Enter/Space/ArrowDown/PageDown, or the *Skip* link. Pointer movement alone never starts the portfolio. |
| Exit | The object swells and dissolves, the text lifts away, and an ink veil closes — then `location.href = "portfolio.html"`. Same background colour, so there is no white flash. |
| Arrive | `portfolio.html` adds `is-ready` on the first frame: the veil lifts over ~0.6 s and the hero elements cascade in. No loader is replayed. |
| Back | Browser Back can restore the entrance through the browser cache; a fresh visit runs the full loading scene again. `pageshow` repairs the state after a bfcache restore. |

The 3D geometry is a subdivided icosahedron (320 faces on desktop, 80 on
phones) rendered as real triangle faces with depth testing — never a flat
illustration. If WebGL2 is unavailable, `polygon.js` draws the same object as
SVG polygons and the gate keeps working; if `prefers-reduced-motion` is set the
rotation and bloom calm down and the gate runs shorter.

## 7. Design notes

- **Palette** — ink `#08080c`, paper `#f3f0e8`, periwinkle `#a9a6f0`, mint `#8fe3c0`.
  Text ladder: `--text #f6f5fc` (18.5:1), `--body #dcdbe9` (14.6:1), `--muted #bfbdcd` (10.8:1),
  `--dim #a3a2b6` (8:1) — every tier clears WCAG AAA against the page ground.
- **Type scale** — body copy 16–17px, meta/mono labels 11–12px with tracking eased on small sizes;
  only the miniature product mockups use micro type, since they read as screenshots, not copy.
- **Type** — Inter Tight (display), Instrument Serif italic (editorial accent),
  JetBrains Mono (labels and metadata).
- **3D** — one small WebGL2 renderer: instanced architectural volumes, floating
  octahedral shards, drifting dust and exponential fog. Camera parallaxes to the
  pointer and dollies gently with scroll; the scene fades back as content takes over.
- **Performance** — no libraries, capped device pixel ratio (1.75), single draw
  call per object type, animation paused when the tab is hidden.
- **Accessibility** — semantic landmarks, visible focus rings, `aria-expanded`
  accordions, focus-managed modal, Escape to close, and a full
  `prefers-reduced-motion` path (no animation, static composed scene).

## 8. Customising the motion

In `assets/js/main.js`: loader timing (section 1), reveal observer thresholds
(section 4), photo tilt strength (section 7, `13` and `11` degrees).
In `assets/js/scene.js`: `volumes` / `shards` arrays control the geometry layout,
`FOG` and `ACCENT` control atmosphere.
