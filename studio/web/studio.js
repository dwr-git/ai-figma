/* AI-Figma — помощник и файлы на сервере внутри редактора интерфейсов.
 *
 * Панель в браузере разговаривает с моделью через api/assistant.php, а действия
 * выполняет в самом редакторе через window.aifigma (apps/figcraft-web/src/bridge.rs):
 * те же методы, что у десктопного канала управления (crates/ui-egui/src/control.rs).
 * Файлы хранятся на вашем сервере (api/files.php), у каждого пользователя свои.
 *
 * Без сборщиков и зависимостей: один файл, подключается из index.html.
 */
(() => {
  'use strict';

  const CFG = Object.assign({
    api: 'api/assistant.php',
    files: 'api/files.php',
    homeUrl: '../',
    labels: 'studio/ru-labels.json',
    defaultTheme: 'brand',     // тема при первом запуске
    autosaveSeconds: 60,       // автосохранение на сервер файла, который там уже лежит (0 — выключить)
    maxSteps: 12,              // сколько шагов подряд помощник может сделать за один запрос
    screenshotMax: 1024,       // длинная сторона снимка экрана для модели, px
    openOnStart: false,
    filesOnStart: true,
  }, window.STUDIO_CONFIG || {});
  // Страница сборки лежит в b/<номер>/ (studio/build/versioned.sh); адреса из настроек — от папки приложения.
  const fromRoot = (p) => { try { return new URL(p, window.STUDIO_ROOT || document.baseURI).href; } catch { return p; } };
  CFG.api = fromRoot(CFG.api);
  CFG.files = fromRoot(CFG.files);
  CFG.homeUrl = fromRoot(CFG.homeUrl || '../');

  const isDarkTheme = (id) => id === 'dark' || id === 'brand';
  const READ_TOOLS = new Set(['find_commands', 'get_state', 'inspect_layer', 'look_at_screen', 'list_templates']);
  const TPL = () => window.AIFigmaTemplates;
  // Никогда: выход, ссылки наружу, служебное, тема (у панели своя кнопка), настройки, плагины, сохранение (его делает панель).
  const DENY = /^(app\.|help\.|view\.theme|file\.(quit|exit|print|page|save|open|import|export)|pref\.|plugin|libraries\.|live\.|dev\.|window\.)/i;
  // Только после подтверждения пользователя.
  const CONFIRM = /^(file\.(close|revert|new)|page\.delete|style\.delete|variable\.(delete|removeMode|deleteCollection)|component\.delete|version\.)/i;

  // ------------------------------------------------------------------ мост к редактору
  const VC = () => window.aifigma;
  const PC = {
    ready: () => !!(VC() && typeof VC().request === 'function'),
    async call(method, params) {
      if (!PC.ready()) throw new Error('Редактор ещё загружается');
      return VC().request(method, params ?? {});
    },
    exec(id, params) {
      const p = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
      return PC.call('engine.execute', { command: id, params: p });
    },
  };
  // Для своих скриптов и отладки из консоли: await aifigma.call('ui.inspect')
  window.aifigmaStudio = { call: PC.call, exec: PC.exec };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const withTimeout = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ': нет ответа'); })]);
  const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…[обрезано]' : s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('aifigma.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('aifigma.' + k, JSON.stringify(v)); } catch { /* приватный режим */ } },
  };

  // ------------------------------------------------------------------ русские названия
  let L = { text: {}, id: {} };
  const labelsLoaded = fetch(CFG.labels).then((r) => (r.ok ? r.json() : L)).then((j) => { L = j; }).catch(() => {});
  function ru(label) {
    if (!label) return '';
    if (L.text[label]) return L.text[label];
    const bare = label.replace(/…$/, '');
    if (bare !== label && L.text[bare]) return L.text[bare] + '…';
    return label;
  }
  const menuOf = (c) => (Array.isArray(c.menu) ? c.menu : String(c.menu || '').split('/').filter(Boolean));
  const ruName = (c) => L.id[c.id] || ru(c.label);
  const ruPath = (c) => [...menuOf(c).map(ru), ruName(c)].join(' › ');

  // ------------------------------------------------------------------ поиск команд
  let catalog = null;
  let catalogAt = 0;
  async function commands() {
    if (!catalog || Date.now() - catalogAt > 3000) {
      catalog = await PC.call('engine.commands');
      catalogAt = Date.now();
    }
    return catalog;
  }
  // Частые просьбы → слова, которыми такие команды называются.
  const SYN = [
    [/прямоуг|квадрат|плашк|карточк/, 'shape rectangle'], [/круг|эллипс|овал|аватар/, 'shape ellipse'], [/звезд/, 'star'],
    [/многоуг|треуг/, 'polygon'], [/лини|отрез|разделител/, 'line'], [/стрелк/, 'arrow'],
    [/фрейм|экран|артборд|макет|страниц[аеу] сайта|монтажн/, 'frame create'], [/секци/, 'section'],
    [/текст|надпис|заголов|шрифт|букв|абзац/, 'text create font'], [/кнопк/, 'frame layout text rectangle component'],
    [/автолейаут|auto ?layout|автораскладк|стопк|в столбик|в ряд|отступ|паддинг|зазор/, 'layout add gap padding'],
    [/компонент/, 'component create instance'], [/экземпляр|инстанс/, 'instance'], [/вариант/, 'variant component set'],
    [/стил/, 'style'], [/переменн|токен|режим/, 'variable mode collection'], [/прототип|переход|клик|ссылк на экран|сценар/, 'proto prototype interaction flow'],
    [/выровн|выравн|по центру/, 'align hcenter vcenter left right top bottom'], [/распредел/, 'distribute spacing'],
    [/групп/, 'group ungroup'], [/обвод|рамк|толщин/, 'stroke weight'], [/залив|фон/, 'fill'],
    [/цвет|перекрас|покрас/, 'fill color stroke'], [/градиент/, 'gradient fill'], [/тен/, 'effect drop shadow'],
    [/размыт/, 'blur effect'], [/эффект/, 'effect'], [/скругл|радиус|угл/, 'corner radius'],
    [/сло[йияе]/, 'layer'], [/объедин|слить|сложи/, 'bool union'], [/вычест|вырез/, 'bool subtract'], [/пересеч/, 'bool intersect'],
    [/исключ/, 'bool exclude'], [/поверн|вращ/, 'rotate'], [/отраз|зеркал/, 'flip'], [/масштаб|размер|уменьш|увелич/, 'scale resize width height'],
    [/сдвин|перемест|подвин/, 'move nudge x y'], [/дубл|копи|повтор/, 'duplicate copy'], [/удал/, 'delete'],
    [/выдел/, 'select'], [/маск|обрез/, 'mask clip'], [/порядок|вперёд|впереди|назад|позади|наверх|вниз/, 'arrange bring front send back'],
    [/блокир|закреп/, 'lock'], [/скры|спрят|показ/, 'hide show visible'], [/картин|изображен|фото/, 'image place'],
    [/сетк/, 'grid layout'], [/направляющ/, 'guide'], [/прозрач|непрозрач/, 'opacity'], [/переименова|назови|название/, 'rename'],
    [/страниц/, 'page'], [/коммент/, 'comment'], [/отмен/, 'undo'], [/масштаб вида|приблиз|отдал/, 'zoom'],
  ];
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
  async function findCommands(query) {
    const all = await commands();
    await labelsLoaded;
    const q = norm(query).trim();
    if (!q) return { results: [], hint: 'Пустой запрос' };
    const terms = new Set(q.split(/[^\p{L}\p{N}.]+/u).filter((t) => t.length > 1));
    for (const [re, words] of SYN) if (re.test(q)) words.split(' ').forEach((w) => terms.add(w));
    const scored = [];
    for (const c of all) {
      if (DENY.test(c.id)) continue;
      const name = norm(ruName(c));
      const en = norm(c.label);
      const path = norm(menuOf(c).map(ru).join(' ') + ' ' + menuOf(c).join(' '));
      const id = norm(c.id);
      const kw = norm(c.keywords);
      let s = 0;
      if (name === q || en === q) s += 20;
      else if (name.includes(q) || en.includes(q)) s += 10;
      for (const t of terms) {
        if (name.includes(t)) s += name.startsWith(t) ? 7 : 5;
        if (en.includes(t)) s += en.startsWith(t) ? 6 : 4;
        if (id.includes(t)) s += 3;
        if (kw.includes(t)) s += 3;
        if (path.includes(t)) s += 1;
      }
      if (s > 0) scored.push([s + (menuOf(c).length ? 1 : 0), c]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const results = scored.slice(0, 10).map(([, c]) => ({
      id: c.id,
      name: ruName(c),
      menu: ruPath(c),
      shortcut: c.shortcut || undefined,
      params: c.params ? clip(String(c.params), 600) : undefined,
    }));
    return results.length ? { results } : { results: [], hint: 'Ничего не найдено. Попробуй другие слова, можно по-английски (например: rectangle, frame, text, layout, component, align).' };
  }

  // ------------------------------------------------------------------ состояние и снимок экрана
  // Дерево слоёв: имена, типы, id, размеры — без лишнего, чтобы влезло в контекст модели.
  function slim(n, depth) {
    if (!n || typeof n !== 'object') return n;
    const o = { id: n.id, type: n.type || n.kind, name: n.name };
    for (const k of ['x', 'y', 'width', 'height']) if (typeof n[k] === 'number') o[k] = Math.round(n[k] * 10) / 10;
    if (n.characters) o.text = clip(String(n.characters), 80);
    if (n.layout) o.layout = typeof n.layout === 'string' ? n.layout : (n.layout.mode || n.layout.direction || 'auto');
    if (n.visible === false) o.hidden = true;
    const kids = Array.isArray(n.children) ? n.children : [];
    if (kids.length && depth > 0) o.children = kids.slice(0, 30).map((c) => slim(c, depth - 1));
    if (kids.length > 30) o.more = kids.length - 30;
    else if (kids.length && depth <= 0) o.childCount = kids.length;
    return o;
  }
  async function snapshot() {
    const ui = await PC.call('ui.inspect');
    const state = { tool: ui.tool, home: !!ui.home };
    try {
      const d = await PC.call('document.inspect', { depth: 3 });
      if (d && d.name) {
        state.file = { name: d.name, unsaved: !!d.dirty, onServer: !!(d.path && String(d.path).startsWith('page:')) };
        state.selection = d.selection;
        state.currentPage = d.currentPage;
        const pages = Array.isArray(d.pages) ? d.pages : [];
        state.pages = pages.map((p) => ({ id: p.id, name: p.name, current: p.id === d.currentPage }));
        const cur = pages.find((p) => p.id === d.currentPage);
        if (cur) state.layers = JSON.parse(clip(JSON.stringify((cur.children || []).slice(0, 40).map((c) => slim(c, 2))), 5000).replace(/…\[обрезано\]$/, '') || '[]');
        if (d.history && Array.isArray(d.history.undo)) state.lastSteps = d.history.undo.slice(-5);
        if (Array.isArray(d.styles) && d.styles.length) state.styles = d.styles.slice(0, 30);
      } else {
        state.file = null;
        state.note = 'Файл не открыт';
      }
    } catch {
      state.file = null;
      state.note = 'Файл не открыт';
    }
    return state;
  }

  function downscale(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, CFG.screenshotMax / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72).split(',')[1]);
      };
      img.onerror = () => reject(new Error('не удалось прочитать снимок'));
      img.src = src;
    });
  }
  // Запасной путь, если ui.screenshot не ответил: холст WebGL/WebGPU очищается после показа
  // кадра, поэтому читаем его сразу после того, как редактор нарисовал кадр.
  let frameWaiters = [];
  const origRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => origRAF((t) => {
    cb(t);
    if (!frameWaiters.length) return;
    const waiters = frameWaiters;
    frameWaiters = [];
    let url = null;
    try { url = document.getElementById('figcraft_canvas').toDataURL('image/png'); } catch { /* холст недоступен */ }
    waiters.forEach((w) => w(url));
  });
  const nextFrame = () => new Promise((resolve) => { frameWaiters.push(resolve); });
  // Однотонный снимок — значит, попали между кадрами.
  function looksBlank(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 32;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, 48, 32);
        const d = g.getImageData(0, 0, 48, 32).data;
        const seen = new Set();
        for (let i = 0; i < d.length && seen.size < 6; i += 4 * 5) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]);
        resolve(seen.size < 4);
      };
      img.onerror = () => resolve(true);
      img.src = src;
    });
  }
  let nativeShotWorks = true;
  async function screenshot() {
    if (!PC.ready()) return null;
    // 1. Снимок окна средствами самого редактора (ui.screenshot).
    if (nativeShotWorks && typeof VC().screenshot === 'function') {
      try {
        const r = await withTimeout(VC().screenshot({ data: true }), 4000, 'снимок');
        const b64 = r && (r.pngBase64 || r.base64 || r.data);
        if (typeof b64 === 'string' && b64.length > 100) return await downscale('data:image/png;base64,' + b64);
      } catch { nativeShotWorks = false; }
    }
    // 2. Холст сразу после кадра.
    for (let attempt = 0; attempt < 4; attempt++) {
      PC.call('ui.inspect').catch(() => {}); // любой запрос заставляет редактор нарисовать кадр
      const url = await Promise.race([nextFrame(), sleep(1500).then(() => null)]);
      if (url && !(await looksBlank(url))) {
        try { return await downscale(url); } catch { return null; }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ интерфейс
  const ICON = {
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M12.5 5.5l6 6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.2a2 2 0 0 0-1.4 3.4A1.6 1.6 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    // Мозг — контур из набора Tabler Icons (MIT), нарисованный градиентом #st-brain-grad.
    brain: '<svg class="st-brain-svg" viewBox="0 0 24 24" fill="none" stroke="url(#st-brain-grad)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"/><path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"/><path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"/><path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"/><path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"/><path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l-8 11h6l-1 7 8-11h-6z"/></svg>',
  };
  // Живой контур: мозг градиентом и три точки на орбите, пока помощник работает.
  const BRAIN = `${ICON.brain}<b class="st-orbit" aria-hidden="true"><i></i><i></i><i></i></b>`;

  const root = document.createElement('div');
  root.id = 'studio-root';
  root.dataset.theme = 'light';
  root.innerHTML = `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="st-brain-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fa2ff"/><stop offset=".55" stop-color="#9b7cf0"/><stop offset="1" stop-color="#ff77c6"/></linearGradient></defs></svg>
    <div class="st-veil" aria-hidden="true"></div>
    <div class="st-drop" aria-hidden="true"><span>Отпустите, чтобы открыть в редакторе</span></div>
    <aside class="st-panel" aria-label="Помощник">
      <header class="st-head">
        <div class="st-logo st-brain st-raised-sm" aria-hidden="true">${BRAIN}</div>
        <div class="st-title"><b>Помощник</b><small data-ref="sub">Загрузка редактора…</small></div>
        <button class="st-icon-btn" data-ref="galleryBtn" title="Шаблоны и быстрые задачи" aria-label="Шаблоны и быстрые задачи">${ICON.layout}</button>
        <button class="st-icon-btn" data-ref="filesBtn" title="Мои файлы (на сервере)" aria-label="Мои файлы">${ICON.folder}</button>
        <button class="st-icon-btn" data-ref="barBtn" title="Быстрая строка (Ctrl+Shift+Пробел)" aria-label="Быстрая строка">${ICON.bolt}</button>
        <div class="st-theme-wrap">
          <button class="st-icon-btn" data-ref="theme" title="Тема оформления" aria-label="Тема оформления" aria-haspopup="menu" aria-expanded="false">${ICON.palette}</button>
          <div class="st-theme-menu" data-ref="themeMenu" role="menu" hidden></div>
        </div>
        <button class="st-icon-btn" data-ref="hide" title="Свернуть панель" aria-label="Свернуть панель">${ICON.close}</button>
      </header>
      <div class="st-seg st-pressed" role="group" aria-label="Режим помощника">
        <button data-mode="advice" aria-pressed="true">${ICON.bulb}Совет</button>
        <button data-mode="act" aria-pressed="false">${ICON.hand}Сделай</button>
      </div>
      <div class="st-mode-hint" data-ref="hint"></div>
      <div class="st-log" data-ref="log" role="log" aria-live="polite"></div>
      <div class="st-composer">
        <div class="st-input st-pressed">
          <button class="st-icon-btn" data-ref="eye" aria-pressed="true" title="Показывать помощнику экран" aria-label="Показывать помощнику экран">${ICON.eye}</button>
          <textarea data-ref="input" rows="1" placeholder="Спросите или попросите…" aria-label="Сообщение помощнику"></textarea>
          <button class="st-send" data-ref="send" title="Отправить (Enter)" aria-label="Отправить">${ICON.send}</button>
        </div>
        <div class="st-foot"><span>Ctrl+Z — отменить · Ctrl+Shift+Пробел — строка</span><button data-ref="clear">Новый разговор</button></div>
      </div>
    </aside>
    <div class="st-files" data-ref="files" role="dialog" aria-modal="true" aria-label="Мои файлы" hidden>
      <div class="st-files-box">
        <header class="st-files-head">
          <b>Мои файлы</b><small data-ref="filesWho"></small>
          <button class="st-icon-btn" data-ref="filesClose" title="Закрыть (Esc)" aria-label="Закрыть">${ICON.x}</button>
        </header>
        <div class="st-files-tools">
          <input data-ref="filesSearch" type="search" placeholder="Поиск по имени" aria-label="Поиск по имени">
          <button class="st-mini" data-ref="filesNew">Новый файл</button>
          <button class="st-mini" data-ref="filesUpload" title=".figcraft, .fig, .svg, картинки">С компьютера…</button>
        </div>
        <div class="st-files-list" data-ref="filesList"></div>
        <footer class="st-files-foot">
          <span data-ref="filesCurrent"></span>
          <button class="st-mini" data-ref="filesSaveAs">Сохранить как…</button>
          <button class="st-mini primary" data-ref="filesSave">Сохранить</button>
        </footer>
      </div>
    </div>
    <div class="st-files st-gallery" data-ref="gallery" role="dialog" aria-modal="true" aria-label="Шаблоны" hidden>
      <div class="st-files-box st-gallery-box">
        <header class="st-files-head">
          <div class="st-gtabs" role="tablist"><button data-gtab="tpl" aria-selected="true">Шаблоны</button><button data-gtab="tasks" aria-selected="false">Быстрые задачи</button></div>
          <small data-ref="galleryHint">Нажмите на шаблон — он появится на холсте. Его можно менять как угодно.</small>
          <button class="st-icon-btn" data-ref="galleryClose" title="Закрыть (Esc)" aria-label="Закрыть">${ICON.x}</button>
        </header>
        <div class="st-gpane" data-pane="tpl">
          <div class="st-files-tools">
            <input data-ref="gSearch" type="search" placeholder="Найти: кнопка, вход, лендинг, сторис…" aria-label="Поиск шаблона">
            <div class="st-swatches" data-ref="gAccents" role="radiogroup" aria-label="Цвет"></div>
            <button class="st-mini" data-ref="gDark" aria-pressed="false" title="Светлый или тёмный вариант">Светлый</button>
          </div>
          <div class="st-gbody"><nav class="st-gcats" data-ref="gCats"></nav><div class="st-ggrid" data-ref="gGrid"></div></div>
        </div>
        <div class="st-gpane" data-pane="tasks" hidden><div class="st-gtasks" data-ref="gTasks"></div></div>
      </div>
    </div>
    <div class="st-ask" data-ref="ask" role="dialog" aria-modal="true" hidden>
      <form class="st-ask-box">
        <b data-ref="askTitle"></b>
        <input data-ref="askInput" type="text" maxlength="120">
        <small data-ref="askNote"></small>
        <div class="st-row"><button type="button" class="st-mini" data-ref="askCancel">Отмена</button><button type="submit" class="st-mini primary" data-ref="askOk">OK</button></div>
      </form>
    </div>
    <button class="st-fab st-brain" data-ref="fab" title="Помощник" aria-label="Открыть помощника">${BRAIN}<span class="st-badge" aria-hidden="true"></span></button>
    <div class="st-bar" data-ref="bar" role="dialog" aria-label="Быстрая строка помощника">
      <div class="st-bar-answer" data-ref="barAnswer"></div>
      <div class="st-bar-row">
        <button class="st-bar-mode" data-ref="barMode" title="Режим: Совет или Сделай"></button>
        <input data-ref="barInput" type="text" placeholder="Что нарисовать или изменить? Enter — отправить, Esc — закрыть" aria-label="Запрос помощнику">
        <button class="st-send" data-ref="barSend" aria-label="Отправить">${ICON.send}</button>
      </div>
    </div>`;
  const $ = (name) => root.querySelector(`[data-ref="${name}"]`);
  const log = $('log');
  const input = $('input');

  // Клавиши, набранные в панели, не должны доходить до редактора (иначе «B» выберет кисть).
  for (const type of ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  let mode = store.get('mode', 'advice');
  let attachScreen = store.get('eye', true);
  let busy = false;
  let stopRequested = false;
  let convo = [];

  const HINTS = {
    advice: 'Объясняю и подсказываю, ничего не меняю в документе.',
    act: 'Делаю сам: собираю экраны и компоненты, включаю автолейаут, крашу, выравниваю. Всё отменяется Ctrl+Z.',
  };
  // Модель видит всю переписку. Если раньше она писала «я в режиме Совет», то по инерции продолжает
  // так отвечать и после переключения. Поэтому смена режима отмечается прямо в разговоре,
  // а каждое сообщение пользователя несёт текущий режим.
  const MODE_NOTE = {
    act: '[Режим переключён на «Сделай». Теперь ты сам выполняешь просьбы инструментами (find_commands, run_command, open_command…). Всё, что ты раньше писал про режим «Совет», больше не действует.]',
    advice: '[Режим переключён на «Совет». Теперь только объясняй и подсказывай, ничего не меняй в документе.]',
  };
  const MODE_TAG = {
    act: '[Режим сейчас: «Сделай» — выполни это сам, инструментами]',
    advice: '[Режим сейчас: «Совет» — объясни, как сделать, ничего не меняя]',
  };
  function setMode(m) {
    const next = m === 'act' ? 'act' : 'advice';
    if (next !== mode && convo.length) convo.push({ role: 'user', content: MODE_NOTE[next] });
    mode = next;
    store.set('mode', mode);
    root.querySelectorAll('.st-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('hint').textContent = HINTS[mode];
    const bm = root.querySelector('[data-ref="barMode"]');
    if (bm) bm.textContent = mode === 'act' ? 'Сделай' : 'Совет';
  }
  function setEye(on) {
    attachScreen = !!on;
    store.set('eye', attachScreen);
    $('eye').setAttribute('aria-pressed', String(attachScreen));
    $('eye').title = attachScreen ? 'Помощник видит экран' : 'Помощник не видит экран';
  }
  function setOpen(open) {
    root.classList.toggle('open', open);
    document.body.classList.toggle('studio-open', open);
    setTimeout(syncBackdrop, 60);
    setTimeout(syncBackdrop, 400);
    store.set('open', open);
    // eframe подхватывает новый размер canvas на следующем кадре
    window.dispatchEvent(new Event('resize'));
    if (open) { setTimeout(() => input.focus(), 200); root.classList.remove('has-hints'); }
  }
  function setBusy(on) {
    busy = on;
    root.classList.toggle('busy', on);
    $('send').innerHTML = on ? ICON.stop : ICON.send;
    $('send').title = on ? 'Остановить' : 'Отправить (Enter)';
  }
  function scroll() { log.scrollTop = log.scrollHeight; }

  function format(text) {
    // Строки списка «- …» / «* …» — с точкой; короткая строка, оканчивающаяся двоеточием, — заголовок.
    text = text.trim().split('\n').map((line) => {
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (li) return '\u0001' + (/^\s*\d/.test(line) ? line.trim().match(/^\d+[.)]/)[0] + ' ' : '• ') + li[1] + '\u0002';
      const head = line.match(/^\s*(?:#{1,4}\s*)?\**([^*:]{2,60}):\**\s*$/);
      if (head) return '\u0003' + head[1] + ':\u0004';
      return line.replace(/^#{1,4}\s+/, '');
    }).join('\n').replace(/\u0002\n/g, '\u0002');  // пункт списка — блок: перенос после него лишний
    let h = esc(text);
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/\((Ctrl|Shift|Alt|Cmd|⌘|⇧|⌥)([^)\n]{0,24})\)/g, '(<kbd>$1$2</kbd>)');
    // «Изображение › Коррекция › Кривые» — путь в меню
    // Сегменты — слова через одиночные пробелы: конечный пробел не должен «съедать» разделитель.
    const C = '[^\\s›«»"():.,!?;<>&]';
    const word = `${C}+`;
    const path = new RegExp(`([А-ЯЁA-Z]${C}*(?: ${word}){0,2}(?: › ${word}(?: ${word}){0,3}){1,4})`, 'g');
    h = h.replace(path, '<span class="st-path">$1</span>');
    h = h.replace(/\u0001/g, '<span class="st-li">').replace(/\u0002/g, '</span>')
      .replace(/\u0003/g, '<span class="st-h">').replace(/\u0004/g, '</span>');
    return h;
  }
  function add(el) { log.querySelector('.st-empty')?.remove(); log.appendChild(el); scroll(); return el; }
  function msg(cls, html) { const d = document.createElement('div'); d.className = 'st-msg ' + cls; d.innerHTML = html; return add(d); }
  function typing(on) {
    log.querySelector('.st-typing')?.remove();
    if (on) { const t = document.createElement('div'); t.className = 'st-typing st-raised-sm'; t.innerHTML = '<i></i><i></i><i></i>'; add(t); }
  }

  const ACTION_TEXT = {
    find_commands: (a) => ['Ищу команду', a.query],
    get_state: () => ['Смотрю состояние документа', ''],
    look_at_screen: () => ['Смотрю на экран', ''],
    inspect_layer: (a) => ['Смотрю слой', String(a.id || '')],
    list_templates: () => ['Смотрю шаблоны', ''],
    undo: (a) => ['Отменяю', `${a.steps || 1} шаг(а)`],
  };
  function card(name, args, label) {
    const d = document.createElement('div');
    const [title, detail] = label || (ACTION_TEXT[name] ? ACTION_TEXT[name](args) : [name, '']);
    d.className = 'st-act' + (READ_TOOLS.has(name) ? ' read' : '');
    d.innerHTML = `<span class="st-dot"></span><div class="st-act-text"><b>${esc(title)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
    return add(d);
  }
  function cardResult(d, ok, error, undoable) {
    if (!ok) {
      d.classList.add('fail');
      const s = d.querySelector('small') || d.querySelector('.st-act-text').appendChild(document.createElement('small'));
      s.textContent = error;
      return;
    }
    if (undoable) {
      const b = document.createElement('button');
      b.className = 'st-mini';
      b.textContent = 'Отменить';
      b.onclick = async () => {
        b.disabled = true;
        try { await PC.exec('edit.undo'); b.textContent = 'Отменено'; } catch (e) { b.textContent = 'Не вышло'; b.title = e.message; }
      };
      d.appendChild(b);
    }
  }
  function confirmAction(text) {
    return new Promise((resolve) => {
      const d = document.createElement('div');
      d.className = 'st-confirm st-raised';
      d.innerHTML = `<p>${esc(text)}</p><div class="st-row"><button class="st-mini danger" data-a="no">Не надо</button><button class="st-mini" data-a="yes">Разрешить</button></div>`;
      add(d);
      d.querySelectorAll('button').forEach((b) => {
        b.onclick = () => { d.remove(); resolve(b.dataset.a === 'yes'); };
      });
    });
  }

  function showEmpty() {
    log.innerHTML = `<div class="st-empty">
      <h3>Чем помочь?</h3>
      <p>Спросите, где найти функцию, или попросите собрать экран, кнопку или раскладку за вас.</p>
      <button class="st-mini primary st-start-tpl">Шаблоны и быстрые задачи</button>
      <div class="st-chips">
        <button class="st-chip" data-act="1">Сделай экран входа для телефона: заголовок, два поля и кнопка</button>
        <button class="st-chip" data-act="1">Сделай из выделенного автолейаут с отступами 16</button>
        <button class="st-chip">Как сделать компонент кнопки с вариантами?</button>
        <button class="st-chip">Как связать экраны в прототип?</button>
        <button class="st-chip" data-act="1">Выровняй выделенные слои по центру</button>
      </div></div>`;
    const st = log.querySelector('.st-start-tpl');
    if (st) st.onclick = () => Gallery.show(true, 'tpl');
    log.querySelectorAll('.st-chip').forEach((c) => {
      c.onclick = () => {
        if (c.dataset.act) setMode('act');
        input.value = c.textContent;
        send();
      };
    });
  }


  // ------------------------------------------------------------------ инструменты для модели
  async function commandById(id) {
    const c = (await commands()).find((x) => x.id === id);
    if (!c) throw new Error(`Нет команды «${id}». Найди нужную через find_commands.`);
    if (DENY.test(id)) throw new Error('Эту команду помощнику выполнять нельзя.');
    return c;
  }
  const short = (v) => (v === undefined || v === null ? { ok: true } : { ok: true, result: v });

  async function runTool(name, args) {
    if (mode !== 'act' && !READ_TOOLS.has(name)) {
      return { ok: false, error: 'Сейчас режим «Совет»: действия выключены. Объясни пользователю, как сделать это самому, или предложи переключиться в «Сделай».' };
    }
    switch (name) {
      case 'find_commands': {
        const d = card(name, args);
        const r = await findCommands(String(args.query || ''));
        cardResult(d, true);
        return r;
      }
      case 'get_state': {
        card(name, args);
        return await snapshot();
      }
      case 'inspect_layer': {
        const d = card(name, args);
        try {
          const r = await PC.call('node.get', { id: args.id, depth: Math.max(0, Math.min(3, parseInt(args.depth, 10) || 1)) });
          cardResult(d, true);
          return short(JSON.parse(clip(JSON.stringify(r), 5000).replace(/…\[обрезано\]$/, '') || 'null'));
        } catch (e) { cardResult(d, false, e.message); return { ok: false, error: e.message }; }
      }
      case 'look_at_screen': {
        const d = card(name, args);
        const img = await screenshot();
        cardResult(d, !!img, 'Снимок не получился');
        return img ? { ok: true, note: 'Снимок приложен следующим сообщением.', __image: img } : { ok: false, error: 'Снимок экрана не получился' };
      }
      case 'run_command':
      case 'open_command': {
        const c = await commandById(String(args.id || ''));
        const label = [name === 'open_command' ? 'Открываю' : 'Выполняю', ruPath(c)];
        if (CONFIRM.test(c.id) && !(await confirmAction(`Помощник хочет выполнить «${ruPath(c)}». Разрешить?`))) {
          card(name, args, ['Пропущено пользователем', ruPath(c)]).classList.add('fail');
          return { ok: false, error: 'Пользователь не разрешил это действие. Не повторяй его, спроси, как поступить.' };
        }
        const d = card(name, args, label);
        root.classList.add('acting');
        try {
          const r = name === 'open_command'
            ? await PC.call('ui.menu.invoke', { id: c.id })
            : await PC.exec(c.id, args.params && typeof args.params === 'object' ? args.params : null);
          cardResult(d, true, '', name === 'run_command' && c.undoable);
          return short(r && typeof r === 'object' ? JSON.parse(clip(JSON.stringify(r), 3000).replace(/…\[обрезано\]$/, '') || 'null') : r);
        } catch (e) {
          cardResult(d, false, e.message);
          return { ok: false, error: e.message, params_doc: c.params ? clip(String(c.params), 800) : undefined };
        } finally {
          root.classList.remove('acting');
        }
      }
      case 'list_templates': {
        card(name, args);
        return { templates: (TPL() ? TPL().list : []).map((t) => ({ id: t.id, name: t.name, group: t.cat, about: t.desc })) };
      }
      case 'insert_template':
      case 'build_design': {
        if (!TPL()) return { ok: false, error: 'Шаблоны не загрузились' };
        const opts = { accent: typeof args.accent === 'string' && /^#[0-9a-f]{6}$/i.test(args.accent) ? args.accent : undefined, dark: !!args.dark, into: args.into != null && args.into !== '' ? args.into : undefined };
        const t = name === 'insert_template' ? TPL().list.find((x) => x.id === args.template) : null;
        const d = card(name, args, name === 'insert_template' ? ['Вставляю шаблон', t ? t.name : String(args.template || '')] : ['Собираю макет', String((args.spec && args.spec.name) || '')]);
        root.classList.add('acting');
        try {
          const r = name === 'insert_template' ? await TPL().insert(VC(), String(args.template || ''), opts) : await TPL().build(VC(), args.spec, opts);
          cardResult(d, true, '', true);
          return { ok: true, id: r.id, layers: r.layers, note: 'Создано одним шагом; корневой слой выделен. Тексты и цвета меняй через node.set {ids:[…]} или inspect_layer.' };
        } catch (e) {
          cardResult(d, false, e.message);
          return { ok: false, error: e.message };
        } finally { root.classList.remove('acting'); }
      }
      case 'undo': {
        const n = Math.max(1, Math.min(20, parseInt(args.steps, 10) || 1));
        const d = card(name, { steps: n });
        try { for (let i = 0; i < n; i++) await PC.exec('edit.undo'); cardResult(d, true); return { ok: true }; } catch (e) { cardResult(d, false, e.message); return { ok: false, error: e.message }; }
      }
      default:
        return { ok: false, error: `Инструмента «${name}» нет. Доступны только: ${TOOL_NAMES.join(', ')}. Кликов по координатам нет: найди команду через find_commands и выполни её run_command.` };
    }
  }

  // Модель иногда пишет вызов инструмента текстом вместо tool_calls — подхватываем его.
  const TOOL_NAMES = ['find_commands', 'get_state', 'inspect_layer', 'look_at_screen', 'list_templates', 'insert_template', 'build_design', 'run_command', 'open_command', 'undo'];
  function inlineCalls(text) {
    if (!text || !/[{[]/.test(text)) return [];
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      const o = JSON.parse(m[0]);
      const list = Array.isArray(o) ? o : [o];
      return list
        .filter((x) => x && TOOL_NAMES.includes(x.name))
        .map((x) => ({ function: { name: x.name, arguments: x.arguments || x.parameters || {} } }));
    } catch { return []; }
  }

  // ------------------------------------------------------------------ разговор с моделью
  function outgoing() {
    // Картинки тяжёлые и занимают много контекста: отправляем только последний снимок.
    const out = convo.slice(-60).map((m) => ({ ...m }));
    let images = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (!out[i].images) continue;
      if (images >= 1) delete out[i].images; else images += out[i].images.length;
    }
    return out;
  }

  // Запрос к серверу помощника. Если сервер не принимает запрос со снимком экрана (nginx по
  // умолчанию берёт не больше 1 МБ и при большем просто обрывает соединение — браузер пишет
  // «Failed to fetch»), запрос повторяется без снимка, и дальше снимки не отправляются.
  const BODY_LIMIT = 900 * 1024;
  let imagesBlocked = false;
  const withoutImages = (payload) => ({ ...payload, messages: payload.messages.map((m) => { const { images, ...rest } = m; void images; return rest; }) });
  const hasImages = (payload) => payload.messages.some((m) => m.images && m.images.length);
  function tellImagesBlocked() {
    if (imagesBlocked) return;
    imagesBlocked = true;
    msg('note', 'Сервер не принял запрос со снимком экрана, поэтому помощник отвечает без него. ' +
      'Чтобы он видел экран, добавьте в nginx для api/assistant.php строку <code>client_max_body_size 20m;</code> (готовый блок — в nginx.conf.example).');
  }
  async function explainNoAnswer(seconds) {
    try {
      const r = await fetch(CFG.api, { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) {
        const when = seconds >= 1 ? ` через ${Math.round(seconds)} с` : ' сразу';
        const why = seconds >= 45
          ? 'Похоже, сервер не дождался модели: для api/assistant.php нужна строка fastcgi_read_timeout 200s; (и такой же таймаут у прокси перед сервером, если он есть).'
          : 'Обычно так бывает, когда запрос больше, чем разрешает сервер (client_max_body_size 20m; для api/assistant.php), или его блокирует защита сервера.';
        return `Сервер оборвал соединение${when} и ничего не ответил, хотя сам помощник доступен. ${why} Готовый блок — в nginx.conf.example.`;
      }
      return `Сервер помощника ответил «${r.status}». Проверьте, что PHP обрабатывает файлы в папке api/.`;
    } catch {
      return 'Нет связи с сервером помощника: страница не может достучаться до api/assistant.php. Проверьте подключение и обновите страницу.';
    }
  }
  async function postApi(payload) {
    const post = (p) => fetch(CFG.api, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    if (imagesBlocked && hasImages(payload)) payload = withoutImages(payload);
    if (hasImages(payload) && JSON.stringify(payload).length > BODY_LIMIT) payload = withoutImages(payload);
    let r;
    const t0 = performance.now();
    const took = () => (performance.now() - t0) / 1000;
    try {
      r = await post(payload);
    } catch (e) {
      console.warn('AI-Figma: запрос к помощнику оборвался', e);
      if (!hasImages(payload)) throw new Error(await explainNoAnswer(took()));
      try { r = await post(withoutImages(payload)); } catch { throw new Error(await explainNoAnswer(took())); }
      tellImagesBlocked();
      return r;
    }
    if (r.status === 413 && hasImages(payload)) {
      r = await post(withoutImages(payload));
      tellImagesBlocked();
    }
    return r;
  }
  async function readAnswer(r) {
    let j;
    try { j = await r.json(); } catch {
      if (r.status === 413) throw new Error('Сервер не принял такой большой запрос (413). Нужна строка client_max_body_size 20m; в nginx — см. nginx.conf.example.');
      if (r.status === 502 || r.status === 504) throw new Error(`Сервер не дождался ответа модели (${r.status}). Нужна строка fastcgi_read_timeout 200s; в nginx — см. nginx.conf.example.`);
      throw new Error(`Сервер помощника ответил не JSON (HTTP ${r.status}). Проверьте, что PHP работает в папке api/.`);
    }
    return j;
  }
  // Шлюз модели не передаёт инструменты штатно (вызовы приходят текстом) — запоминаем это.
  let textTools = store.get('textTools', false);
  async function ask() {
    const r = await postApi({ mode, messages: outgoing(), textTools });
    const j = await readAnswer(r);
    if (j && j.ok && j.textTools && !textTools) { textTools = true; store.set('textTools', true); }
    if (!j.ok) {
      const e = new Error(j.error || 'Ошибка помощника');
      e.noVision = !!j.noVision;
      throw e;
    }
    return j;
  }

  async function send(fromBar) {
    if (busy) { stopRequested = true; return; }
    const field = typeof fromBar === 'string' ? null : input;
    const text = (typeof fromBar === 'string' ? fromBar : input.value).trim();
    if (!text) return;
    if (field) { field.value = ''; autosize(); }
    setBusy(true);
    stopRequested = false;
    msg('user', esc(text));
    try {
      let state = null;
      let image = null;
      if (PC.ready()) {
        state = await snapshot().catch((e) => ({ error: e.message }));
        if (attachScreen) image = await screenshot();
      }
      convo.push({
        role: 'user',
        content: MODE_TAG[mode] + '\n' + text + '\n\n[Состояние редактора — автоматически]\n' + clip(JSON.stringify(state ?? { note: 'Редактор ещё загружается' }), 4000),
        ...(image ? { images: [image] } : {}),
      });
      for (let step = 0; step < CFG.maxSteps; step++) {
        if (stopRequested) { msg('bot', 'Остановлено.'); break; }
        typing(true);
        const j = await ask();
        typing(false);
        const m = j.message || {};
        let calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
        let content = (m.content || '').replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').replace(/<think>[\s\S]*?<\/think>/g, '')
          .replace(/<?function=[\w.-]+>[\s\S]*?(<\/function>|$)/g, '').replace(/<\/?tool_call>/g, '').trim();
        if (!calls.length) {
          calls = inlineCalls(content);
          if (calls.length) content = content.replace(/\{[\s\S]*\}/, '').trim();
        }
        // «Сделай», а модель всё равно ответила как в «Совете» — одна попытка её поправить.
        if (mode === 'act' && !calls.length && step === 0 && /режим\S*\s*«?Совет/i.test(content)) {
          convo.push({ role: 'assistant', content: m.content || '' });
          convo.push({ role: 'user', content: MODE_NOTE.act + ' Выполни просьбу сейчас.' });
          continue;
        }
        convo.push({ role: 'assistant', content: m.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
        if (content) msg('bot', format(content));
        if (!calls.length) break;
        let pendingImage = null;
        for (const c of calls) {
          if (stopRequested) break;
          const fname = c.function && c.function.name;
          let a = (c.function && c.function.arguments) || {};
          if (typeof a === 'string') { try { a = JSON.parse(a || '{}'); } catch { a = {}; } }
          let result;
          try { result = await runTool(fname, a || {}); } catch (e) { result = { ok: false, error: e.message || String(e) }; }
          if (result && result.__image) { pendingImage = result.__image; delete result.__image; }
          convo.push({ role: 'tool', tool_name: fname, content: clip(JSON.stringify(result ?? { ok: true }), 6000) });
        }
        if (pendingImage) convo.push({ role: 'user', content: '[Снимок экрана после действий — прислан автоматически]', images: [pendingImage] });
        if (step === CFG.maxSteps - 1) msg('bot', `Сделал ${CFG.maxSteps} шагов подряд и остановился. Напишите «продолжай», если нужно дальше.`);
      }
    } catch (e) {
      typing(false);
      if (e.noVision) setEye(false);
      msg('err', esc(e.message || String(e)));
    } finally {
      typing(false);
      setBusy(false);
      root.classList.remove('acting');
      updateBarAnswer();
    }
  }

  // ------------------------------------------------------------------ быстрая строка
  // Ctrl+Shift+Пробел: поле внизу над холстом. Ответ всплывает над ним; вся история — в панели.
  const bar = $('bar');
  const barInput = $('barInput');
  const barAnswer = $('barAnswer');
  function setBar(open) {
    root.classList.toggle('bar-open', open);
    if (open) { setTimeout(() => barInput.focus(), 30); updateBarAnswer(); }
  }
  function updateBarAnswer() {
    if (!root.classList.contains('bar-open')) return;
    if (busy) { barAnswer.innerHTML = '<div class="st-typing"><i></i><i></i><i></i></div>'; barAnswer.hidden = false; return; }
    const last = [...log.querySelectorAll('.st-msg.bot, .st-msg.err')].pop();
    if (!last || !barSent) { barAnswer.hidden = true; return; }
    barAnswer.hidden = false;
    barAnswer.innerHTML = `<div class="st-bar-text ${last.classList.contains('err') ? 'err' : ''}">${last.innerHTML}</div><button class="st-link" data-a="panel">Открыть в панели</button>`;
    barAnswer.querySelector('[data-a="panel"]').onclick = () => { setBar(false); setOpen(true); };
  }
  let barSent = false;
  async function sendFromBar() {
    const text = barInput.value.trim();
    if (!text || busy) return;
    barInput.value = '';
    barSent = true;
    const done = send(text);
    updateBarAnswer();
    await done;
    updateBarAnswer();
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setBar(!root.classList.contains('bar-open'));
    }
  }, true);

  // ------------------------------------------------------------------ сообщения и перетаскивание
  function setBadge(on) { root.classList.toggle('has-hints', on); }
  function toast(text, error) {
    let t = root.querySelector('.st-toast');
    if (!t) { t = document.createElement('div'); t.className = 'st-toast'; root.appendChild(t); }
    t.textContent = text;
    t.classList.toggle('err', !!error);
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // Вставку из буфера обмена и файлы, брошенные на холст, редактор принимает сам.
  // Файлы, брошенные на панель помощника или край страницы, браузер открыл бы вместо
  // редактора — передаём их редактору: они открываются как новые документы.
  const isFileDrag = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  let dropHideTimer = 0;
  function showDrop(on) {
    root.classList.toggle('dropping', on);
    clearTimeout(dropHideTimer);
    if (on) dropHideTimer = setTimeout(() => root.classList.remove('dropping'), 400);
  }
  window.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    const canvas = document.getElementById('figcraft_canvas');
    if (canvas && e.target === canvas) return;
    e.preventDefault();
    showDrop(true);
  });
  window.addEventListener('drop', async (e) => {
    showDrop(false);
    if (!isFileDrag(e)) return;
    const canvas = document.getElementById('figcraft_canvas');
    if (canvas && e.target === canvas) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (!files.length || !PC.ready()) return;
    toast(files.length === 1 ? 'Открываю ' + files[0].name : 'Открываю файлы: ' + files.length);
    for (const f of files) {
      try { await PC.exec('file.open', { name: f.name, data: toBase64(new Uint8Array(await f.arrayBuffer())) }); } catch (err) { toast('Не удалось открыть ' + f.name + ': ' + (err.message || err), true); }
    }
  });

  // ------------------------------------------------------------------ файлы на сервере
  function toBase64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }
  function fromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const fmtSize = (n) => (n < 1024 ? n + ' Б' : n < 1048576 ? Math.round(n / 1024) + ' КБ' : (n / 1048576).toFixed(1).replace('.', ',') + ' МБ');
  const fmtDate = (t) => {
    if (!t) return '';
    const d = new Date(t * 1000), now = new Date();
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'сегодня, ' + time;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ', ' + time;
  };

  // Окно с одним полем: имя файла.
  function askName(title, value, note) {
    return new Promise((resolve) => {
      const box = $('ask');
      $('askTitle').textContent = title;
      $('askNote').textContent = note || '';
      const field = $('askInput');
      field.value = value || '';
      box.hidden = false;
      setTimeout(() => { field.focus(); field.select(); }, 30);
      const done = (v) => { box.hidden = true; form.onsubmit = null; $('askCancel').onclick = null; box.onkeydown = null; resolve(v); };
      const form = box.querySelector('form');
      form.onsubmit = (e) => { e.preventDefault(); done(field.value.trim() || null); };
      $('askCancel').onclick = () => done(null);
      box.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    });
  }

  // Несохранённая копия в браузере — на случай, если вкладка закроется или пропадёт связь.
  const Recovery = (() => {
    const open = () => new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('нет IndexedDB')); return; }
      const r = indexedDB.open('aifigma', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('recovery');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('recovery', mode);
        const req = fn(tx.objectStore('recovery'));
        tx.oncomplete = () => { db.close(); resolve(req && req.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    };
    return {
      put: (v) => run('readwrite', (s) => s.put(v, 'last')).catch(() => {}),
      get: () => run('readonly', (s) => s.get('last')).catch(() => null),
      clear: () => run('readwrite', (s) => s.delete('last')).catch(() => {}),
    };
  })();

  const Files = (() => {
    let list = [];
    let saving = false;
    let lastRecoveryToken = '';
    const api = (q) => CFG.files + (q ? '?' + q : '');
    async function json(r) {
      let j = null;
      try { j = await r.json(); } catch { /* ниже */ }
      if (!j) throw new Error(r.status === 413 ? 'Файл слишком большой для сервера: увеличьте client_max_body_size в nginx и post_max_size в PHP.' : `Сервер ответил ${r.status}: проверьте, что PHP обрабатывает api/files.php.`);
      if (!j.ok) { const e = new Error(j.error || 'Ошибка сервера'); e.exists = !!j.exists; e.login = !!j.login; throw e; }
      return j;
    }
    async function refresh() {
      const j = await json(await fetch(api(''), { credentials: 'same-origin', cache: 'no-store' }));
      list = Array.isArray(j.files) ? j.files : [];
      $('filesWho').textContent = j.user && j.user !== 'local' ? 'на сервере · пользователь ' + j.user : 'на сервере';
      return list;
    }
    async function current() {
      try {
        const d = await PC.call('document.inspect', { depth: 0 });
        if (!d || !d.name) return null;
        const p = String(d.path || '');
        return { name: d.name, dirty: !!d.dirty, page: p.startsWith('page:') ? p.slice(5) : null };
      } catch { return null; }
    }
    function render() {
      const q = norm($('filesSearch').value).trim();
      const rows = list.filter((f) => !q || norm(f.name).includes(q));
      const box = $('filesList');
      if (!list.length) { box.innerHTML = '<p class="st-files-empty">Здесь будут ваши файлы. Сохраните открытый файл кнопкой «Сохранить» или Ctrl+S.</p>'; return; }
      if (!rows.length) { box.innerHTML = '<p class="st-files-empty">Ничего не найдено.</p>'; return; }
      box.innerHTML = rows.map((f, i) => `<div class="st-file" data-i="${i}" tabindex="0">
          <span class="st-file-icon">${ICON.file}</span>
          <span class="st-file-name">${esc(f.name)}</span>
          <span class="st-file-meta">${esc(fmtDate(f.modified))} · ${esc(fmtSize(f.size))}</span>
          <span class="st-file-acts"><button class="st-link" data-a="rename">Переименовать</button><button class="st-link danger" data-a="delete">Удалить</button></span>
        </div>`).join('');
      box.querySelectorAll('.st-file').forEach((row) => {
        const f = rows[+row.dataset.i];
        row.onclick = (e) => { if (!e.target.closest('button')) load(f.name); };
        row.onkeydown = (e) => { if (e.key === 'Enter') load(f.name); };
        row.querySelector('[data-a="rename"]').onclick = () => rename(f.name);
        row.querySelector('[data-a="delete"]').onclick = () => remove(f.name);
      });
    }
    async function updateFoot() {
      const c = PC.ready() ? await current() : null;
      $('filesCurrent').textContent = !c ? 'Файл не открыт' : (c.page ? `Открыт «${c.page}»` : `Открыт «${c.name}» — ещё не сохранён на сервере`) + (c && c.dirty ? ' · есть изменения' : '');
      $('filesSave').disabled = !c;
      $('filesSaveAs').disabled = !c;
    }
    async function show(on = true) {
      $('files').hidden = !on;
      if (!on) return;
      $('filesList').innerHTML = '<p class="st-files-empty">Загружаю список…</p>';
      updateFoot();
      try { await refresh(); render(); } catch (e) { $('filesList').innerHTML = `<p class="st-files-empty err">${esc(e.message)}</p>`; }
      setTimeout(() => $('filesSearch').focus(), 30);
    }
    async function load(name) {
      try {
        toast('Открываю «' + name + '»…');
        const r = await fetch(api('action=load&name=' + encodeURIComponent(name)), { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) await json(r);
        const bytes = new Uint8Array(await r.arrayBuffer());
        await PC.exec('file.open', { name: name + '.figcraft', data: toBase64(bytes) });
        await PC.exec('file.pageSaved', { name });
        show(false);
        toast('Открыт «' + name + '»');
      } catch (e) { toast('Не удалось открыть: ' + e.message, true); }
    }
    async function upload(name, b64, overwrite) {
      const r = await fetch(api('action=save&name=' + encodeURIComponent(name) + (overwrite ? '&overwrite=1' : '')), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: fromBase64(b64),
      });
      return json(r);
    }
    // Сохранить: файл, который уже лежит на сервере, — туда же; новый — спросить имя.
    async function save(saveAs, quiet) {
      if (saving || !PC.ready()) return false;
      saving = true;
      try {
        let snap = await PC.exec('file.pageSnapshot');
        let name = snap.page;
        let overwrite = !!name && !saveAs;
        if (!name || saveAs) {
          if (quiet) return false;
          name = await askName(saveAs ? 'Сохранить как' : 'Сохранить на сервере', snap.page || snap.name, 'Файл появится в «Моих файлах».');
          if (!name) return false;
          name = name.replace(/\.figcraft$/i, '').trim();
          if (!list.length) await refresh().catch(() => {});
          if (list.some((f) => f.name === name) && name !== snap.page) {
            if (!(await confirmBox(`Файл «${name}» уже есть. Заменить его?`))) return false;
          }
          overwrite = true;
          // Название вкладки — как у файла на сервере.
          if (snap.name !== name) { await PC.exec('file.rename', { name }).catch(() => {}); snap = await PC.exec('file.pageSnapshot'); }
        }
        const r = await upload(name, snap.data, overwrite);
        await PC.exec('file.pageSaved', { name: r.name, token: snap.token });
        if (snap.token === lastRecoveryToken || !(await current())?.dirty) Recovery.clear();
        if (!quiet) toast('Сохранено: «' + r.name + '»');
        if (!$('files').hidden) { await refresh().catch(() => {}); render(); updateFoot(); }
        return true;
      } catch (e) {
        if (e.login) toast('Войдите в систему, чтобы сохранять файлы на сервере.', true);
        else toast((quiet ? 'Автосохранение не удалось: ' : 'Не удалось сохранить: ') + e.message, true);
        return false;
      } finally { saving = false; }
    }
    function confirmBox(text) {
      return new Promise((resolve) => { resolve(window.confirm(text)); });
    }
    async function rename(name) {
      const to = await askName('Переименовать', name);
      if (!to || to === name) return;
      try {
        await json(await fetch(api('action=rename'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, to }) }));
        const c = await current();
        if (c && c.page === name) { await PC.exec('file.rename', { name: to }).catch(() => {}); await PC.exec('file.pageSaved', { name: to, token: 'keep' }).catch(() => {}); }
        await refresh(); render(); updateFoot();
      } catch (e) { toast('Не удалось переименовать: ' + e.message, true); }
    }
    async function remove(name) {
      if (!(await confirmBox(`Удалить «${name}»? Файл уйдёт в корзину на сервере.`))) return;
      try {
        await json(await fetch(api('action=delete'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }));
        await refresh(); render();
      } catch (e) { toast('Не удалось удалить: ' + e.message, true); }
    }
    function pickLocal() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.figcraft,.fig,.json,.svg,.png,.jpg,.jpeg,.webp,.gif';
      input.onchange = async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        try { await PC.exec('file.open', { name: f.name, data: toBase64(new Uint8Array(await f.arrayBuffer())) }); show(false); toast('Открыт «' + f.name + '». Сохраните его, чтобы он появился в «Моих файлах».'); }
        catch (e) { toast('Не удалось открыть ' + f.name + ': ' + e.message, true); }
      };
      input.click();
    }
    // Каждые 30 с: несохранённая копия в браузере; раз в autosaveSeconds — на сервер, если файл уже там.
    async function tick() {
      let sinceServer = 0;
      for (;;) {
        await sleep(30000);
        sinceServer += 30;
        if (document.hidden || !PC.ready() || saving) continue;
        const c = await current();
        if (!c || !c.dirty) continue;
        if (c.page && CFG.autosaveSeconds > 0 && sinceServer >= CFG.autosaveSeconds) {
          sinceServer = 0;
          if (await save(false, true)) continue;
        }
        try {
          const snap = await PC.exec('file.pageSnapshot');
          if (snap.token !== lastRecoveryToken) {
            lastRecoveryToken = snap.token;
            await Recovery.put({ name: snap.name, page: snap.page, data: snap.data, time: Date.now() });
          }
        } catch { /* не страшно */ }
      }
    }
    async function offerRecovery() {
      const r = await Recovery.get();
      if (!r || !r.data) return;
      const when = new Date(r.time).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const d = msg('note', `Есть несохранённые изменения файла «${esc(r.page || r.name)}» от ${esc(when)} — в прошлый раз вкладка закрылась без сохранения. ` +
        '<span class="st-row"><button class="st-mini" data-a="open">Открыть копию</button><button class="st-mini danger" data-a="drop">Удалить копию</button></span>');
      d.querySelector('[data-a="open"]').onclick = async () => {
        try {
          await PC.exec('file.open', { name: (r.page || r.name) + '.figcraft', data: r.data });
          if (r.page) await PC.exec('file.pageSaved', { name: r.page, token: 'not-saved' }).catch(() => {});
          d.remove();
          toast('Копия открыта. Сохраните её (Ctrl+S), если всё на месте.');
        } catch (e) { toast('Не удалось открыть копию: ' + e.message, true); }
      };
      d.querySelector('[data-a="drop"]').onclick = () => { Recovery.clear(); d.remove(); };
      setOpen(true);
    }
    function start() {
      $('filesBtn').onclick = () => show(true);
      $('filesClose').onclick = () => show(false);
      $('files').addEventListener('pointerdown', (e) => { if (e.target === $('files')) show(false); });
      $('files').addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('ask').hidden) { e.preventDefault(); show(false); } });
      $('filesSearch').addEventListener('input', render);
      $('filesNew').onclick = async () => { try { await PC.exec('file.new'); show(false); } catch (e) { toast(e.message, true); } };
      $('filesUpload').onclick = pickLocal;
      $('filesSave').onclick = () => save(false);
      $('filesSaveAs').onclick = () => save(true);
      // Ctrl+S и «Сохранить как» из меню редактора приходят сюда.
      window.addEventListener('aifigma:save', (e) => save(!!(e.detail && e.detail.saveAs)));
      window.addEventListener('aifigma:help', () => setOpen(true));
      // Домик внизу левой полосы редактора — на уровень вверх, на ваш сайт.
      window.addEventListener('aifigma:home', () => { location.href = CFG.homeUrl || '../'; });
      // Браузер не должен предлагать «Сохранить страницу как…».
      window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) e.preventDefault(); }, true);
      window.addEventListener('beforeunload', (e) => {
        if (lastDirty) { e.preventDefault(); e.returnValue = ''; }
      });
      offerRecovery();
      tick();
      watchDirty();
      if (CFG.filesOnStart) refresh().then((l) => { if (l.length) show(true); }).catch(() => {});
    }
    // Есть ли несохранённые изменения — чтобы браузер переспросил перед закрытием вкладки.
    let lastDirty = false;
    async function watchDirty() {
      for (;;) {
        await sleep(3000);
        if (document.hidden || !PC.ready()) continue;
        const c = await current();
        lastDirty = !!(c && c.dirty);
      }
    }
    return { start, show, save };
  })();

  // ------------------------------------------------------------------ шаблоны и быстрые задачи
  function downloadB64(name, b64, type) {
    const blob = new Blob([fromBase64(b64)], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 40000);
  }
  async function selectionIds() {
    const d = await PC.call('document.inspect', { depth: 0 });
    return Array.isArray(d.selection) ? d.selection : [];
  }
  async function topFrames() {
    const d = await PC.call('document.inspect', { depth: 1 });
    const page = (d.pages || []).find((p) => p.id === d.currentPage) || {};
    return (page.children || []).filter((n) => /FRAME|COMPONENT|SECTION/.test(String(n.type)))
      .sort((a, b) => ((a.absoluteBounds || a).x - (b.absoluteBounds || b).x) || ((a.absoluteBounds || a).y - (b.absoluteBounds || b).y));
  }
  const needSel = async (min = 1) => {
    const ids = await selectionIds();
    if (ids.length < min) throw new Error(min > 1 ? `Выделите хотя бы ${min} слоя (Shift+щелчок).` : 'Сначала выделите слой на холсте.');
    return ids;
  };
  // Быстрые задачи: те, что делаются командами, — сразу; остальные — через помощника.
  const TASKS = [
    ['Раскладка', [
      ['Автолейаут из выделенного', 'Слои выстроятся в колонку с равными отступами (как Shift+A в Figma)', async () => { await needSel(); await PC.exec('layout.add', { direction: 'vertical' }); }],
      ['Автолейаут в строку', 'То же, но слои встанут в ряд', async () => { await needSel(); await PC.exec('layout.add', { direction: 'horizontal' }); }],
      ['Выровнять по центру', 'По центру друг друга или своего фрейма', async () => { await needSel(); await PC.exec('align.hcenter'); await PC.exec('align.vcenter'); }],
      ['Распределить по горизонтали', 'Равные промежутки между выделенными', async () => { await needSel(3); await PC.exec('distribute.horizontal'); }],
      ['Распределить по вертикали', 'Равные промежутки сверху вниз', async () => { await needSel(3); await PC.exec('distribute.vertical'); }],
      ['Сгруппировать', 'Ctrl+G', async () => { await needSel(); await PC.exec('object.group'); }],
      ['Разгруппировать', 'Ctrl+Shift+G', async () => { await needSel(); await PC.exec('object.ungroup'); }],
    ]],
    ['Оформление', [
      ['Мягкая тень', 'Тень под выделенным', async () => { const ids = await needSel(); await PC.exec('node.set', { ids, effects: [{ type: 'dropShadow', color: '#0000001F', offset: [0, 8], radius: 24 }] }); }],
      ['Скруглить углы', 'Радиус 12 у выделенного', async () => { const ids = await needSel(); await PC.exec('node.set', { ids, cornerRadius: 12 }); }],
      ['Сделать компонент', 'Ctrl+Alt+K: элемент для повторного использования', async () => { await needSel(); await PC.exec('component.create'); }],
      ['Обрезать содержимое', 'Всё, что выходит за фрейм, скрыть', async () => { const ids = await needSel(); await PC.exec('node.set', { ids, clip: true }); }],
    ]],
    ['Прототип и показ', [
      ['Связать экраны по порядку', 'Щелчок по экрану ведёт на следующий (слева направо)', async () => {
        const frames = await topFrames();
        if (frames.length < 2) throw new Error('Нужно хотя бы два экрана (фрейма) на странице.');
        const commands = frames.slice(0, -1).map((f, i) => ({ command: 'proto.interaction.add', params: { id: f.id, trigger: { type: 'onClick' }, action: { type: 'navigate', dest: frames[i + 1].id } } }));
        await PC.exec('command.batch', { label: 'Связать экраны', commands });
        toast(`Связано экранов: ${frames.length}. «Показать прототип» — чтобы пощёлкать.`);
      }],
      ['Показать прототип', 'Во весь экран, как в Figma (Esc — выход)', async () => { await PC.exec('proto.present'); }],
    ]],
    ['Экспорт и файлы', [
      ['Экспорт выделенного в PNG ×2', 'Картинка в двойном размере — для сайтов и соцсетей', async () => { const ids = await needSel(); const r = await PC.exec('file.export', { ids, format: 'png', scale: 2 }); downloadB64('экспорт@2x.png', r.data, 'image/png'); }],
      ['Экспорт выделенного в SVG', 'Вектор для разработчиков', async () => { const ids = await needSel(); const r = await PC.exec('file.export', { ids, format: 'svg' }); downloadB64('экспорт.svg', r.data, 'image/svg+xml'); }],
      ['Все экраны в PDF', 'Каждый фрейм — отдельная страница', async () => { const r = await PC.exec('file.exportFramesPdf'); downloadB64('экраны.pdf', r.data, 'application/pdf'); }],
      ['Сохранить на сервер', 'Ctrl+S', async () => { await Files.save(false); }],
      ['Новая страница', 'Ещё одна страница в этом файле', async () => { await PC.exec('page.add'); }],
    ]],
    ['Попросить помощника', [
      ['Собрать лендинг', 'Опишите продукт — помощник соберёт страницу из блоков', 'Собери лендинг для: '],
      ['Тёмная версия экрана', 'Копия выделенного экрана в тёмных цветах', '!Сделай тёмную версию выделенного экрана рядом с ним'],
      ['Мобильная версия', 'Копия выделенного под ширину телефона 393', '!Сделай мобильную версию выделенного экрана шириной 393 рядом с ним'],
      ['Проверить отступы', 'Найти неровности и поправить', '!Проверь выравнивание и отступы на текущем экране и поправь неровности'],
      ['Перевести на английский', 'Все тексты на странице', '!Переведи все тексты на текущей странице на английский'],
      ['Варианты цвета', 'Три цветовые схемы для выделенного', '!Сделай три копии выделенного рядом с разными цветовыми схемами'],
      ['Объяснить экран', 'Как устроен выделенный макет и что улучшить', '?Объясни, как устроен выделенный экран, и что можно улучшить'],
    ]],
  ];
  const Gallery = (() => {
    let cat = 'Все';
    let accent = store.get('tplAccent', TPL() ? TPL().ACCENTS[0][0] : '#667EEA');
    let dark = store.get('tplDark', false);
    function show(on = true, tab) {
      $('gallery').hidden = !on;
      if (!on) return;
      if (tab) setTab(tab);
      renderCats(); renderGrid(); renderTasks();
      setTimeout(() => $('gSearch').focus(), 30);
    }
    function setTab(tab) {
      root.querySelectorAll('[data-gtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.gtab === tab)));
      root.querySelectorAll('.st-gpane').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
      $('galleryHint').textContent = tab === 'tpl' ? 'Нажмите на шаблон — он появится на холсте. Его можно менять как угодно.' : 'Задачи в одно нажатие. Большинству нужно выделить слой на холсте.';
    }
    function renderCats() {
      const cats = ['Все', ...new Set(TPL().list.map((t) => t.cat))];
      $('gCats').innerHTML = cats.map((c) => `<button data-cat="${esc(c)}" aria-pressed="${c === cat}">${esc(c)}</button>`).join('');
      $('gCats').querySelectorAll('button').forEach((b) => { b.onclick = () => { cat = b.dataset.cat; renderCats(); renderGrid(); }; });
      $('gAccents').innerHTML = TPL().ACCENTS.map(([c, n]) => `<button role="radio" aria-checked="${c === accent}" title="${esc(n)}" data-c="${c}" style="background:${c}"></button>`).join('');
      $('gAccents').querySelectorAll('button').forEach((b) => { b.onclick = () => { accent = b.dataset.c; store.set('tplAccent', accent); renderCats(); renderGrid(); }; });
      $('gDark').textContent = dark ? 'Тёмный' : 'Светлый';
      $('gDark').setAttribute('aria-pressed', String(dark));
    }
    function renderGrid() {
      const q = norm($('gSearch').value).trim();
      const items = TPL().list.filter((t) => (cat === 'Все' || t.cat === cat) && (!q || norm(t.name + ' ' + t.desc + ' ' + t.cat + ' ' + t.keywords).includes(q)));
      const grid = $('gGrid');
      grid.innerHTML = '';
      if (!items.length) { grid.innerHTML = '<p class="st-files-empty">Ничего не нашлось. Можно попросить помощника: «Сделай …».</p>'; return; }
      for (const t of items) {
        const c = document.createElement('button');
        c.className = 'st-tpl';
        c.title = t.desc;
        c.innerHTML = `<div class="st-tpl-prev"></div><b>${esc(t.name)}</b><small>${esc(t.desc)}</small>`;
        const box = c.querySelector('.st-tpl-prev');
        box.style.background = dark ? '#1A1D27' : '#EEF0F6';
        const node = TPL().preview(t.build(), { accent, dark });
        node.style.position = 'absolute'; node.style.left = '0'; node.style.top = '0'; node.style.transformOrigin = '0 0';
        box.appendChild(node);
        c.onclick = () => insert(t);
        grid.appendChild(c);
        requestAnimationFrame(() => {
          const w = node.offsetWidth || 1, h = node.offsetHeight || 1;
          const k = Math.min(box.clientWidth / w, box.clientHeight / h, 1);
          node.style.transform = `translate(${(box.clientWidth - w * k) / 2}px, ${(box.clientHeight - h * k) / 2}px) scale(${k})`;
        });
      }
    }
    async function insert(t) {
      if (!PC.ready()) return;
      try {
        const doc = await PC.call('document.inspect', { depth: 0 }).catch(() => null);
        if (!doc || !doc.name) await PC.exec('file.new');
        const r = await TPL().insert(VC(), t.id, { accent, dark });
        show(false);
        toast(`«${t.name}»: ${r.layers} слоёв. Двойной щелчок по тексту — изменить, Ctrl+Z — убрать.`);
      } catch (e) { toast('Не получилось вставить: ' + e.message, true); }
    }
    function renderTasks() {
      $('gTasks').innerHTML = TASKS.map(([group, items], gi) => `<section><h4>${esc(group)}</h4><div>${items.map(([n, d], i) => `<button class="st-task" data-g="${gi}" data-i="${i}"><b>${esc(n)}</b><small>${esc(d)}</small></button>`).join('')}</div></section>`).join('');
      $('gTasks').querySelectorAll('.st-task').forEach((b) => {
        const [, , run] = TASKS[+b.dataset.g][1][+b.dataset.i];
        b.onclick = async () => {
          if (typeof run === 'string') {
            show(false);
            setOpen(true);
            const ask = run.startsWith('?') ? 'advice' : 'act';
            setMode(ask);
            const text = run.replace(/^[!?]/, '');
            if (/^[!?]/.test(run)) { input.value = text; send(); } else { input.value = text; autosize(); input.focus(); input.setSelectionRange(text.length, text.length); }
            return;
          }
          b.disabled = true;
          try { await run(); show(false); toast('Готово: ' + b.querySelector('b').textContent + '. Ctrl+Z — отменить.'); }
          catch (e) { toast(e.message, true); }
          finally { b.disabled = false; }
        };
      });
    }
    function start() {
      if (!TPL()) { $('galleryBtn').hidden = true; return; }
      $('galleryBtn').onclick = () => show(true, 'tpl');
      $('galleryClose').onclick = () => show(false);
      $('gallery').addEventListener('pointerdown', (e) => { if (e.target === $('gallery')) show(false); });
      $('gallery').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); show(false); } });
      root.querySelectorAll('[data-gtab]').forEach((b) => { b.onclick = () => setTab(b.dataset.gtab); });
      $('gSearch').addEventListener('input', renderGrid);
      $('gDark').onclick = () => { dark = !dark; store.set('tplDark', dark); renderCats(); renderGrid(); };
    }
    return { start, show };
  })();

  // ------------------------------------------------------------------ тема
  const panelThemeOf = (themeId) => (themeId === 'brand' ? 'brand' : (isDarkTheme(themeId) ? 'dark' : 'light'));
  function applyPanelTheme(themeId) {
    root.dataset.theme = panelThemeOf(themeId);
    document.documentElement.classList.toggle('studio-brand', themeId === 'brand');
    renderThemeMenu(themeId);
  }
  const syncBackdrop = () => {};
  // Список тем: фирменная и две привычные по Figma.
  const THEMES = [['brand', 'Фирменная'], null, ['light', 'Светлая'], ['dark', 'Тёмная']];
  function renderThemeMenu(current) {
    const menu = $('themeMenu');
    if (!menu) return;
    menu.innerHTML = THEMES.map((t) => (t
      ? `<button role="menuitemradio" aria-checked="${t[0] === current}" data-theme-id="${t[0]}">${esc(t[1])}</button>`
      : '<hr>')).join('');
    menu.querySelectorAll('button').forEach((b) => { b.onclick = () => { toggleThemeMenu(false); setTheme(b.dataset.themeId); }; });
  }
  function toggleThemeMenu(open) {
    const menu = $('themeMenu');
    if (!menu) return;
    const show = open == null ? menu.hidden : open;
    menu.hidden = !show;
    $('theme').setAttribute('aria-expanded', String(show));
  }
  async function setTheme(themeId) {
    store.set('theme', themeId);
    applyPanelTheme(themeId);
    if (PC.ready()) await VC().setTheme(themeId).catch(() => {});
  }
  // Тема, которая сейчас на экране, как бы её ни выбрали: меню «Вид › Тема», настройки, список в панели.
  async function watchTheme() {
    for (;;) {
      await sleep(1000);
      if (document.hidden || !PC.ready()) continue;
      try {
        const id = VC().currentTheme();
        if (id && (id !== store.get('theme', '') || root.dataset.theme !== panelThemeOf(id))) {
          store.set('theme', id);
          applyPanelTheme(id);
        }
      } catch { /* не важно */ }
    }
  }

  async function status() {
    try {
      const r = await fetch(CFG.api, { credentials: 'same-origin' });
      const j = await r.json();
      if (j.ok) {
        $('sub').textContent = 'Модель: ' + j.model;
        fetch('studio/version.json', { cache: 'no-store' }).then((v) => (v.ok ? v.json() : null)).then((v) => {
          if (!v || !v.build) return;
          const d = String(v.date || '').split('-').reverse().join('.');
          $('sub').textContent = 'Модель: ' + j.model + ' · сборка ' + v.build + (d ? ' от ' + d : '');
          const pageBuild = document.documentElement.dataset.build;
          if (pageBuild && pageBuild !== String(v.build)) {
            const page = +pageBuild, server = +v.build;
            if (page > server) {
              msg('note', `Страница — от сборки ${esc(pageBuild)}, а файлы на сервере частично остались от сборки ${esc(String(v.build))}: ` +
                'программа заливки, похоже, пропустила файлы того же размера. Удалите старую папку на сервере целиком и залейте новую ' +
                '(или включите в программе «перезаписывать всегда»).');
            } else {
              msg('note', `Открыта старая копия страницы из кэша браузера (сборка ${esc(pageBuild)}), а на сервере уже сборка ${esc(String(v.build))}. Нажмите <b>Ctrl+F5</b>, чтобы загрузить новую.`);
            }
          }
        }).catch(() => {});
      }
      else $('sub').textContent = j.login ? 'Нужно войти в систему' : (j.error || 'Нет связи с помощником');
    } catch {
      $('sub').textContent = 'Нет связи с сервером помощника';
    }
  }

  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; }

  function mount() {
    document.body.appendChild(root);
    root.querySelectorAll('.st-seg button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    $('eye').onclick = () => setEye(!attachScreen);
    $('hide').onclick = () => setOpen(false);
    $('fab').onclick = () => { setOpen(true); setBadge(false); };
    $('send').onclick = () => send();
    $('barBtn').onclick = () => setBar(!root.classList.contains('bar-open'));
    $('barSend').onclick = () => (busy ? send() : sendFromBar());
    $('barMode').onclick = () => setMode(mode === 'act' ? 'advice' : 'act');
    barInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendFromBar(); }
      if (e.key === 'Escape') { e.preventDefault(); setBar(false); }
    });
    $('clear').onclick = () => { if (!busy) { convo = []; showEmpty(); } };
    // Луна/солнце — между светлой и тёмной неоморфными; из фирменной — в светлую.
    $('theme').onclick = (e) => { e.stopPropagation(); toggleThemeMenu(); };
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest || !e.target.closest('.st-theme-wrap')) toggleThemeMenu(false); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleThemeMenu(false); });
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    setMode(mode);
    setEye(attachScreen);
    applyPanelTheme(store.get('theme', CFG.defaultTheme));
    showEmpty();
    status();
  }

  async function boot() {
    mount();
    // Ждём, пока WebAssembly загрузится и поставит window.aifigma.
    while (!PC.ready()) await sleep(200);
    await sleep(300);
    root.classList.add('ready');
    // Первый запуск — фирменная тема; дальше редактор сам помнит выбранную.
    const saved = store.get('theme', '');
    if (!saved) await setTheme(CFG.defaultTheme);
    else { try { const id = VC().currentTheme(); if (id) { store.set('theme', id); applyPanelTheme(id); } } catch { /* не важно */ } }
    if (store.get('open', CFG.openOnStart)) setOpen(true);
    commands().catch(() => {});
    watchTheme();
    Files.start();
    Gallery.start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
