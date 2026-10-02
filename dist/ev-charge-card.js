/*!
 * EV Charge Card für Home Assistant
 * https://github.com/Kohle93/EV-Charge-Card
 *
 * E-Auto, Hybrid oder Verbrenner + Wallbox: Ladestand/Tank, Reichweite,
 * Fahrzeugbild, Start/Stopp und eine frei konfigurierbare Button-Leiste.
 * Mehrere Fahrzeuge in einer Karte – per Wischen oder Punkte umschalten.
 *
 * Design & Editor nutzen dasselbe System wie die Abfall-Karte (Trash Card Plus)
 * und die Status-Übersicht-Karte: Tab-Leiste, aufklappbare Gruppen, Live-
 * Vorschau, Hintergrund (Theme / Farbton / Akzent / eigene Farbe / transparent)
 * mit Deckkraft, Farbverlauf und Glas-Effekt, Symbol-Hintergrund mit Form,
 * Text- und Rahmenfarbe, Schatten, Eckenradius, Abstände und Hervorhebung.
 *
 * Ohne Build-Step, ohne externe Abhängigkeiten.
 *   Ressource: /local/ev-charge-card/ev-charge-card.js  (Typ: JavaScript-Modul)
 */

const CARD_VERSION = '1.1.0';
const CARD_TYPE = 'ev-charge-card';
const EDITOR_TYPE = 'ev-charge-card-editor';

/* ------------------------------------------------------------------ */
/*  Hilfen                                                            */
/* ------------------------------------------------------------------ */

const has = (v) => v !== undefined && v !== null && v !== '';
const isNum = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && !Array.isArray(v) && !isNaN(Number(v));
const px = (v) => (!has(v) ? '' : isNum(v) ? `${v}px` : String(v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const deepGet = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const styleString = (vars) => Object.entries(vars).filter(([, v]) => has(v)).map(([k, v]) => `${k}:${v}`).join(';');
const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));

function fireEvent(node, type, detail = {}) {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: false });
  ev.detail = detail;
  node.dispatchEvent(ev);
  return ev;
}

/* ------------------------------------------------------------------ */
/*  Farben – identisch zu Trash Card Plus / Status-Übersicht           */
/* ------------------------------------------------------------------ */

const HA_COLORS = {
  red: [244, 67, 54], pink: [233, 30, 99], purple: [146, 107, 199], 'deep-purple': [110, 65, 171],
  indigo: [63, 81, 181], blue: [33, 150, 243], 'light-blue': [3, 169, 244], cyan: [0, 188, 212],
  teal: [0, 150, 136], green: [76, 175, 80], 'light-green': [139, 195, 74], lime: [205, 220, 57],
  yellow: [255, 235, 59], amber: [255, 193, 7], orange: [255, 152, 0], 'deep-orange': [255, 111, 34],
  brown: [121, 85, 72], 'light-grey': [189, 189, 189], grey: [158, 158, 158], 'dark-grey': [96, 96, 96],
  'blue-grey': [96, 125, 139], black: [0, 0, 0], white: [255, 255, 255],
};

const THEME_BG = 'var(--ha-card-background, var(--card-background-color, #fff))';

// Zerlegt Farbangaben in { rgb, alpha (0–100) } – für Kontrast & Migration.
const parseColor = (value) => {
  if (Array.isArray(value) && value.length >= 3) return { rgb: value.slice(0, 3).map((v) => Math.round(Number(v) || 0)), alpha: 100 };
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) {
    let h = v.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null;
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return { rgb, alpha: h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 2.55) : 100 };
  }
  const m = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    let alpha = 100;
    if (m[4]) alpha = m[4].endsWith('%') ? parseFloat(m[4]) : Math.round(parseFloat(m[4]) * 100);
    return { rgb: [m[1], m[2], m[3]].map((x) => Math.round(Number(x))), alpha };
  }
  if (HA_COLORS[v]) return { rgb: HA_COLORS[v], alpha: 100 };
  return null;
};

// Liefert { css, rgb } für Farbwerte aus dem Farbpicker ([r,g,b]), Hex-Codes,
// HA-Farbnamen ("red", "deep-purple", "primary") oder beliebigen CSS-Farben.
const colorInfo = (value) => {
  if (Array.isArray(value) && value.length >= 3) {
    const rgb = value.slice(0, 3).map((v) => Number(v) || 0);
    return { css: `rgb(${rgb.join(',')})`, rgb };
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (v === 'primary' || v === 'accent') return { css: `var(--${v}-color)`, rgb: null };
  if (v === 'disabled') return { css: 'var(--disabled-text-color, #9e9e9e)', rgb: [158, 158, 158] };
  if (HA_COLORS[v]) return { css: `rgb(var(--rgb-${v}, ${HA_COLORS[v].join(',')}))`, rgb: HA_COLORS[v] };
  const p = parseColor(v);
  if (p) return { css: p.alpha < 100 ? v : `rgb(${p.rgb.join(',')})`, rgb: p.rgb };
  return { css: v, rgb: null };
};

const withAlpha = (css, pct) => {
  const p = Math.max(0, Math.min(100, Number(pct)));
  if (p >= 100) return css;
  if (p <= 0) return 'transparent';
  return `color-mix(in srgb, ${css} ${p}%, transparent)`;
};

const luminance = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastText = (rgb) => (rgb && luminance(rgb) > 0.45 ? '#1c1c1c' : '#ffffff');

/* ------------------------------------------------------------------ */
/*  Konfiguration – Standardwerte                                     */
/* ------------------------------------------------------------------ */

const DEFAULTS = {
  // Anzeige
  image_position: 'right',
  title_position: 'top',
  left_width: 45,
  right_columns: 1,
  stack_below: 260,
  min_height: 0,
  scale: 1,

  // Karte (Hintergrund, Rahmen, Abstände)
  card_bg_mode: 'theme',
  card_bg_opacity: 100,
  card_bg_gradient: false,
  card_blur: 0,
  card_border_mode: 'theme',
  card_border_width: 1,
  card_radius: 12,
  card_shadow: 'theme',
  background_size: 'cover',
  background_position: 'center',
  overlay_opacity: 40,
  padding: 16,
  gap: 12,

  // Werte-Kacheln (Standard für alle Werte, pro Wert überschreibbar)
  bg_mode: 'tinted',
  bg_opacity: 10,
  bg_gradient: false,
  blur: 0,
  icon_size: 20,
  icon_color_mode: 'auto',
  icon_bg_mode: 'accent',
  icon_bg_opacity: 18,
  icon_shape: 'circle',
  text_color_mode: 'auto',
  title_size: 20,
  label_size: 12,
  value_size: 18,
  border_mode: 'none',
  border_width: 1,
  radius: 12,
  shadow: 'none',
  tile_padding: 8,

  // Hervorhebung der ganzen Karte beim Laden bzw. wenn der Tank fast leer ist
  highlight: 'none',

  // Mehrere Fahrzeuge (Karussell)
  show_dots: true,
  swipe: true,
  remember_vehicle: true,
};

// Diese Schlüssel können pro Wert (fields[]) überschrieben werden
const ITEM_STYLE_KEYS = [
  'bg_mode', 'bg_color', 'bg_opacity', 'bg_gradient', 'icon_color_mode', 'icon_color',
  'icon_bg_mode', 'icon_bg_color', 'icon_bg_opacity', 'icon_shape', 'text_color_mode', 'text_color',
  'border_mode', 'border_color', 'border_width', 'shadow',
];

const IMAGE_DEFAULTS = { size: 100, max_height: 180, offset_x: 0, offset_y: 0, flip: false, shadow: true, hide: false };
const CC_DEFAULTS = { show_names: true, confirm: false, size: 36 };
const BAR_DEFAULTS = { style: 'segmented', height: 44, show_names: true, show_icons: true, hide: false };
const FUEL_DEFAULTS = { threshold: 15, color: [255, 152, 0] };

// Diese Schlüssel gehören zu einem Fahrzeug (vehicles[]), alles andere gilt für die ganze Karte
const VEHICLE_KEYS = [
  'vehicle_type', 'title', 'title_icon', 'subtitle', 'subtitle_entity', 'title_tap_action', 'title_hold_action',
  'image', 'charge_control', 'fuel', 'fields', 'button_bar', 'buttons',
];
const VEHICLE_TYPES = ['ev', 'hybrid', 'combustion'];
const TYPE_ICONS = { ev: 'mdi:car-electric', hybrid: 'mdi:car-electric-outline', combustion: 'mdi:car' };

const vehicleType = (v) => (VEHICLE_TYPES.includes(v?.vehicle_type) ? v.vehicle_type : 'ev');
const vehiclesOf = (cfg) => (Array.isArray(cfg?.vehicles) && cfg.vehicles.length ? cfg.vehicles : [{}]);
// Wirksame Konfiguration eines Fahrzeugs: Karten-Einstellungen + Fahrzeug (Fahrzeug gewinnt, z. B. eigene accent_color)
const vehCfg = (cfg, i = 0) => {
  const v = vehiclesOf(cfg)[i] || {};
  return { ...cfg, ...v, fields: Array.isArray(v.fields) ? v.fields : [], buttons: Array.isArray(v.buttons) ? v.buttons : [] };
};

const SHADOWS = {
  none: 'none',
  theme: 'var(--ha-card-box-shadow, none)',
  soft: '0 2px 8px rgba(0,0,0,.12)',
  strong: '0 6px 20px rgba(0,0,0,.28)',
};
const SHAPES = { circle: '50%', rounded: '30%', square: '6px', none: '0' };

// Übernimmt die bisherigen Blöcke `layout:` und `style:` (v0.x) in das neue,
// flache Design-System. Bestehende YAML funktioniert weiter und wird beim
// nächsten Speichern im Editor automatisch bereinigt.
// Deckende Farben als [r,g,b] (Farbpicker), alles andere unverändert
const opaqueRgb = (v) => { const p = parseColor(v); return p && p.alpha >= 100 ? p.rgb : v; };

const migrateConfig = (config) => {
  const cfg = { ...config };
  const setIf = (k, v) => { if (has(v) && cfg[k] === undefined) cfg[k] = v; };

  const l = cfg.layout && typeof cfg.layout === 'object' ? cfg.layout : null;
  if (l) {
    ['image_position', 'title_position', 'left_width', 'right_columns', 'stack_below', 'min_height', 'gap'].forEach((k) => setIf(k, l[k]));
    if (l.field_style === 'plain') { setIf('bg_mode', 'none'); setIf('tile_padding', 2); }
  }
  if (cfg.layout !== undefined && typeof cfg.layout !== 'string') delete cfg.layout;

  const s = cfg.style && typeof cfg.style === 'object' ? cfg.style : null;
  if (s) {
    if (has(s.background)) {
      const c = parseColor(s.background);
      if (c) { setIf('card_bg_mode', 'custom'); setIf('card_bg_color', c.rgb); setIf('card_bg_opacity', c.alpha); }
      else setIf('card_background', s.background); // z. B. linear-gradient(…) – bleibt als YAML-Option erhalten
    }
    setIf('background_image', s.background_image);
    setIf('background_size', s.background_size);
    setIf('background_position', s.background_position);
    if (has(s.overlay)) {
      const c = parseColor(s.overlay);
      if (c) { setIf('overlay_color', c.rgb); setIf('overlay_opacity', c.alpha); }
    }
    setIf('card_blur', s.blur);
    setIf('card_radius', s.border_radius);
    if (has(s.border)) {
      const m = String(s.border).match(/^\s*([\d.]+)px\s+\w+\s+(.+)$/);
      const c = m ? parseColor(m[2]) : null;
      if (c) { setIf('card_border_mode', 'custom'); setIf('card_border_width', Number(m[1])); setIf('card_border_color', c.alpha < 100 ? m[2].trim() : c.rgb); }
      else if (String(s.border).trim() === 'none') setIf('card_border_mode', 'none');
      else setIf('card_border', s.border);
    }
    setIf('card_shadow', s.shadow);
    setIf('padding', s.padding);
    setIf('card_height', s.height);
    if (has(s.text_color)) { setIf('text_color_mode', 'custom'); setIf('text_color', opaqueRgb(s.text_color)); }
    if (has(s.accent_color)) setIf('accent_color', opaqueRgb(s.accent_color));
    if (has(s.tile_background)) {
      const c = parseColor(s.tile_background);
      if (c) { setIf('bg_mode', 'custom'); setIf('bg_color', c.rgb); setIf('bg_opacity', c.alpha); }
      else setIf('tile_background', s.tile_background);
    }
    setIf('radius', s.tile_radius);
    setIf('title_size', s.title_size);
    setIf('value_size', s.value_size);
  }
  delete cfg.style;

  // Ein Fahrzeug (bis v1.0) -> Liste `vehicles:` (ab v1.1 beliebig viele Fahrzeuge)
  if (!Array.isArray(cfg.vehicles) || !cfg.vehicles.length) {
    const v = {};
    VEHICLE_KEYS.forEach((k) => { if (cfg[k] !== undefined) { v[k] = cfg[k]; delete cfg[k]; } });
    cfg.vehicles = [v];
  } else {
    cfg.vehicles = cfg.vehicles.map((v) => (v && typeof v === 'object' ? v : {}));
  }
  return cfg;
};

/* ------------------------------------------------------------------ */
/*  Stil-Berechnung (gemeinsames Design-System)                       */
/* ------------------------------------------------------------------ */

const pick = (item, cfg, key) => {
  const v = item?.[key];
  if (v !== undefined && v !== null && v !== '' && v !== 'inherit') {
    if (v === 'on') return true;
    if (v === 'off') return false;
    return v;
  }
  return has(cfg[key]) ? cfg[key] : DEFAULTS[key];
};

// Hintergrund nach Modus: theme | tinted | accent | custom | none
const bgValue = ({ mode, opacity, gradient, color }, accent, base) => {
  const op = Number(opacity);
  if (mode === 'none') return { bg: 'transparent', strong: null };
  if (mode === 'theme') return { bg: withAlpha(THEME_BG, op), strong: null };
  if (mode === 'tinted') {
    const tint = gradient
      ? `linear-gradient(135deg, ${withAlpha(accent.css, op)} 0%, ${withAlpha(accent.css, Math.round(op * 0.15))} 100%)`
      : `linear-gradient(${withAlpha(accent.css, op)}, ${withAlpha(accent.css, op)})`;
    return { bg: base ? `${tint}, ${base}` : tint, strong: null };
  }
  const info = mode === 'custom' ? (colorInfo(color) || colorInfo([255, 255, 255])) : accent;
  const bg = gradient
    ? `linear-gradient(135deg, ${withAlpha(info.css, op)} 0%, ${withAlpha(`color-mix(in srgb, ${info.css} 62%, black)`, op)} 100%)`
    : withAlpha(info.css, op);
  return { bg, strong: op >= 55 ? (info.rgb || [0, 0, 0]) : null };
};

const accentOf = (cfg) => colorInfo(cfg.accent_color) || colorInfo('primary');

/** color_thresholds: [{from: 0, color: …}, {from: 20, color: …}, …] */
const thresholdColor = (f, num) => {
  if (num === null || num === undefined || !Array.isArray(f.color_thresholds)) return null;
  let col = null;
  [...f.color_thresholds]
    .filter((t) => t && isNum(t.from) && has(t.color))
    .sort((a, b) => a.from - b.from)
    .forEach((t) => { if (num >= Number(t.from)) col = t.color; });
  return col;
};

// CSS-Variablen einer Werte-Kachel (analog itemVars() der Abfall-Karte)
const tileVars = (f, cfg, num = null) => {
  const s = {};
  ITEM_STYLE_KEYS.forEach((k) => { s[k] = pick(f, cfg, k); });
  const accent = colorInfo(thresholdColor(f, num)) || colorInfo(f.color) || accentOf(cfg);
  const vars = {};

  let r;
  if (has(cfg.tile_background) && !has(f.bg_mode) && !has(cfg.bg_mode)) r = { bg: cfg.tile_background, strong: null };
  else r = bgValue({ mode: s.bg_mode, opacity: s.bg_opacity, gradient: s.bg_gradient, color: s.bg_color }, accent, null);
  vars['--t-bg'] = r.bg;

  // Text: automatisch guter Kontrast auf kräftigem Hintergrund, sonst Kartentext
  let text = null;
  if (s.text_color_mode === 'custom' && colorInfo(s.text_color)) text = colorInfo(s.text_color).css;
  else if (s.text_color_mode === 'auto' && r.strong) text = contrastText(r.strong);
  else if (s.text_color_mode === 'theme') text = 'var(--primary-text-color)';
  vars['--t-text'] = text || 'var(--evc-text)';
  vars['--t-text2'] = text ? `color-mix(in srgb, ${text} 70%, transparent)` : 'var(--evc-text2)';

  // Symbol-Hintergrund
  let iconBg = 'transparent';
  let iconBgStrong = null;
  if (s.icon_bg_mode === 'accent' || s.icon_bg_mode === 'custom') {
    const ib = s.icon_bg_mode === 'custom' ? (colorInfo(s.icon_bg_color) || accent) : accent;
    iconBg = withAlpha(ib.css, s.icon_bg_opacity);
    if (Number(s.icon_bg_opacity) >= 55) iconBgStrong = ib.rgb || [0, 0, 0];
  } else if (s.icon_bg_mode === 'theme') {
    iconBg = withAlpha(THEME_BG, s.icon_bg_opacity);
  }
  vars['--t-ibg'] = iconBg;
  vars['--t-ishape'] = SHAPES[s.icon_shape] || '50%';

  // Symbolfarbe
  let icon = accent.css;
  if (s.icon_color_mode === 'custom' && colorInfo(s.icon_color)) icon = colorInfo(s.icon_color).css;
  else if (s.icon_color_mode === 'text') icon = text || 'var(--evc-text)';
  else if (s.icon_color_mode === 'auto') {
    if (iconBgStrong) icon = contrastText(iconBgStrong);
    else if (r.strong && s.bg_mode === 'accent') icon = text || contrastText(r.strong);
  }
  vars['--t-icolor'] = icon;

  // Rahmen & Schatten
  const bw = Number(s.border_width) || 0;
  let border = 'none';
  if (s.border_mode === 'accent') border = `${bw}px solid ${accent.css}`;
  else if (s.border_mode === 'custom') border = `${bw}px solid ${(colorInfo(s.border_color) || accent).css}`;
  else if (s.border_mode === 'theme') border = `${bw}px solid var(--divider-color, rgba(127,127,127,.3))`;
  vars['--t-border'] = border;
  vars['--t-shadow'] = SHADOWS[s.shadow] ?? s.shadow ?? 'none';
  vars['--t-accent'] = accent.css;
  return vars;
};

// Alle Eigenschaften der Karte selbst (ha-card) – auch für die Editor-Vorschau
const cardDesign = (cfg) => {
  const v = (k) => (has(cfg[k]) ? cfg[k] : DEFAULTS[k]);
  const accent = accentOf(cfg);
  const p = {};

  // Hintergrund: Overlay -> Bild -> Farbe
  const layers = [];
  const ov = colorInfo(cfg.overlay_color);
  if (ov && has(cfg.background_image)) {
    const c = withAlpha(ov.css, v('overlay_opacity'));
    layers.push(`linear-gradient(${c}, ${c})`);
  }
  if (has(cfg.background_image)) {
    layers.push(`url("${String(cfg.background_image).replace(/"/g, '%22')}") ${v('background_position')} / ${v('background_size')} no-repeat`);
  }
  let strong = null;
  if (has(cfg.card_background)) {
    // Eigener CSS-Hintergrund (YAML): Kontrast an der ersten Farbe darin ausrichten
    layers.push(cfg.card_background);
    const first = parseColor(String(cfg.card_background).match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i)?.[0]);
    if (first && first.alpha >= 55) strong = first.rgb;
  } else {
    const r = bgValue({ mode: v('card_bg_mode'), opacity: v('card_bg_opacity'), gradient: v('card_bg_gradient'), color: cfg.card_bg_color }, accent, THEME_BG);
    layers.push(r.bg);
    strong = r.strong;
  }
  p['--evc-card-bg'] = layers.join(', ');
  p['--evc-card-bf'] = Number(v('card_blur')) > 0 ? `blur(${v('card_blur')}px)` : 'none';

  // Text der Karte
  const tm = v('text_color_mode');
  let text = 'var(--primary-text-color)';
  let text2 = 'var(--secondary-text-color)';
  if (tm === 'custom' && colorInfo(cfg.text_color)) text = colorInfo(cfg.text_color).css;
  else if (tm === 'auto' && strong) text = contrastText(strong);
  if (text !== 'var(--primary-text-color)') text2 = `color-mix(in srgb, ${text} 70%, transparent)`;
  p['--evc-text'] = text;
  p['--evc-text2'] = text2;
  p['--evc-accent'] = accent.css;

  // Rahmen, Schatten, Form – nur setzen, wenn nicht "wie Theme"
  const bm = v('card_border_mode');
  if (has(cfg.card_border)) p.border = cfg.card_border;
  else if (bm === 'none') p.border = 'none';
  else if (bm === 'accent' || bm === 'custom') {
    const bc = bm === 'custom' ? (colorInfo(cfg.card_border_color) || accent) : accent;
    p.border = `${Number(v('card_border_width')) || 1}px solid ${bc.css}`;
  }
  const sh = v('card_shadow');
  if (sh !== 'theme') { p['box-shadow'] = SHADOWS[sh] ?? sh; p['--evc-card-shadow'] = SHADOWS[sh] ?? sh; }
  if (has(cfg.card_radius)) p['border-radius'] = px(cfg.card_radius);
  if (has(cfg.card_height)) p.height = px(cfg.card_height);

  // Größen & Abstände
  p['--evc-scale'] = v('scale');
  p['--evc-pad'] = px(v('padding'));
  p['--evc-gap'] = px(v('gap'));
  p['--evc-left-width'] = `${v('left_width')}%`;
  p['--evc-min-h'] = Number(v('min_height')) > 0 ? px(v('min_height')) : '';
  p['--evc-isize'] = px(v('icon_size'));
  p['--evc-title-size'] = px(v('title_size'));
  p['--evc-label-size'] = px(v('label_size'));
  p['--evc-value-size'] = px(v('value_size'));
  p['--evc-radius'] = px(v('radius'));
  p['--evc-tile-pad'] = px(v('tile_padding'));
  p['--evc-bf'] = Number(v('blur')) > 0 ? `blur(${v('blur')}px)` : 'none';

  // Standard-Kachel (Titel-Symbol, Button-Leiste)
  Object.assign(p, tileVars({}, cfg, null));

  // Fahrzeugbild
  const im = cfg.image || {};
  p['--evc-img-size'] = has(im.size) ? `${im.size}%` : '';
  p['--evc-img-max-h'] = px(im.max_height);
  p['--evc-img-x'] = px(im.offset_x);
  p['--evc-img-y'] = px(im.offset_y);
  p['--evc-img-flip'] = im.flip ? -1 : '';
  p['--evc-img-filter'] = im.shadow === false ? 'none' : '';
  p['--evc-glow'] = colorInfo(im.glow_color)?.css || '';

  // Start / Stopp
  const cc = cfg.charge_control || {};
  p['--evc-cc-size'] = px(cc.size);
  p['--evc-cc-start'] = colorInfo(cc.start_color)?.css || '';
  p['--evc-cc-stop'] = colorInfo(cc.stop_color)?.css || '';

  // Button-Leiste
  const b = cfg.button_bar || {};
  const act = colorInfo(b.active_color) || accent;
  p['--evc-btn-h'] = px(b.height);
  p['--evc-bar-bg'] = colorInfo(b.background)?.css || '';
  p['--evc-btn-active'] = act.css;
  p['--evc-btn-active-text'] = colorInfo(b.active_text_color)?.css || (act.rgb ? contrastText(act.rgb) : 'var(--text-primary-color, #fff)');
  return p;
};

