# IDA – barrierefreie KI-Bürgerservice-Plattform

**Austrian Startup Summit 2026 Hackathon** · KI-Agentenplattform für Ministerien, Magistrate und Behörden in Österreich.
Aufgebaut auf dem [Starter-Template](https://github.com/Nlea/austrian-startup-summit-hackathon), Design aus Google Stitch
(`design/`), gehostet auf **Cloudflare**, Modelle von **Gemini** (Text, Live-Sprache, Diktat, Übersetzung) und optional **Claude**.

> Prototyp – alle Personen, Register und Behörden sind fiktiv. Regeln teilweise vereinfacht.

## Was IDA kann

- **Login mit ID Austria (simuliert)** → IDA kennt die Registerdaten der Person und füllt Formulare vor.
- **Text-Chat** mit Gemini und Werkzeugen (Leistung finden, Anspruch prüfen, amtliche Infos, Termin, Rückruf durch Menschen).
- **Live-Sprachdialog** (Gemini Live, Voice-to-Voice) mit Live-Untertiteln – IDA füllt das Formular *während des Gesprächs* aus.
- **Diktieren direkt im Eingabefeld** (Chat und jedes Formularfeld) – der Text erscheint live, das Mikrofon wird beim Beenden sofort freigegeben.
- **Termine:** IDA zeigt freie Termine **visuell im rechten Panel** (Wunschzeit wird hervorgehoben), Buchung nur nach Bestätigung;
  Seite **„Meine Termine“** (`/termine`) mit Kalender-Export (.ics), Stornieren und Neubuchung. Referenznummern erscheinen
  auch im Sprachdialog als Karte (kopierbar).
- **Interaktives Formularfenster rechts** (Split-View, verschiebbar; Tabs auf dem Handy): Meldezettel inkl. Wohnungsgeberbestätigung,
  Familienbeihilfe (Beih 100), Reisepass – vorausgefüllt, Schritt-für-Schritt geführt, Absenden nur nach Bestätigung.
- **Übersetzungsebene** in jede Sprache: liegt *über* dem deutschen Originalformular – keine zusätzlichen Felder, nichts abgeschnitten,
  Original per „Gedrückt halten“ sichtbar, 1 Gemini-Call pro Formular & Sprache, danach aus dem KV-Cache.
- **Gedächtnis**: ein Entscheidungsmodell (Claude / Workers AI / Gemini) merkt sich Sprache, Barrieren und Vorlieben – transparent und löschbar.
- **Barrierefreiheit**: AAA-Kontraste, Textgröße bis 200 %, Hochkontrast, Leichte Sprache, Vorlesen, Tastaturbedienung, RTL, Screenreader-taugliches Overlay.

## Schnellstart

```bash
pnpm install
npx wrangler login
cp .dev.vars.example .dev.vars    # GEMINI_API_KEY, SESSION_SECRET eintragen
pnpm dev                          # http://localhost:5173
```

Deployment: `npx wrangler secret put GEMINI_API_KEY` · `npx wrangler secret put SESSION_SECRET` · `pnpm run deploy`

👉 **Ausführliche Schritt-für-Schritt-Anleitung:** [`docs/SETUP.md`](docs/SETUP.md)
👉 **Architektur & Konzepte:** [`docs/TECHNICAL.md`](docs/TECHNICAL.md)

## Testidentitäten

| Person | Szenario |
|---|---|
| Oksana Kovalenko | Familienbeihilfe auf Ukrainisch, Formular-Übersetzung |
| Mehmet Yılmaz | Sehbehinderung, Sprachdialog, Türkisch |
| Lena Huber | Ummeldung (Meldezettel), Umgangssprache |
| Josef Gruber | Reisepass abgelaufen, schwerhörig, Dialekt, Hilfe durch Menschen |
| Amira Haddad | Aufenthaltstitel, Kinderbetreuungsgeld/Familienbeihilfe, Arabisch/Englisch |
| Thomas Berger | Neugeborenes |
| Sofia Rossi | Ummeldung auf Englisch (EU-Bürgerin) |
| David Novak | Unvollständige Daten, Zuzug aus dem Ausland |

## Befehle

| Befehl | Zweck |
|---|---|
| `pnpm dev` | Lokale Entwicklung (Vite + Worker) |
| `pnpm test` | Unit-/API-Tests (ohne KI) |
| `pnpm evals` | KI-Szenarien → `test-results/report.md` |
| `pnpm run deploy` | Build + Deploy auf Cloudflare |
| `pnpm cf-typegen` | `Env`-Typen nach Änderungen an `wrangler.jsonc` |

## Projektstruktur

```
src/
  index.ts              Worker: Routing, Schutz der Agent-Instanzen
  routes/app-api.ts     Bürger-API (Login, Live-Token, Tools, Übersetzung, Gedächtnis, Formulare)
  auth/                 simulierter ID-Austria-Login
  agent/                Chat-Agent, Tool-Register, Systemprompt, Eval-Runner
  live/                 Gemini-Live-Setup (Ephemeral Tokens)
  memory/               Gedächtnis (D1) + Entscheidungsmodell
  translate/            Übersetzungsebene (Gemini + KV-Cache)
  ai/gemini.ts          Gemini-REST (Tokens, JSON-Output, Transkription)
  gov/                  Mock-E-Government-Backend (Template)
  shared/               Typen, Formulare, Sprachen, UI-Texte (Worker + Frontend)
frontend/               React: Login, Portal, Formular-Overlay, Live-Client, Audio
design/                 Stitch-Export (DESIGN.md, code.html, screen.png)
docs/                   SETUP.md, TECHNICAL.md
evals/ · test/          KI-Szenarien · Unit-Tests
```
