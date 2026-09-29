# EV Charge Card

Lovelace-Karte für Home Assistant zur Anzeige und Steuerung von **E-Auto und Wallbox**:
Ladestand, Reichweite, Ladeleistung, Fahrzeugbild, Start/Stopp und eine frei konfigurierbare Button-Leiste für den Lademodus.

Design und Editor folgen demselben System wie die [Abfall-Karte (Trash Card Plus)](https://github.com/Kohle93/Trash-Card-Plus)
und die [Status-Übersicht-Karte](https://github.com/Kohle93/Status-Summary-Card) – alle drei Karten bedienen sich gleich und passen optisch zusammen.

![Vorschau](images/preview.png)

<sub>Das Fahrzeug in der Vorschau ist eine eigene, generische Illustration (kein reales Modell) – siehe [Bildnachweis](#bildnachweis).</sub>

## Features

- Layout: Titel + Werte links, Fahrzeugbild + Werte rechts, Button-Leiste unten (Bild auch links möglich)
- Sehr schmale Karten brechen automatisch untereinander um (Schwelle einstellbar)
- **Gemeinsames Design-System:** Hintergrund *Theme / Theme + Farbton / Akzentfarbe / eigene Farbe / transparent* mit Deckkraft, Farbverlauf und Glas-Effekt – für die Karte und für die Werte-Kacheln
- Symbol-Hintergrund mit Form (Kreis, abgerundet, eckig), Textfarbe mit automatischem Kontrast, Rahmen, Schatten, Eckenradius, Abstände
- Hervorhebung der Karte **während des Ladens** (Leuchten, Pulsieren, farbiger Rahmen, etwas größer)
- Hintergrundbild mit Farb-Overlay
- Beliebig viele Werte mit Einheit, Nachkommastellen, Faktor, Fortschrittsbalken, Farbschwellen und Zustandsübersetzung – jeder Wert kann das Design überschreiben
- Button-Leiste mit Optionen direkt aus einer `select`- / `input_select`-Entität, plus freie Aktions-Buttons (z. B. Favorit ☆)
- Start-/Stopp-Buttons unter dem Auto, sobald das Auto eingesteckt ist, und Lade-Glow unter dem Auto
- Tap- und Hold-Actions (more-info, toggle, navigate, url, perform-action)

## Visueller Editor

Aufgebaut wie bei der Abfall-Karte und der Status-Übersicht:

| Tab | Inhalt |
|---|---|
| **Allgemein** | Titel, Titel-Symbol, Untertitel (Text oder Entität), Aktionen |
| **Anzeige** | Bild-/Titelposition, Spaltenbreite, Skalierung, Mindesthöhe, Umbruch-Schwelle |
| **Fahrzeug** | Fahrzeugbild, Lade-Glow, Start/Stopp mit Beschriftung, Farben und eigenen Aktionen |
| **Werte** | Liste aller Werte (sortieren, bearbeiten, löschen), Bearbeiten-Seite mit Live-Vorschau, Farbschwellen und Zustandsübersetzung per Klick, Vorschläge aus deinen Fahrzeug-/Wallbox-Geräten |
| **Buttons** | Button-Leiste, „Alle Optionen übernehmen“, Liste aller Buttons mit Bearbeiten-Seite |
| **Design** | Akzentfarbe, Karte (Hintergrund, Bild, Rahmen) und Werte (Hintergrund, Symbol, Text, Rahmen), Hervorhebung – mit Live-Vorschau |

Farben werden per Farbpicker gewählt. Konfigurationen der Version 0.x (`layout:` / `style:`) werden automatisch übernommen und beim nächsten Speichern im Editor ins neue Format umgeschrieben.

## Installation

### HACS (benutzerdefiniertes Repository)

1. HACS → ⋮ → **Benutzerdefinierte Repositories**
2. URL `https://github.com/Kohle93/ev-charge-card`, Typ **Dashboard**
3. „EV Charge Card“ installieren, Browser-Cache leeren

### Manuell

1. `dist/ev-charge-card.js` nach `/config/www/ev-charge-card/ev-charge-card.js` kopieren
2. Einstellungen → Dashboards → ⋮ → **Ressourcen** → hinzufügen:
   - URL: `/local/ev-charge-card/ev-charge-card.js`
   - Typ: **JavaScript-Modul**

## Konfiguration

Vollständiges Beispiel: [`examples/beispiel.yaml`](examples/beispiel.yaml)

```yaml
type: custom:ev-charge-card
title: Mein E-Auto
title_icon: mdi:car-electric
accent_color: [156, 204, 60]
image:
  url: /local/ev/auto.png
  max_height: 170
fields:
  - entity: sensor.car_battery_level
    name: Ladestand
    size: large
    show_bar: true
  - entity: sensor.car_range
    name: Reichweite
button_bar:
  entity: select.wallbox_charging_mode
buttons:
  - option: Default
    name: Standard
    icon: mdi:ev-station
  - option: Eco
    icon: mdi:leaf
```

Farben akzeptieren Farbpicker-Werte `[r, g, b]`, Hex-Codes (`#9ccc3c`) oder HA-Farbnamen (`green`, `amber`, `primary` …).

### Allgemein

| Option | Beschreibung |
|---|---|
| `title`, `title_icon` | Titel und Symbol |
| `subtitle` / `subtitle_entity` | Untertitel (Text oder Zustand einer Entität) |
| `title_tap_action` / `title_hold_action` | Aktionen auf dem Titel |

### Anzeige

| Option | Standard | Beschreibung |
|---|---|---|
| `image_position` | `right` | `right` / `left` |
| `title_position` | `top` | `top` (volle Breite) / `column` (linke Spalte) |
| `left_width` | `45` | Breite linke Spalte in % |
| `right_columns` | `1` | Spalten der Werte unter dem Bild |
| `scale` | `1` | Skalierung der ganzen Karte (0.5 – 2) |
| `min_height` / `card_height` | – | Mindesthöhe / feste Höhe in px |
| `stack_below` | `260` | Unterhalb dieser Kartenbreite (px) rutscht das Bild unter den Titel, `0` = nie |

### Design – Karte

| Option | Standard | Beschreibung |
|---|---|---|
| `accent_color` | Theme-Primärfarbe | Farbe für Symbole, Balken, Glow und aktiven Button |
| `card_bg_mode` | `theme` | `theme` / `tinted` (Theme + Farbton) / `accent` / `custom` / `none` |
| `card_bg_color`, `card_bg_opacity`, `card_bg_gradient` | –, `100`, `false` | Farbe, Deckkraft in %, Farbverlauf |
| `card_blur` | `0` | Glas-Effekt (px) |
| `background_image`, `background_size`, `background_position` | –, `cover`, `center` | Hintergrundbild |
| `overlay_color`, `overlay_opacity` | –, `40` | Farbe über dem Bild |
| `card_border_mode` | `theme` | `theme` / `none` / `accent` / `custom` (+ `card_border_color`, `card_border_width`) |
| `card_shadow` | `theme` | `theme` / `none` / `soft` / `strong` |
| `card_radius`, `padding`, `gap` | Theme, `16`, `12` | Eckenradius, Innenabstand, Abstand in px |
| `card_background` | – | *Nur YAML:* beliebiger CSS-Hintergrund (z. B. `linear-gradient(…)`), überschreibt `card_bg_*` |

### Design – Werte (Standard für alle, pro Wert überschreibbar)

| Option | Standard | Beschreibung |
|---|---|---|
| `bg_mode` | `tinted` | `theme` / `tinted` / `accent` / `custom` / `none` |
| `bg_color`, `bg_opacity`, `bg_gradient`, `blur` | –, `10`, `false`, `0` | Hintergrund der Kacheln |
| `icon_size` | `20` | Symbolgröße in px |
| `icon_color_mode` | `auto` | `auto` / `accent` / `text` / `custom` (+ `icon_color`) |
| `icon_bg_mode` | `accent` | `none` / `accent` / `theme` / `custom` (+ `icon_bg_color`, `icon_bg_opacity`) |
| `icon_shape` | `circle` | `circle` / `rounded` / `square` |
| `text_color_mode` | `auto` | `auto` (guter Kontrast) / `theme` / `custom` (+ `text_color`) |
| `title_size`, `label_size`, `value_size` | `20`, `12`, `18` | Schriftgrößen in px |
| `border_mode` | `none` | `none` / `accent` / `theme` / `custom` (+ `border_color`, `border_width`) |
| `shadow` | `none` | `theme` / `none` / `soft` / `strong` |
| `radius`, `tile_padding` | `12`, `8` | Eckenradius und Innenabstand der Kacheln |
| `highlight` | `none` | Beim Laden: `none` / `glow` / `pulse` / `border` / `scale` |

### `image`

| Option | Beschreibung |
|---|---|
| `url` / `entity` | Bild-URL (z. B. `/local/ev/auto.png`) oder `entity_picture` einer Entität. Eine frei nutzbare Beispielgrafik liegt unter [`examples/auto.png`](examples/auto.png) |
| `size`, `max_height` | Breite in %, max. Höhe in px |
| `offset_x` / `offset_y`, `flip`, `shadow`, `hide` | Versatz, spiegeln, Schlagschatten (`false` = aus), ausblenden |
| `glow_entity` / `glow_state` / `glow_color` | Leuchten unter dem Auto bei bestimmtem Zustand |
| `state_images` | *Nur YAML:* Bild je Zustand der `glow_entity` |
| `tap_action` / `hold_action` | Aktionen |

### `charge_control` – Laden Start / Stopp

| Option | Beschreibung |
|---|---|
| `start_entity` / `stop_entity` | `button`/`input_button` → press, `script`/`scene` → turn_on, `switch`/`input_boolean` → Start = an, Stopp = aus |
| `show_entity` / `show_state` | Sichtbar, wenn die Entität diesen Zustand hat. Leer = Lade-Glow verwenden |
| `charging_entity` / `charging_state` | Lädt gerade – füllt Start/Stopp und steuert die Hervorhebung |
| `start_name`, `stop_name`, `start_icon`, `stop_icon`, `start_color`, `stop_color` | Beschriftung und Farben |
| `show_names`, `size`, `confirm` | Beschriftung anzeigen, Größe (px), vorher nachfragen |
| `start_action` / `stop_action` | Eigene Aktion statt Entität |

### `fields[]` – Werte

| Option | Beschreibung |
|---|---|
| `entity`, `attribute` | Entität (Pflicht), optional Attribut statt Zustand |
| `name`, `icon`, `color` | Bezeichnung, Symbol, Farbe des Werts |
| `slot`, `size` | `left` / `right`, `small` / `normal` / `large` |
| `unit`, `decimals`, `multiply` | Einheit, Nachkommastellen, Faktor |
| `show_name`, `show_icon` | ein-/ausblenden |
| `show_bar`, `bar_min`, `bar_max` | Fortschrittsbalken |
| `color_thresholds` | Liste `{from, color}` – färbt Symbol, Balken und Kachel |
| `state_map` | Zustände übersetzen, z. B. `Charging: Lädt` |
| Design-Schlüssel | `bg_mode`, `bg_color`, `bg_opacity`, `bg_gradient`, `icon_color_mode`, `icon_color`, `icon_bg_mode`, `icon_bg_color`, `icon_bg_opacity`, `icon_shape`, `text_color_mode`, `text_color`, `border_mode`, `border_color`, `border_width`, `shadow` |
| `tap_action`, `hold_action` | Standard-Tap: more-info |

### `button_bar`

| Option | Standard | Beschreibung |
|---|---|---|
| `entity` | – | `select.*` oder `input_select.*` |
| `style` | `segmented` | `segmented` / `separate` |
| `show_names`, `show_icons` | `true` | |
| `height` | `44` | Höhe in px |
| `active_color`, `active_text_color`, `background` | Akzent / Kontrast / wie Kacheln | Farben |
| `hide` | `false` | Leiste ausblenden |

### `buttons[]`

| Option | Beschreibung |
|---|---|
| `type` | `option` (Standard) oder `action` |
| `option` | Option der Auswahl-Entität |
| `entity` | Überschreibt die Leisten-Entität bzw. Entität für `action` |
| `active_state` | Aktiv, wenn die Entität diesen Zustand hat (Standard `on`) |
| `name`, `icon`, `color`, `width` | Aussehen (`width` = Flex-Faktor) |
| `tap_action`, `hold_action` | Aktionen (`action`-Buttons ohne Tap-Action: toggle) |

## Bildnachweis

- `images/preview.png` und `examples/auto.png` / `examples/auto.svg` sind eigens für dieses Projekt erstellte, generische Illustrationen und stehen wie der Code unter der MIT-Lizenz.
- Die Symbole stammen von [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), die Home Assistant mitliefert.
- Verwende für dein eigenes Dashboard am besten ein Foto deines Autos oder ein Bild, an dem du die Nutzungsrechte hast. Herstellerbilder aus Konfiguratoren oder Pressebereichen sind in der Regel nicht frei weiterverwendbar – bitte nicht ins Repository einchecken.

## Lizenz

MIT