/* ------------------------------------------------------------------ */
/*  Werte / Formatierung                                              */
/* ------------------------------------------------------------------ */

const DEVICE_CLASS_ICONS = {
  battery: 'mdi:battery', distance: 'mdi:map-marker-distance', power: 'mdi:flash', energy: 'mdi:lightning-bolt',
  current: 'mdi:current-ac', voltage: 'mdi:sine-wave', temperature: 'mdi:thermometer', duration: 'mdi:timer-outline',
  timestamp: 'mdi:clock-outline', plug: 'mdi:power-plug', battery_charging: 'mdi:battery-charging',
};
const DOMAIN_ICONS = {
  select: 'mdi:format-list-bulleted', input_select: 'mdi:format-list-bulleted', switch: 'mdi:toggle-switch-outline',
  input_boolean: 'mdi:toggle-switch-outline', binary_sensor: 'mdi:checkbox-blank-circle-outline', device_tracker: 'mdi:map-marker',
  number: 'mdi:ray-vertex', input_number: 'mdi:ray-vertex', button: 'mdi:gesture-tap-button', lock: 'mdi:lock', sensor: 'mdi:eye',
};

const batteryIcon = (level) => {
  const n = Math.max(0, Math.min(100, Math.round(level / 10) * 10));
  return n >= 100 ? 'mdi:battery' : n <= 0 ? 'mdi:battery-outline' : `mdi:battery-${n}`;
};

const localeOf = (hass) => hass?.locale?.language || hass?.language || 'de';

const formatState = (hass, st, attr) => {
  try {
    if (attr) return hass.formatEntityAttributeValue?.(st, attr) ?? String(st.attributes[attr]);
    return hass.formatEntityState?.(st) ?? st.state;
  } catch (e) {
    return attr ? String(st.attributes[attr]) : st.state;
  }
};

const fieldValue = (f, st, hass) => {
  if (!st) return { text: '—', unit: '', num: null, unavailable: true };
  const raw = f.attribute ? st.attributes?.[f.attribute] : st.state;
  const unavailable = !f.attribute && (raw === 'unavailable' || raw === 'unknown');
  const map = f.state_map && typeof f.state_map === 'object' ? f.state_map : null;

  if (map && raw !== undefined && raw !== null && map[raw] !== undefined) {
    return { text: String(map[raw]), unit: '', num: isNum(raw) ? Number(raw) : null, unavailable };
  }
  if (unavailable) return { text: formatState(hass, st), unit: '', num: null, unavailable: true };

  if (isNum(raw)) {
    const n = Number(raw) * (isNum(f.multiply) ? Number(f.multiply) : 1);
    const dec = has(f.decimals) ? Number(f.decimals) : f.attribute ? undefined : hass?.entities?.[f.entity]?.display_precision;
    const opts = has(dec) ? { minimumFractionDigits: dec, maximumFractionDigits: dec } : { maximumFractionDigits: 2 };
    const text = new Intl.NumberFormat(localeOf(hass), opts).format(n);
    const unit = f.unit ?? (f.attribute ? '' : st.attributes?.unit_of_measurement || '');
    return { text, unit, num: n, unavailable: false };
  }
  return { text: raw === undefined ? '—' : formatState(hass, st, f.attribute), unit: f.unit || '', num: null, unavailable: false };
};

const fieldIcon = (f, st, num) => {
  if (f.icon) return f.icon;
  if (!st) return 'mdi:help-circle-outline';
  if (st.attributes?.icon) return st.attributes.icon;
  const dcl = st.attributes?.device_class;
  if (dcl === 'battery' && num !== null) return batteryIcon(num);
  return DEVICE_CLASS_ICONS[dcl] || DOMAIN_ICONS[String(f.entity).split('.')[0]] || 'mdi:information-outline';
};

const stateIs = (hass, entity, states, def) => {
  if (!entity) return false;
  const s = hass?.states?.[entity]?.state;
  const want = has(states) ? String(states).split(',').map((x) => x.trim()) : def;
  return want.includes(s);
};

const fuelLevel = (cfg, hass) => {
  const fu = cfg.fuel || {};
  if (!fu.entity) return null;
  const st = hass?.states?.[fu.entity];
  const raw = fu.attribute ? st?.attributes?.[fu.attribute] : st?.state;
  return isNum(raw) ? Number(raw) : null;
};

// Laden (Elektro/Hybrid) und Tank-Warnung (Hybrid/Benzin/Diesel) eines Fahrzeugs
const glowInfo = (cfg, hass) => {
  const type = vehicleType(cfg);
  const cc = cfg.charge_control || {};
  const im = cfg.image || {};
  let charging = false;
  if (type !== 'combustion') {
    if (cc.charging_entity) charging = stateIs(hass, cc.charging_entity, cc.charging_state, ['on', 'charging', 'Charging']);
    else if (im.glow_entity) charging = stateIs(hass, im.glow_entity, im.glow_state, ['on', 'charging', 'Charging']);
  }
  let fuelLow = false;
  if (type !== 'ev') {
    const lvl = fuelLevel(cfg, hass);
    fuelLow = lvl !== null && lvl <= Number(cfg.fuel?.threshold ?? FUEL_DEFAULTS.threshold);
  }
  const fuelColor = (colorInfo(cfg.fuel?.color) || colorInfo(FUEL_DEFAULTS.color)).css;
  return { charging, fuelLow, active: charging || fuelLow, color: !charging && fuelLow ? fuelColor : null, fuelColor };
};
const isCharging = (cfg, hass) => glowInfo(cfg, hass).active;

/* ------------------------------------------------------------------ */
/*  HTML-Bausteine                                                    */
/* ------------------------------------------------------------------ */

const renderHeader = (cfg, hass) => {
  let subtitle = cfg.subtitle || '';
  if (cfg.subtitle_entity) {
    const st = hass?.states?.[cfg.subtitle_entity];
    if (st) subtitle = formatState(hass, st);
  }
  if (!cfg.title && !cfg.title_icon && !subtitle) return '';
  const clickable = cfg.title_tap_action && cfg.title_tap_action.action !== 'none';
  return `
    <div class="header ${clickable ? 'clickable' : ''}" data-act="title">
      ${cfg.title_icon ? `<div class="ico"><ha-icon icon="${esc(cfg.title_icon)}"></ha-icon></div>` : ''}
      <div class="htext">
        ${cfg.title ? `<div class="title">${esc(cfg.title)}</div>` : ''}
        ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      </div>
    </div>`;
};

// Start/Stopp-Buttons unter dem Auto – nur sichtbar, wenn eingesteckt
const renderChargeControl = (cfg, hass) => {
  if (vehicleType(cfg) === 'combustion') return '';
  const cc = cfg.charge_control;
  if (!cc || (!cc.start_entity && !cc.stop_entity && !cc.start_action && !cc.stop_action)) return '';
  const im = cfg.image || {};
  const showEntity = cc.show_entity || im.glow_entity;
  const showStates = has(cc.show_entity) ? cc.show_state : cc.show_state ?? im.glow_state;
  if (showEntity && !stateIs(hass, showEntity, showStates, ['on', 'charging'])) return '';

  const charging = cc.charging_entity ? stateIs(hass, cc.charging_entity, cc.charging_state, ['on', 'charging', 'Charging']) : null;
  const showNames = cc.show_names !== false;
  const btn = (kind) => {
    const ent = cc[`${kind}_entity`];
    if (!ent && !cc[`${kind}_action`]) return '';
    const st = ent ? hass?.states?.[ent] : null;
    const disabled = ent && (!st || st.state === 'unavailable');
    const name = cc[`${kind}_name`] ?? (kind === 'start' ? 'Start' : 'Stopp');
    const icon = cc[`${kind}_icon`] || (kind === 'start' ? 'mdi:play' : 'mdi:stop');
    const active = charging === null ? false : kind === 'start' ? charging : !charging;
    return `
      <button class="cc-btn ${kind} ${active ? 'active' : ''} ${showNames && name ? '' : 'icon-only'}"
        data-act="cc:${kind}" title="${esc(name)}" ${disabled ? 'disabled' : ''}>
        <ha-icon icon="${esc(icon)}"></ha-icon>${showNames && name ? `<span>${esc(name)}</span>` : ''}
      </button>`;
  };
  return `<div class="cc">${btn('start')}${btn('stop')}</div>`;
};

const renderImage = (cfg, hass) => {
  const im = cfg.image || {};
  let url = im.url;
  if (im.entity) url = hass?.states?.[im.entity]?.attributes?.entity_picture || url;
  if (im.state_images && im.glow_entity) {
    const s = hass?.states?.[im.glow_entity]?.state;
    if (s && im.state_images[s]) url = im.state_images[s];
  }
  const type = vehicleType(cfg);
  const g = glowInfo(cfg, hass);
  // Lade-Glow (Akzentfarbe) hat Vorrang vor der Tank-Warnung (Warnfarbe)
  const charging = type !== 'combustion' && stateIs(hass, im.glow_entity, im.glow_state, ['on', 'charging']);
  const hasGlow = (type !== 'combustion' && im.glow_entity) || (type !== 'ev' && cfg.fuel?.entity);
  const glowCls = charging ? 'on' : g.fuelLow ? 'on fuel' : '';
  const glowStyle = !charging && g.fuelLow ? ` style="--evc-glow:${esc(g.fuelColor)}"` : '';
  const clickable = im.tap_action && im.tap_action.action !== 'none';
  return `
    <div class="image-wrap ${clickable ? 'clickable' : ''}" data-act="image">
      <div class="car">
        ${hasGlow ? `<div class="glow ${glowCls}"${glowStyle}></div>` : ''}
        ${url ? `<img src="${esc(url)}" alt="" draggable="false">` : `<ha-icon class="placeholder" icon="${TYPE_ICONS[type]}"></ha-icon>`}
      </div>
      ${renderChargeControl(cfg, hass)}
    </div>`;
};

