(() => {
  "use strict";

  const LINE = "-";
  const DAYS = window.CAMP_DAYS;

  const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const MAX_OPEN = 3 * 60;      // пункт без длительности «идёт» не дольше 3 часов
  const MIN = 60 * 1000;

  // ---------- Время ----------
  // Для проверки можно открыть страницу с якорем #now-2026-10-19_13.30
  function readOverride() {
    const m = /^#now-(\d{4})-(\d{2})-(\d{2})_(\d{1,2})\.(\d{2})$/.exec(location.hash);
    if (!m) return null;
    const fake = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    const startedAt = Date.now();
    return () => fake + (Date.now() - startedAt);
  }
  let clock = readOverride() || (() => Date.now());

  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const dayStart = (d) => new Date(d.date[0], d.date[1] - 1, d.date[2]).getTime();
  const at = (d, mins) => dayStart(d) + mins * MIN;
  const clockMin = (t) => { const m = toMin(t); return m < 5 * 60 ? m + 1440 : m; };

  // ---------- Таймлайн ----------
  const timeline = [];       // все пункты с началом, по порядку
  const allEntries = [];     // все пункты (и без времени)
  DAYS.forEach((d) => {
    let talkCursor = d.talksAt ? toMin(d.talksAt) : null;
    d.items.forEach((it) => {
      if (it === LINE || it.banner) return;
      const e = { day: d, it, start: null, end: null, rows: [] };
      if (it.t || it.at) {
        e.start = at(d, clockMin(it.t || it.at));
        if (it.mins) e.end = e.start + it.mins * MIN;
        if (it.talk) talkCursor = toMin(it.at || it.t) + (it.mins || 0);
      } else if (it.talk) {
        if (talkCursor == null) talkCursor = toMin("12:00");
        e.start = at(d, talkCursor);
        e.end = e.start + it.mins * MIN;
        talkCursor += it.mins;
      } else if (it.group) {
        e.rows = it.rows.map((r) => ({ start: at(d, clockMin(r[2])), end: at(d, clockMin(r[3])) }));
        e.start = Math.min(...e.rows.map((r) => r.start));
        e.end = Math.max(...e.rows.map((r) => r.end));
      }
      it._e = e;
      allEntries.push(e);
      if (e.start != null) timeline.push(e);
    });
  });
  timeline.forEach((e, i) => {
    if (e.end != null) return;
    const next = timeline[i + 1];
    const cap = e.start + MAX_OPEN * MIN;
    e.end = next ? Math.min(next.start, cap) : cap;
  });
  // День закончился, когда закончился его последний пункт (с учётом ночных после полуночи)
  DAYS.forEach((d) => {
    d.end = Math.max(...timeline.filter((e) => e.day === d).map((e) => e.end));
  });

  // ---------- Отрисовка ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const daysEl = document.getElementById("days");
  const chipsEl = document.getElementById("chips");
  const bar = document.getElementById("bar");
  const nowBtn = document.getElementById("nowbtn");

  function renderItem(it) {
    if (it === LINE) return '<hr class="rule">';
    if (it.banner) return `<p class="banner">${esc(it.banner)}</p>`;

    const cls = ["ev"];
    if (it.talk) cls.push("talk");
    if (it.group) cls.push("group");
    if (it.muted) cls.push("muted");
    if (it.center) cls.push("center");

    let info = `<p class="ev-title">${esc(it.title)}</p>`;
    if (it.sub) info += `<p class="ev-sub">${esc(it.sub)}</p>`;
    if (it.rows) {
      info += '<ol class="rows">' + it.rows.map((r, i) =>
        `<li><span class="n">${i + 1}.</span><span><b>${esc(r[0])}</b>${esc(r[1])}</span><span class="range">${r[2]}—${r[3]}</span></li>`
      ).join("") + "</ol>";
    }
    if (it.list) {
      info += '<ol class="rows">' + it.list.map((r, i) =>
        `<li><span class="n">${i + 1}.</span><span><b>${esc(r[0])}</b>${esc(r[1])}</span><span></span></li>`
      ).join("") + "</ol>";
    }

    let side = "";
    if (!it.center) {
      side = '<div class="ev-side">';
      if (it.t) side += `<p class="ev-time">${esc(it.t)}</p>`;
      // доклад с точным временем: время и плашка длительности; без времени — только длительность
      if (it.talk && it.at) side += `<p class="ev-time">${esc(it.at)}</p><span class="pill">${esc(it.dur)}</span>`;
      else if (it.talk) side += `<p class="ev-time dur">${esc(it.dur)}</p>`;
      else if (it.dur) side += `<span class="pill">${esc(it.dur)}</span>`;
      side += "</div>";
    }
    const emoji = it.emoji ? `<span class="ev-emoji" aria-hidden="true">${it.emoji}</span>` : "";
    return `<div class="${cls.join(" ")}">${emoji}<div class="ev-info">${info}</div>${side}</div>`;
  }

  DAYS.forEach((d) => {
    const sec = document.createElement("section");
    sec.className = "day";
    sec.id = d.id;
    sec.style.setProperty("--bg", `var(${d.bg})`);
    sec.style.setProperty("--fg", `var(${d.fg})`);
    sec.style.setProperty("--gap", d.gap);
    // линия «сейчас»: жёлтая на тёмных днях, красная на светлых
    const lightDay = d.fg === "--ink";
    sec.style.setProperty("--now", lightDay ? "var(--signal-on-light)" : "var(--signal-on-dark)");
    sec.style.setProperty("--now-ink", lightDay ? "var(--paper)" : "var(--ink)");
    // плашки длительности: чёрные на светлых днях, полупрозрачные белые на тёмных
    sec.style.setProperty("--pill-bg", lightDay ? "var(--ink)" : "var(--pill-on-dark)");
    sec.style.setProperty("--pill-fg", lightDay ? "var(--paper)" : "var(--pill-ink-on-dark)");
    const dateLabel = `${d.date[2]} ${MONTHS[d.date[1] - 1]}`;
    sec.setAttribute("aria-label", `${d.title.replace(/\s*:\($/, "")}, ${dateLabel}`);
    sec.innerHTML =
      `<div class="day-in"><h2 class="day-title"><span>${esc(d.title)}</span></h2>` +
      `<div class="sched">${d.items.map(renderItem).join("")}</div></div>`;
    daysEl.appendChild(sec);
    d.el = sec;

    // привязываем DOM к записям таймлайна
    const nodes = sec.querySelectorAll(".ev");
    let k = 0;
    d.items.forEach((it) => {
      if (it === LINE || it.banner) return;
      const e = it._e;
      e.el = nodes[k++];
      e.side = e.el.querySelector(".ev-side");
      if (e.rows.length) e.rows.forEach((r, i) => { r.el = e.el.querySelectorAll(".rows li")[i]; });
    });
  });

  const overEl = document.createElement("p");
  overEl.className = "camp-over";
  overEl.textContent = "Кэмп закончился. До встречи!";
  overEl.hidden = true;
  DAYS[DAYS.length - 1].el.querySelector(".day-in").appendChild(overEl);

  // Якоря по дням
  DAYS.forEach((d) => {
    const a = document.createElement("a");
    a.className = "chip";
    a.id = "chip-" + d.id;
    a.href = "#" + d.id;
    a.innerHTML = `<b>${d.wd}</b><span>${d.date[2]}</span>`;
    a.setAttribute("aria-label", `${d.title.replace(/\s*:\($/, "")}, ${d.date[2]} ${MONTHS[d.date[1] - 1]}`);
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      scrollToDay(d, true);
    });
    chipsEl.appendChild(a);
    d.chip = a;
  });

  // ---------- Состояние «сейчас» ----------
  let target = null;          // { e, kind: "now" | "next" }

  function plural(n, one, few, many) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }
  function until(ms, startTs) {
    const mins = Math.max(1, Math.ceil(ms / MIN));
    if (mins < 60) return `через ${mins} мин`;
    if (mins < 12 * 60) {
      const h = Math.floor(mins / 60), m = mins % 60;
      return `через ${h} ч` + (m ? ` ${m} мин` : "");
    }
    const now = new Date(clock());
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const s = new Date(startTs);
    const b = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
    const days = Math.round((b - a) / (24 * 60 * MIN));
    if (days <= 0) return `через ${Math.floor(mins / 60)} ч`;
    if (days === 1) return "завтра";
    return `через ${days} ${plural(days, "день", "дня", "дней")}`;
  }
  const hhmm = (ts) => { const d = new Date(ts); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

  function updateStatus() {
    const now = clock();
    let current = null, next = null;
    allEntries.forEach((e) => {
      let isNow = false;
      if (e.start != null) {
        isNow = e.start <= now && now < e.end;
        if (isNow) current = e;
        if (!next && e.start > now) next = e;
      }
      e.el.classList.toggle("is-now", isNow);
      e.rows.forEach((r) => r.el.classList.toggle("is-past", r.end <= now));
      const old = e.el.querySelector(".pill.status");
      if (old) old.remove();
    });

    target = current ? { e: current, kind: "now" } : next ? { e: next, kind: "next" } : null;
    if (target && target.kind === "next" && target.e.side) {
      const p = document.createElement("span");
      p.className = "pill status";
      p.textContent = until(target.e.start - now, target.e.start);
      target.e.side.appendChild(p);
    }
    placeNowLine(now, next);
    markPast(now);

    const todayStr = new Date(now).toDateString();
    DAYS.forEach((d) => {
      d.chip.classList.toggle("today", new Date(dayStart(d)).toDateString() === todayStr);
      d.chip.classList.toggle("is-over", d.end <= now);
    });
    overEl.hidden = !!target;
    updateNowButton();
  }

  // ---------- Линия «сейчас» ----------
  // Стоит между последним начавшимся пунктом и следующим.
  // Если вокруг на 12 часов ничего нет (до или после кэмпа), линию не показываем.
  const NEAR = 12 * 60 * MIN;
  const nowLine = document.createElement("div");
  nowLine.className = "nowline";
  nowLine.setAttribute("role", "note");
  nowLine.innerHTML = '<span class="nowline-dot" aria-hidden="true"></span><span class="nowline-rule" aria-hidden="true"></span><span class="nowline-label"></span>';
  const nowLabel = nowLine.querySelector(".nowline-label");

  function placeNowLine(now, next) {
    let last = null;
    for (const e of timeline) { if (e.start <= now) last = e; else break; }
    const nearLast = last && now - last.end < NEAR;
    const nearNext = next && next.start - now < NEAR;
    if (!nearLast && !nearNext) { nowLine.remove(); return; }

    const running = last && now < last.end;
    if (running || (last && (!next || next.day === last.day))) last.el.after(nowLine);
    else next.el.before(nowLine);   // утро нового дня или начало кэмпа: линия над первым пунктом

    nowLabel.textContent = "сейчас " + hhmm(now);
    nowLine.setAttribute("aria-label", "Сейчас " + hhmm(now));
  }

  // Серым — всё, что выше линии «сейчас»: пункты, разделители, плашки про лекции.
  // Идущий пункт остаётся ярким. Заголовок дня сереет, когда день закончился.
  function markPast(now) {
    const all = [...daysEl.querySelectorAll(".sched > *")];
    let edge;
    if (nowLine.isConnected) edge = all.indexOf(nowLine);
    else edge = timeline.length && now < timeline[0].start ? 0 : all.length;
    all.forEach((el, i) => {
      if (el === nowLine) return;
      el.classList.toggle("is-past", i < edge && !el.classList.contains("is-now"));
    });
    DAYS.forEach((d) => d.el.querySelector(".day-title").classList.toggle("is-past", d.end <= now));
  }

  // ---------- Прокрутка ----------
  const headerH = () => bar.getBoundingClientRect().height;
  const scrollBehavior = (smooth) =>
    smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant";

  // Пока страница едет к выбранному дню, подсвечиваем его якорь, а не промежуточные дни
  let lockedDay = null, lockTimer = 0;
  function lockTo(d) {
    lockedDay = d;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { lockedDay = null; onScroll(); }, 1200);
  }
  window.addEventListener("scrollend", () => {
    if (!lockedDay) return;
    clearTimeout(lockTimer);
    lockedDay = null;
    onScroll();
  });

  function scrollToDay(d, smooth) {
    const top = d.el.getBoundingClientRect().top + window.scrollY - headerH() + 1;
    lockTo(d);
    onScroll();
    window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior(smooth) });
  }

  function scrollToTarget(smooth) {
    if (!target) return;
    const e = target.e;
    const d = e.day;
    // если это начало дня — показываем и заголовок дня
    const firstTwo = allEntries.filter((x) => x.day === d).slice(0, 2);
    const anchor = firstTwo.includes(e) ? d.el : e.el;
    const offset = anchor === d.el ? 0 : headerH() + 72;
    const top = anchor.getBoundingClientRect().top + window.scrollY - (anchor === d.el ? headerH() - 1 : offset);
    lockTo(d);
    window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior(smooth) });
  }

  // Линия «сейчас» встаёт на треть экрана под шапкой: видно и что было, и что дальше.
  // Если линии нет (до или после кэмпа) — к ближайшему событию.
  function scrollToNow(smooth) {
    if (!nowLine.isConnected) { scrollToTarget(smooth); return; }
    const h = headerH();
    const top = nowLine.getBoundingClientRect().top + window.scrollY - h - (window.innerHeight - h) * 0.35;
    lockTo(DAYS.find((d) => d.el.contains(nowLine)));
    window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior(smooth) });
  }

  function updateNowButton() {
    if (!target) { nowBtn.hidden = true; return; }
    const r = (nowLine.isConnected ? nowLine : target.e.el).getBoundingClientRect();
    const below = r.top > window.innerHeight - 70;
    nowBtn.hidden = !(below || r.bottom < headerH());
    const dir = below ? "↓" : "↑";
    const label = target.kind === "now" ? `Сейчас ${hhmm(clock())}` : "Сейчас";
    nowBtn.innerHTML = `${esc(label)}<span class="arr" aria-hidden="true">${dir}</span>`;
  }

  nowBtn.addEventListener("click", () => {
    if (!target) return;
    scrollToNow(true);
  });

  // Держим фильтр текущего дня в видимой части ленты
  function revealChip(chip) {
    if (!chip) return;
    const pad = 16;
    const l = chip.offsetLeft, r = l + chip.offsetWidth;
    const vl = chipsEl.scrollLeft, vr = vl + chipsEl.clientWidth;
    if (l - pad < vl) chipsEl.scrollTo({ left: l - pad, behavior: "smooth" });
    else if (r + pad > vr) chipsEl.scrollTo({ left: r + pad - chipsEl.clientWidth, behavior: "smooth" });
  }

  // Шапка красится в цвет дня, который сейчас под ней
  let ticking = false;
  let lastInView = null;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = headerH() + 2;
      let cur = DAYS[0];
      for (const d of DAYS) if (d.el.getBoundingClientRect().top <= y) cur = d;
      // у самого низа страницы последний день может не доехать до шапки
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) cur = DAYS[DAYS.length - 1];
      const root = document.documentElement.style;
      root.setProperty("--hbg", `var(${cur.bg})`);
      root.setProperty("--hfg", `var(${cur.fg})`);
      const active = lockedDay || cur;
      DAYS.forEach((d) => {
        if (d === active) d.chip.setAttribute("aria-current", "true");
        else d.chip.removeAttribute("aria-current");
      });
      if (active !== lastInView) { lastInView = active; revealChip(active.chip); }
      updateNowButton();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { fitTitles(); onScroll(); });

  // Заголовок дня всегда в одну строку и по ширине колонки
  function fitTitles() {
    DAYS.forEach((d) => {
      const h = d.el.querySelector(".day-title");
      const span = h.firstElementChild;
      h.style.fontSize = "";
      const avail = h.clientWidth;
      const w = span.getBoundingClientRect().width;
      if (w > avail && avail > 0) {
        const base = parseFloat(getComputedStyle(h).fontSize);
        h.style.fontSize = (base * avail / w * 0.97).toFixed(1) + "px";
      }
    });
  }

  // ---------- Старт ----------
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  document.documentElement.style.setProperty("--page", `var(${DAYS[DAYS.length - 1].bg})`);
  // При каждом открытии страница встаёт на текущее время
  function openAtNow() {
    updateStatus();
    fitTitles();
    scrollToNow(false);
    onScroll();
  }
  openAtNow();

  // После загрузки шрифтов вёрстка чуть меняется — выравниваем ещё раз,
  // если человек за это время сам не начал листать
  let touched = false;
  ["touchstart", "wheel", "keydown"].forEach((t) => window.addEventListener(t, () => { touched = true; }, { once: true, passive: true }));
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(() => {
    if (!touched) openAtNow();
  });

  // Браузер вернул страницу из кэша (кнопка «назад», переключение вкладок на телефоне)
  window.addEventListener("pageshow", (ev) => { if (ev.persisted) openAtNow(); });
  // Вернулись на вкладку после долгого перерыва — тоже к текущему времени
  const AWAY = 10 * 60 * 1000;
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > AWAY) openAtNow();
    else updateStatus();
  });

  setInterval(updateStatus, 15 * 1000);
  window.addEventListener("hashchange", () => {
    if (!readOverride()) return;
    clock = readOverride();
    openAtNow();
  });
})();
