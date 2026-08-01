/* ============================================================
   FEB team website — behavior
   ------------------------------------------------------------
   Scroll reveals, count-ups, stage bars, hero parallax, the
   footer battery, smooth-scrolling, and the easter eggs.

   Everything here is progressive enhancement: with JS off the
   page is fully readable and every link still works. Nothing
   fetches, nothing persists.
   ============================================================ */
(function () {
  'use strict';

  // Arm the reveal styles only now, so a JS failure can never leave the page
  // invisible. site.css scopes the opacity-0 rule to html.js for this reason.
  var root = document.documentElement;
  root.classList.add('js');

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NAV_OFFSET = 60; // sticky nav height, matches the design handoff

  // ── toasts ────────────────────────────────────────────────────────────────
  function toast(msg) {
    var d = document.createElement('div');
    d.className = 'toast';
    d.setAttribute('role', 'status');
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () {
      d.classList.add('out');
      setTimeout(function () { d.remove(); }, 450);
    }, 3200);
  }

  // ── scroll reveals, count-ups, stage bars ────────────────────────────────
  function countUp(n) {
    if (n.dataset.done) return;
    n.dataset.done = '1';
    var target = parseFloat(n.dataset.count);
    var suffix = n.dataset.suffix || '';
    if (reduced) { n.textContent = target + suffix; return; }
    var t0 = performance.now();
    (function tick(t) {
      var p = Math.min(1, (t - t0) / 900);
      n.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function fillBars(el) {
    el.querySelectorAll('[data-bar]').forEach(function (b, i) {
      b.style.transitionDelay = (i * 0.15) + 's';
      b.style.width = b.dataset.bar + '%';
    });
  }

  function show(el) {
    el.classList.add('shown');
    el.querySelectorAll('[data-count]').forEach(countUp);
    if (el.matches('[data-count]')) countUp(el);
    fillBars(el);
    if (el.matches('[data-bar]')) { el.style.width = el.dataset.bar + '%'; }
  }

  var reveals = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    reveals.forEach(show); // no observer support: just show everything
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        show(e.target);
        io.unobserve(e.target); // one-shot
      });
    }, { threshold: 0.18 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  // ── hero parallax + footer battery ───────────────────────────────────────
  var slash = document.querySelector('[data-slash]');
  var socText = document.querySelector('[data-soc]');
  var socFill = document.querySelector('[data-soc-fill]');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      if (slash && !reduced) slash.style.transform = 'translateX(' + (-y * 0.18) + 'px)';
      if (socText || socFill) {
        var max = document.documentElement.scrollHeight - innerHeight;
        // Drains 100 → 4 with scroll depth, and regenerates scrolling back up.
        var soc = Math.max(4, Math.round(100 - (max > 0 ? y / max : 0) * 96));
        if (socText) socText.textContent = 'SOC ' + soc + '%';
        if (socFill) {
          socFill.style.width = Math.max(4, soc - 8) + '%';
          socFill.classList.toggle('low', soc < 25);
        }
      }
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── smooth scroll to anchors, clearing the sticky nav ────────────────────
  function scrollToId(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    var top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
    window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
    return true;
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (id && scrollToId(id)) {
      e.preventDefault();
      history.replaceState(null, '', '#' + id);
    }
  });

  // Buttons that jump to a section, e.g. the hero CTAs and the nav Join.
  document.querySelectorAll('[data-scroll]').forEach(function (b) {
    b.addEventListener('click', function () {
      // On the secondary pages the target section lives on another page.
      if (!scrollToId(b.dataset.scroll)) location.href = b.dataset.href || 'index.html#' + b.dataset.scroll;
    });
  });

  // ── easter eggs ──────────────────────────────────────────────────────────

  // 3. Console message for anyone who opens devtools.
  console.log(
    '%c⚡ FEB — we build electric race cars. If you can read this, you should probably join: fe.berkeley.edu/apply',
    'color:#FDB515;background:#003262;padding:6px 10px;border-radius:4px;font-weight:bold'
  );

  // 8. Logo wheel spins on click.
  var logo = document.querySelector('[data-logo]');
  if (logo) {
    logo.addEventListener('click', function () {
      var w = logo.querySelector('.nav-wheel');
      if (!w || w.classList.contains('spin')) return;
      w.classList.add('spin');
      setTimeout(function () { w.classList.remove('spin'); }, 1100);
    });
  }

  // 4. Vacuum pump: clicking the ticker item shuts it off.
  document.querySelectorAll('[data-pump]').forEach(function (p) {
    p.addEventListener('click', function () {
      document.querySelectorAll('[data-pump]').forEach(function (q) {
        q.textContent = 'vacuum pump: off. thank you.';
      });
      toast('🔧 Vacuum pump shut off. The composites lead thanks you.');
    });
  });

  // 5. SN1's 88 mph: archive mode over the whole page.
  document.querySelectorAll('[data-archive]').forEach(function (c) {
    c.addEventListener('click', function () {
      var on = root.classList.toggle('archive');
      toast(on
        ? '🕰 88 mph reached — archive mode engaged. Click SN1–SN3 again to return to 2026.'
        : '⚡ Back to the future.');
    });
  });

  // 6. Redacted build-log post reveals on click.
  document.querySelectorAll('[data-redacted]').forEach(function (card) {
    card.addEventListener('click', function () {
      var t = card.querySelector('[data-redtitle]');
      if (t) t.textContent = 'SN7 concept: four hub motors and torque vectoring';
      toast('🕵️ Clearance granted. You saw nothing.');
    });
  });

  // 7. The fax line says no.
  document.querySelectorAll('[data-fax]').forEach(function (f) {
    f.addEventListener('click', function () { toast('📠 beeeee-boop-kshhhhhh… no.'); });
  });

  // 1. Konami code: gold flash, jump to Join, pre-fill the referral field.
  var seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var keys = [];
  addEventListener('keydown', function (e) {
    keys.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    keys = keys.slice(-seq.length);
    if (!seq.every(function (k, i) { return keys[i] === k; })) return;
    keys = [];

    var f = document.querySelector('[data-flash]');
    if (f && !reduced) {
      f.classList.add('go');
      setTimeout(function () { f.classList.remove('go'); }, 1100);
    }
    toast('⚡ Fast-track unlocked. Welcome, old driver — application pre-filled: "↑↑↓↓←→←→BA"');

    // Where the application form exists, pre-fill how they found it.
    var ref = document.querySelector('[data-referral]');
    if (ref) ref.value = '↑↑↓↓←→←→BA';

    if (!scrollToId('join')) location.href = 'join.html';
  });
})();