// Eine Werte-Kachel. `override` = { text, unit, num } für Beispiele im Editor.
const renderField = (f, i, cfg, hass, override = null) => {
  const st = hass?.states?.[f.entity];
  const v = override || fieldValue(f, st, hass);
  const vars = tileVars(f, cfg, v.num);
  const showIcon = f.show_icon !== false;
  const showName = f.show_name !== false;
  const name = f.name ?? (f.attribute ? f.attribute : st?.attributes?.friendly_name) ?? f.entity ?? '';
  const icon = fieldIcon(f, st, v.num);

  let bar = '';
  if (f.show_bar && v.num !== null && v.num !== undefined) {
    const min = Number(f.bar_min ?? 0);
    const max = Number(f.bar_max ?? 100);
    const pct = Math.max(0, Math.min(100, ((v.num - min) / (max - min || 1)) * 100));
    bar = `<div class="pbar"><div class="pbar-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
  }
  return `
    <div class="field size-${esc(f.size || 'normal')} ${v.unavailable ? 'unavail' : ''}" data-act="field:${i}" style="${esc(styleString(vars))}">
      ${showIcon ? `<div class="ico"><ha-icon icon="${esc(icon)}"></ha-icon></div>` : ''}
      <div class="ftext">
        ${showName ? `<div class="fname">${esc(name)}</div>` : ''}
        <div class="fvalue">${esc(v.text)}${v.unit ? `<span class="unit">${esc(v.unit)}</span>` : ''}</div>
        ${bar}
      </div>
    </div>`;
};

// Button-Leiste. opts.buttons / opts.activeFn für Beispiele, opts.selected markiert einen Button (Editor)
const renderBar = (cfg, hass, opts = {}) => {
  const bb = cfg.button_bar || {};
  const buttons = opts.buttons || cfg.buttons || [];
  if (!buttons.length || (bb.hide && !opts.force)) return '';
  const showNames = bb.show_names !== false;
  const showIcons = bb.show_icons !== false;
  const btns = buttons.map((b, i) => {
    if (!b) return '';
    const type = b.type || 'option';
    const ent = type === 'option' ? b.entity || bb.entity : b.entity;
    const st = ent ? hass?.states?.[ent] : undefined;
    let active = false;
    let disabled = false;
    if (opts.activeFn) active = opts.activeFn(b, i);
    else if (type === 'option') {
      active = st?.state === String(b.option);
      disabled = !st || st.state === 'unavailable';
    } else if (st) {
      active = st.state === (has(b.active_state) ? String(b.active_state) : 'on');
    }
    if (opts.selected !== undefined) disabled = false;
    const label = b.name ?? (type === 'option' ? b.option : '') ?? '';
    const icon = b.icon;
    const iconOnly = !(showNames && label) && icon;
    const col = colorInfo(b.color);
    const style = [
      b.width ? `flex:${b.width} 1 0` : '',
      col ? `--b-active:${col.css}` : '',
      col ? `--b-active-text:${col.rgb ? contrastText(col.rgb) : '#fff'}` : '',
    ].filter(Boolean).join(';');
    return `
      <button class="btn ${active ? 'active' : ''} ${iconOnly ? 'icon-only' : ''} ${opts.selected === i ? 'pv-sel' : ''}" data-act="btn:${i}"
        ${disabled ? 'disabled' : ''} ${style ? `style="${esc(style)}"` : ''} title="${esc(label || b.option || '')}">
        ${showIcons && icon ? `<ha-icon icon="${esc(icon)}"></ha-icon>` : ''}
        ${showNames && label ? `<span>${esc(label)}</span>` : ''}
      </button>`;
  }).join('');
  return `<div class="bar-row ${bb.style === 'separate' ? 'separate' : 'segmented'} ${showNames ? 'names' : ''}">${btns}</div>`;
};

const renderBody = (cfg, hass) => {
  const left = [];
  const right = [];
  (cfg.fields || []).forEach((f, i) => {
    if (!f) return;
    (f.slot === 'right' ? right : left).push(renderField(f, i, cfg, hass));
  });
  const cols = Math.max(1, Number(cfg.right_columns) || 1);
  const titleInColumn = cfg.title_position === 'column';
  return `
    ${titleInColumn ? '' : renderHeader(cfg, hass)}
    <div class="main ${cfg.image_position === 'left' ? 'img-left' : ''}">
      <div class="col-left">
        ${titleInColumn ? renderHeader(cfg, hass) : ''}
        ${left.length ? `<div class="fields fields-left">${left.join('')}</div>` : ''}
      </div>
      <div class="col-right">
        ${cfg.image?.hide ? '' : renderImage(cfg, hass)}
        ${right.length ? `<div class="fields-right" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${right.join('')}</div>` : ''}
      </div>
    </div>
    ${renderBar(cfg, hass)}`;
};

/* ------------------------------------------------------------------ */
/*  CSS der Karte                                                      */
/* ------------------------------------------------------------------ */

const CARD_CSS = `
  :host { display:block; height:100%; }
  .evc { position:relative; isolation:isolate; box-sizing:border-box; height:100%; overflow:hidden;
    background:transparent; color: var(--evc-text, var(--primary-text-color));
    transition: transform .15s ease, box-shadow .25s ease; }
  /* Hintergrund + Glas-Effekt auf eigener Ebene (wie Abfall-Karte / Status-Übersicht) */
  .evc::before { content:''; position:absolute; inset:0; z-index:-1; border-radius:inherit; pointer-events:none;
    background: var(--evc-card-bg, ${THEME_BG});
    backdrop-filter: var(--evc-card-bf, none); -webkit-backdrop-filter: var(--evc-card-bf, none); }

  .root { zoom: var(--evc-scale, 1); display:flex; flex-direction:column; box-sizing:border-box; min-height: var(--evc-min-h, 0); }

  /* ---------- Fahrzeuge (Karussell) ---------- */
  .viewport { position:relative; overflow:hidden; touch-action: pan-y; transition: height .3s ease; }
  .track { display:flex; align-items:flex-start; transition: transform .35s cubic-bezier(.25,.8,.25,1); }
  .track.dragging { transition:none; }
  .slide { flex:0 0 100%; min-width:0; box-sizing:border-box; padding: var(--evc-pad, 16px);
    display:flex; flex-direction:column; gap: var(--evc-gap, 12px); }
  .dots { display:flex; justify-content:center; align-items:center; gap:2px;
    margin-top: calc(var(--evc-pad, 16px) * -.55); padding-bottom: calc(var(--evc-pad, 16px) * .45); }
  .dot { border:none; background:none; padding:6px 3px; margin:0; cursor:pointer; line-height:0; -webkit-tap-highlight-color: transparent; }
  .dot span { display:block; width:8px; height:8px; border-radius:999px; transition: width .25s ease, background .25s ease;
    background: color-mix(in srgb, var(--evc-text, var(--primary-text-color)) 28%, transparent); }
  .dot:hover span { background: color-mix(in srgb, var(--evc-text, var(--primary-text-color)) 50%, transparent); }
  .dot.active span { width:22px; background: var(--evc-accent); }
  .main { display:flex; gap: var(--evc-gap, 12px); flex:1; }
  .main.img-left { flex-direction: row-reverse; }
  .col-left { flex: 0 0 var(--evc-left-width, 45%); min-width:0; display:flex; flex-direction:column; gap: var(--evc-gap, 12px); }
  .col-right { flex: 1 1 0; min-width:0; display:flex; flex-direction:column; gap: var(--evc-gap, 12px); }

  /* ---------- Symbol (gleiche Optik wie Abfall-Karte) ---------- */
  .ico { flex:0 0 auto; display:flex; align-items:center; justify-content:center;
    width: calc(var(--evc-isize, 20px) * 1.8); height: calc(var(--evc-isize, 20px) * 1.8);
    border-radius: var(--t-ishape, 50%); background: var(--t-ibg, transparent); color: var(--t-icolor, var(--evc-accent));
    --mdc-icon-size: var(--evc-isize, 20px); transition: background .3s, color .3s; }

  /* ---------- Titel ---------- */
  .header { display:flex; align-items:center; gap:12px; min-width:0; }
  .header.clickable { cursor:pointer; }
  .header .ico { width: calc(var(--evc-isize, 20px) * 2); height: calc(var(--evc-isize, 20px) * 2); --mdc-icon-size: calc(var(--evc-isize, 20px) * 1.1); }
  .htext { min-width:0; }
  .title { font-size: var(--evc-title-size, 20px); font-weight:600; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .subtitle { font-size: calc(var(--evc-title-size, 20px) * .65); color: var(--evc-text2); margin-top:2px; }

  /* ---------- Werte-Kacheln ---------- */
  .fields { display:flex; flex-direction:column; gap: calc(var(--evc-gap, 12px) * .67); }
  .fields-right { display:grid; gap: calc(var(--evc-gap, 12px) * .67); }
  .field { position:relative; isolation:isolate; display:flex; align-items:center; gap:12px; min-width:0; box-sizing:border-box;
    padding: var(--evc-tile-pad, 8px) calc(var(--evc-tile-pad, 8px) + 4px) var(--evc-tile-pad, 8px) var(--evc-tile-pad, 8px);
    color: var(--t-text, inherit); border: var(--t-border, none); border-radius: var(--evc-radius, 12px);
    box-shadow: var(--t-shadow, none); cursor:pointer; user-select:none; transition: transform .15s ease, opacity .2s; }
  .field::before { content:''; position:absolute; inset:0; z-index:-1; border-radius:inherit; pointer-events:none;
    background: var(--t-bg, transparent); backdrop-filter: var(--evc-bf, none); -webkit-backdrop-filter: var(--evc-bf, none); }
  .field:active { transform: scale(.98); }
  .field.unavail { opacity:.5; }
  .ftext { min-width:0; flex:1; }
  .fname { font-size: var(--evc-label-size, 12px); color: var(--t-text2, var(--evc-text2)); letter-spacing:.2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .fvalue { font-size: var(--evc-value-size, 18px); font-weight:600; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .size-small .fvalue { font-size: calc(var(--evc-value-size, 18px) * .8); }
  .size-large .fvalue { font-size: calc(var(--evc-value-size, 18px) * 1.45); }
  .size-large .ico { width: calc(var(--evc-isize, 20px) * 2.2); height: calc(var(--evc-isize, 20px) * 2.2); --mdc-icon-size: calc(var(--evc-isize, 20px) * 1.2); }
  .unit { font-size:.65em; font-weight:400; color: var(--t-text2, var(--evc-text2)); margin-left:3px; }
  .pbar { height:6px; border-radius:3px; margin-top:6px; overflow:hidden; background: color-mix(in srgb, currentColor 14%, transparent); }
  .pbar-fill { height:100%; border-radius:3px; background: var(--t-accent, var(--evc-accent)); transition: width .6s ease; }

  /* ---------- Fahrzeugbild ---------- */
  .image-wrap { position:relative; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; min-height:80px; }
  .image-wrap.clickable { cursor:pointer; }
  .car { position:relative; width:100%; display:flex; align-items:center; justify-content:center; }
  .image-wrap img { position:relative; z-index:1; width: var(--evc-img-size, 100%); max-height: var(--evc-img-max-h, 180px); object-fit:contain;
    transform: translate(var(--evc-img-x, 0), var(--evc-img-y, 0)) scaleX(var(--evc-img-flip, 1));
    filter: var(--evc-img-filter, drop-shadow(0 10px 12px rgba(0,0,0,.25))); }
  .image-wrap .placeholder { --mdc-icon-size:96px; color: var(--evc-text2); opacity:.35; }
  .glow { position:absolute; left:10%; right:10%; bottom:4%; height:28%; border-radius:50%; pointer-events:none;
    background: radial-gradient(closest-side, var(--evc-glow, var(--evc-accent)), transparent); opacity:0; transition: opacity .6s; }
  .glow.on { animation: evc-glow 2.4s ease-in-out infinite; }
  @keyframes evc-glow { 0%,100% { opacity:.25; } 50% { opacity:.75; } }

  /* ---------- Laden Start / Stopp ---------- */
  .cc { position:relative; z-index:2; display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
  .cc-btn { --cc: var(--evc-accent); height: var(--evc-cc-size, 36px); min-width: var(--evc-cc-size, 36px);
    padding:0 14px 0 10px; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:6px;
    border:none; border-radius:999px; cursor:pointer; font:inherit; font-size:13px; font-weight:600; color: var(--cc);
    background: color-mix(in srgb, var(--cc) 18%, transparent); transition: background .25s, color .25s, transform .1s;
    -webkit-tap-highlight-color: transparent; }
  .cc-btn:hover { background: color-mix(in srgb, var(--cc) 28%, transparent); }
  .cc-btn:active { transform: scale(.94); }
  .cc-btn.start { --cc: var(--evc-cc-start, var(--evc-accent)); }
  .cc-btn.stop { --cc: var(--evc-cc-stop, var(--error-color, #f44336)); }
  .cc-btn.active, .cc-btn.active:hover { background: var(--cc); color: var(--text-primary-color, #fff); }
  .cc-btn.icon-only { padding:0; width: var(--evc-cc-size, 36px); }
  .cc-btn[disabled] { opacity:.4; pointer-events:none; }
  .cc-btn ha-icon { --mdc-icon-size: calc(var(--evc-cc-size, 36px) * .55); }

  /* ---------- Button-Leiste ---------- */
  .bar-row { display:flex; gap:4px; }
  .bar-row.segmented { padding:4px; border-radius: calc(var(--evc-btn-h, 44px) / 2 + 4px); background: var(--evc-bar-bg, var(--t-bg)); }
  .bar-row.separate { gap:8px; }
  .btn { flex:1 1 0; min-width:0; height: var(--evc-btn-h, 44px); display:flex; align-items:center; justify-content:center; gap:6px;
    padding:0 10px; border:none; cursor:pointer; font:inherit; font-size:13px; font-weight:600; color: var(--evc-text, var(--primary-text-color));
    background:transparent; border-radius: calc(var(--evc-btn-h, 44px) / 2); transition: background .25s, color .25s, box-shadow .25s;
    -webkit-tap-highlight-color: transparent; }
  .separate .btn { background: var(--evc-bar-bg, var(--t-bg)); border-radius: var(--evc-radius, 12px); }
  .btn:hover { background: color-mix(in srgb, var(--evc-text, var(--primary-text-color)) 8%, transparent); }
  .btn.active, .btn.active:hover { background: var(--b-active, var(--evc-btn-active, var(--evc-accent)));
    color: var(--b-active-text, var(--evc-btn-active-text, #fff));
    box-shadow: 0 2px 6px color-mix(in srgb, var(--b-active, var(--evc-btn-active, var(--evc-accent))) 40%, transparent); }
  .btn.icon-only { padding:0; }
  .bar-row.names .btn.icon-only { flex: 0 0 var(--evc-btn-h, 44px); }
  .btn[disabled] { opacity:.4; cursor:default; }
  .btn ha-icon { --mdc-icon-size:20px; flex:0 0 auto; }
  .btn span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* ---------- Hervorhebung beim Laden / Tank fast leer – dieselben Effekte wie in den anderen Karten ---------- */
  .evc.hl-glow { box-shadow: 0 0 0 1.5px var(--evc-hl, var(--evc-accent)), 0 0 18px 0 color-mix(in srgb, var(--evc-hl, var(--evc-accent)) 55%, transparent) !important; }
  .evc.hl-border { box-shadow: inset 0 0 0 2px var(--evc-hl, var(--evc-accent)), var(--evc-card-shadow, none) !important; }
  .evc.hl-pulse { animation: evc-pulse 2.2s ease-in-out infinite; }
  .evc.hl-scale { transform: scale(1.02); z-index:1; box-shadow: 0 6px 18px color-mix(in srgb, var(--evc-hl, var(--evc-accent)) 40%, transparent) !important; }
  @keyframes evc-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--evc-hl, var(--evc-accent)) 60%, transparent), var(--evc-card-shadow, none); }
    50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--evc-hl, var(--evc-accent)) 0%, transparent), var(--evc-card-shadow, none); }
  }
  @media (prefers-reduced-motion: reduce) { .evc.hl-pulse, .glow.on { animation:none; } .glow.on { opacity:.5; } }

  /* ---------- Schmale Karte: untereinander (Schwelle: stack_below) ---------- */
  .stacked .main, .stacked .main.img-left { flex-direction:column; }
  .stacked .col-left, .stacked .col-right { display:contents; }
  .stacked .header { order:0; }
  .stacked .image-wrap { order:1; }
  .stacked .fields-left { order:2; }
  .stacked .fields-right { order:3; }
`;

/* ------------------------------------------------------------------ */
/*  Karte                                                             */
/* ------------------------------------------------------------------ */

// CSS-Variablen eines einzelnen Fahrzeugs (Akzent, Kacheln, Bild …) – ohne die Karten-Hülle
const SHELL_VARS = ['--evc-card-bg', '--evc-card-bf', '--evc-card-shadow', '--evc-scale', '--evc-min-h'];
const slideVars = (eff) => {
  const out = {};
  Object.entries(cardDesign(eff)).forEach(([k, v]) => { if (k.startsWith('--') && !SHELL_VARS.includes(k)) out[k] = v; });
  return out;
};

class EvChargeCard extends HTMLElement {
  static getConfigElement() { return document.createElement(EDITOR_TYPE); }

  static getStubConfig(hass) {
    const states = hass?.states || {};
    const ids = Object.keys(states);
    const dc = (id) => states[id]?.attributes?.device_class;
    const soc = ids.find((id) => id.startsWith('sensor.') && dc(id) === 'battery' && /(car|auto|ev_|vehicle|fahrzeug)/i.test(id))
      || ids.find((id) => id.startsWith('sensor.') && dc(id) === 'battery');
    const range = ids.find((id) => id.startsWith('sensor.') && /(range|reichweite|autonomy)/i.test(id));
    const sel = ids.find((id) => /^(input_)?select\./.test(id) && /(wallbox|charg|lade)/i.test(id));
    const opts = sel ? (states[sel].attributes.options || []).slice(0, 4) : [];
    return {
      vehicles: [{
        vehicle_type: 'ev',
        title: 'Mein E-Auto',
        title_icon: TYPE_ICONS.ev,
        image: { url: '', max_height: 170 },
        fields: [
          soc && { entity: soc, name: 'Ladestand', size: 'large', show_bar: true },
          range && { entity: range, name: 'Reichweite' },
        ].filter(Boolean),
        button_bar: sel ? { entity: sel } : {},
        buttons: opts.map((o) => ({ option: o })),
      }],
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._html = '';
    this._styleKey = '';
    this._applied = new Set();
    this._holdTimer = null;
    this._held = false;
    this._states = new Map();
    this._idx = 0;
    this._drag = null;
    this._swiped = false;
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Ungültige Konfiguration');
    const cfg = migrateConfig(config);
    this._config = cfg;
    this._vehicles = vehiclesOf(cfg);
    if (cfg.remember_vehicle !== false) {
      try {
        const saved = Number(window.localStorage.getItem(this._storeKey()));
        if (Number.isInteger(saved)) this._idx = saved;
      } catch (e) { /* kein localStorage */ }
    }
    this._idx = Math.max(0, Math.min(this._idx, this._vehicles.length - 1));
    this._states.clear();
    this._html = '';
    this._styleKey = '';
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first || this._relevantChanged()) this._render();
  }
  get hass() { return this._hass; }

  getCardSize() { return 5; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  _storeKey() {
    return `ev-charge-card:${this._vehicles.map((v) => v.title || v.vehicle_type || '').join('|')}`;
  }

  _entities() {
    const set = new Set();
    const add = (e) => e && set.add(e);
    this._vehicles.forEach((_, i) => {
      const c = vehCfg(this._config, i);
      add(c.subtitle_entity);
      add(c.image?.entity);
      add(c.image?.glow_entity);
      add(c.fuel?.entity);
      const cc = c.charge_control || {};
      [cc.show_entity, cc.start_entity, cc.stop_entity, cc.charging_entity].forEach(add);
      add(c.button_bar?.entity);
      c.fields.forEach((f) => add(f?.entity));
      c.buttons.forEach((b) => add(b?.entity));
    });
    return set;
  }

  _relevantChanged() {
    let changed = false;
    for (const id of this._entities()) {
      const st = this._hass.states[id];
      if (this._states.get(id) !== st) {
        this._states.set(id, st);
        changed = true;
      }
    }
    return changed;
  }

  _ensureSkeleton() {
    if (this._card) return;
    this.shadowRoot.innerHTML = `<style>${CARD_CSS}</style><ha-card class="evc"><div class="root"></div></ha-card>`;
    this._card = this.shadowRoot.querySelector('ha-card');
    this._root = this.shadowRoot.querySelector('.root');
    const r = this._root;
    r.addEventListener('click', (e) => this._onClick(e));
    r.addEventListener('pointerdown', (e) => { this._onDown(e); this._swipeStart(e); });
    r.addEventListener('pointermove', (e) => this._swipeMove(e));
    r.addEventListener('pointerup', (e) => { clearTimeout(this._holdTimer); this._swipeEnd(e); });
    r.addEventListener('pointercancel', (e) => { clearTimeout(this._holdTimer); this._swipeEnd(e, true); });
    r.addEventListener('pointerleave', () => clearTimeout(this._holdTimer));
    r.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-act]')) e.preventDefault(); });
    this._width = 0;
    this._ro = new ResizeObserver((entries) => {
      this._width = entries[0]?.contentRect?.width || 0;
      this._checkStack();
    });
    this._ro.observe(this._card);
    this._slideRO = new ResizeObserver(() => this._syncHeight());
  }

  // Untereinander-Layout erst unterhalb von stack_below (px, Standard 260, 0 = nie)
  _checkStack() {
    if (!this._root || !this._width) return;
    const c = this._config || {};
    const limit = has(c.stack_below) ? Number(c.stack_below) : DEFAULTS.stack_below;
    const scale = Number(c.scale) || 1;
    this._root.classList.toggle('stacked', limit > 0 && this._width / scale < limit);
  }

  // Karten-Hülle (Hintergrund, Rahmen, Hervorhebung) folgt dem gerade sichtbaren Fahrzeug
  _applyCardStyle() {
    const eff = vehCfg(this._config, this._idx);
    const hl = eff.highlight || DEFAULTS.highlight;
    const g = glowInfo(eff, this._hass);
    const on = hl !== 'none' && g.active;
    const key = JSON.stringify([this._config, this._idx, on, g.color]);
    if (key === this._styleKey) return;
    this._styleKey = key;
    const props = cardDesign(eff);
    if (on && g.color) props['--evc-hl'] = g.color;
    const card = this._card;
    const next = new Set();
    Object.entries(props).forEach(([k, v]) => {
      if (!has(v)) return;
      card.style.setProperty(k, String(v));
      next.add(k);
    });
    this._applied.forEach((k) => { if (!next.has(k)) card.style.removeProperty(k); });
    this._applied = next;
    ['glow', 'pulse', 'border', 'scale'].forEach((h) => card.classList.toggle(`hl-${h}`, on && hl === h));
  }

  _template() {
    const cfg = this._config;
    const n = this._vehicles.length;
    const slides = this._vehicles.map((_, i) => {
      const eff = vehCfg(cfg, i);
      return `<div class="slide" data-v="${i}" style="${esc(styleString(slideVars(eff)))}">${renderBody(eff, this._hass)}</div>`;
    }).join('');
    const dots = n > 1 && cfg.show_dots !== false
      ? `<div class="dots" role="tablist">${this._vehicles.map((v, i) => `<button class="dot" type="button" role="tab" data-act="dot:${i}" title="${esc(v.title || `Fahrzeug ${i + 1}`)}" aria-label="${esc(v.title || `Fahrzeug ${i + 1}`)}"><span></span></button>`).join('')}</div>`
      : '';
    return `<div class="viewport"><div class="track">${slides}</div></div>${dots}`;
  }

  _render() {
    if (!this._config) return;
    this._ensureSkeleton();
    this._applyCardStyle();
    this._checkStack();
    const html = this._template();
    if (html !== this._html) {
      this._root.innerHTML = html;
      this._html = html;
      this._viewport = this._root.querySelector('.viewport');
      this._track = this._root.querySelector('.track');
      this._slideRO.disconnect();
      this._root.querySelectorAll('.slide').forEach((s) => this._slideRO.observe(s));
      this._applyIndex(false);
    }
  }

  /* ---------- Fahrzeug wechseln ---------- */

  _applyIndex(animate) {
    const track = this._track;
    if (!track) return;
    if (!animate) track.classList.add('dragging');
    track.style.transform = `translateX(${-this._idx * 100}%)`;
    if (!animate) { void track.offsetWidth; track.classList.remove('dragging'); }
    this._root.querySelectorAll('.slide').forEach((s, i) => s.setAttribute('aria-hidden', String(i !== this._idx)));
    this._root.querySelectorAll('.dot').forEach((d, i) => {
      d.classList.toggle('active', i === this._idx);
      d.setAttribute('aria-selected', String(i === this._idx));
    });
    this._syncHeight();
  }

  // Höhe folgt dem sichtbaren Fahrzeug (unterschiedlich viele Werte je Auto)
  _syncHeight() {
    if (!this._viewport) return;
    if (this._vehicles.length < 2) { this._viewport.style.height = ''; return; }
    const slide = this._root.querySelectorAll('.slide')[this._idx];
    if (slide) this._viewport.style.height = `${slide.offsetHeight}px`;
  }

  _goTo(i) {
    const n = this._vehicles.length;
    const next = Math.max(0, Math.min(n - 1, i));
    const changed = next !== this._idx;
    this._idx = next;
    if (changed && this._config.remember_vehicle !== false) {
      try { window.localStorage.setItem(this._storeKey(), String(next)); } catch (e) { /* egal */ }
    }
    this._applyIndex(true);
    if (changed) {
      this._applyCardStyle();
      fireEvent(window, 'haptic', 'light');
    }
  }

  _swipeStart(e) {
    if (this._vehicles.length < 2 || this._config.swipe === false || e.button > 0) return;
    if (e.target.closest('.dots')) return;
    this._drag = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  }

  _swipeMove(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        d.active = true;
        clearTimeout(this._holdTimer);
        this._track.classList.add('dragging');
        try { this._root.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
      } else if (Math.abs(dy) > 10) {
        this._drag = null;
        return;
      } else return;
    }
    const n = this._vehicles.length;
    const off = (this._idx === 0 && dx > 0) || (this._idx === n - 1 && dx < 0) ? dx / 3 : dx;
    this._track.style.transform = `translateX(calc(${-this._idx * 100}% + ${off}px))`;
  }

  _swipeEnd(e, cancel = false) {
    const d = this._drag;
    this._drag = null;
    if (!d || !d.active) return;
    this._swiped = true;
    setTimeout(() => { this._swiped = false; }, 350);
    this._track.classList.remove('dragging');
    const dx = cancel ? 0 : e.clientX - d.x;
    const limit = Math.min(60, (this._viewport?.clientWidth || 300) * 0.2);
    if (dx < -limit) this._goTo(this._idx + 1);
    else if (dx > limit) this._goTo(this._idx - 1);
    else this._applyIndex(true);
  }

  /* ---------- Interaktion ---------- */
  _resolve(act, vi) {
    const c = vehCfg(this._config, vi);
    const [kind, idx] = act.split(':');
    if (kind === 'field') {
      const f = c.fields[+idx] || {};
      return { entity: f.entity, tap: f.tap_action || { action: 'more-info' }, hold: f.hold_action };
    }
    if (kind === 'btn') {
      const b = c.buttons[+idx] || {};
      if ((b.type || 'option') === 'option') {
        const ent = b.entity || c.button_bar?.entity;
        return { entity: ent, tap: { action: '__select', option: b.option }, hold: b.hold_action || { action: 'more-info' } };
      }
      return { entity: b.entity, tap: b.tap_action || (b.entity ? { action: 'toggle' } : { action: 'none' }), hold: b.hold_action };
    }
    if (kind === 'cc') {
      const cc = c.charge_control || {};
      const ent = cc[`${idx}_entity`];
      const custom = cc[`${idx}_action`];
      const tap = custom && custom.action ? { ...custom } : { action: '__press', kind: idx };
      if (cc.confirm && !tap.confirmation) tap.confirmation = { text: idx === 'start' ? 'Ladevorgang starten?' : 'Ladevorgang stoppen?' };
      return { entity: ent, tap, hold: { action: 'more-info' } };
    }
    if (kind === 'image') {
      const im = c.image || {};
      return { entity: im.entity || im.glow_entity || c.fuel?.entity, tap: im.tap_action, hold: im.hold_action };
    }
    if (kind === 'title') return { entity: c.subtitle_entity, tap: c.title_tap_action, hold: c.title_hold_action };
    return {};
  }

  _target(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return null;
    const slide = el.closest('.slide');
    return { el, vi: slide ? Number(slide.dataset.v) : this._idx };
  }

  _onDown(e) {
    const t = this._target(e);
    if (!t || t.el.dataset.act.startsWith('dot:')) return;
    this._held = false;
    clearTimeout(this._holdTimer);
    const r = this._resolve(t.el.dataset.act, t.vi);
    if (!r.hold || r.hold.action === 'none') return;
    this._holdTimer = setTimeout(() => {
      this._held = true;
      fireEvent(window, 'haptic', 'medium');
      this._run(r.hold, r.entity);
    }, 500);
  }

  _onClick(e) {
    if (this._swiped) { this._swiped = false; return; }
    const t = this._target(e);
    if (!t || t.el.disabled) return;
    if (t.el.dataset.act.startsWith('dot:')) { this._goTo(Number(t.el.dataset.act.split(':')[1])); return; }
    if (this._held) { this._held = false; return; }
    const r = this._resolve(t.el.dataset.act, t.vi);
    if (r.tap) this._run(r.tap, r.entity);
  }

  _run(a, entityId) {
    if (!a || !this._hass) return;
    if (a.confirmation) {
      const text = typeof a.confirmation === 'object' && a.confirmation.text ? a.confirmation.text : 'Bist du sicher?';
      if (!window.confirm(text)) return;
    }
    const hass = this._hass;
    switch (a.action) {
      case '__press': {
        if (!entityId) return;
        const d = entityId.split('.')[0];
        const onOff = ['switch', 'input_boolean', 'light', 'fan'].includes(d);
        const map = {
          button: ['button', 'press'], input_button: ['input_button', 'press'], script: ['script', 'turn_on'],
          scene: ['scene', 'turn_on'], automation: ['automation', 'trigger'],
        };
        const [sd, ss] = onOff ? ['homeassistant', a.kind === 'stop' ? 'turn_off' : 'turn_on'] : map[d] || ['homeassistant', 'turn_on'];
        hass.callService(sd, ss, { entity_id: entityId });
        fireEvent(window, 'haptic', 'medium');
        break;
      }
      case '__select': {
        if (!entityId || !has(a.option)) return;
        const domain = entityId.split('.')[0];
        hass.callService(domain === 'input_select' ? 'input_select' : 'select', 'select_option', { entity_id: entityId, option: a.option });
        fireEvent(window, 'haptic', 'light');
        break;
      }
      case 'more-info':
        fireEvent(this, 'hass-more-info', { entityId: a.entity || entityId });
        break;
      case 'toggle':
        if (entityId) hass.callService('homeassistant', 'toggle', { entity_id: entityId });
        fireEvent(window, 'haptic', 'light');
        break;
      case 'navigate':
        if (!a.navigation_path) return;
        history.pushState(null, '', a.navigation_path);
        fireEvent(window, 'location-changed', { replace: false });
        break;
      case 'url':
        if (a.url_path) window.open(a.url_path, a.new_tab === false ? '_self' : '_blank');
        break;
      case 'perform-action':
      case 'call-service': {
        const svc = a.perform_action || a.service;
        if (!svc) return;
        const [d, s] = svc.split('.');
        hass.callService(d, s, a.data || a.service_data || {}, a.target);
        fireEvent(window, 'haptic', 'light');
        break;
      }
      case 'fire-dom-event':
        fireEvent(this, 'll-custom', a);
        break;
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Editor – Texte, Tabs & Gruppen (identischer Aufbau wie Trash Card   */
/*  Plus und Status-Übersicht: Tab-Leiste oben, Intro-Text, aufklapp-   */
/*  bare Gruppen mit Symbol, Listen mit Bearbeiten-Seite, Vorschau).    */
/* ------------------------------------------------------------------ */

const T = {
  tabs: { general: 'Allgemein', display: 'Anzeige', vehicle: 'Fahrzeug', fields: 'Werte', buttons: 'Buttons', design: 'Design' },
  intro: {
    general: 'Deine Fahrzeuge in dieser Karte – und Antrieb, Titel und Untertitel des oben gewählten Fahrzeugs. Bei mehreren Fahrzeugen schaltest du in der Karte per Wischen oder über die Punkte unten um.',
    display: 'Grundlayout der Karte: wo Bild und Titel sitzen, wie breit die Spalten sind und ab welcher Breite die Karte untereinander umbricht. Farben und Transparenz findest du im Tab „Design“.',
    vehicle: 'Fahrzeugbild und Glow: beim Elektroauto leuchtet er beim Laden, bei Hybrid und Benzin/Diesel zusätzlich als Warnung, wenn der Tank fast leer ist. Start/Stopp erscheint unter dem Auto, sobald es eingesteckt ist.',
    fields: 'Jeder Wert (Ladestand, Reichweite, Ladeleistung …) hat sein eigenes Symbol, seine eigene Farbe und optional ein komplett eigenes Design.',
    buttons: 'Die Button-Leiste unten: Optionen direkt aus einer Auswahl-Entität (z. B. Lademodus) oder freie Aktions-Buttons wie Favorit ☆.',
    design: 'Standard-Design für Karte, Werte und Button-Leiste – genau wie bei der Abfall-Karte und der Status-Übersicht. Jeder Wert kann das im Tab „Werte“ individuell überschreiben.',
  },
  groups: {
    title_actions: 'Aktionen', arrangement: 'Anordnung', size: 'Größe & Umbruch', carousel: 'Mehrere Fahrzeuge',
    vehicle: 'Fahrzeug', vehicle_color: 'Farbe', fuel: 'Tank-Warnung',
    image: 'Fahrzeugbild', glow: 'Lade-Glow (Laden)', image_actions: 'Aktionen',
    cc: 'Laden Start / Stopp', cc_look: 'Beschriftung & Farben', cc_actions: 'Eigene Aktionen',
    value: 'Entität & Wert', placement: 'Position & Größe', look: 'Symbol & Farbe', progress: 'Fortschrittsbalken',
    item_bg: 'Hintergrund', item_text: 'Text & Rahmen', field_actions: 'Aktionen',
    thresholds: 'Farbschwellen', state_map: 'Zustände übersetzen',
    bar: 'Button-Leiste', bar_colors: 'Farben',
    function: 'Funktion', btn_look: 'Aussehen', button_actions: 'Aktionen',
    card_bg: 'Karte – Hintergrund & Transparenz', card_image: 'Karte – Hintergrundbild', card_frame: 'Karte – Rahmen, Form & Abstände',
    bg: 'Werte – Hintergrund & Transparenz', icon: 'Symbol', text: 'Text', frame: 'Werte – Rahmen, Form & Abstände',
    highlight: 'Hervorhebung (Laden / Tank fast leer)',
  },
  fields: {
    // Oberste Ebene (Allgemein, Anzeige, Design)
    root: {
      title: 'Titel', title_icon: 'Titel-Symbol', subtitle: 'Untertitel (Text)', subtitle_entity: 'Untertitel aus Entität',
      title_tap_action: 'Aktion beim Antippen', title_hold_action: 'Aktion beim Halten',
      image_position: 'Fahrzeugbild', title_position: 'Titel', left_width: 'Breite der linken Spalte',
      right_columns: 'Spalten der Werte unter dem Bild', scale: 'Skalierung der ganzen Karte', min_height: 'Mindesthöhe',
      card_height: 'Feste Höhe', stack_below: 'Untereinander unter Kartenbreite',
      accent_color: 'Akzentfarbe',
      card_bg_mode: 'Hintergrund der Karte', card_bg_color: 'Farbe der Karte', card_bg_opacity: 'Deckkraft der Karte',
      card_bg_gradient: 'Farbverlauf', card_blur: 'Unschärfe hinter der Karte (Glas-Effekt)',
      background_image: 'Hintergrundbild (URL)', background_size: 'Bildgröße', background_position: 'Bildposition',
      overlay_color: 'Farbe über dem Bild', overlay_opacity: 'Deckkraft über dem Bild',
      card_border_mode: 'Rahmen', card_border_color: 'Rahmenfarbe', card_border_width: 'Rahmenstärke',
      card_shadow: 'Schatten', card_radius: 'Eckenradius', padding: 'Innenabstand', gap: 'Abstand zwischen den Elementen',
      bg_mode: 'Hintergrund', bg_color: 'Hintergrundfarbe', bg_opacity: 'Deckkraft / Farbstärke', bg_gradient: 'Farbverlauf',
      blur: 'Unschärfe dahinter (Glas-Effekt)',
      icon_size: 'Symbolgröße', icon_color_mode: 'Symbolfarbe', icon_color: 'Eigene Symbolfarbe',
      icon_bg_mode: 'Symbol-Hintergrund', icon_bg_color: 'Eigene Farbe Symbol-Hintergrund', icon_bg_opacity: 'Deckkraft Symbol-Hintergrund',
      icon_shape: 'Form Symbol-Hintergrund',
      text_color_mode: 'Textfarbe', text_color: 'Eigene Textfarbe', title_size: 'Schriftgröße Titel',
      label_size: 'Schriftgröße Bezeichnung', value_size: 'Schriftgröße Wert',
      border_mode: 'Rahmen', border_color: 'Rahmenfarbe', border_width: 'Rahmenstärke', shadow: 'Schatten',
      radius: 'Eckenradius', tile_padding: 'Innenabstand der Werte',
      highlight: 'Hervorhebung',
      show_dots: 'Punkte zum Umschalten anzeigen', swipe: 'Wischen zum Umschalten', remember_vehicle: 'Zuletzt gewähltes Fahrzeug merken',
    },
    vehicle: {
      vehicle_type: 'Antrieb', title: 'Name / Titel', own_accent: 'Eigene Akzentfarbe für dieses Fahrzeug', accent_color: 'Akzentfarbe dieses Fahrzeugs',
    },
    fuel: {
      entity: 'Tankfüllstand (Entität)', attribute: 'Attribut statt Zustand (optional)', threshold: 'Warnen ab Füllstand (höchstens)', color: 'Farbe der Warnung',
    },
    image: {
      url: 'Bild-URL', entity: 'Bild aus Entität (entity_picture)', size: 'Größe', max_height: 'Maximale Höhe',
      offset_x: 'Versatz horizontal', offset_y: 'Versatz vertikal', flip: 'Spiegeln', shadow: 'Schlagschatten', hide: 'Bild ausblenden',
      glow_entity: 'Entität', glow_state: 'Leuchtet bei Zustand', glow_color: 'Farbe',
      tap_action: 'Aktion beim Antippen', hold_action: 'Aktion beim Halten',
    },
    cc: {
      start_entity: 'Start-Entität', stop_entity: 'Stopp-Entität', show_entity: 'Anzeigen, wenn Entität …', show_state: '… diesen Zustand hat',
      charging_entity: 'Lädt gerade: Entität', charging_state: 'Lädt gerade: Zustand', show_names: 'Beschriftung anzeigen', confirm: 'Vor dem Ausführen nachfragen',
      start_name: 'Name Start', stop_name: 'Name Stopp', start_icon: 'Symbol Start', stop_icon: 'Symbol Stopp',
      start_color: 'Farbe Start', stop_color: 'Farbe Stopp', size: 'Größe der Buttons',
      start_action: 'Eigene Aktion Start', stop_action: 'Eigene Aktion Stopp',
    },
    field: {
      entity: 'Entität', attribute: 'Attribut statt Zustand (optional)', name: 'Bezeichnung', unit: 'Einheit (überschreibt)',
      decimals: 'Nachkommastellen', multiply: 'Faktor', slot: 'Position', size: 'Größe', show_name: 'Bezeichnung anzeigen', show_icon: 'Symbol anzeigen',
      color: 'Farbe des Werts', icon: 'Symbol', show_bar: 'Fortschrittsbalken anzeigen', bar_min: 'Balken von', bar_max: 'Balken bis',
      icon_color_mode: 'Symbolfarbe', icon_color: 'Eigene Symbolfarbe', icon_bg_mode: 'Symbol-Hintergrund', icon_bg_color: 'Eigene Farbe Symbol-Hintergrund',
      icon_bg_opacity: 'Deckkraft Symbol-Hintergrund', icon_shape: 'Form Symbol-Hintergrund',
      bg_mode: 'Hintergrund', bg_color: 'Hintergrundfarbe', bg_opacity: 'Deckkraft / Farbstärke', bg_gradient: 'Farbverlauf',
      text_color_mode: 'Textfarbe', text_color: 'Eigene Textfarbe', border_mode: 'Rahmen', border_color: 'Rahmenfarbe',
      border_width: 'Rahmenstärke', shadow: 'Schatten', tap_action: 'Aktion beim Antippen', hold_action: 'Aktion beim Halten',
    },
    thr: { from: 'Ab Wert', color: 'Farbe' },
    map: { state: 'Zustand', text: 'Anzeige' },
    bar: {
      entity: 'Auswahl-Entität (select / input_select)', style: 'Stil', height: 'Höhe', show_names: 'Namen anzeigen', show_icons: 'Symbole anzeigen',
      hide: 'Leiste ausblenden', active_color: 'Farbe aktiver Button', active_text_color: 'Textfarbe aktiver Button', background: 'Hintergrund der Leiste',
    },
    button: {
      type: 'Art des Buttons', option: 'Option der Auswahl-Entität', entity: 'Entität', active_state: 'Aktiv bei Zustand',
      name: 'Name', icon: 'Symbol', color: 'Farbe wenn aktiv', width: 'Breite', tap_action: 'Aktion beim Antippen', hold_action: 'Aktion beim Halten',
    },
  },
  helpers: {
    root: {
      subtitle_entity: 'Überschreibt den Untertitel-Text, z. B. mit dem Wallbox-Status.',
      stack_below: 'Unterhalb dieser Kartenbreite rutscht das Bild unter den Titel. 0 = nie.',
      card_bg_opacity: 'Bei „Theme + Farbton“ ist das die Stärke des Farbtons.',
      bg_opacity: 'Bei „Theme + Farbton“ ist das die Stärke des Farbtons.',
      blur: 'Wirkt, wenn hinter den Werten ein Hintergrundbild oder eine transparente Karte liegt.',
      background_image: 'Bild nach /config/www legen und /local/dateiname.jpg eintragen.',
      accent_color: 'Farbe für Symbole, Balken, Glow und den aktiven Button – solange nichts Eigenes gewählt ist.',
      highlight: 'Wird angezeigt, solange geladen wird (Entität „Lädt gerade“ bzw. Lade-Glow) – bei Hybrid und Benzin/Diesel auch, wenn der Tank fast leer ist (dann in der Warnfarbe).',
      show_dots: 'Erscheinen unten in der Mitte, sobald mehr als ein Fahrzeug angelegt ist.',
      remember_vehicle: 'Merkt sich pro Browser, welches Fahrzeug zuletzt angezeigt wurde.',
    },
    vehicle: {
      vehicle_type: 'Elektro: Laden, Lade-Glow und Start/Stopp. Hybrid: Laden plus Tank-Warnung. Benzin/Diesel: nur Tank-Warnung.',
      accent_color: 'Überschreibt die Akzentfarbe aus dem Tab „Design“ nur für dieses Fahrzeug.',
    },
    fuel: {
      threshold: 'In der Einheit der Entität, meist %. Sobald der Füllstand darauf oder darunter fällt, leuchtet der Glow unter dem Auto in der Warnfarbe.',
    },
    image: {
      url: 'Am besten ein PNG mit transparentem Hintergrund nach /config/www legen und /local/… eintragen.',
      glow_state: 'Mehrere Zustände mit Komma trennen. Standard: on, charging',
    },
    cc: {
      show_entity: 'Leer = Entität und Zustand vom Lade-Glow verwenden.',
      charging_entity: 'Optional: füllt „Start“ beim Laden bzw. „Stopp“ in der Pause.',
      start_action: 'Überschreibt die Start-Entität.',
      stop_action: 'Überschreibt die Stopp-Entität.',
    },
    field: { multiply: 'z. B. 0.001 für W → kW', color: 'Farbschwellen weiter unten haben Vorrang.' },
    bar: { background: 'Leer = wie die Werte-Kacheln (Tab „Design“).' },
    button: { width: '1 = normal, 0.5 = halb, 2 = doppelt', active_state: 'Standard: on' },
  },
  opt: {
    image_position: { right: 'Rechts', left: 'Links' },
    title_position: { top: 'Oben über die volle Breite', column: 'In der linken Spalte' },
    bg_mode: { theme: 'Karten-Hintergrund (Theme)', tinted: 'Theme + Farbton', accent: 'Volle Akzentfarbe', custom: 'Eigene Farbe', none: 'Transparent (kein Hintergrund)' },
    card_border_mode: { theme: 'Wie Theme', none: 'Kein Rahmen', accent: 'Akzentfarbe', custom: 'Eigene Farbe' },
    icon_color_mode: { auto: 'Automatisch', accent: 'Akzentfarbe', text: 'Wie Textfarbe', custom: 'Eigene Farbe' },
    icon_bg_mode: { none: 'Keiner', accent: 'Akzentfarbe', theme: 'Karten-Hintergrund', custom: 'Eigene Farbe' },
    icon_shape: { circle: 'Kreis', rounded: 'Abgerundet', square: 'Eckig' },
    text_color_mode: { auto: 'Automatisch (guter Kontrast)', theme: 'Theme-Textfarbe', custom: 'Eigene Farbe' },
    border_mode: { none: 'Kein Rahmen', accent: 'Akzentfarbe', theme: 'Dezent (Theme)', custom: 'Eigene Farbe' },
    shadow: { theme: 'Wie Theme', none: 'Kein Schatten', soft: 'Weich', strong: 'Kräftig' },
    highlight: { none: 'Keine', glow: 'Leuchten', pulse: 'Pulsieren', border: 'Farbiger Rahmen', scale: 'Etwas größer' },
    bg_gradient: { on: 'An', off: 'Aus' },
    slot: { left: 'Links (unter dem Titel)', right: 'Rechts (unter dem Bild)' },
    size: { small: 'Klein', normal: 'Normal', large: 'Groß' },
    bar_style: { segmented: 'Segmentiert (Pille)', separate: 'Einzelne Buttons' },
    btn_type: { option: 'Option der Auswahl-Entität', action: 'Freie Aktion (z. B. Favorit ☆)' },
    vehicle_type: { ev: 'Elektrofahrzeug', hybrid: 'Hybrid (Plug-in / Vollhybrid)', combustion: 'Benzin / Diesel' },
  },
  inherit: 'Standard',
  preview: 'Vorschau', back: 'Zurück', edit_field: 'Wert bearbeiten', edit_button: 'Button bearbeiten',
  move_up: 'Nach oben', move_down: 'Nach unten', edit: 'Bearbeiten', delete: 'Löschen',
  add_field: 'Wert hinzufügen', add_button: 'Button hinzufügen', add_all_options: 'Alle Optionen übernehmen',
  add_threshold: 'Farbschwelle hinzufügen', add_mapping: 'Übersetzung hinzufügen',
  thresholds_hint: 'Ab dem Wert gilt die Farbe – für Symbol, Balken und Farbton der Kachel. Hat Vorrang vor der Farbe oben.',
  map_hint: 'Rohe Zustände der Entität durch eigene Texte ersetzen, z. B. „Charging“ → „Lädt“.',
  current_state: 'Aktueller Zustand', left: 'links', right: 'rechts', no_entity: 'Keine Entität gewählt',
  new_field: 'Neuer Wert', new_button: 'Neuer Button', option: 'Option', action: 'Aktion', no_action_entity: 'ohne Entität',
  option_missing: 'nicht in der Auswahl', no_buttons: 'Noch keine Buttons – wähle oben eine Auswahl-Entität und übernimm ihre Optionen.',
  no_fields: 'Noch keine Werte angelegt.',
  suggest_title: 'Vorschläge von deinen Fahrzeug- und Wallbox-Geräten', suggest_none: 'Keine weiteren passenden Entitäten gefunden.',
  suggest_add: 'Als Wert hinzufügen', buttons_title: 'Buttons',
  sample_soc: 'Ladestand', sample_range: 'Reichweite', raw_css: 'Eigener CSS-Hintergrund aus YAML aktiv:',
  vehicles_title: 'Fahrzeuge in dieser Karte', add_vehicle: 'Fahrzeug hinzufügen', vehicle: 'Fahrzeug',
  new_vehicle: { ev: 'Neues E-Auto', hybrid: 'Neuer Hybrid', combustion: 'Neues Auto' },
  type_short: { ev: 'Elektro', hybrid: 'Hybrid', combustion: 'Benzin / Diesel' },
  editing: 'wird bearbeitet',
  combustion_note: 'Bei Benzin/Diesel gibt es kein Laden – Lade-Glow und Start/Stopp sind ausgeblendet. Der Glow leuchtet über die Tank-Warnung.',
};

const EDITOR_TABS = [
  { id: 'general', icon: 'mdi:car-electric' },
  { id: 'display', icon: 'mdi:view-dashboard-outline' },
  { id: 'vehicle', icon: 'mdi:car-side' },
  { id: 'fields', icon: 'mdi:format-list-bulleted-square' },
  { id: 'buttons', icon: 'mdi:gesture-tap-button' },
  { id: 'design', icon: 'mdi:palette-outline' },
];

const EDITOR_STATE = { tab: 'general' };

// Farbfelder, die im Editor als Farbpicker ([r,g,b]) dargestellt werden
const ROOT_COLOR_KEYS = ['accent_color', 'card_bg_color', 'card_border_color', 'overlay_color', 'bg_color', 'icon_color', 'icon_bg_color', 'text_color', 'border_color'];
const FIELD_COLOR_KEYS = ['color', 'bg_color', 'icon_color', 'icon_bg_color', 'text_color', 'border_color'];

const EDITOR_CSS = `
  :host { display:block; height:auto; }
  .tabs { display:flex; gap:4px; padding:4px; margin-bottom:16px; border-radius:14px;
    background: var(--secondary-background-color, rgba(127,127,127,.12)); overflow-x:auto; }
  .tab { flex:1 1 0; min-width:62px; display:flex; flex-direction:column; align-items:center; gap:3px;
    padding:8px 4px; border:none; border-radius:10px; background:transparent; cursor:pointer;
    color: var(--secondary-text-color); font: inherit; font-size:12px; font-weight:500; transition: background .15s, color .15s; }
  .tab ha-icon { --mdc-icon-size:20px; }
  .tab:hover { color: var(--primary-text-color); }
  .tab.active { background: var(--card-background-color, #fff); color: var(--primary-color); font-weight:600; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .intro { font-size:13px; color: var(--secondary-text-color); margin: 0 2px 14px; line-height:1.45; }
  .section-title { font-size:14px; font-weight:600; margin: 22px 2px 8px; color: var(--primary-text-color); }
  ha-form { display:block; }
  ha-form + ha-form { margin-top:24px; }

  .it-row { display:flex; align-items:center; gap:10px; padding:8px 8px 8px 10px; margin-bottom:8px; border-radius:14px;
    border:1px solid var(--divider-color, rgba(127,127,127,.25)); background: var(--card-background-color, #fff); cursor:pointer; }
  .it-row:hover { border-color: var(--primary-color); }
  .it-ico { flex:0 0 auto; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; --mdc-icon-size:22px; }
  .it-txt { flex:1; min-width:0; }
  .it-name { font-weight:600; font-size:14px; color: var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .it-sub { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .it-sub .un { color: var(--warning-color, #ffa600); }
  .ibtn { flex:0 0 auto; width:34px; height:34px; display:flex; align-items:center; justify-content:center; border:none; border-radius:50%;
    background:transparent; color: var(--secondary-text-color); cursor:pointer; --mdc-icon-size:20px; padding:0; }
  .ibtn:hover { background: var(--secondary-background-color, rgba(127,127,127,.15)); color: var(--primary-text-color); }
  .ibtn[disabled] { opacity:.3; pointer-events:none; }
  .ibtn.del:hover { color: var(--error-color, #db4437); }
  .add { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; padding:11px; margin-top:4px; border-radius:14px;
    border:1.5px dashed var(--primary-color); background:transparent; color: var(--primary-color); font: inherit; font-weight:600; font-size:14px; cursor:pointer; }
  .add:hover { background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
  .add.small { padding:8px; font-size:13px; border-radius:10px; }
  .add-row { display:flex; gap:8px; }
  .add-row .add { flex:1; }

  .found { display:flex; flex-direction:column; gap:6px; }
  .found-row { display:flex; align-items:center; gap:8px; font-size:13px; padding:6px 10px; border-radius:10px; background: var(--secondary-background-color, rgba(127,127,127,.1)); }
  .found-row .s { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color: var(--primary-text-color); }
  .found-row .m { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; }
  .found-row .ibtn { width:28px; height:28px; --mdc-icon-size:18px; }
  .muted { font-size:12px; color: var(--secondary-text-color); padding: 4px 2px; }
  .note { font-size:12px; color: var(--secondary-text-color); margin: 0 2px 12px; padding:8px 10px; border-radius:10px;
    background: color-mix(in srgb, var(--warning-color, #ffa600) 12%, transparent); word-break: break-all; }

  .ed-head { display:flex; align-items:center; gap:6px; margin-bottom:12px; }
  .ed-head .t { font-size:16px; font-weight:600; color: var(--primary-text-color); }
  .pv { padding:14px; margin-bottom:16px; border-radius:14px;
    background: repeating-conic-gradient(rgba(127,127,127,.08) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px, var(--primary-background-color, #f5f5f5); }
  .pv-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color: var(--secondary-text-color); margin-bottom:10px; }
  .pv-card { height:auto; border-radius: var(--ha-card-border-radius, 12px);
    border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0)); }
  .pv-card .root { zoom:1; padding:12px; min-height:0; }
  .pv-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(var(--evc-gap, 12px) * .67); }
  .pv-card .btn.pv-sel { outline: 2px dashed var(--primary-color); outline-offset: 2px; }

  /* Eigene Blöcke im Stil der aufklappbaren ha-form-Gruppen */
  .xp { display:block; margin: 24px 0; --expansion-panel-content-padding: 0; border-radius:6px; --ha-card-border-radius:6px; }
  .xp-h { display:flex; align-items:center; gap:12px; }
  .xp-h ha-icon { color: var(--secondary-text-color); }
  .xp-h .cnt { font-size:11px; font-weight:600; padding:1px 7px; border-radius:999px; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .xp-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
  .xp-hint { font-size:12px; color: var(--secondary-text-color); line-height:1.4; margin-bottom:4px; }
  .mini-row { display:flex; align-items:center; gap:4px; }
  .mini-row ha-form { flex:1; min-width:0; }

  /* Fahrzeug-Auswahl über den Tabs */
  .vbar { display:flex; gap:6px; margin-bottom:10px; overflow-x:auto; padding:1px 1px 3px; }
  .vchip { flex:0 0 auto; display:flex; align-items:center; gap:6px; padding:5px 12px 5px 5px; border-radius:999px; cursor:pointer;
    border:1px solid var(--divider-color, rgba(127,127,127,.3)); background: var(--card-background-color, #fff);
    color: var(--primary-text-color); font: inherit; font-size:13px; font-weight:500; max-width:200px; }
  .vchip .vi { width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; --mdc-icon-size:16px; flex:0 0 auto; }
  .vchip .vn { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .vchip.active { border-color: var(--primary-color); box-shadow: inset 0 0 0 1px var(--primary-color); color: var(--primary-color); font-weight:600; }
  .vchip.add { border-style:dashed; border-color: var(--primary-color); color: var(--primary-color); padding:5px 12px; }
  .vchip.add ha-icon { --mdc-icon-size:18px; }
  .it-row.sel { border-color: var(--primary-color); box-shadow: inset 0 0 0 1px var(--primary-color); }
`;

const grid = (...schema) => ({ type: 'grid', name: '', schema });
// Farbpicker kennen nur deckende [r,g,b]-Werte. CSS-Variablen oder Farben mit
// Transparenz aus der YAML bleiben unverändert erhalten („raw“).
const toPicker = (v) => {
  if (!has(v)) return undefined;
  const p = parseColor(v);
  return p && p.alpha >= 100 ? p.rgb : undefined;
};
const isRawColor = (v) => typeof v === 'string' && has(v) && !toPicker(v);

const FIELD_DEFAULTS = { slot: 'left', size: 'normal', show_name: true, show_icon: true, show_bar: false };
const SAMPLE_BUTTONS = [
  { name: 'Standard', icon: 'mdi:ev-station' },
  { name: 'Eco', icon: 'mdi:leaf' },
  { name: 'Next Trip', icon: 'mdi:calendar-clock' },
];
const THRESHOLD_COLORS = [[244, 67, 54], [255, 152, 0], [76, 175, 80], [33, 150, 243]];

const guessOptionIcon = (o) => {
  const s = String(o).toLowerCase();
  if (/eco|öko/.test(s)) return 'mdi:leaf';
  if (/pv|solar|sonne|überschuss/.test(s)) return 'mdi:solar-power';
  if (/default|standard|normal/.test(s)) return 'mdi:ev-station';
  if (/trip|fahrt|termin|abfahrt|next/.test(s)) return 'mdi:calendar-clock';
  if (/fast|schnell|boost|max|sofort/.test(s)) return 'mdi:lightning-bolt';
  if (/off|aus|stop|pause/.test(s)) return 'mdi:power';
  return 'mdi:ev-plug-type2';
};

/* ------------------------------------------------------------------ */
/*  Editor                                                            */
/* ------------------------------------------------------------------ */

class EvChargeCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tab = EDITOR_STATE.tab;
    this._vi = EDITOR_STATE.vi || 0; // gewähltes Fahrzeug
    this._edit = null; // { kind: 'field' | 'button', idx }
    this._paneKey = null;
    this._forms = [];
  }

  connectedCallback() { this._loadHaForm(); }

  // Stellt sicher, dass ha-form geladen ist (falls noch keine andere Karte es geladen hat)
  async _loadHaForm() {
    if (customElements.get('ha-form')) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      const c = await helpers?.createCardElement({ type: 'entities', entities: [] });
      await c?.constructor?.getConfigElement?.();
    } catch (e) { /* egal */ }
  }

  setConfig(config) {
    const cfg = migrateConfig(clone(config));
    cfg.vehicles = vehiclesOf(cfg);
    this._config = cfg;
    this._vi = Math.max(0, Math.min(this._vi, cfg.vehicles.length - 1));
    if (this._edit) {
      const eff = this._eff();
      const list = this._edit.kind === 'field' ? eff.fields : eff.buttons;
      if (!list[this._edit.idx]) this._edit = null;
    }
    this._refresh();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._refresh();
    else {
      this._pushHass();
      this._renderPreview();
    }
  }
  get hass() { return this._hass; }

  /* ---------- Hilfen ---------- */

  _t(path) {
    const v = deepGet(T, path);
    return v === undefined ? path.split('.').pop() : v;
  }

  _opts(key, values, withInherit = false) {
    const list = values.map((v) => ({ value: String(v), label: this._t(`opt.${key}.${v}`) }));
    if (withInherit) list.unshift({ value: 'inherit', label: T.inherit });
    return { select: { mode: 'dropdown', options: list } };
  }

  _num(min, max, step = 1, unit = '', mode = 'slider') {
    return { number: { min, max, step, mode, ...(unit ? { unit_of_measurement: unit } : {}) } };
  }

  _group(key, icon, schema, expanded = false) {
    return { type: 'expandable', name: '', flatten: true, title: this._t(`groups.${key}`), icon, expanded, schema };
  }

  _val(key) {
    const v = this._config?.[key];
    return has(v) ? v : DEFAULTS[key];
  }

  _pushHass() {
    this.shadowRoot.querySelectorAll('ha-form').forEach((f) => { f.hass = this._hass; });
  }

  // Gewähltes Fahrzeug: roh (_veh) und mit Karten-Einstellungen zusammengeführt (_eff)
  _veh() { return this._config.vehicles[this._vi] || {}; }
  _eff() { return vehCfg(this._config, this._vi); }
  _type() { return vehicleType(this._veh()); }

  _curField() { return (this._edit && this._eff().fields[this._edit.idx]) || {}; }
  _curButton() { return (this._edit && this._eff().buttons[this._edit.idx]) || {}; }

  _setVehicle(v) {
    const vehicles = [...this._config.vehicles];
    vehicles[this._vi] = v;
    this._emit({ ...this._config, vehicles });
  }

  _setVehProp(key, value) {
    const v = { ...this._veh() };
    if (value === undefined || (Array.isArray(value) && !value.length)) delete v[key];
    else v[key] = value;
    this._setVehicle(v);
  }

  /* ---------- Schemas: oberste Ebene ---------- */

  _schemaGeneral() {
    const v = this._veh();
    return [
      { name: 'vehicle_type', selector: this._opts('vehicle_type', VEHICLE_TYPES) },
      { name: 'title', selector: { text: {} } },
      grid({ name: 'title_icon', selector: { icon: {} } }, { name: 'subtitle', selector: { text: {} } }),
      { name: 'subtitle_entity', selector: { entity: {} } },
      this._group('vehicle_color', 'mdi:palette-outline', [
        { name: 'own_accent', selector: { boolean: {} } },
        ...(has(v.accent_color) ? [{ name: 'accent_color', selector: { color_rgb: {} } }] : []),
      ], has(v.accent_color)),
      this._group('title_actions', 'mdi:gesture-tap', [
        { name: 'title_tap_action', selector: { ui_action: {} } },
        { name: 'title_hold_action', selector: { ui_action: {} } },
      ]),
    ];
  }

  _vehData() {
    const d = { ...this._veh() };
    d.vehicle_type = vehicleType(d);
    d.own_accent = has(d.accent_color);
    d.accent_color = toPicker(d.accent_color);
    return d;
  }

  _vehChanged(value) {
    const old = this._veh();
    const v = {};
    Object.entries(value).forEach(([k, x]) => { if (has(x)) v[k] = x; });
    if (v.own_accent) {
      if (!has(v.accent_color)) v.accent_color = isRawColor(old.accent_color) ? old.accent_color : (toPicker(this._config.accent_color) || [3, 169, 244]);
    } else delete v.accent_color;
    delete v.own_accent;
    // Titel-Symbol folgt dem Antrieb, solange es das Standard-Symbol ist
    const oldType = vehicleType(old);
    const newType = vehicleType(v);
    if (newType !== oldType && (!has(old.title_icon) || old.title_icon === TYPE_ICONS[oldType])) v.title_icon = TYPE_ICONS[newType];
    this._setVehicle(v);
  }

  _schemaDisplay() {
    return [
      this._group('carousel', 'mdi:car-multiple', [
        { name: 'show_dots', selector: { boolean: {} } },
        { name: 'swipe', selector: { boolean: {} } },
        { name: 'remember_vehicle', selector: { boolean: {} } },
      ], this._config.vehicles.length > 1),
      this._group('arrangement', 'mdi:view-split-vertical', [
        grid(
          { name: 'image_position', selector: this._opts('image_position', ['right', 'left']) },
          { name: 'title_position', selector: this._opts('title_position', ['top', 'column']) },
        ),
        { name: 'left_width', selector: this._num(20, 80, 1, '%') },
        { name: 'right_columns', selector: this._num(1, 3, 1, '', 'box') },
      ], true),
      this._group('size', 'mdi:resize', [
        { name: 'scale', selector: this._num(0.5, 2, 0.05, '×') },
        grid(
          { name: 'min_height', selector: this._num(0, 1000, 10, 'px', 'box') },
          { name: 'card_height', selector: this._num(0, 1000, 10, 'px', 'box') },
        ),
        { name: 'stack_below', selector: this._num(0, 1000, 10, 'px', 'box') },
      ], true),
    ];
  }

  _schemaDesign() {
    const v = (k) => this._val(k);
    const tintable = (k) => ['tinted', 'accent', 'custom'].includes(v(k));
    const hasImg = has(this._config.background_image);
    return [
      { name: 'accent_color', selector: { color_rgb: {} } },
      this._group('card_bg', 'mdi:card-outline', [
        { name: 'card_bg_mode', selector: this._opts('bg_mode', ['theme', 'tinted', 'accent', 'custom', 'none']) },
        ...(v('card_bg_mode') === 'custom' ? [{ name: 'card_bg_color', selector: { color_rgb: {} } }] : []),
        ...(v('card_bg_mode') !== 'none' ? [{ name: 'card_bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
        ...(tintable('card_bg_mode') ? [{ name: 'card_bg_gradient', selector: { boolean: {} } }] : []),
        { name: 'card_blur', selector: this._num(0, 30, 1, 'px') },
      ], true),
      this._group('card_image', 'mdi:image-filter-hdr', [
        { name: 'background_image', selector: { text: {} } },
        ...(hasImg ? [
          grid(
            { name: 'background_size', selector: { select: { mode: 'dropdown', custom_value: true, options: ['cover', 'contain', 'auto', '100% 100%'] } } },
            { name: 'background_position', selector: { select: { mode: 'dropdown', custom_value: true, options: ['center', 'top', 'bottom', 'left', 'right'] } } },
          ),
          { name: 'overlay_color', selector: { color_rgb: {} } },
          { name: 'overlay_opacity', selector: this._num(0, 100, 1, '%') },
        ] : []),
      ]),
      this._group('card_frame', 'mdi:square-rounded-outline', [
        { name: 'card_border_mode', selector: this._opts('card_border_mode', ['theme', 'none', 'accent', 'custom']) },
        ...(v('card_border_mode') === 'custom' ? [{ name: 'card_border_color', selector: { color_rgb: {} } }] : []),
        ...(['accent', 'custom'].includes(v('card_border_mode')) ? [{ name: 'card_border_width', selector: this._num(1, 6, 1, 'px') }] : []),
        { name: 'card_shadow', selector: this._opts('shadow', ['theme', 'none', 'soft', 'strong']) },
        { name: 'card_radius', selector: this._num(0, 40, 1, 'px') },
        { name: 'padding', selector: this._num(4, 40, 1, 'px') },
        { name: 'gap', selector: this._num(0, 32, 1, 'px') },
      ]),
      this._group('bg', 'mdi:format-color-fill', [
        { name: 'bg_mode', selector: this._opts('bg_mode', ['theme', 'tinted', 'accent', 'custom', 'none']) },
        ...(v('bg_mode') === 'custom' ? [{ name: 'bg_color', selector: { color_rgb: {} } }] : []),
        ...(v('bg_mode') !== 'none' ? [{ name: 'bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
        ...(tintable('bg_mode') ? [{ name: 'bg_gradient', selector: { boolean: {} } }] : []),
        { name: 'blur', selector: this._num(0, 30, 1, 'px') },
      ]),
      this._group('icon', 'mdi:emoticon-outline', [
        { name: 'icon_size', selector: this._num(12, 48, 1, 'px') },
        grid(
          { name: 'icon_color_mode', selector: this._opts('icon_color_mode', ['auto', 'accent', 'text', 'custom']) },
          { name: 'icon_bg_mode', selector: this._opts('icon_bg_mode', ['none', 'accent', 'theme', 'custom']) },
        ),
        ...(v('icon_color_mode') === 'custom' ? [{ name: 'icon_color', selector: { color_rgb: {} } }] : []),
        ...(v('icon_bg_mode') === 'custom' ? [{ name: 'icon_bg_color', selector: { color_rgb: {} } }] : []),
        ...(v('icon_bg_mode') !== 'none' ? [
          { name: 'icon_bg_opacity', selector: this._num(0, 100, 1, '%') },
          { name: 'icon_shape', selector: this._opts('icon_shape', ['circle', 'rounded', 'square']) },
        ] : []),
      ]),
      this._group('text', 'mdi:format-text', [
        { name: 'text_color_mode', selector: this._opts('text_color_mode', ['auto', 'theme', 'custom']) },
        ...(v('text_color_mode') === 'custom' ? [{ name: 'text_color', selector: { color_rgb: {} } }] : []),
        { name: 'title_size', selector: this._num(10, 40, 1, 'px') },
        { name: 'label_size', selector: this._num(8, 24, 1, 'px') },
        { name: 'value_size', selector: this._num(10, 40, 1, 'px') },
      ]),
      this._group('frame', 'mdi:rounded-corner', [
        { name: 'border_mode', selector: this._opts('border_mode', ['none', 'accent', 'theme', 'custom']) },
        ...(v('border_mode') === 'custom' ? [{ name: 'border_color', selector: { color_rgb: {} } }] : []),
        ...(v('border_mode') !== 'none' ? [{ name: 'border_width', selector: this._num(1, 6, 1, 'px') }] : []),
        { name: 'shadow', selector: this._opts('shadow', ['theme', 'none', 'soft', 'strong']) },
        { name: 'radius', selector: this._num(0, 40, 1, 'px') },
        { name: 'tile_padding', selector: this._num(0, 24, 1, 'px') },
      ]),
      this._group('highlight', 'mdi:star-four-points-outline', [
        { name: 'highlight', selector: this._opts('highlight', ['none', 'glow', 'pulse', 'border', 'scale']) },
      ]),
    ];
  }

  _formData() {
    const d = { ...this._config };
    Object.keys(DEFAULTS).forEach((k) => { if (!has(d[k])) d[k] = this._val(k); });
    ROOT_COLOR_KEYS.forEach((k) => { d[k] = toPicker(d[k]); });
    return d;
  }

  /* ---------- Schemas: Fahrzeug ---------- */

  _schemaImage() {
    return [
      this._group('image', 'mdi:image-outline', [
        { name: 'url', selector: { text: {} } },
        { name: 'entity', selector: { entity: {} } },
        { name: 'size', selector: this._num(10, 200, 1, '%') },
        { name: 'max_height', selector: this._num(20, 600, 5, 'px') },
        grid(
          { name: 'offset_x', selector: this._num(-300, 300, 1, 'px', 'box') },
          { name: 'offset_y', selector: this._num(-300, 300, 1, 'px', 'box') },
        ),
        grid({ name: 'flip', selector: { boolean: {} } }, { name: 'shadow', selector: { boolean: {} } }),
        { name: 'hide', selector: { boolean: {} } },
      ], true),
      ...(this._type() !== 'combustion' ? [this._group('glow', 'mdi:shimmer', [
        { name: 'glow_entity', selector: { entity: {} } },
        grid({ name: 'glow_state', selector: { text: {} } }, { name: 'glow_color', selector: { color_rgb: {} } }),
      ], true)] : []),
      this._group('image_actions', 'mdi:gesture-tap', [
        { name: 'tap_action', selector: { ui_action: {} } },
        { name: 'hold_action', selector: { ui_action: {} } },
      ]),
    ];
  }

  _imageData() {
    const d = { ...(this._veh().image || {}) };
    Object.entries(IMAGE_DEFAULTS).forEach(([k, v]) => { if (!has(d[k])) d[k] = v; });
    d.glow_color = toPicker(d.glow_color);
    return d;
  }

  _schemaCC() {
    const dom = { entity: { filter: { domain: ['button', 'input_button', 'script', 'scene', 'automation', 'switch', 'input_boolean'] } } };
    return [
      this._group('cc', 'mdi:play-pause', [
        grid({ name: 'start_entity', selector: dom }, { name: 'stop_entity', selector: dom }),
        grid({ name: 'show_entity', selector: { entity: {} } }, { name: 'show_state', selector: { text: {} } }),
        grid({ name: 'charging_entity', selector: { entity: {} } }, { name: 'charging_state', selector: { text: {} } }),
        grid({ name: 'show_names', selector: { boolean: {} } }, { name: 'confirm', selector: { boolean: {} } }),
      ], true),
      this._group('cc_look', 'mdi:palette-swatch-outline', [
        grid({ name: 'start_name', selector: { text: {} } }, { name: 'stop_name', selector: { text: {} } }),
        grid({ name: 'start_icon', selector: { icon: {} } }, { name: 'stop_icon', selector: { icon: {} } }),
        grid({ name: 'start_color', selector: { color_rgb: {} } }, { name: 'stop_color', selector: { color_rgb: {} } }),
        { name: 'size', selector: this._num(24, 72, 1, 'px') },
      ]),
      this._group('cc_actions', 'mdi:script-text-outline', [
        { name: 'start_action', selector: { ui_action: {} } },
        { name: 'stop_action', selector: { ui_action: {} } },
      ]),
    ];
  }

  _schemaFuel() {
    return [
      this._group('fuel', 'mdi:gas-station', [
        { name: 'entity', selector: { entity: {} } },
        { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } },
        grid(
          { name: 'threshold', selector: this._num(0, 10000, 1, '', 'box') },
          { name: 'color', selector: { color_rgb: {} } },
        ),
      ], true),
    ];
  }

  _fuelData() {
    const d = { ...(this._veh().fuel || {}) };
    if (!has(d.threshold)) d.threshold = FUEL_DEFAULTS.threshold;
    d.color = toPicker(d.color) || (isRawColor(d.color) ? undefined : FUEL_DEFAULTS.color);
    return d;
  }

  _ccData() {
    const d = { ...(this._veh().charge_control || {}) };
    Object.entries(CC_DEFAULTS).forEach(([k, v]) => { if (!has(d[k])) d[k] = v; });
    d.start_color = toPicker(d.start_color);
    d.stop_color = toPicker(d.stop_color);
    return d;
  }

  /* ---------- Schemas: Werte ---------- */

  _schemaFieldA(f) {
    const eff = (k) => pick(f, this._eff(), k);
    const set = (k) => has(f[k]) && f[k] !== 'inherit';
    return [
      this._group('value', 'mdi:numeric', [
        { name: 'entity', required: true, selector: { entity: {} } },
        { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } },
        grid({ name: 'name', selector: { text: {} } }, { name: 'unit', selector: { text: {} } }),
        grid(
          { name: 'decimals', selector: this._num(0, 4, 1, '', 'box') },
          { name: 'multiply', selector: { number: { min: -1000000, max: 1000000, step: 'any', mode: 'box' } } },
        ),
      ], true),
      this._group('placement', 'mdi:view-split-vertical', [
        grid(
          { name: 'slot', selector: this._opts('slot', ['left', 'right']) },
          { name: 'size', selector: this._opts('size', ['small', 'normal', 'large']) },
        ),
        grid({ name: 'show_name', selector: { boolean: {} } }, { name: 'show_icon', selector: { boolean: {} } }),
      ], true),
      this._group('look', 'mdi:palette-swatch-outline', [
        { name: 'color', selector: { color_rgb: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        grid(
          { name: 'icon_color_mode', selector: this._opts('icon_color_mode', ['auto', 'accent', 'text', 'custom'], true) },
          { name: 'icon_bg_mode', selector: this._opts('icon_bg_mode', ['none', 'accent', 'theme', 'custom'], true) },
        ),
        { name: 'icon_shape', selector: this._opts('icon_shape', ['circle', 'rounded', 'square'], true) },
        ...(eff('icon_color_mode') === 'custom' ? [{ name: 'icon_color', selector: { color_rgb: {} } }] : []),
        ...(eff('icon_bg_mode') === 'custom' ? [{ name: 'icon_bg_color', selector: { color_rgb: {} } }] : []),
        ...(set('icon_bg_mode') && f.icon_bg_mode !== 'none' ? [{ name: 'icon_bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
      ], true),
      this._group('progress', 'mdi:progress-check', [
        { name: 'show_bar', selector: { boolean: {} } },
        ...(f.show_bar ? [grid(
          { name: 'bar_min', selector: { number: { min: -100000, max: 100000, step: 'any', mode: 'box' } } },
          { name: 'bar_max', selector: { number: { min: -100000, max: 100000, step: 'any', mode: 'box' } } },
        )] : []),
      ], !!f.show_bar),
    ];
  }

  _schemaFieldB(f) {
    const eff = (k) => pick(f, this._eff(), k);
    const set = (k) => has(f[k]) && f[k] !== 'inherit';
    return [
      this._group('item_bg', 'mdi:format-color-fill', [
        { name: 'bg_mode', selector: this._opts('bg_mode', ['theme', 'tinted', 'accent', 'custom', 'none'], true) },
        ...(eff('bg_mode') === 'custom' ? [{ name: 'bg_color', selector: { color_rgb: {} } }] : []),
        ...(set('bg_mode') && f.bg_mode !== 'none' ? [{ name: 'bg_opacity', selector: this._num(0, 100, 1, '%') }] : []),
        ...(['tinted', 'accent', 'custom'].includes(eff('bg_mode')) ? [{ name: 'bg_gradient', selector: this._opts('bg_gradient', ['on', 'off'], true) }] : []),
      ]),
      this._group('item_text', 'mdi:format-text', [
        { name: 'text_color_mode', selector: this._opts('text_color_mode', ['auto', 'theme', 'custom'], true) },
        ...(eff('text_color_mode') === 'custom' ? [{ name: 'text_color', selector: { color_rgb: {} } }] : []),
        grid(
          { name: 'border_mode', selector: this._opts('border_mode', ['none', 'accent', 'theme', 'custom'], true) },
          { name: 'shadow', selector: this._opts('shadow', ['theme', 'none', 'soft', 'strong'], true) },
        ),
        ...(eff('border_mode') === 'custom' ? [{ name: 'border_color', selector: { color_rgb: {} } }] : []),
        ...(set('border_mode') && f.border_mode !== 'none' ? [{ name: 'border_width', selector: this._num(1, 6, 1, 'px') }] : []),
      ]),
      this._group('field_actions', 'mdi:gesture-tap', [
        { name: 'tap_action', selector: { ui_action: {} } },
        { name: 'hold_action', selector: { ui_action: {} } },
      ]),
    ];
  }

  // Formulardaten inkl. Standardwerte (damit Regler/Auswahl den echten Wert zeigen)
  _fieldData() {
    const d = { ...this._curField() };
    Object.entries(FIELD_DEFAULTS).forEach(([k, v]) => { if (!has(d[k])) d[k] = v; });
    ITEM_STYLE_KEYS.forEach((k) => {
      if (d[k] === undefined) {
        if (['bg_opacity', 'icon_bg_opacity', 'border_width'].includes(k)) d[k] = this._val(k);
        else if (!FIELD_COLOR_KEYS.includes(k)) d[k] = 'inherit';
      } else if (k === 'bg_gradient' && typeof d[k] === 'boolean') d[k] = d[k] ? 'on' : 'off';
    });
    FIELD_COLOR_KEYS.forEach((k) => { d[k] = toPicker(d[k]); });
    if (d.show_bar) {
      if (!has(d.bar_min)) d.bar_min = 0;
      if (!has(d.bar_max)) d.bar_max = 100;
    }
    return d;
  }

  /* ---------- Schemas: Buttons ---------- */

  _schemaBar() {
    return [
      this._group('bar', 'mdi:dots-horizontal-circle-outline', [
        { name: 'entity', selector: { entity: { filter: { domain: ['select', 'input_select'] } } } },
        grid(
          { name: 'style', selector: this._opts('bar_style', ['segmented', 'separate']) },
          { name: 'height', selector: this._num(24, 96, 1, 'px', 'box') },
        ),
        grid({ name: 'show_names', selector: { boolean: {} } }, { name: 'show_icons', selector: { boolean: {} } }),
        { name: 'hide', selector: { boolean: {} } },
      ], true),
      this._group('bar_colors', 'mdi:palette-outline', [
        grid({ name: 'active_color', selector: { color_rgb: {} } }, { name: 'active_text_color', selector: { color_rgb: {} } }),
        { name: 'background', selector: { color_rgb: {} } },
      ]),
    ];
  }

  _barData() {
    const d = { ...(this._veh().button_bar || {}) };
    Object.entries(BAR_DEFAULTS).forEach(([k, v]) => { if (!has(d[k])) d[k] = v; });
    ['active_color', 'active_text_color', 'background'].forEach((k) => { d[k] = toPicker(d[k]); });
    return d;
  }

  _schemaButton(b) {
    const type = b.type || 'option';
    const ent = b.entity || this._veh().button_bar?.entity;
    const options = (ent && this._hass?.states?.[ent]?.attributes?.options) || [];
    return [
      this._group('function', 'mdi:cog-outline', [
        { name: 'type', selector: this._opts('btn_type', ['option', 'action']) },
        ...(type === 'option' ? [
          { name: 'option', selector: { select: { mode: 'dropdown', custom_value: true, options: options.map((o) => ({ value: o, label: o })) } } },
          { name: 'entity', selector: { entity: { filter: { domain: ['select', 'input_select'] } } } },
        ] : [
          grid({ name: 'entity', selector: { entity: {} } }, { name: 'active_state', selector: { text: {} } }),
        ]),
      ], true),
      this._group('btn_look', 'mdi:palette-swatch-outline', [
        grid({ name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} } }),
        grid({ name: 'color', selector: { color_rgb: {} } }, { name: 'width', selector: this._num(0.25, 6, 0.25, '', 'box') }),
      ], true),
      this._group('button_actions', 'mdi:gesture-tap', [
        ...(type === 'action' ? [{ name: 'tap_action', selector: { ui_action: {} } }] : []),
        { name: 'hold_action', selector: { ui_action: {} } },
      ]),
    ];
  }

  _buttonData() {
    const d = { ...this._curButton() };
    if (!has(d.type)) d.type = 'option';
    if (!has(d.width)) d.width = 1;
    d.color = toPicker(d.color);
    return d;
  }

  /* ---------- Rendering ---------- */

  _refresh() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    this._tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === this._tab));
    this._renderVbar();
    const key = `${this._tab}:${this._vi}:${this._type()}:${this._edit ? `${this._edit.kind}-${this._edit.idx}` : ''}`;
    if (key !== this._paneKey) { this._paneKey = key; this._renderPane(); }
    this._updatePane();
  }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${CARD_CSS}${EDITOR_CSS}</style><div class="vbar"></div><div class="tabs"></div><div class="pane"></div>`;
    this._vbarEl = this.shadowRoot.querySelector('.vbar');
    this._tabsEl = this.shadowRoot.querySelector('.tabs');
    this._paneEl = this.shadowRoot.querySelector('.pane');
    EDITOR_TABS.forEach((tab) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.type = 'button';
      b.dataset.tab = tab.id;
      b.innerHTML = `<ha-icon icon="${tab.icon}"></ha-icon><span>${esc(this._t(`tabs.${tab.id}`))}</span>`;
      b.addEventListener('click', () => {
        this._tab = tab.id;
        EDITOR_STATE.tab = tab.id;
        this._edit = null;
        this._refresh();
      });
      this._tabsEl.appendChild(b);
    });
  }

  _makeForm(ns, schemaFn, dataFn, onChange) {
    const f = document.createElement('ha-form');
    f.hass = this._hass;
    f.computeLabel = (s) => (s.name ? (deepGet(T.fields, `${ns}.${s.name}`) ?? deepGet(T.fields, `root.${s.name}`) ?? s.name) : '');
    f.computeHelper = (s) => (s.name ? deepGet(T.helpers, `${ns}.${s.name}`) || '' : '');
    f.addEventListener('value-changed', (ev) => { ev.stopPropagation(); onChange({ ...ev.detail.value }); });
    this._forms.push({ el: f, schemaFn, dataFn });
    return f;
  }

  _el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  _addBtn(text, onClick, small = false) {
    const b = this._el('button', `add${small ? ' small' : ''}`, `<ha-icon icon="mdi:plus"></ha-icon>${esc(text)}`);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  _renderPane() {
    const pane = this._paneEl;
    pane.innerHTML = '';
    this._forms = [];
    this._pv = null; this._list = null; this._found = null; this._addAll = null; this._rawNote = null; this._vlist = null;
    this._thr = null; this._map = null;

    if (this._edit?.kind === 'field') { this._renderFieldEditor(pane); return; }
    if (this._edit?.kind === 'button') { this._renderButtonEditor(pane); return; }

    pane.appendChild(this._el('div', 'intro', esc(this._t(`intro.${this._tab}`))));
    const rootForm = (schemaFn) => this._makeForm('root', schemaFn, () => this._formData(), (v) => this._emit(v));

    switch (this._tab) {
      case 'general':
        pane.appendChild(this._makeForm('vehicle', () => this._schemaGeneral(), () => this._vehData(), (v) => this._vehChanged(v)));
        pane.appendChild(this._el('div', 'section-title', esc(T.vehicles_title)));
        this._vlist = this._el('div');
        pane.appendChild(this._vlist);
        {
          const row = this._el('div', 'add-row');
          VEHICLE_TYPES.forEach((type) => {
            const b = this._addBtn(T.type_short[type], () => this._addVehicle(type), true);
            b.querySelector('ha-icon').setAttribute('icon', TYPE_ICONS[type]);
            row.appendChild(b);
          });
          pane.appendChild(row);
        }
        break;
      case 'display':
        pane.appendChild(rootForm(() => this._schemaDisplay()));
        break;
      case 'vehicle':
        if (this._type() === 'combustion') pane.appendChild(this._el('div', 'muted', esc(T.combustion_note)));
        pane.appendChild(this._makeForm('image', () => this._schemaImage(), () => this._imageData(),
          (v) => this._setVehProp('image', this._cleanSub(v, IMAGE_DEFAULTS, this._veh().image, ['glow_color']))));
        if (this._type() !== 'ev') {
          pane.appendChild(this._makeForm('fuel', () => this._schemaFuel(), () => this._fuelData(),
            (v) => this._setVehProp('fuel', this._cleanSub(v, FUEL_DEFAULTS, this._veh().fuel, ['color']))));
        }
        if (this._type() !== 'combustion') {
          pane.appendChild(this._makeForm('cc', () => this._schemaCC(), () => this._ccData(),
            (v) => this._setVehProp('charge_control', this._cleanSub(v, CC_DEFAULTS, this._veh().charge_control, ['start_color', 'stop_color']))));
        }
        break;
      case 'fields':
        this._list = this._el('div');
        pane.appendChild(this._list);
        pane.appendChild(this._addBtn(T.add_field, () => this._addField({}, true)));
        pane.appendChild(this._el('div', 'section-title', esc(T.suggest_title)));
        this._found = this._el('div', 'found');
        pane.appendChild(this._found);
        break;
      case 'buttons':
        this._pv = this._el('div', 'pv');
        pane.appendChild(this._pv);
        pane.appendChild(this._makeForm('bar', () => this._schemaBar(), () => this._barData(),
          (v) => this._setVehProp('button_bar', this._cleanSub(v, BAR_DEFAULTS, this._veh().button_bar, ['active_color', 'active_text_color', 'background']))));
        pane.appendChild(this._el('div', 'section-title', esc(T.buttons_title)));
        this._list = this._el('div');
        pane.appendChild(this._list);
        {
          const row = this._el('div', 'add-row');
          row.appendChild(this._addBtn(T.add_button, () => this._addButton()));
          this._addAll = this._addBtn(T.add_all_options, () => this._addAllOptions());
          row.appendChild(this._addAll);
          pane.appendChild(row);
        }
        break;
      case 'design':
        this._pv = this._el('div', 'pv');
        pane.appendChild(this._pv);
        this._rawNote = this._el('div', 'note');
        pane.appendChild(this._rawNote);
        pane.appendChild(rootForm(() => this._schemaDesign()));
        break;
      default:
        break;
    }
  }

  _editHead(pane, title) {
    const head = this._el('div', 'ed-head',
      `<button class="ibtn back" type="button" title="${esc(T.back)}"><ha-icon icon="mdi:arrow-left"></ha-icon></button><span class="t">${esc(title)}</span>`);
    head.querySelector('.back').addEventListener('click', () => { this._edit = null; this._refresh(); });
    pane.appendChild(head);
  }

  _renderFieldEditor(pane) {
    this._editHead(pane, T.edit_field);
    this._pv = this._el('div', 'pv');
    pane.appendChild(this._pv);
    pane.appendChild(this._makeForm('field', () => this._schemaFieldA(this._curField()), () => this._fieldData(), (v) => this._fieldChanged(v)));

    const f = this._curField();
    this._mapRows = Object.entries(f.state_map && typeof f.state_map === 'object' ? f.state_map : {}).map(([state, text]) => ({ state, text: String(text ?? '') }));
    this._thr = this._xpBlock('thresholds', 'mdi:gradient-horizontal', T.thresholds_hint, T.add_threshold, () => this._addThreshold(),
      (f.color_thresholds || []).length > 0);
    pane.appendChild(this._thr.el);
    this._map = this._xpBlock('state_map', 'mdi:translate', T.map_hint, T.add_mapping, () => this._addMapping(), this._mapRows.length > 0);
    pane.appendChild(this._map.el);

    pane.appendChild(this._makeForm('field', () => this._schemaFieldB(this._curField()), () => this._fieldData(), (v) => this._fieldChanged(v)));
  }

  _renderButtonEditor(pane) {
    this._editHead(pane, T.edit_button);
    this._pv = this._el('div', 'pv');
    pane.appendChild(this._pv);
    pane.appendChild(this._makeForm('button', () => this._schemaButton(this._curButton()), () => this._buttonData(), (v) => this._buttonChanged(v)));
  }

  // Aufklappbarer Block im Stil der ha-form-Gruppen (für die kleinen Listen)
  _xpBlock(key, icon, hint, addText, onAdd, expanded) {
    const el = document.createElement('ha-expansion-panel');
    el.className = 'xp';
    el.setAttribute('outlined', '');
    el.outlined = true;
    el.expanded = !!expanded;
    if (expanded) el.setAttribute('expanded', '');
    const head = this._el('div', 'xp-h', `<ha-icon icon="${icon}"></ha-icon><span>${esc(this._t(`groups.${key}`))}</span><span class="cnt"></span>`);
    head.setAttribute('slot', 'header');
    el.appendChild(head);
    const body = this._el('div', 'xp-body');
    body.appendChild(this._el('div', 'xp-hint', esc(hint)));
    const rows = this._el('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    body.appendChild(rows);
    body.appendChild(this._addBtn(addText, onAdd, true));
    el.appendChild(body);
    return { el, rows, hintEl: body.firstChild, cnt: head.querySelector('.cnt'), forms: [] };
  }

  _miniForm(ns, schema, onChange) {
    const f = document.createElement('ha-form');
    f.hass = this._hass;
    f.schema = schema;
    f.computeLabel = (s) => (s.name ? deepGet(T.fields, `${ns}.${s.name}`) ?? s.name : '');
    f.addEventListener('value-changed', (ev) => { ev.stopPropagation(); onChange({ ...ev.detail.value }); });
    return f;
  }

  _miniRows(box, count, makeSchema, ns, onChange, onDelete) {
    if (box.forms.length === count) return;
    box.rows.innerHTML = '';
    box.forms = [];
    for (let i = 0; i < count; i += 1) {
      const row = this._el('div', 'mini-row');
      const form = this._miniForm(ns, makeSchema(), (v) => onChange(i, v));
      row.appendChild(form);
      const del = this._el('button', 'ibtn del', '<ha-icon icon="mdi:delete-outline"></ha-icon>');
      del.type = 'button';
      del.title = T.delete;
      del.addEventListener('click', () => onDelete(i));
      row.appendChild(del);
      box.rows.appendChild(row);
      box.forms.push(form);
    }
  }

  _updatePane() {
    this._forms.forEach(({ el, schemaFn, dataFn }) => {
      el.hass = this._hass;
      el.schema = schemaFn();
      el.data = dataFn();
    });
    this._renderPreview();
    if (this._list && this._tab === 'fields') this._renderFieldList();
    if (this._list && this._tab === 'buttons') this._renderButtonList();
    if (this._found) this._renderSuggestions();
    if (this._vlist) this._renderVehicleList();
    if (this._thr) this._renderThresholds();
    if (this._map) this._renderMappings();
    if (this._rawNote) {
      const raw = this._config.card_background;
      this._rawNote.style.display = has(raw) ? '' : 'none';
      this._rawNote.textContent = has(raw) ? `${T.raw_css} ${raw}` : '';
    }
    if (this._addAll) {
      const ent = this._veh().button_bar?.entity;
      const opts = (ent && this._hass.states[ent]?.attributes?.options) || [];
      const used = new Set(this._eff().buttons.map((b) => b?.option));
      this._addAll.style.display = opts.some((o) => !used.has(o)) ? '' : 'none';
    }
  }

  _pvProps() {
    const p = cardDesign(this._eff());
    delete p.height;
    delete p['--evc-min-h'];
    delete p['--evc-scale'];
    return p;
  }

  _renderPreview() {
    if (!this._pv || !this._config) return;
    const cfg = this._eff();
    const hass = this._hass;
    let inner = '';
    if (this._edit?.kind === 'field') {
      inner = `<div class="pv-grid" style="grid-template-columns:1fr">${renderField(this._curField(), this._edit.idx, cfg, hass)}</div>`;
    } else if (this._edit?.kind === 'button') {
      inner = renderBar(cfg, hass, { selected: this._edit.idx, force: true });
    } else if (this._tab === 'buttons') {
      inner = cfg.buttons.length ? renderBar(cfg, hass, { force: true }) : `<div class="muted">${esc(T.no_buttons)}</div>`;
    } else if (this._tab === 'design') {
      const real = cfg.fields.filter((f) => f && f.entity).slice(0, 2);
      const tiles = real.length
        ? real.map((f) => renderField(f, cfg.fields.indexOf(f), cfg, hass))
        : [
          renderField({ name: T.sample_soc, icon: 'mdi:battery-70', show_bar: true }, 0, cfg, hass, { text: '72', unit: '%', num: 72 }),
          renderField({ name: T.sample_range, icon: 'mdi:map-marker-distance' }, 1, cfg, hass, { text: '243', unit: 'km', num: 243 }),
        ];
      const bar = cfg.buttons.length
        ? renderBar(cfg, hass, { force: true })
        : renderBar(cfg, hass, { force: true, buttons: SAMPLE_BUTTONS, activeFn: (b, i) => i === 1 });
      inner = `${renderHeader(cfg, hass)}<div class="pv-grid">${tiles.join('')}</div>${bar}`;
    }
    this._pv.innerHTML = `<div class="pv-label">${esc(T.preview)}</div><div class="evc pv-card" style="${esc(styleString(this._pvProps()))}"><div class="root"><div class="slide">${inner}</div></div></div>`;
  }

  _rowHtml(icon, color, name, sub, i, n) {
    return `
      <div class="it-ico" style="background:${withAlpha(color, 20)};color:${color}"><ha-icon icon="${esc(icon)}"></ha-icon></div>
      <div class="it-txt"><div class="it-name">${esc(name)}</div><div class="it-sub">${sub}</div></div>
      <button class="ibtn" data-a="up" title="${esc(T.move_up)}" ${i === 0 ? 'disabled' : ''}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
      <button class="ibtn" data-a="down" title="${esc(T.move_down)}" ${i === n - 1 ? 'disabled' : ''}><ha-icon icon="mdi:chevron-down"></ha-icon></button>
      <button class="ibtn" data-a="edit" title="${esc(T.edit)}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>
      <button class="ibtn del" data-a="del" title="${esc(T.delete)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>`;
  }

  _bindRow(row, key, i) {
    row.addEventListener('click', (ev) => {
      const btn = ev.composedPath().find((n) => n.dataset && n.dataset.a);
      ev.stopPropagation();
      this._listAction(key, btn ? btn.dataset.a : 'edit', i);
    });
  }

  _renderFieldList() {
    const cfg = this._eff();
    const hass = this._hass;
    const list = this._list;
    list.innerHTML = '';
    if (!cfg.fields.length) list.appendChild(this._el('div', 'muted', esc(T.no_fields)));
    cfg.fields.forEach((raw, i) => {
      const f = raw || {};
      const st = hass.states[f.entity];
      const v = fieldValue(f, st, hass);
      const accent = colorInfo(thresholdColor(f, v.num)) || colorInfo(f.color) || accentOf(cfg);
      const name = f.name || st?.attributes?.friendly_name || f.entity || T.new_field;
      const pos = f.slot === 'right' ? T.right : T.left;
      const size = f.size && f.size !== 'normal' ? ` · ${this._t(`opt.size.${f.size}`)}` : '';
      const sub = f.entity
        ? `${esc(v.text)}${v.unit ? ` ${esc(v.unit)}` : ''} · ${esc(pos)}${esc(size)}`
        : `<span class="un">${esc(T.no_entity)}</span>`;
      const row = this._el('div', 'it-row', this._rowHtml(fieldIcon(f, st, v.num), accent.css, name, sub, i, cfg.fields.length));
      this._bindRow(row, 'fields', i);
      list.appendChild(row);
    });
  }

  _renderButtonList() {
    const cfg = this._eff();
    const bb = cfg.button_bar || {};
    const list = this._list;
    list.innerHTML = '';
    const barOpts = (bb.entity && this._hass.states[bb.entity]?.attributes?.options) || [];
    cfg.buttons.forEach((raw, i) => {
      const b = raw || {};
      const action = b.type === 'action';
      const color = (colorInfo(b.color) || colorInfo(bb.active_color) || accentOf(cfg)).css;
      const icon = b.icon || (action ? 'mdi:star-outline' : 'mdi:radiobox-marked');
      const name = b.name || b.option || (action && b.entity ? this._hass.states[b.entity]?.attributes?.friendly_name : '') || (action ? T.action : T.new_button);
      let sub;
      if (action) sub = `${esc(T.action)} · ${esc(b.entity || T.no_action_entity)}`;
      else {
        const ent = b.entity || bb.entity;
        const opts = b.entity ? (this._hass.states[b.entity]?.attributes?.options || []) : barOpts;
        const missing = ent && opts.length && has(b.option) && !opts.includes(b.option);
        sub = `${esc(T.option)} „${esc(b.option ?? '–')}“${missing ? ` · <span class="un">${esc(T.option_missing)}</span>` : ''}`;
      }
      const row = this._el('div', 'it-row', this._rowHtml(icon, color, name, sub, i, cfg.buttons.length));
      this._bindRow(row, 'buttons', i);
      list.appendChild(row);
    });
  }

  // Weitere Entitäten der Geräte, die schon in der Karte stecken (Auto, Wallbox)
  _suggestionIds() {
    const hass = this._hass;
    const cfg = this._eff();
    const cc = cfg.charge_control || {};
    const used = new Set(cfg.fields.map((f) => f?.entity).filter(Boolean));
    const refs = [
      ...cfg.fields.map((f) => f?.entity), cfg.button_bar?.entity, cfg.image?.glow_entity, cfg.subtitle_entity,
      cc.start_entity, cc.stop_entity, cc.charging_entity, cc.show_entity, cfg.fuel?.entity,
    ].filter(Boolean);
    const devices = new Set(refs.map((e) => hass.entities?.[e]?.device_id).filter(Boolean));
    const re = /(vehicle|fahrzeug|\bcar\b|_car_|auto_|ev_|wallbox|charg|lade|range|reichweite|battery_level|soc|fuel|tank|kraftstoff|benzin|diesel|odometer|kilometer)/i;
    const byDevice = [];
    const byName = [];
    Object.keys(hass.states).forEach((id) => {
      if (!/^(sensor|binary_sensor|number|device_tracker)\./.test(id) || used.has(id)) return;
      const ent = hass.entities?.[id];
      if (ent?.hidden || ent?.entity_category === 'config') return;
      if (devices.size && devices.has(ent?.device_id)) byDevice.push(id);
      else if (re.test(id) || re.test(hass.states[id].attributes?.friendly_name || '')) byName.push(id);
    });
    const name = (id) => hass.states[id].attributes?.friendly_name || id;
    const sortFn = (a, b) => name(a).localeCompare(name(b));
    return [...byDevice.sort(sortFn), ...byName.sort(sortFn)].slice(0, 12);
  }

  _renderSuggestions() {
    const hass = this._hass;
    const el = this._found;
    const ids = this._suggestionIds();
    el.innerHTML = '';
    if (!ids.length) { el.appendChild(this._el('div', 'muted', esc(T.suggest_none))); return; }
    ids.forEach((id) => {
      const st = hass.states[id];
      const v = fieldValue({ entity: id }, st, hass);
      const row = this._el('div', 'found-row',
        `<span class="s">${esc(st.attributes?.friendly_name || id)}</span><span class="m">${esc(v.text)}${v.unit ? ` ${esc(v.unit)}` : ''}</span>
         <button class="ibtn" type="button" title="${esc(T.suggest_add)}"><ha-icon icon="mdi:plus-circle-outline"></ha-icon></button>`);
      row.querySelector('button').addEventListener('click', () => this._addField({ entity: id }, true));
      el.appendChild(row);
    });
  }

  _renderThresholds() {
    const box = this._thr;
    const list = Array.isArray(this._curField().color_thresholds) ? this._curField().color_thresholds : [];
    box.cnt.textContent = list.length ? String(list.length) : '';
    box.cnt.style.display = list.length ? '' : 'none';
    this._miniRows(box, list.length,
      () => [grid(
        { name: 'from', selector: { number: { min: -100000, max: 100000, step: 'any', mode: 'box' } } },
        { name: 'color', selector: { color_rgb: {} } },
      )],
      'thr', (i, v) => this._thresholdChanged(i, v), (i) => this._thresholdRemove(i));
    box.forms.forEach((fm, i) => {
      fm.hass = this._hass;
      fm.data = { from: list[i]?.from, color: toPicker(list[i]?.color) };
    });
  }

  _renderMappings() {
    const box = this._map;
    const rows = this._mapRows || [];
    box.cnt.textContent = rows.length ? String(rows.length) : '';
    box.cnt.style.display = rows.length ? '' : 'none';
    const f = this._curField();
    const st = this._hass.states[f.entity];
    const cur = st ? (f.attribute ? st.attributes?.[f.attribute] : st.state) : undefined;
    box.hintEl.textContent = has(cur) ? `${T.map_hint} ${T.current_state}: „${cur}“.` : T.map_hint;
    this._miniRows(box, rows.length,
      () => [grid({ name: 'state', selector: { text: {} } }, { name: 'text', selector: { text: {} } })],
      'map', (i, v) => this._mappingChanged(i, v), (i) => this._mappingRemove(i));
    box.forms.forEach((fm, i) => {
      fm.hass = this._hass;
      fm.data = { state: rows[i]?.state ?? '', text: rows[i]?.text ?? '' };
    });
  }

  /* ---------- Listen-Aktionen ---------- */

  _listAction(key, action, i) {
    if (key === 'vehicles') { this._vehicleAction(action, i); return; }
    const list = [...this._eff()[key]];
    if (action === 'up' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; this._setVehProp(key, list); }
    else if (action === 'down' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; this._setVehProp(key, list); }
    else if (action === 'del') { list.splice(i, 1); this._setVehProp(key, list); }
    else if (action === 'edit') { this._edit = { kind: key === 'fields' ? 'field' : 'button', idx: i }; this._refresh(); }
  }

  /* ---------- Fahrzeuge ---------- */

  _renderVbar() {
    const bar = this._vbarEl;
    if (!bar) return;
    bar.innerHTML = '';
    this._config.vehicles.forEach((v, i) => {
      const type = vehicleType(v);
      const acc = accentOf(vehCfg(this._config, i)).css;
      const chip = this._el('button', `vchip${i === this._vi ? ' active' : ''}`,
        `<span class="vi" style="background:${withAlpha(acc, 20)};color:${acc}"><ha-icon icon="${esc(v.title_icon || TYPE_ICONS[type])}"></ha-icon></span><span class="vn">${esc(v.title || `${T.vehicle} ${i + 1}`)}</span>`);
      chip.type = 'button';
      chip.title = this._t(`type_short.${type}`);
      chip.addEventListener('click', () => this._selectVehicle(i));
      bar.appendChild(chip);
    });
    const add = this._el('button', 'vchip add', `<ha-icon icon="mdi:plus"></ha-icon><span>${esc(T.add_vehicle)}</span>`);
    add.type = 'button';
    add.addEventListener('click', () => this._addVehicle('ev'));
    bar.appendChild(add);
  }

  _renderVehicleList() {
    const list = this._vlist;
    const vehicles = this._config.vehicles;
    list.innerHTML = '';
    vehicles.forEach((v, i) => {
      const type = vehicleType(v);
      const acc = accentOf(vehCfg(this._config, i)).css;
      const sub = `${esc(this._t(`type_short.${type}`))}${i === this._vi ? ` · ${esc(T.editing)}` : ''}`;
      const row = this._el('div', `it-row${i === this._vi ? ' sel' : ''}`,
        this._rowHtml(v.title_icon || TYPE_ICONS[type], acc, v.title || `${T.vehicle} ${i + 1}`, sub, i, vehicles.length));
      if (vehicles.length < 2) row.querySelector('[data-a="del"]').setAttribute('disabled', '');
      this._bindRow(row, 'vehicles', i);
      list.appendChild(row);
    });
  }

  _selectVehicle(i) {
    this._vi = i;
    EDITOR_STATE.vi = i;
    this._edit = null;
    this._refresh();
  }

  _addVehicle(type) {
    const vehicles = [...this._config.vehicles, { vehicle_type: type, title: T.new_vehicle[type], title_icon: TYPE_ICONS[type] }];
    this._vi = vehicles.length - 1;
    EDITOR_STATE.vi = this._vi;
    this._edit = null;
    this._tab = 'general';
    EDITOR_STATE.tab = 'general';
    this._emit({ ...this._config, vehicles });
  }

  _vehicleAction(action, i) {
    const list = [...this._config.vehicles];
    const swap = (a, b) => {
      [list[a], list[b]] = [list[b], list[a]];
      if (this._vi === a) this._vi = b; else if (this._vi === b) this._vi = a;
    };
    if (action === 'edit') { this._selectVehicle(i); return; }
    if (action === 'up' && i > 0) swap(i, i - 1);
    else if (action === 'down' && i < list.length - 1) swap(i, i + 1);
    else if (action === 'del' && list.length > 1) {
      list.splice(i, 1);
      if (this._vi > i || this._vi >= list.length) this._vi = Math.max(0, this._vi - 1);
      this._edit = null;
    } else return;
    EDITOR_STATE.vi = this._vi;
    this._emit({ ...this._config, vehicles: list });
  }

  /* ---------- Werte & Buttons hinzufügen ---------- */

  _addField(field, openEditor) {
    const fields = [...this._eff().fields, field];
    if (openEditor) this._edit = { kind: 'field', idx: fields.length - 1 };
    this._setVehProp('fields', fields);
  }

  _addButton() {
    const ent = this._veh().button_bar?.entity;
    const opts = (ent && this._hass.states[ent]?.attributes?.options) || [];
    const used = new Set(this._eff().buttons.map((b) => b?.option));
    const next = opts.find((o) => !used.has(o));
    const buttons = [...this._eff().buttons, next ? { option: next, icon: guessOptionIcon(next) } : {}];
    this._edit = { kind: 'button', idx: buttons.length - 1 };
    this._setVehProp('buttons', buttons);
  }

  _addAllOptions() {
    const ent = this._veh().button_bar?.entity;
    const opts = (ent && this._hass.states[ent]?.attributes?.options) || [];
    const used = new Set(this._eff().buttons.map((b) => b?.option));
    const add = opts.filter((o) => !used.has(o)).map((o) => ({ option: o, icon: guessOptionIcon(o) }));
    if (add.length) this._setVehProp('buttons', [...this._eff().buttons, ...add]);
  }

  _setFieldProp(key, value) {
    const idx = this._edit.idx;
    const fields = [...this._eff().fields];
    const f = { ...(fields[idx] || {}) };
    if (value === undefined) delete f[key]; else f[key] = value;
    fields[idx] = f;
    this._setVehProp('fields', fields);
  }

  _thresholdChanged(i, v) {
    const list = [...(this._curField().color_thresholds || [])];
    const old = list[i] || {};
    const t = {};
    if (has(v.from)) t.from = v.from;
    if (has(v.color)) t.color = v.color;
    else if (isRawColor(old.color)) t.color = old.color;
    list[i] = t;
    this._setFieldProp('color_thresholds', list);
  }

  _thresholdRemove(i) {
    const list = [...(this._curField().color_thresholds || [])];
    list.splice(i, 1);
    this._setFieldProp('color_thresholds', list.length ? list : undefined);
  }

  _addThreshold() {
    const list = [...(this._curField().color_thresholds || [])];
    const last = list.filter((t) => t && isNum(t.from)).map((t) => Number(t.from)).sort((a, b) => a - b).pop();
    list.push({ from: last === undefined ? 0 : last + 20, color: THRESHOLD_COLORS[list.length % THRESHOLD_COLORS.length] });
    this._thr.el.expanded = true;
    this._setFieldProp('color_thresholds', list);
  }

  _commitMappings() {
    const obj = {};
    (this._mapRows || []).forEach((r) => { if (has(r.state)) obj[r.state] = r.text ?? ''; });
    this._setFieldProp('state_map', Object.keys(obj).length ? obj : undefined);
  }

  _mappingChanged(i, v) {
    this._mapRows[i] = { state: v.state ?? '', text: v.text ?? '' };
    this._commitMappings();
  }

  _mappingRemove(i) {
    this._mapRows.splice(i, 1);
    this._commitMappings();
  }

  _addMapping() {
    const f = this._curField();
    const st = this._hass.states[f.entity];
    const cur = st ? (f.attribute ? st.attributes?.[f.attribute] : st.state) : '';
    const known = new Set(this._mapRows.map((r) => r.state));
    this._mapRows.push({ state: has(cur) && !known.has(String(cur)) ? String(cur) : '', text: '' });
    this._map.el.expanded = true;
    this._renderMappings();
  }

  /* ---------- Änderungen übernehmen ---------- */

  _fieldChanged(value) {
    const idx = this._edit.idx;
    const old = this._eff().fields[idx] || {};
    const f = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' || v === 'inherit') return;
      if (k === 'bg_gradient') { f[k] = v === 'on' || v === true; return; }
      f[k] = v;
    });
    FIELD_COLOR_KEYS.forEach((k) => { if (f[k] === undefined && isRawColor(old[k])) f[k] = old[k]; });
    // Standardwerte nicht in die YAML schreiben
    Object.entries(FIELD_DEFAULTS).forEach(([k, d]) => { if (f[k] === d && old[k] === undefined) delete f[k]; });
    if (!f.show_bar) { if (old.bar_min === undefined) delete f.bar_min; if (old.bar_max === undefined) delete f.bar_max; }
    if (f.bar_min === 0 && old.bar_min === undefined) delete f.bar_min;
    if (f.bar_max === 100 && old.bar_max === undefined) delete f.bar_max;
    // Regler nur übernehmen, wenn der zugehörige Modus überschrieben ist
    if (!f.bg_mode) delete f.bg_opacity;
    if (!f.icon_bg_mode) delete f.icon_bg_opacity;
    if (!f.border_mode) delete f.border_width;
    ['bg_opacity', 'icon_bg_opacity', 'border_width'].forEach((k) => {
      if (f[k] !== undefined && f[k] === this._val(k) && old[k] === undefined) delete f[k];
    });
    // Farbschwellen & Übersetzungen haben eigene Blöcke
    ['color_thresholds', 'state_map'].forEach((k) => { if (old[k] !== undefined) f[k] = old[k]; else delete f[k]; });
    const fields = [...this._eff().fields];
    fields[idx] = f;
    this._setVehProp('fields', fields);
  }

  _buttonChanged(value) {
    const idx = this._edit.idx;
    const old = this._eff().buttons[idx] || {};
    const b = {};
    Object.entries(value).forEach(([k, v]) => { if (has(v)) b[k] = v; });
    if (b.color === undefined && isRawColor(old.color)) b.color = old.color;
    if (b.width === 1 && old.width === undefined) delete b.width;
    if ((b.type || 'option') === 'option') {
      delete b.type;
      delete b.tap_action;
      delete b.active_state;
    } else {
      delete b.option;
    }
    const buttons = [...this._eff().buttons];
    buttons[idx] = b;
    this._setVehProp('buttons', buttons);
  }

  _cleanSub(value, defaults, old = {}, colorKeys = []) {
    const o = old || {};
    const out = {};
    Object.entries(value).forEach(([k, v]) => { if (has(v)) out[k] = v; });
    colorKeys.forEach((k) => { if (out[k] === undefined && isRawColor(o[k])) out[k] = o[k]; });
    Object.entries(defaults).forEach(([k, d]) => {
      if (out[k] !== undefined && JSON.stringify(out[k]) === JSON.stringify(d) && o[k] === undefined) delete out[k];
    });
    return Object.keys(out).length ? out : undefined;
  }

  _emit(value) {
    const old = this._config;
    const cfg = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      cfg[k] = v;
    });
    ROOT_COLOR_KEYS.forEach((k) => { if (cfg[k] === undefined && isRawColor(old[k])) cfg[k] = old[k]; });
    // Werte, die dem Standard entsprechen, nicht in die YAML schreiben
    Object.keys(DEFAULTS).forEach((k) => {
      if (cfg[k] === undefined) return;
      if (JSON.stringify(cfg[k]) === JSON.stringify(DEFAULTS[k]) && old[k] === undefined) delete cfg[k];
    });
    const m = (k) => (has(cfg[k]) ? cfg[k] : DEFAULTS[k]);
    const tintable = (k) => ['tinted', 'accent', 'custom'].includes(m(k));
    if (m('card_bg_mode') !== 'custom') delete cfg.card_bg_color;
    if (!tintable('card_bg_mode')) delete cfg.card_bg_gradient;
    if (m('card_border_mode') !== 'custom') delete cfg.card_border_color;
    if (!['accent', 'custom'].includes(m('card_border_mode'))) delete cfg.card_border_width;
    if (!has(cfg.background_image)) ['background_size', 'background_position', 'overlay_color', 'overlay_opacity'].forEach((k) => delete cfg[k]);
    if (m('bg_mode') !== 'custom') delete cfg.bg_color;
    if (!tintable('bg_mode')) delete cfg.bg_gradient;
    if (m('icon_color_mode') !== 'custom') delete cfg.icon_color;
    if (m('icon_bg_mode') !== 'custom') delete cfg.icon_bg_color;
    if (m('icon_bg_mode') === 'none') { delete cfg.icon_bg_opacity; delete cfg.icon_shape; }
    if (m('text_color_mode') !== 'custom') delete cfg.text_color;
    if (m('border_mode') !== 'custom') delete cfg.border_color;
    if (m('border_mode') === 'none') delete cfg.border_width;
    cfg.vehicles = vehiclesOf(cfg).map((v) => {
      const o = { ...v };
      ['fields', 'buttons'].forEach((k) => { if (Array.isArray(o[k]) && !o[k].length) delete o[k]; });
      return o;
    });

    this._config = { ...cfg };
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
    this._refresh();
  }
}

/* ------------------------------------------------------------------ */
/*  Registrierung                                                     */
/* ------------------------------------------------------------------ */

if (!customElements.get(CARD_TYPE)) customElements.define(CARD_TYPE, EvChargeCard);
if (!customElements.get(EDITOR_TYPE)) customElements.define(EDITOR_TYPE, EvChargeCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: 'EV Charge Card',
    description: 'E-Auto, Hybrid oder Verbrenner + Wallbox: Ladestand/Tank, Reichweite, Fahrzeugbild, Start/Stopp und Lademodus-Buttons – mehrere Fahrzeuge per Wischen. Design und Editor wie bei der Abfall-Karte und der Status-Übersicht.',
    preview: true,
    documentationURL: 'https://github.com/Kohle93/EV-Charge-Card',
  });
}

console.info(`%c🚗 EV-CHARGE-CARD %c v${CARD_VERSION} `, 'background:#4caf50;color:#fff;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px', 'background:#333;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px');
