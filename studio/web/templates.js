/* AI-Figma — готовые шаблоны и сборка макета по описанию.
 *
 * Шаблон — дерево слоёв: фреймы с автолейаутом, текст, фигуры, значки. Сборка превращает дерево в
 * одну команду редактора command.batch: всё появляется одним шагом истории (Ctrl+Z убирает целиком),
 * а если что-то не получилось — не появляется ничего. Тем же путём помощник собирает макеты по
 * описанию (инструмент build_design): ему не нужно склеивать слои по одному.
 *
 * Описание узла: {type, name?, w?, h?, x?, y?, text?, path?, children?, ...свойства node.set}
 *   type: frame | text | rectangle | ellipse | star | line | vector | icon
 *   цвета можно писать токенами темы: $accent $onAccent $bg $surface $text $muted $border $placeholder $success $warning $danger
 *   shadow: 'sm' | 'md' | 'lg' — мягкая тень; icon: имя значка из ICONS (рисуется контуром).
 * Все значки нарисованы для AI-Figma с нуля (простые линии), сторонних наборов нет.
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------ палитры
  const ACCENTS = [
    ['#667EEA', 'Фирменный'], ['#2563EB', 'Синий'], ['#7C3AED', 'Фиолетовый'], ['#DB2777', 'Розовый'],
    ['#DC2626', 'Красный'], ['#EA580C', 'Оранжевый'], ['#16A34A', 'Зелёный'], ['#0D9488', 'Бирюзовый'], ['#111827', 'Чёрный'],
  ];
  const LIGHT = { bg: '#FFFFFF', surface: '#F5F6FA', text: '#111827', muted: '#6B7280', border: '#E5E7EB', placeholder: '#E3E7F1', onAccent: '#FFFFFF', success: '#16A34A', warning: '#F59E0B', danger: '#DC2626' };
  const DARK = { bg: '#0F1117', surface: '#1A1D27', text: '#F3F4F6', muted: '#9CA3AF', border: '#2A2E3A', placeholder: '#2A2F45', onAccent: '#FFFFFF', success: '#22C55E', warning: '#FBBF24', danger: '#F87171' };

  function palette(opts) {
    const p = Object.assign({}, opts && opts.dark ? DARK : LIGHT);
    p.accent = (opts && opts.accent) || ACCENTS[0][0];
    if (/^#(111827|000000|111111)$/i.test(p.accent) && opts && opts.dark) p.accent = '#F3F4F6';
    if (opts && opts.dark && /^#F3F4F6$/i.test(p.accent)) p.onAccent = '#111827';
    p.accentSoft = p.accent + (opts && opts.dark ? '33' : '1F');
    return p;
  }
  function tokens(v, p) {
    if (typeof v === 'string') return v.replace(/\$(accentSoft|accent|onAccent|bg|surface|text|muted|border|placeholder|success|warning|danger)/g, (m, k) => p[k] || m);
    if (Array.isArray(v)) return v.map((x) => tokens(x, p));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = tokens(v[k], p); return o; }
    return v;
  }

  // ------------------------------------------------------------------ значки (24×24, контуром)
  const ICONS = {
    home: 'M3 11 L12 4 L21 11 M5 10 V20 H10 V14 H14 V20 H19 V10',
    search: 'M10.5 4 A6.5 6.5 0 1 1 10.49 4 Z M15.5 15.5 L20 20',
    user: 'M12 4 A4 4 0 1 1 11.99 4 Z M4 20 C4 15.5 8 13.5 12 13.5 C16 13.5 20 15.5 20 20',
    heart: 'M12 20 C5 15 3 11.5 3 8.5 C3 6 5 4 7.5 4 C9.5 4 11 5.2 12 6.8 C13 5.2 14.5 4 16.5 4 C19 4 21 6 21 8.5 C21 11.5 19 15 12 20 Z',
    bell: 'M6 17 V11 C6 7.7 8.7 5 12 5 C15.3 5 18 7.7 18 11 V17 L19.5 18.5 H4.5 Z M10 20.5 H14',
    cart: 'M3 4 H5.5 L8 15 H18 L20 8 H6.5 M9 19.5 A1 1 0 1 1 8.99 19.5 Z M17 19.5 A1 1 0 1 1 16.99 19.5 Z',
    menu: 'M4 7 H20 M4 12 H20 M4 17 H20',
    close: 'M6 6 L18 18 M18 6 L6 18',
    plus: 'M12 5 V19 M5 12 H19',
    check: 'M5 12.5 L10 17 L19 7',
    'arrow-left': 'M19 12 H5 M11 6 L5 12 L11 18',
    'arrow-right': 'M5 12 H19 M13 6 L19 12 L13 18',
    'chevron-right': 'M9 5 L16 12 L9 19',
    'chevron-down': 'M5 9 L12 16 L19 9',
    settings: 'M12 9 A3 3 0 1 1 11.99 9 Z M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7.1 7.1 M16.9 16.9 L18.7 18.7 M5.3 18.7 L7.1 16.9 M16.9 7.1 L18.7 5.3',
    mail: 'M3.5 6 H20.5 V18 H3.5 Z M3.5 6.5 L12 13 L20.5 6.5',
    lock: 'M6 11 H18 V20 H6 Z M8.5 11 V8 C8.5 6 10 4.5 12 4.5 C14 4.5 15.5 6 15.5 8 V11',
    star: 'M12 3.5 L14.6 9 L20.5 9.6 L16 13.6 L17.3 19.5 L12 16.5 L6.7 19.5 L8 13.6 L3.5 9.6 L9.4 9 Z',
    calendar: 'M4 6 H20 V20 H4 Z M4 10 H20 M8 3.5 V7.5 M16 3.5 V7.5',
    chat: 'M4 5 H20 V16 H10 L5.5 20 V16 H4 Z',
    image: 'M3.5 5 H20.5 V19 H3.5 Z M3.5 16 L9 11 L13 15 L16 12.5 L20.5 16.5 M15.5 8.5 A1.2 1.2 0 1 1 15.49 8.5 Z',
    phone: 'M7 3.5 H17 V20.5 H7 Z M11 17.5 H13',
    chart: 'M4 20 H20 M7 20 V12 M12 20 V6 M17 20 V14',
    grid: 'M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z',
    play: 'M8 5 L19 12 L8 19 Z',
    download: 'M12 4 V15 M7 10 L12 15 L17 10 M5 19.5 H19',
    share: 'M18 5.5 A2.5 2.5 0 1 1 17.99 5.5 Z M6 12 A2.5 2.5 0 1 1 5.99 12 Z M18 18.5 A2.5 2.5 0 1 1 17.99 18.5 Z M8.2 10.8 L15.8 6.7 M8.2 13.2 L15.8 17.3',
    location: 'M12 21 C7 15.5 5 12.5 5 9.5 C5 5.9 8.1 3 12 3 C15.9 3 19 5.9 19 9.5 C19 12.5 17 15.5 12 21 Z M12 7.5 A2 2 0 1 1 11.99 7.5 Z',
    filter: 'M4 5 H20 L14 12.5 V19 L10 17 V12.5 Z',
    trash: 'M5 7 H19 M9 7 V4.5 H15 V7 M7 7 L8 20 H16 L17 7',
    edit: 'M4 20 H8 L19 9 L15 5 L4 16 Z M13 7 L17 11',
    logout: 'M10 4 H5 V20 H10 M15 8 L19 12 L15 16 M9 12 H19',
    globe: 'M12 3.5 A8.5 8.5 0 1 1 11.99 3.5 Z M3.5 12 H20.5 M12 3.5 C9.5 6 9 9 9 12 C9 15 9.5 18 12 20.5 C14.5 18 15 15 15 12 C15 9 14.5 6 12 3.5',
    bolt: 'M13 3 L5 13.5 H11 L10 21 L19 10 H13 Z',
    card: 'M3.5 6 H20.5 V18 H3.5 Z M3.5 10 H20.5 M7 14.5 H11',
    clock: 'M12 3.5 A8.5 8.5 0 1 1 11.99 3.5 Z M12 7.5 V12 L15 14',
  };

  // ------------------------------------------------------------------ сборка
  const NODE_KEYS = new Set(['type', 'name', 'w', 'h', 'x', 'y', 'text', 'path', 'children', 'shadow', 'icon', 'size', 'color']);
  const SHADOWS = {
    sm: [{ type: 'dropShadow', color: '#0000001A', offset: [0, 2], radius: 6 }],
    md: [{ type: 'dropShadow', color: '#0000001F', offset: [0, 8], radius: 24 }],
    lg: [{ type: 'dropShadow', color: '#00000033', offset: [0, 16], radius: 48 }],
  };

  // Дерево → шаги command.batch. Возвращает {commands, root: номер шага корня}.
  function compile(spec, opts) {
    const p = palette(opts);
    const commands = [];
    let count = 0;
    function add(node, parentStep, top) {
      if (!node || typeof node !== 'object') throw new Error('Пустой узел в описании макета');
      if (++count > 400) throw new Error('Слишком большой макет: больше 400 слоёв за раз');
      node = tokens(node, p);
      let type = String(node.type || (node.children ? 'frame' : node.text != null ? 'text' : 'rectangle')).toLowerCase();
      if (type === 'rect') type = 'rectangle';
      if (type === 'circle') type = 'ellipse';
      const params = { type, select: false };
      if (node.name) params.name = String(node.name);
      if (node.w != null) params.width = +node.w;
      if (node.h != null) params.height = +node.h;
      if (parentStep != null) params.parent = { $step: parentStep };
      if (top) { params.x = Math.round(opts.x || 0); params.y = Math.round(opts.y || 0); if (opts.parent != null) params.parent = opts.parent; }
      else { if (node.x != null) params.x = +node.x; if (node.y != null) params.y = +node.y; }
      const props = {};
      for (const k of Object.keys(node)) if (!NODE_KEYS.has(k)) props[k] = node[k];
      if (type === 'icon') {
        const d = ICONS[node.icon] || ICONS.star;
        const size = +node.size || 24;
        params.type = 'vector';
        params.path = d;
        params.width = size; params.height = size;
        params.name = params.name || 'Значок ' + (node.icon || '');
        Object.assign(props, { fill: 'none', stroke: node.color || p.text, strokeWeight: size >= 24 ? 2 : 1.75, strokeCap: 'round', strokeJoin: 'round' }, props);
        if (node.icon === 'star' && node.filled) { props.fill = node.color || p.warning; delete props.filled; }
        delete props.filled;
      } else if (type === 'text') {
        params.text = String(node.text ?? '');
        if (!params.name) params.name = params.text.slice(0, 40) || 'Текст';
        if (props.fill == null) props.fill = node.color || p.text;
        if (props.fontSize == null) props.fontSize = 16;
        if (props.sizingH === 'fill' && props.textAutoResize == null) props.textAutoResize = 'height';
      } else if (type === 'vector') {
        params.path = String(node.path || '');
      } else if (type === 'frame' || type === 'component') {
        if (props.fill == null) props.fill = 'none';
        if (node.children && props.layout == null && !node.children.some((c) => c && c.x != null)) props.layout = 'vertical';
        // Автолейаут без заданного размера — «по содержимому», как в Figma.
        if (props.layout) {
          if (node.w == null && props.sizingH == null) props.sizingH = 'hug';
          if (node.h == null && props.sizingV == null) props.sizingV = 'hug';
        }
      }
      if (node.color && type !== 'text' && type !== 'icon' && props.fill == null) props.fill = node.color;
      if (node.shadow) props.effects = SHADOWS[node.shadow] || SHADOWS.md;
      if (Object.keys(props).length) params.props = props;
      const step = commands.length;
      commands.push({ command: 'node.create', params });
      for (const c of node.children || []) add(c, step, false);
      return step;
    }
    const root = add(spec, null, true);
    return { commands, root };
  }

  // ------------------------------------------------------------------ строительные блоки
  const T = (text, o) => Object.assign({ type: 'text', text }, o || {});
  const H = (children, o) => Object.assign({ type: 'frame', layout: 'horizontal', gap: 8, crossAlign: 'center', children }, o || {});
  const V = (children, o) => Object.assign({ type: 'frame', layout: 'vertical', gap: 8, children }, o || {});
  const I = (icon, o) => Object.assign({ type: 'icon', icon }, o || {});
  const R = (o) => Object.assign({ type: 'rectangle' }, o || {});
  const Ell = (o) => Object.assign({ type: 'ellipse' }, o || {});
  const FILL = { sizingH: 'fill' };
  const grow = { name: 'Отступ', type: 'frame', fill: 'none', sizingH: 'fill', sizingV: 'fill' };
  const hgrow = { name: 'Отступ', type: 'frame', fill: 'none', sizingH: 'fill', h: 1 };
  const divider = () => R({ name: 'Разделитель', h: 1, fill: '$border', sizingH: 'fill' });
  const img = (h, o) => R(Object.assign({ name: 'Изображение', h, fill: '$placeholder', sizingH: 'fill', cornerRadius: 12 }, o || {}));

  const button = (label, o = {}) => H([T(label, { fontSize: o.size || 16, fontStyle: 'Semi Bold', fill: o.ghost ? '$accent' : o.outline ? '$text' : '$onAccent' })], Object.assign({
    name: 'Кнопка', padding: o.small ? [8, 14, 8, 14] : [14, 24, 14, 24], cornerRadius: o.radius ?? 12, mainAlign: 'center',
    fill: o.ghost || o.outline ? 'none' : '$accent', stroke: o.outline ? '$border' : undefined, strokeWeight: o.outline ? 1 : undefined,
  }, o.full ? FILL : {}));
  const input = (label, placeholder, o = {}) => V([
    ...(label ? [T(label, { fontSize: 14, fontStyle: 'Medium', fill: '$text' })] : []),
    H([...(o.icon ? [I(o.icon, { size: 20, color: '$muted' })] : []), T(placeholder, { fontSize: 16, fill: '$muted', sizingH: 'fill' })],
      { name: 'Поле', padding: [14, 16, 14, 16], fill: '$bg', stroke: '$border', strokeWeight: 1, cornerRadius: 12, sizingH: 'fill', gap: 10 }),
  ], { name: label ? 'Поле: ' + label : 'Поле ввода', gap: 6, sizingH: 'fill' });
  const avatar = (size = 40, o = {}) => Ell(Object.assign({ name: 'Аватар', w: size, h: size, fill: '$placeholder' }, o));
  const badge = (label, o = {}) => H([T(label, { fontSize: 12, fontStyle: 'Semi Bold', fill: o.color || '$accent' })], { name: 'Метка', padding: [4, 10, 4, 10], cornerRadius: 999, fill: o.bg || '$accentSoft' });
  const stars = (n = 5) => H(Array.from({ length: 5 }, (_, i) => ({ type: 'star', w: 16, h: 16, fill: i < n ? '$warning' : '$border', pointCount: 5, innerRadius: 0.45, name: 'Звезда' })), { name: 'Рейтинг', gap: 2 });
  const statusBar = () => H([T('9:41', { fontSize: 15, fontStyle: 'Semi Bold' }), hgrow, T('●●●', { fontSize: 11 }), H([R({ name: 'Заряд', w: 16, h: 7, cornerRadius: 2, fill: '$text' })], { name: 'Батарея', w: 24, h: 12, padding: 2, cornerRadius: 4, stroke: '$text', strokeWeight: 1, sizingH: 'fixed', sizingV: 'fixed' })], { name: 'Строка состояния', padding: [14, 24, 8, 24], gap: 6, sizingH: 'fill' });
  const appBar = (title, o = {}) => H([I(o.left || 'arrow-left'), T(title, { fontSize: 17, fontStyle: 'Semi Bold', sizingH: 'fill', textAlign: 'center' }), I(o.right || 'settings')], { name: 'Верхняя панель', padding: [12, 16, 12, 16], sizingH: 'fill', gap: 12 });
  const tabBar = (active = 0) => H(['home', 'search', 'heart', 'user'].map((ic, i) => V([I(ic, { color: i === active ? '$accent' : '$muted' }), T(['Главная', 'Поиск', 'Избранное', 'Профиль'][i], { fontSize: 11, fill: i === active ? '$accent' : '$muted' })], { name: 'Вкладка', gap: 4, crossAlign: 'center', sizingH: 'fill' })),
    { name: 'Нижняя панель', padding: [10, 8, 28, 8], sizingH: 'fill', fill: '$bg', stroke: '$border', strokeWeight: 1, strokeSides: [1, 0, 0, 0] });
  const screen = (name, children, o = {}) => V(children, Object.assign({ name, w: 393, h: 852, gap: 0, fill: '$bg', sizingH: 'fixed', sizingV: 'fixed', clip: true }, o));
  const body = (children, o = {}) => V(children, Object.assign({ name: 'Содержимое', padding: [8, 24, 24, 24], gap: 16, sizingH: 'fill', sizingV: 'fill' }, o));
  const web = (name, children, o = {}) => V(children, Object.assign({ name, w: 1440, gap: 0, fill: '$bg', sizingH: 'fixed', sizingV: 'hug' }, o));
  const section = (children, o = {}) => V(children, Object.assign({ name: 'Секция', padding: [96, 120, 96, 120], gap: 48, sizingH: 'fill', crossAlign: 'center' }, o));
  const listRow = (title, sub, o = {}) => H([o.icon ? I(o.icon, { color: '$accent' }) : avatar(44), V([T(title, { fontSize: 16, fontStyle: 'Medium' }), ...(sub ? [T(sub, { fontSize: 13, fill: '$muted' })] : [])], { gap: 2, sizingH: 'fill' }), I('chevron-right', { size: 20, color: '$muted' })],
    { name: 'Строка списка', padding: [12, 0, 12, 0], gap: 14, sizingH: 'fill' });
  const card = (children, o = {}) => V(children, Object.assign({ name: 'Карточка', padding: 24, gap: 12, fill: '$bg', cornerRadius: 20, stroke: '$border', strokeWeight: 1 }, o));
  const navLinks = (items) => H(items.map((t) => T(t, { fontSize: 15, fill: '$muted' })), { name: 'Меню', gap: 32 });
  const logo = (o = {}) => H([R({ name: 'Знак', w: 28, h: 28, cornerRadius: 8, fill: '$accent' }), T(o.text || 'Компания', { fontSize: 18, fontStyle: 'Bold' })], { name: 'Логотип', gap: 10 });

  // ------------------------------------------------------------------ шаблоны
  const L = [];
  const def = (id, cat, name, desc, build, o = {}) => L.push({ id, cat, name, desc, build, screen: !!o.screen, keywords: o.keywords || '' });

  // Элементы
  def('button', 'Элементы', 'Кнопка', 'Основная кнопка с автолейаутом', () => button('Продолжить'));
  def('button-set', 'Элементы', 'Набор кнопок', 'Основная, вторичная, текстовая и маленькая', () => H([button('Основная'), button('Вторичная', { outline: true }), button('Текстовая', { ghost: true }), button('Маленькая', { small: true, size: 14, radius: 8 })], { name: 'Кнопки', gap: 16, padding: 24, fill: '$bg', cornerRadius: 16 }));
  def('button-icon', 'Элементы', 'Кнопка со значком', 'Значок и надпись', () => H([I('plus', { color: '$onAccent', size: 20 }), T('Добавить', { fontSize: 16, fontStyle: 'Semi Bold', fill: '$onAccent' })], { name: 'Кнопка со значком', padding: [12, 20, 12, 16], cornerRadius: 12, fill: '$accent', gap: 8 }));
  def('input', 'Элементы', 'Поле ввода', 'Подпись и поле', () => V([input('Электронная почта', 'name@mail.ru', { icon: 'mail' })], { name: 'Поле ввода', w: 343, padding: 0, sizingH: 'fixed' }));
  def('search', 'Элементы', 'Поиск', 'Строка поиска со значком', () => H([I('search', { size: 20, color: '$muted' }), T('Поиск', { fontSize: 16, fill: '$muted', sizingH: 'fill' }), I('filter', { size: 20, color: '$muted' })], { name: 'Поиск', w: 343, padding: [12, 16, 12, 16], cornerRadius: 999, fill: '$surface', gap: 10, sizingH: 'fixed' }));
  def('toggle', 'Элементы', 'Переключатель', 'Строка настройки с переключателем', () => H([T('Уведомления', { fontSize: 16, sizingH: 'fill' }), H([Ell({ name: 'Ручка', w: 24, h: 24, fill: '#FFFFFF', shadow: 'sm' })], { name: 'Переключатель', w: 52, h: 32, padding: 4, cornerRadius: 999, fill: '$accent', mainAlign: 'max', sizingH: 'fixed', sizingV: 'fixed' })], { name: 'Настройка', w: 343, sizingH: 'fixed', padding: [8, 0, 8, 0] }));
  def('checkbox', 'Элементы', 'Флажки', 'Список с отметками', () => V(['Запомнить меня', 'Получать новости', 'Согласен с условиями'].map((t, i) => H([H(i !== 1 ? [I('check', { size: 16, color: '$onAccent' })] : [], { name: 'Флажок', w: 22, h: 22, cornerRadius: 6, fill: i !== 1 ? '$accent' : 'none', stroke: i !== 1 ? undefined : '$border', strokeWeight: 1.5, mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' }), T(t, { fontSize: 15 })], { gap: 12 })), { name: 'Флажки', gap: 14 }));
  def('tabs', 'Элементы', 'Вкладки', 'Переключатель разделов', () => H(['Все', 'Новые', 'Популярные'].map((t, i) => H([T(t, { fontSize: 14, fontStyle: 'Semi Bold', fill: i === 0 ? '$text' : '$muted' })], { name: 'Вкладка', padding: [8, 16, 8, 16], cornerRadius: 999, fill: i === 0 ? '$bg' : 'none', shadow: i === 0 ? 'sm' : undefined })), { name: 'Вкладки', padding: 4, cornerRadius: 999, fill: '$surface', gap: 4 }));
  def('badges', 'Элементы', 'Метки и чипсы', 'Цветные метки статуса', () => H([badge('Новинка'), badge('В наличии', { color: '$success', bg: '#16A34A1F' }), badge('Скидка −20%', { color: '$danger', bg: '#DC26261F' }), badge('Ожидает', { color: '#B45309', bg: '#F59E0B26' })], { name: 'Метки', gap: 8 }));
  def('avatar-row', 'Элементы', 'Пользователь', 'Аватар, имя и подпись', () => H([avatar(48), V([T('Анна Смирнова', { fontSize: 16, fontStyle: 'Semi Bold' }), T('Дизайнер', { fontSize: 14, fill: '$muted' })], { gap: 2 })], { name: 'Пользователь', gap: 12 }));
  def('toast', 'Элементы', 'Уведомление', 'Всплывающее сообщение', () => H([H([I('check', { size: 16, color: '#FFFFFF' })], { name: 'Значок', w: 28, h: 28, cornerRadius: 999, fill: '$success', mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' }), V([T('Сохранено', { fontSize: 15, fontStyle: 'Semi Bold' }), T('Изменения появятся у всех участников', { fontSize: 13, fill: '$muted' })], { gap: 2, sizingH: 'fill' }), I('close', { size: 18, color: '$muted' })], { name: 'Уведомление', w: 380, padding: 16, gap: 12, cornerRadius: 14, fill: '$bg', shadow: 'md', sizingH: 'fixed' }));
  def('progress', 'Элементы', 'Прогресс', 'Полоса выполнения с подписью', () => V([H([T('Загрузка файлов', { fontSize: 14, fontStyle: 'Medium', sizingH: 'fill' }), T('64%', { fontSize: 14, fill: '$muted' })], FILL), H([R({ name: 'Заполнено', w: 205, h: 8, cornerRadius: 999, fill: '$accent' })], { name: 'Полоса', h: 8, cornerRadius: 999, fill: '$surface', sizingH: 'fill', sizingV: 'fixed' })], { name: 'Прогресс', w: 320, gap: 8, sizingH: 'fixed' }));
  def('rating', 'Элементы', 'Рейтинг', 'Звёзды и число отзывов', () => H([stars(4), T('4,8', { fontSize: 14, fontStyle: 'Semi Bold' }), T('(128 отзывов)', { fontSize: 14, fill: '$muted' })], { name: 'Рейтинг', gap: 8 }));
  def('pagination', 'Элементы', 'Пагинация', 'Номера страниц', () => H([I('arrow-left', { size: 18, color: '$muted' }), ...['1', '2', '3', '…', '12'].map((t, i) => H([T(t, { fontSize: 14, fontStyle: 'Medium', fill: i === 1 ? '$onAccent' : '$text' })], { name: 'Страница', w: 36, h: 36, cornerRadius: 10, fill: i === 1 ? '$accent' : 'none', mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' })), I('arrow-right', { size: 18, color: '$muted' })], { name: 'Пагинация', gap: 6 }));

  // Карточки
  def('card-product', 'Карточки', 'Товар', 'Фото, название, цена, кнопка', () => card([img(200), badge('Новинка'), T('Беспроводные наушники', { fontSize: 18, fontStyle: 'Semi Bold', ...FILL }), stars(5), H([T('7 990 ₽', { fontSize: 22, fontStyle: 'Bold', sizingH: 'fill' }), T('9 990 ₽', { fontSize: 14, fill: '$muted', textDecoration: 'strikethrough' })], FILL), button('В корзину', { full: true })], { w: 300, padding: 16, sizingH: 'fixed', shadow: 'sm' }));
  def('card-article', 'Карточки', 'Статья', 'Обложка, тема, заголовок, автор', () => card([img(180), badge('Дизайн'), T('Как собрать дизайн-систему за неделю', { fontSize: 20, fontStyle: 'Bold', ...FILL }), T('Пошагово: цвета, шрифты, компоненты и правила, которые команда будет соблюдать.', { fontSize: 15, fill: '$muted', ...FILL }), H([avatar(32), T('Иван Петров · 5 мин', { fontSize: 13, fill: '$muted' })], { gap: 10 })], { w: 360, padding: 16, sizingH: 'fixed' }));
  def('card-profile', 'Карточки', 'Профиль', 'Аватар, имя, статистика, кнопки', () => card([avatar(88), T('Анна Смирнова', { fontSize: 20, fontStyle: 'Bold' }), T('Продуктовый дизайнер, Москва', { fontSize: 14, fill: '$muted' }), H([['128', 'проектов'], ['4,9', 'рейтинг'], ['2,1 тыс.', 'подписчиков']].map(([a, b]) => V([T(a, { fontSize: 18, fontStyle: 'Bold' }), T(b, { fontSize: 12, fill: '$muted' })], { gap: 2, crossAlign: 'center', sizingH: 'fill' })), FILL), H([button('Написать', { full: true }), button('Подписаться', { outline: true, full: true })], { gap: 12, ...FILL })], { w: 340, crossAlign: 'center', sizingH: 'fixed', shadow: 'sm' }));
  def('card-price', 'Карточки', 'Тариф', 'Цена и список возможностей', () => card([badge('Популярный'), T('Команда', { fontSize: 22, fontStyle: 'Bold' }), H([T('990 ₽', { fontSize: 40, fontStyle: 'Bold' }), T('/ мес', { fontSize: 16, fill: '$muted' })], { gap: 6, crossAlign: 'max' }), divider(), ...['До 10 участников', 'Неограниченные файлы', 'История версий', 'Приоритетная поддержка'].map((t) => H([I('check', { size: 18, color: '$accent' }), T(t, { fontSize: 15 })], { gap: 10 })), button('Выбрать тариф', { full: true })], { w: 320, gap: 16, sizingH: 'fixed', stroke: '$accent', strokeWeight: 2 }));
  def('card-stat', 'Карточки', 'Показатель', 'Цифра, подпись и рост', () => card([H([T('Выручка', { fontSize: 14, fill: '$muted', sizingH: 'fill' }), I('chart', { size: 20, color: '$muted' })], FILL), T('1,24 млн ₽', { fontSize: 28, fontStyle: 'Bold' }), badge('+12,4% за месяц', { color: '$success', bg: '#16A34A1F' })], { w: 260, gap: 10, sizingH: 'fixed' }));
  def('card-review', 'Карточки', 'Отзыв', 'Оценка, текст, автор', () => card([stars(5), T('«Пользуемся каждый день: всё понятно с первого раза, а поддержка отвечает за минуты».', { fontSize: 16, ...FILL }), H([avatar(40), V([T('Мария К.', { fontSize: 15, fontStyle: 'Semi Bold' }), T('Руководитель отдела', { fontSize: 13, fill: '$muted' })], { gap: 2 })], { gap: 12 })], { w: 360, gap: 16, sizingH: 'fixed' }));
  def('card-event', 'Карточки', 'Событие', 'Дата, место, участники', () => card([H([V([T('ОКТ', { fontSize: 12, fontStyle: 'Bold', fill: '$accent' }), T('24', { fontSize: 26, fontStyle: 'Bold' })], { name: 'Дата', w: 64, padding: 8, cornerRadius: 12, fill: '$accentSoft', crossAlign: 'center', gap: 0, sizingH: 'fixed' }), V([T('Дизайн-митап', { fontSize: 18, fontStyle: 'Bold' }), H([I('location', { size: 16, color: '$muted' }), T('Минск, ул. Ленина, 5', { fontSize: 14, fill: '$muted' })], { gap: 6 }), H([I('clock', { size: 16, color: '$muted' }), T('19:00 – 21:00', { fontSize: 14, fill: '$muted' })], { gap: 6 })], { gap: 6, sizingH: 'fill' })], { gap: 16, ...FILL }), button('Записаться', { full: true })], { w: 360, gap: 16, sizingH: 'fixed' }));

  // Навигация
  def('header', 'Навигация', 'Шапка сайта', 'Логотип, меню, кнопка', () => H([logo(), hgrow, navLinks(['Продукт', 'Цены', 'Блог', 'Контакты']), button('Войти', { small: true, size: 15, radius: 10 })], { name: 'Шапка', w: 1440, padding: [20, 120, 20, 120], gap: 40, fill: '$bg', sizingH: 'fixed', stroke: '$border', strokeWeight: 1, strokeSides: [0, 0, 1, 0] }));
  def('footer', 'Навигация', 'Подвал сайта', 'Колонки ссылок и копирайт', () => V([H([V([logo(), T('Делаем удобные сервисы\nдля команд и бизнеса.', { fontSize: 14, fill: '$muted' })], { gap: 16, sizingH: 'fill' }), ...[['Продукт', ['Возможности', 'Цены', 'Обновления']], ['Компания', ['О нас', 'Вакансии', 'Контакты']], ['Помощь', ['Документация', 'Поддержка', 'Статус']]].map(([h, items]) => V([T(h, { fontSize: 14, fontStyle: 'Semi Bold' }), ...items.map((t) => T(t, { fontSize: 14, fill: '$muted' }))], { gap: 12, w: 180, sizingH: 'fixed' }))], { gap: 40, ...FILL }), divider(), H([T('© 2026 Компания. Все права защищены.', { fontSize: 13, fill: '$muted', sizingH: 'fill' }), T('Политика конфиденциальности', { fontSize: 13, fill: '$muted' })], FILL)], { name: 'Подвал', w: 1440, padding: [64, 120, 40, 120], gap: 40, fill: '$surface', sizingH: 'fixed' }));
  def('app-bar', 'Навигация', 'Верхняя панель (телефон)', 'Назад, заголовок, действие', () => V([appBar('Заголовок')], { name: 'Верхняя панель', w: 393, padding: 0, fill: '$bg', sizingH: 'fixed' }));
  def('tab-bar', 'Навигация', 'Нижняя панель (телефон)', 'Четыре раздела со значками', () => V([tabBar(0)], { name: 'Нижняя панель', w: 393, padding: 0, sizingH: 'fixed' }));
  def('sidebar', 'Навигация', 'Боковое меню', 'Разделы приложения', () => V([logo(), V([['grid', 'Обзор'], ['chart', 'Аналитика'], ['user', 'Клиенты'], ['cart', 'Заказы'], ['chat', 'Сообщения'], ['settings', 'Настройки']].map(([ic, t], i) => H([I(ic, { size: 20, color: i === 0 ? '$accent' : '$muted' }), T(t, { fontSize: 15, fontStyle: i === 0 ? 'Semi Bold' : 'Regular', fill: i === 0 ? '$accent' : '$text' })], { name: 'Пункт', padding: [10, 12, 10, 12], gap: 12, cornerRadius: 10, fill: i === 0 ? '$accentSoft' : 'none', sizingH: 'fill' })), { gap: 4, ...FILL }), grow, H([avatar(36), V([T('Анна', { fontSize: 14, fontStyle: 'Semi Bold' }), T('Администратор', { fontSize: 12, fill: '$muted' })], { gap: 0 })], { gap: 10 })], { name: 'Боковое меню', w: 260, h: 800, padding: 20, gap: 28, fill: '$bg', sizingH: 'fixed', sizingV: 'fixed', stroke: '$border', strokeWeight: 1, strokeSides: [0, 1, 0, 0] }));
  def('breadcrumbs', 'Навигация', 'Хлебные крошки', 'Путь к странице', () => H(['Главная', '/', 'Каталог', '/', 'Наушники'].map((t, i) => T(t, { fontSize: 14, fill: i === 4 ? '$text' : '$muted' })), { name: 'Хлебные крошки', gap: 8 }));

  // Мобильные экраны
  def('m-login', 'Экраны телефона', 'Вход', 'Логотип, почта, пароль, кнопка', () => screen('Вход', [statusBar(), body([V([R({ name: 'Логотип', w: 56, h: 56, cornerRadius: 16, fill: '$accent' })], { padding: [32, 0, 8, 0] }), T('С возвращением!', { fontSize: 28, fontStyle: 'Bold' }), T('Войдите, чтобы продолжить', { fontSize: 16, fill: '$muted' }), input('Электронная почта', 'name@mail.ru', { icon: 'mail' }), input('Пароль', '••••••••', { icon: 'lock' }), T('Забыли пароль?', { fontSize: 14, fontStyle: 'Medium', fill: '$accent' }), button('Войти', { full: true }), grow, H([T('Нет аккаунта?', { fontSize: 15, fill: '$muted' }), T('Зарегистрироваться', { fontSize: 15, fontStyle: 'Semi Bold', fill: '$accent' })], { gap: 6, mainAlign: 'center', ...FILL })], { gap: 18 })]), { screen: true, keywords: 'логин авторизация' });
  def('m-signup', 'Экраны телефона', 'Регистрация', 'Имя, почта, пароль, согласие', () => screen('Регистрация', [statusBar(), appBar('', { right: 'close' }), body([T('Создайте аккаунт', { fontSize: 28, fontStyle: 'Bold' }), input('Имя', 'Анна'), input('Электронная почта', 'name@mail.ru'), input('Пароль', 'Не меньше 8 символов'), H([H([I('check', { size: 14, color: '$onAccent' })], { name: 'Флажок', w: 20, h: 20, cornerRadius: 6, fill: '$accent', mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' }), T('Согласен с условиями использования', { fontSize: 14, fill: '$muted' })], { gap: 10 }), grow, button('Создать аккаунт', { full: true })], { gap: 18 })]), { screen: true });
  def('m-onboarding', 'Экраны телефона', 'Приветствие', 'Картинка, заголовок, точки, кнопка', () => screen('Приветствие', [statusBar(), body([img(380, { cornerRadius: 28 }), T('Всё под рукой', { fontSize: 30, fontStyle: 'Bold', textAlign: 'center', ...FILL }), T('Планируйте задачи, следите за прогрессом и работайте вместе с командой.', { fontSize: 16, fill: '$muted', textAlign: 'center', ...FILL }), H([Ell({ w: 24, h: 8, fill: '$accent', name: 'Точка' }), Ell({ w: 8, h: 8, fill: '$border', name: 'Точка' }), Ell({ w: 8, h: 8, fill: '$border', name: 'Точка' })], { gap: 6, mainAlign: 'center', ...FILL }), grow, button('Начать', { full: true }), T('Пропустить', { fontSize: 15, fill: '$muted', textAlign: 'center', ...FILL })], { gap: 20, crossAlign: 'center' })]), { screen: true });
  def('m-home', 'Экраны телефона', 'Главная', 'Приветствие, поиск, карточки, меню', () => screen('Главная', [statusBar(), body([H([V([T('Привет, Анна!', { fontSize: 14, fill: '$muted' }), T('Что ищем сегодня?', { fontSize: 24, fontStyle: 'Bold' })], { gap: 4, sizingH: 'fill' }), I('bell')], FILL), H([I('search', { size: 20, color: '$muted' }), T('Поиск', { fontSize: 16, fill: '$muted', sizingH: 'fill' })], { name: 'Поиск', padding: [12, 16, 12, 16], cornerRadius: 14, fill: '$surface', gap: 10, ...FILL }), V([T('Акция недели', { fontSize: 14, fill: '$onAccent' }), T('−30% на всё', { fontSize: 26, fontStyle: 'Bold', fill: '$onAccent' }), H([T('Смотреть', { fontSize: 14, fontStyle: 'Semi Bold', fill: '$accent' })], { name: 'Кнопка', padding: [8, 14, 8, 14], cornerRadius: 10, fill: '#FFFFFF' })], { name: 'Баннер', padding: 20, gap: 8, cornerRadius: 20, fill: '$accent', ...FILL }), H([T('Популярное', { fontSize: 18, fontStyle: 'Bold', sizingH: 'fill' }), T('Все', { fontSize: 14, fill: '$accent' })], FILL), H([0, 1].map(() => V([img(120), T('Название', { fontSize: 15, fontStyle: 'Semi Bold' }), T('1 290 ₽', { fontSize: 14, fill: '$muted' })], { name: 'Товар', gap: 6, sizingH: 'fill' })), { gap: 14, ...FILL })], { gap: 18 }), tabBar(0)]), { screen: true });
  def('m-profile', 'Экраны телефона', 'Профиль', 'Аватар, данные, пункты меню', () => screen('Профиль', [statusBar(), appBar('Профиль', { right: 'settings' }), body([V([avatar(96), T('Анна Смирнова', { fontSize: 22, fontStyle: 'Bold' }), T('anna@mail.ru', { fontSize: 14, fill: '$muted' })], { gap: 8, crossAlign: 'center', ...FILL }), V([listRow('Мои заказы', '3 активных', { icon: 'cart' }), divider(), listRow('Избранное', '12 товаров', { icon: 'heart' }), divider(), listRow('Адреса доставки', null, { icon: 'location' }), divider(), listRow('Способы оплаты', null, { icon: 'card' }), divider(), listRow('Уведомления', null, { icon: 'bell' })], { gap: 0, ...FILL }), grow, button('Выйти', { outline: true, full: true })], { gap: 20 }), tabBar(3)]), { screen: true });
  def('m-list', 'Экраны телефона', 'Список', 'Лента записей с аватарами', () => screen('Список', [statusBar(), appBar('Сообщения', { left: 'menu', right: 'search' }), body([...['Анна Смирнова', 'Команда дизайна', 'Иван Петров', 'Мария Козлова', 'Поддержка'].map((n, i) => H([avatar(48), V([H([T(n, { fontSize: 16, fontStyle: 'Semi Bold', sizingH: 'fill' }), T(['10:24', '09:10', 'вчера', 'пн', '21.10'][i], { fontSize: 12, fill: '$muted' })], FILL), T(['Отправила макет на согласование', 'Встреча перенесена на 15:00', 'Спасибо, всё получил!', 'Посмотри, пожалуйста, вариант 2', 'Ваш вопрос решён'][i], { fontSize: 14, fill: '$muted', ...FILL })], { gap: 4, sizingH: 'fill' })], { name: 'Диалог', gap: 14, padding: [10, 0, 10, 0], ...FILL }))], { gap: 4 }), tabBar(1)]), { screen: true, keywords: 'чат сообщения лента' });
  def('m-product', 'Экраны телефона', 'Товар', 'Фото, описание, цена, покупка', () => screen('Товар', [statusBar(), appBar('', { right: 'heart' }), body([img(320, { cornerRadius: 24 }), H([V([T('Беспроводные наушники', { fontSize: 22, fontStyle: 'Bold', ...FILL }), H([stars(5), T('4,8 · 128 отзывов', { fontSize: 13, fill: '$muted' })], { gap: 8 })], { gap: 8, sizingH: 'fill' })], FILL), T('Шумоподавление, 30 часов работы, быстрая зарядка за 10 минут — на 3 часа музыки.', { fontSize: 15, fill: '$muted', ...FILL }), H(['Чёрный', 'Белый', 'Синий'].map((t, i) => H([T(t, { fontSize: 14, fill: i === 0 ? '$onAccent' : '$text' })], { name: 'Вариант', padding: [8, 14, 8, 14], cornerRadius: 999, fill: i === 0 ? '$accent' : '$surface' })), { gap: 8 }), grow, H([V([T('Цена', { fontSize: 13, fill: '$muted' }), T('7 990 ₽', { fontSize: 24, fontStyle: 'Bold' })], { gap: 0 }), button('В корзину', { full: true })], { gap: 20, ...FILL })], { gap: 16 })]), { screen: true });
  def('m-cart', 'Экраны телефона', 'Корзина', 'Товары, итог, оформление', () => screen('Корзина', [statusBar(), appBar('Корзина', { right: 'trash' }), body([...['Наушники', 'Чехол', 'Зарядка'].map((n, i) => H([R({ name: 'Фото', w: 72, h: 72, cornerRadius: 14, fill: '$placeholder' }), V([T(n, { fontSize: 16, fontStyle: 'Semi Bold' }), T(['7 990 ₽', '990 ₽', '1 490 ₽'][i], { fontSize: 15, fill: '$muted' })], { gap: 4, sizingH: 'fill' }), H([I('plus', { size: 16 }), T('1', { fontSize: 15, fontStyle: 'Semi Bold' })], { name: 'Количество', padding: [6, 10, 6, 10], cornerRadius: 999, fill: '$surface', gap: 10 })], { name: 'Товар', gap: 14, ...FILL })), divider(), H([T('Доставка', { fontSize: 15, fill: '$muted', sizingH: 'fill' }), T('Бесплатно', { fontSize: 15 })], FILL), H([T('Итого', { fontSize: 18, fontStyle: 'Bold', sizingH: 'fill' }), T('10 470 ₽', { fontSize: 20, fontStyle: 'Bold' })], FILL), grow, button('Оформить заказ', { full: true })], { gap: 18 })]), { screen: true });
  def('m-settings', 'Экраны телефона', 'Настройки', 'Группы настроек с переключателями', () => screen('Настройки', [statusBar(), appBar('Настройки', { right: 'search' }), body([T('Аккаунт', { fontSize: 13, fontStyle: 'Semi Bold', fill: '$muted' }), V([listRow('Личные данные', null, { icon: 'user' }), divider(), listRow('Безопасность', null, { icon: 'lock' }), divider(), listRow('Язык', 'Русский', { icon: 'globe' })], { gap: 0, ...FILL }), T('Приложение', { fontSize: 13, fontStyle: 'Semi Bold', fill: '$muted' }), ...['Уведомления', 'Тёмная тема', 'Звуки'].map((t, i) => H([T(t, { fontSize: 16, sizingH: 'fill' }), H([Ell({ name: 'Ручка', w: 24, h: 24, fill: '#FFFFFF' })], { name: 'Переключатель', w: 52, h: 32, padding: 4, cornerRadius: 999, fill: i !== 1 ? '$accent' : '$border', mainAlign: i !== 1 ? 'max' : 'min', sizingH: 'fixed', sizingV: 'fixed' })], { name: 'Настройка', padding: [6, 0, 6, 0], ...FILL }))], { gap: 12 })]), { screen: true });
  def('m-empty', 'Экраны телефона', 'Пустое состояние', 'Когда ещё ничего нет', () => screen('Пусто', [statusBar(), appBar('Заказы', { right: 'filter' }), body([grow, H([I('cart', { size: 48, color: '$accent' })], { name: 'Значок', w: 112, h: 112, cornerRadius: 999, fill: '$accentSoft', mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' }), T('Пока нет заказов', { fontSize: 22, fontStyle: 'Bold' }), T('Загляните в каталог — там много интересного', { fontSize: 15, fill: '$muted', textAlign: 'center', ...FILL }), button('Перейти в каталог'), grow], { crossAlign: 'center', gap: 16 })]), { screen: true });
  def('m-chat', 'Экраны телефона', 'Чат', 'Переписка и поле ввода', () => screen('Чат', [statusBar(), H([I('arrow-left'), avatar(36), V([T('Анна', { fontSize: 16, fontStyle: 'Semi Bold' }), T('в сети', { fontSize: 12, fill: '$success' })], { gap: 0, sizingH: 'fill' }), I('phone')], { name: 'Шапка чата', padding: [8, 16, 12, 16], gap: 12, ...FILL, stroke: '$border', strokeWeight: 1, strokeSides: [0, 0, 1, 0] }), body([['Привет! Посмотришь макет?', 0], ['Да, уже открыл', 1], ['Кнопку бы сделать заметнее', 1], ['Согласна, поправлю сегодня', 0]].map(([t, me]) => H([T(t, { fontSize: 15, fill: me ? '$onAccent' : '$text' })], { name: 'Сообщение', padding: [10, 14, 10, 14], cornerRadius: 18, fill: me ? '$accent' : '$surface' })), { gap: 10, crossAlign: 'min' }), H([T('Сообщение…', { fontSize: 15, fill: '$muted', sizingH: 'fill' }), H([I('arrow-right', { size: 18, color: '$onAccent' })], { name: 'Отправить', w: 40, h: 40, cornerRadius: 999, fill: '$accent', mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' })], { name: 'Поле сообщения', padding: [8, 8, 30, 20], gap: 10, ...FILL, stroke: '$border', strokeWeight: 1, strokeSides: [1, 0, 0, 0] })]), { screen: true });

  // Блоки сайта
  def('w-hero', 'Блоки сайта', 'Первый экран', 'Заголовок, текст, кнопки, картинка', () => web('Первый экран', [H([logo(), hgrow, navLinks(['Продукт', 'Цены', 'Блог']), button('Попробовать', { small: true, size: 15, radius: 10 })], { name: 'Шапка', padding: [24, 120, 24, 120], gap: 40, ...FILL }), H([V([badge('Новое в 2026'), T('Делайте интерфейсы вместе и быстрее', { fontSize: 60, fontStyle: 'Bold', lineHeight: '110%', ...FILL }), T('Макеты, прототипы и помощник на вашей модели — в одном окне браузера.', { fontSize: 20, fill: '$muted', ...FILL }), H([button('Начать бесплатно'), button('Смотреть демо', { outline: true })], { gap: 12 })], { gap: 24, sizingH: 'fill' }), img(480, { name: 'Иллюстрация', cornerRadius: 28 })], { name: 'Главное', padding: [64, 120, 96, 120], gap: 64, ...FILL })]), { screen: true, keywords: 'лендинг hero' });
  def('w-features', 'Блоки сайта', 'Преимущества', 'Три колонки со значками', () => web('Преимущества', [section([V([T('Почему выбирают нас', { fontSize: 40, fontStyle: 'Bold', textAlign: 'center' }), T('Всё, что нужно команде, без лишнего', { fontSize: 18, fill: '$muted', textAlign: 'center' })], { gap: 12, crossAlign: 'center' }), H([['bolt', 'Быстро', 'Открывается за секунды прямо в браузере.'], ['lock', 'Надёжно', 'Файлы хранятся на вашем сервере.'], ['chat', 'Вместе', 'Комментарии и правки в одном месте.']].map(([ic, h, t]) => V([H([I(ic, { color: '$accent' })], { name: 'Значок', w: 48, h: 48, cornerRadius: 14, fill: '$accentSoft', mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' }), T(h, { fontSize: 22, fontStyle: 'Bold' }), T(t, { fontSize: 16, fill: '$muted', ...FILL })], { name: 'Преимущество', gap: 12, padding: 28, cornerRadius: 20, fill: '$surface', sizingH: 'fill' })), { gap: 24, ...FILL })])]), { screen: true });
  def('w-pricing', 'Блоки сайта', 'Тарифы', 'Три тарифа рядом', () => web('Тарифы', [section([T('Простые тарифы', { fontSize: 40, fontStyle: 'Bold' }), H([['Старт', '0 ₽', ['1 участник', '3 файла']], ['Команда', '990 ₽', ['До 10 участников', 'Без ограничений', 'История версий']], ['Компания', '4 900 ₽', ['Без ограничений', 'Свой сервер', 'Поддержка 24/7']]].map(([n, pr, items], i) => card([T(n, { fontSize: 20, fontStyle: 'Bold' }), H([T(pr, { fontSize: 36, fontStyle: 'Bold' }), T('/ мес', { fontSize: 15, fill: '$muted' })], { gap: 6, crossAlign: 'max' }), divider(), ...items.map((t) => H([I('check', { size: 18, color: '$accent' }), T(t, { fontSize: 15 })], { gap: 10 })), grow, button(i === 1 ? 'Выбрать' : 'Начать', { full: true, outline: i !== 1 })], { gap: 16, sizingH: 'fill', h: 420, sizingV: 'fixed', stroke: i === 1 ? '$accent' : '$border', strokeWeight: i === 1 ? 2 : 1 })), { gap: 24, ...FILL })])]), { screen: true });
  def('w-testimonials', 'Блоки сайта', 'Отзывы', 'Три отзыва клиентов', () => web('Отзывы', [section([T('Что говорят клиенты', { fontSize: 40, fontStyle: 'Bold' }), H(['Мария К.', 'Олег Р.', 'Светлана Д.'].map((n) => card([stars(5), T('«Стали делать макеты в два раза быстрее, а согласование теперь занимает один день».', { fontSize: 16, ...FILL }), H([avatar(40), V([T(n, { fontSize: 15, fontStyle: 'Semi Bold' }), T('Руководитель продукта', { fontSize: 13, fill: '$muted' })], { gap: 2 })], { gap: 12 })], { gap: 16, sizingH: 'fill' })), { gap: 24, ...FILL })], { fill: '$surface' })]), { screen: true });
  def('w-cta', 'Блоки сайта', 'Призыв к действию', 'Яркий блок с кнопкой', () => web('Призыв', [section([V([T('Готовы начать?', { fontSize: 44, fontStyle: 'Bold', fill: '$onAccent', textAlign: 'center' }), T('Первые 14 дней — бесплатно, карта не нужна.', { fontSize: 18, fill: '$onAccent', textAlign: 'center' }), H([T('Создать аккаунт', { fontSize: 16, fontStyle: 'Semi Bold', fill: '$accent' })], { name: 'Кнопка', padding: [14, 28, 14, 28], cornerRadius: 12, fill: '#FFFFFF' })], { name: 'Блок', padding: [64, 48, 64, 48], gap: 20, cornerRadius: 32, fill: '$accent', crossAlign: 'center', ...FILL })], { padding: [64, 120, 64, 120] })]), { screen: true });
  def('w-contact', 'Блоки сайта', 'Форма обратной связи', 'Контакты и форма', () => web('Контакты', [section([H([V([T('Свяжитесь с нами', { fontSize: 40, fontStyle: 'Bold' }), T('Ответим в течение рабочего дня.', { fontSize: 18, fill: '$muted' }), H([I('mail', { color: '$accent' }), T('hello@company.ru', { fontSize: 16 })], { gap: 12 }), H([I('phone', { color: '$accent' }), T('+375 29 000-00-00', { fontSize: 16 })], { gap: 12 }), H([I('location', { color: '$accent' }), T('Минск, ул. Ленина, 5', { fontSize: 16 })], { gap: 12 })], { gap: 20, sizingH: 'fill' }), card([input('Имя', 'Как к вам обращаться'), input('Электронная почта', 'name@mail.ru'), V([T('Сообщение', { fontSize: 14, fontStyle: 'Medium' }), H([T('Расскажите о задаче', { fontSize: 16, fill: '$muted', sizingH: 'fill' })], { name: 'Поле', h: 120, padding: 16, cornerRadius: 12, stroke: '$border', strokeWeight: 1, crossAlign: 'min', sizingH: 'fill', sizingV: 'fixed' })], { gap: 6, ...FILL }), button('Отправить', { full: true })], { gap: 16, sizingH: 'fill', padding: 32 })], { gap: 64, ...FILL })], { crossAlign: 'min' })]), { screen: true });
  def('w-dashboard', 'Блоки сайта', 'Панель управления', 'Меню, показатели, таблица', () => H([V([logo(), ...[['grid', 'Обзор'], ['chart', 'Аналитика'], ['user', 'Клиенты'], ['cart', 'Заказы'], ['settings', 'Настройки']].map(([ic, t], i) => H([I(ic, { size: 20, color: i === 0 ? '$accent' : '$muted' }), T(t, { fontSize: 15, fill: i === 0 ? '$accent' : '$text' })], { name: 'Пункт', padding: [10, 12, 10, 12], gap: 12, cornerRadius: 10, fill: i === 0 ? '$accentSoft' : 'none', ...FILL }))], { name: 'Меню', w: 240, padding: 20, gap: 8, sizingH: 'fixed', sizingV: 'fill', stroke: '$border', strokeWeight: 1, strokeSides: [0, 1, 0, 0] }), V([H([T('Обзор', { fontSize: 28, fontStyle: 'Bold', sizingH: 'fill' }), H([I('search', { size: 18, color: '$muted' }), T('Поиск', { fontSize: 14, fill: '$muted' })], { padding: [10, 14, 10, 14], gap: 8, cornerRadius: 10, fill: '$surface', w: 240, sizingH: 'fixed' }), avatar(36)], { gap: 16, ...FILL }), H([['Выручка', '1,24 млн ₽', '+12%'], ['Заказы', '3 482', '+8%'], ['Клиенты', '1 209', '+3%'], ['Средний чек', '3 560 ₽', '−2%']].map(([a, b, c]) => card([T(a, { fontSize: 14, fill: '$muted' }), T(b, { fontSize: 26, fontStyle: 'Bold' }), badge(c, c.startsWith('−') ? { color: '$danger', bg: '#DC26261F' } : { color: '$success', bg: '#16A34A1F' })], { gap: 8, padding: 20, sizingH: 'fill' })), { gap: 16, ...FILL }), card([H([T('Последние заказы', { fontSize: 18, fontStyle: 'Bold', sizingH: 'fill' }), T('Все заказы', { fontSize: 14, fill: '$accent' })], FILL), H(['Заказ', 'Клиент', 'Дата', 'Сумма', 'Статус'].map((t) => T(t, { fontSize: 13, fontStyle: 'Semi Bold', fill: '$muted', sizingH: 'fill' })), { name: 'Заголовки', padding: [8, 0, 8, 0], ...FILL }), ...[['#1042', 'Анна С.', '24.10', '7 990 ₽', 'Оплачен'], ['#1041', 'Иван П.', '24.10', '2 490 ₽', 'В пути'], ['#1040', 'Мария К.', '23.10', '12 300 ₽', 'Оплачен'], ['#1039', 'Олег Р.', '23.10', '990 ₽', 'Отменён']].flatMap((row) => [divider(), H(row.map((t, j) => j === 4 ? H([badge(t, t === 'Отменён' ? { color: '$danger', bg: '#DC26261F' } : t === 'В пути' ? { color: '#B45309', bg: '#F59E0B26' } : { color: '$success', bg: '#16A34A1F' })], { sizingH: 'fill' }) : T(t, { fontSize: 14, sizingH: 'fill' })), { name: 'Строка', padding: [12, 0, 12, 0], ...FILL })])], { gap: 4, ...FILL, padding: 24 })], { name: 'Содержимое', padding: 32, gap: 24, sizingH: 'fill', sizingV: 'fill', fill: '$surface' })], { name: 'Панель управления', w: 1440, h: 900, gap: 0, fill: '$bg', crossAlign: 'min', sizingH: 'fixed', sizingV: 'fixed' }), { screen: true, keywords: 'дашборд админка таблица' });

  // Соцсети, печать, презентации
  const poster = (name, w, h, children, o = {}) => V(children, Object.assign({ name, w, h, padding: Math.round(w / 14), gap: Math.round(w / 40), fill: '$accent', sizingH: 'fixed', sizingV: 'fixed', clip: true }, o));
  def('s-post', 'Соцсети и печать', 'Пост 1080×1080', 'Квадратный пост с заголовком', () => poster('Пост', 1080, 1080, [badge('АНОНС', { color: '$accent', bg: '#FFFFFF' }), grow, T('Большая распродажа\nв эти выходные', { fontSize: 88, fontStyle: 'Bold', fill: '$onAccent', lineHeight: '105%' }), T('Скидки до 50% на всё. Только 25–26 октября.', { fontSize: 36, fill: '$onAccent' }), H([logo({ text: 'Компания' })], { padding: [24, 0, 0, 0] })]), { keywords: 'инстаграм instagram' });
  def('s-story', 'Соцсети и печать', 'Сторис 1080×1920', 'Вертикальный формат', () => poster('Сторис', 1080, 1920, [grow, img(760, { cornerRadius: 48, fill: '#FFFFFF33' }), T('Новая коллекция', { fontSize: 96, fontStyle: 'Bold', fill: '$onAccent' }), T('Смотрите в профиле →', { fontSize: 44, fill: '$onAccent' }), grow], { crossAlign: 'center' }), { keywords: 'stories инстаграм' });
  def('s-youtube', 'Соцсети и печать', 'Обложка видео 1280×720', 'Заголовок и место под фото', () => H([V([badge('НОВОЕ ВИДЕО', { color: '$accent', bg: '#FFFFFF' }), T('5 ошибок\nв дизайне', { fontSize: 96, fontStyle: 'Bold', fill: '$onAccent', lineHeight: '100%' })], { gap: 24, sizingH: 'fill' }), img(560, { w: 460, sizingH: 'fixed', cornerRadius: 32, fill: '#FFFFFF33', name: 'Фото' })], { name: 'Обложка видео', w: 1280, h: 720, padding: 80, gap: 48, fill: '$accent', sizingH: 'fixed', sizingV: 'fixed', clip: true }), { keywords: 'youtube превью' });
  def('s-banner', 'Соцсети и печать', 'Баннер 1200×628', 'Для рекламы и ссылок', () => H([V([T('Курс по дизайну интерфейсов', { fontSize: 56, fontStyle: 'Bold', fill: '$onAccent', ...FILL }), T('Старт 1 ноября · онлайн', { fontSize: 28, fill: '$onAccent' }), H([T('Записаться', { fontSize: 22, fontStyle: 'Semi Bold', fill: '$accent' })], { name: 'Кнопка', padding: [16, 32, 16, 32], cornerRadius: 14, fill: '#FFFFFF' })], { gap: 24, sizingH: 'fill' }), img(420, { w: 420, sizingH: 'fixed', cornerRadius: 999, fill: '#FFFFFF33' })], { name: 'Баннер', w: 1200, h: 628, padding: 72, gap: 40, fill: '$accent', sizingH: 'fixed', sizingV: 'fixed', clip: true }));
  def('p-card', 'Соцсети и печать', 'Визитка', '90×50 мм (1063×591 px)', () => H([V([T('Анна Смирнова', { fontSize: 56, fontStyle: 'Bold' }), T('Продуктовый дизайнер', { fontSize: 30, fill: '$muted' }), grow, T('+375 29 000-00-00', { fontSize: 28 }), T('anna@company.ru', { fontSize: 28 })], { gap: 12, sizingH: 'fill', sizingV: 'fill' }), R({ name: 'Знак', w: 120, h: 120, cornerRadius: 32, fill: '$accent' })], { name: 'Визитка', w: 1063, h: 591, padding: 80, fill: '$bg', crossAlign: 'min', sizingH: 'fixed', sizingV: 'fixed' }));
  def('slide-title', 'Соцсети и печать', 'Слайд: титульный', '1920×1080 для презентации', () => V([badge('ОКТЯБРЬ 2026'), T('Итоги квартала', { fontSize: 120, fontStyle: 'Bold' }), T('Команда продукта · Анна Смирнова', { fontSize: 40, fill: '$muted' })], { name: 'Слайд — титульный', w: 1920, h: 1080, padding: 160, gap: 32, fill: '$bg', mainAlign: 'center', sizingH: 'fixed', sizingV: 'fixed' }), { keywords: 'презентация' });
  def('slide-content', 'Соцсети и печать', 'Слайд: три пункта', '1920×1080, заголовок и три блока', () => V([T('Главное за квартал', { fontSize: 72, fontStyle: 'Bold' }), H([['+32%', 'рост выручки'], ['1 209', 'новых клиентов'], ['4,9', 'средняя оценка']].map(([a, b]) => V([T(a, { fontSize: 96, fontStyle: 'Bold', fill: '$accent' }), T(b, { fontSize: 36, fill: '$muted' })], { gap: 8, padding: 48, cornerRadius: 32, fill: '$surface', sizingH: 'fill' })), { gap: 40, ...FILL })], { name: 'Слайд — пункты', w: 1920, h: 1080, padding: 140, gap: 80, fill: '$bg', sizingH: 'fixed', sizingV: 'fixed' }), { keywords: 'презентация' });
  def('p-certificate', 'Соцсети и печать', 'Сертификат A4', 'Альбомный, 1123×794 px', () => V([T('СЕРТИФИКАТ', { fontSize: 28, fontStyle: 'Bold', fill: '$accent', letterSpacing: '20%' }), T('Анна Смирнова', { fontSize: 64, fontStyle: 'Bold' }), T('успешно прошла курс «Дизайн интерфейсов»', { fontSize: 24, fill: '$muted' }), grow, H([V([R({ name: 'Линия', w: 220, h: 1, fill: '$text' }), T('Подпись', { fontSize: 16, fill: '$muted' })], { gap: 8 }), hgrow, V([T('24.10.2026', { fontSize: 18 }), T('Дата', { fontSize: 16, fill: '$muted' })], { gap: 4 })], FILL)], { name: 'Сертификат', w: 1123, h: 794, padding: 96, gap: 20, fill: '$bg', crossAlign: 'center', sizingH: 'fixed', sizingV: 'fixed', stroke: '$accent', strokeWeight: 12 }));

  // ------------------------------------------------------------------ вставка
  async function lookup(api) {
    const d = await api.request('document.inspect', { depth: 1 });
    const page = (d.pages || []).find((p) => p.id === d.currentPage) || (d.pages || [])[0] || {};
    const kids = Array.isArray(page.children) ? page.children : [];
    let right = 0, top = null;
    for (const k of kids) {
      const b = k.absoluteBounds || { x: k.x || 0, y: k.y || 0, width: k.width || 0, height: k.height || 0 };
      right = Math.max(right, b.x + b.width);
      top = top == null ? b.y : Math.min(top, b.y);
    }
    return { d, kids, x: kids.length ? Math.round(right + 120) : 0, y: top == null ? 0 : Math.round(top) };
  }
  // Куда вставить: справа от всего, что уже есть на странице (или внутрь фрейма `into`, если его указали).
  async function place(api, spec, opts) {
    const o = Object.assign({}, opts);
    if (o.into != null) { o.parent = o.into; o.x = 0; o.y = 0; }
    if (o.x == null || o.y == null) {
      const at = await lookup(api);
      if (o.x == null) o.x = at.x;
      if (o.y == null) o.y = at.y;
    }
    const { commands, root } = compile(spec, o);
    if (o.parent != null) { delete commands[root].params.x; delete commands[root].params.y; }
    const label = o.label || 'Шаблон';
    const r = await api.execute('command.batch', { label, commands });
    const id = Array.isArray(r) && r[root] ? r[root].id : null;
    if (id != null) {
      await api.execute('select.set', { ids: [id] }).catch(() => {});
      if (o.zoom !== false) await api.execute('view.zoomSelection').catch(() => {});
    }
    return { id, layers: commands.length };
  }

  async function insert(api, id, opts) {
    const t = L.find((x) => x.id === id) || L.find((x) => x.name.toLowerCase() === String(id).toLowerCase());
    if (!t) throw new Error(`Нет шаблона «${id}». Есть: ${L.map((x) => x.id).join(', ')}`);
    return place(api, t.build(), Object.assign({ screen: t.screen, label: 'Шаблон: ' + t.name }, opts));
  }

  // Помощник: макет по описанию.
  async function build(api, spec, opts) {
    if (typeof spec === 'string') { try { spec = JSON.parse(spec); } catch { throw new Error('spec должен быть JSON-объектом'); } }
    if (Array.isArray(spec)) spec = { type: 'frame', name: 'Макет', layout: 'vertical', gap: 16, children: spec };
    return place(api, spec, Object.assign({ label: 'Макет от помощника' }, opts));
  }

  // ------------------------------------------------------------------ предпросмотр (HTML)
  // Тот же шаблон, нарисованный блоками HTML: автолейаут — это flexbox.
  function preview(spec, opts) {
    const p = palette(opts);
    const css = (v) => (typeof v === 'string' ? tokens(v, p) : v);
    const color = (v) => { v = css(v); return !v || v === 'none' ? 'transparent' : (/^#[0-9a-f]{8}$/i.test(v) ? '#' + v.slice(1) : v); };
    const align = (v) => ({ min: 'flex-start', center: 'center', max: 'flex-end', spaceBetween: 'space-between' }[v] || 'flex-start');
    function el(n, parentLayout) {
      n = tokens(n, p);
      const d = document.createElement('div');
      const s = d.style;
      const type = String(n.type || (n.children ? 'frame' : n.text != null ? 'text' : 'rectangle'));
      const fixedW = n.w != null && n.sizingH !== 'fill' && n.sizingH !== 'hug';
      const fixedH = n.h != null && n.sizingV !== 'fill' && n.sizingV !== 'hug';
      if (fixedW || (n.w != null && type !== 'frame')) s.width = n.w + 'px';
      if (fixedH || (n.h != null && type !== 'frame')) s.height = n.h + 'px';
      if (n.sizingH === 'fill') { if (parentLayout === 'horizontal') s.flex = '1 1 0'; else s.alignSelf = 'stretch'; s.minWidth = '0'; }
      if (n.sizingV === 'fill') { if (parentLayout === 'vertical') s.flex = '1 1 0'; else s.alignSelf = 'stretch'; }
      s.flexShrink = s.flexShrink || '0';
      s.boxSizing = 'border-box';
      if (n.cornerRadius != null) s.borderRadius = Math.min(n.cornerRadius, 9999) + 'px';
      if (n.stroke) s.boxShadow = `inset 0 0 0 ${n.strokeWeight || 1}px ${color(n.stroke)}`;
      if (n.shadow) s.filter = 'drop-shadow(0 6px 12px rgba(0,0,0,.12))';
      if (type === 'text') {
        d.textContent = n.text;
        s.whiteSpace = 'pre-wrap'; s.color = color(n.fill || p.text); s.fontSize = (n.fontSize || 16) + 'px';
        s.fontWeight = /Bold/.test(n.fontStyle || '') ? (/Semi/.test(n.fontStyle) ? 600 : 700) : /Medium/.test(n.fontStyle || '') ? 500 : 400;
        s.lineHeight = n.lineHeight && /%$/.test(n.lineHeight) ? parseFloat(n.lineHeight) / 100 : 1.25;
        s.textAlign = n.textAlign || 'left';
        if (n.textDecoration === 'strikethrough') s.textDecoration = 'line-through';
        return d;
      }
      if (type === 'icon') {
        d.innerHTML = `<svg viewBox="0 0 24 24" width="${n.size || 24}" height="${n.size || 24}" fill="none" stroke="${color(n.color || p.text)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[n.icon] || ICONS.star}"/></svg>`;
        s.width = s.height = (n.size || 24) + 'px'; s.display = 'flex';
        return d;
      }
      if (type === 'star') { s.background = color(n.fill); s.clipPath = 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)'; return d; }
      s.background = color(n.fill == null ? (type === 'frame' ? 'none' : p.placeholder) : n.fill);
      if (type === 'ellipse') s.borderRadius = '50%';
      if (n.children) {
        const layout = n.layout || 'vertical';
        s.display = 'flex'; s.flexDirection = layout === 'horizontal' ? 'row' : 'column';
        s.gap = (n.gap || 0) + 'px';
        const pad = Array.isArray(n.padding) ? n.padding : [n.padding || 0, n.padding || 0, n.padding || 0, n.padding || 0];
        s.padding = pad.map((x) => x + 'px').join(' ');
        s.justifyContent = align(n.mainAlign); s.alignItems = n.crossAlign ? align(n.crossAlign) : (layout === 'horizontal' ? 'center' : 'flex-start');
        if (n.clip) s.overflow = 'hidden';
        for (const c of n.children) d.appendChild(el(c, layout));
      }
      return d;
    }
    return el(spec, null);
  }

  window.AIFigmaTemplates = { list: L, ACCENTS, ICONS, compile, insert, build, preview, palette };
})();
