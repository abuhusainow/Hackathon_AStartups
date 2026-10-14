# IDA – Schritt-für-Schritt-Anleitung (Einrichtung & Deployment auf Cloudflare)

Diese Anleitung bringt IDA zuerst lokal auf Ihrem Laptop und dann live auf Cloudflare zum Laufen.
Rechnen Sie mit ca. 20–30 Minuten.

---

## 0. Voraussetzungen (einmalig)

| Was | Wie prüfen | Woher |
|---|---|---|
| Node.js **20 oder neuer** | `node -v` | https://nodejs.org (LTS) |
| pnpm | `pnpm -v` | `npm i -g pnpm` |
| Git | `git --version` | https://git-scm.com |
| Cloudflare-Konto (E-Mail bestätigt!) | – | https://dash.cloudflare.com/sign-up |
| Gemini-API-Key | – | https://aistudio.google.com/apikey |
| *(optional)* Anthropic-API-Key für Claude als Gedächtnis-Modell | – | https://console.anthropic.com |

> ⚠️ **Gemini-Kontingent:** Ein Key im **Free Tier** erlaubt nur wenige Anfragen pro Minute/Tag
> (z. B. 15/min für Flash-Lite). Eine einzige Chat-Antwort mit Werkzeugen braucht mehrere Anfragen.
> Für Demo und Jury unbedingt **Billing im Google-AI-Studio-Projekt aktivieren** (AI Studio → Settings → Billing).
> IDA weicht bei 429/503 automatisch auf Ersatzmodelle und zuletzt auf Workers AI (Hackathon-Credits) aus.

> ⚠️ **Sicherheit:** API-Keys gehören **nie** ins Repository, in Chats oder Screenshots.
> Der Gemini-Key aus der Projektbeschreibung wurde im Chat geteilt – erzeugen Sie nach dem Hackathon einen neuen Key
> (AI Studio → API keys → Key löschen / neu erstellen).

---

## 1. Projekt holen und Abhängigkeiten installieren

```bash
git clone https://github.com/abuhusainow/Hackathon_AStartups.git
cd Hackathon_AStartups
git checkout claude/vigilant-lamport-s4azd9   # bzw. main, sobald gemergt
pnpm install
```

> Die Versionen der Abhängigkeiten sind absichtlich fixiert (siehe `AGENTS.md`). Bitte **kein** `pnpm update`.

---

## 2. Bei Cloudflare anmelden

```bash
npx wrangler login      # öffnet den Browser → Zugriff erlauben
npx wrangler whoami     # zeigt E-Mail und Account-ID
```

**Mehrere Cloudflare-Konten?** (Fehler „More than one account available“)

```bash
export CLOUDFLARE_ACCOUNT_ID=<Ihre-Account-ID>     # Windows PowerShell: $env:CLOUDFLARE_ACCOUNT_ID="..."
```

**Hackathon-Credits:** Ein Teammitglied ist „Owner“ des Kontos, lädt die anderen unter
*Manage Account → Members* ein und meldet E-Mail + Account-ID über das Formular der Veranstalter.
Danach alle Befehle mit diesem Konto ausführen.

---

## 3. Lokale Geheimnisse anlegen (`.dev.vars`)

```bash
cp .dev.vars.example .dev.vars
```

Dann `.dev.vars` öffnen und ausfüllen:

```ini
GEMINI_API_KEY=<Ihr Gemini-Key>
SESSION_SECRET=<lange Zufallszeichenkette>     # z. B. Ausgabe von: openssl rand -hex 32
ANTHROPIC_API_KEY=                              # optional: Claude als Entscheidungsmodell fürs Gedächtnis
```

`.dev.vars` steht in `.gitignore` und wird **nie** committet.

---

## 4. Lokal starten

```bash
pnpm dev
```

→ http://localhost:5173 öffnen.

1. **Anmeldung mit ID Austria (simuliert):** Testidentität wählen → „Weiter mit ID Austria“ → „In der App bestätigen“.
2. Startseite mit IDA → Chip **„Familienbeihilfe“** klicken oder schreiben/sprechen.
3. Rechts öffnet sich das Formular, vorausgefüllt aus den Registerdaten.
4. „Übersetzen“ (oder: *„Bitte übersetze das Formular auf Ukrainisch“*) → die Übersetzungsebene liegt über dem Original, die Felder bleiben ausfüllbar.
5. Mikrofon-Button (rund) = **Live-Sprachdialog** mit Gemini Live · Mikrofon in der Eingabezeile = **Diktieren direkt ins Feld** (nochmals klicken = Stopp).
6. *„Ich brauche einen Termin für den Reisepass, am Montag in der Früh“* → freie Termine erscheinen rechts, passende sind markiert. Gebuchte Termine: Menü **„Meine Termine“**.

> **Mikrofon:** Browser erlauben Mikrofonzugriff nur über `https://` oder `http://localhost`.
> Testen Sie Sprache daher lokal über `localhost` oder auf der deployten `https://…workers.dev`-Adresse.

**Ohne Cloudflare-Login lokal testen** (z. B. CI): `CF_REMOTE_BINDINGS=false pnpm dev` –
alles mit Gemini funktioniert, nur Workers AI (Fallback / Gedächtnis-Modell) nicht.
Setzen Sie dann zusätzlich `MEMORY_PROVIDER=gemini` in `.dev.vars`.

---

## 5. Tests

```bash
pnpm test                          # Unit-/API-Tests (ohne KI-Aufrufe)
npx tsc --noEmit                   # Typen Worker
npx tsc --noEmit -p frontend/tsconfig.json   # Typen Frontend
pnpm evals                         # KI-Szenarien (pnpm dev muss laufen) → test-results/report.md
```

---

## 6. Auf Cloudflare deployen

### 6.1 Secrets in Cloudflare hinterlegen (einmalig)

```bash
npx wrangler secret put GEMINI_API_KEY        # Key einfügen, Enter
npx wrangler secret put SESSION_SECRET        # lange Zufallszeichenkette
npx wrangler secret put ANTHROPIC_API_KEY     # optional (Claude für das Gedächtnis)
```

> Falls `wrangler secret put` meldet, dass der Worker noch nicht existiert: zuerst Schritt 6.2 ausführen,
> danach die Secrets setzen und noch einmal deployen.

### 6.2 Deployen

```bash
pnpm run deploy
```

Das baut das Frontend (Vite) und deployt alles als **einen** Worker:

- **D1** `ida-gov-db` und **KV** (Übersetzungs-Cache) werden beim ersten Deploy automatisch angelegt.
- Die Tabellen (Register + Gedächtnis) befüllen sich beim ersten Aufruf selbst – keine Migrationen nötig.
- Am Ende erscheint die URL: `https://ida-buergerservice.<ihr-subdomain>.workers.dev`

### 6.3 Prüfen

```bash
curl https://ida-buergerservice.<ihr-subdomain>.workers.dev/api/health
# → {"status":"ok","gemini":true,...,"decisionModel":"claude" | "workers-ai"}
```

Logs live ansehen: `npx wrangler tail` oder Dashboard → *Workers & Pages → ida-buergerservice → Logs*.

---

## 7. Modelle & AI Gateway (optional, empfohlen)

Alle Modell-IDs sind Variablen in `wrangler.jsonc` → ohne Code-Änderung austauschbar:

| Variable | Standard | Zweck |
|---|---|---|
| `GEMINI_TEXT_MODEL` | `gemini-3.8-flash` | Text-Chat mit Tools |
| `GEMINI_TEXT_FALLBACKS` | `gemini-3.6-flash,gemini-3.1-flash-lite` | bei „high demand“ / Kontingent (429/503) |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | Voice-to-Voice (Gemini Live) |
| `GEMINI_LIVE_FALLBACKS` | `gemini-2.5-flash-native-audio-latest` | Live-Fallback |
| `GEMINI_TRANSCRIBE_MODEL` | `gemini-3.5-transcribe-live` | Diktat |
| `GEMINI_TRANSLATE_MODEL` | `gemini-3.5-flash-lite` | Formular-/UI-Übersetzung |
| `MEMORY_PROVIDER` | `auto` | `auto` = Claude (wenn Key) → Workers AI; oder `claude`, `workers-ai`, `gemini` |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Entscheidungsmodell (Gedächtnis) |
| `WORKERS_AI_MODEL` | `@cf/zai-org/glm-4.7-flash` | Gedächtnis ohne Claude / Chat ohne Gemini-Key |

**AI Gateway** (Logs, Kosten, Caching aller Modellaufrufe):

1. Dashboard → *AI → AI Gateway* → Gateway `default` anlegen (wird für Workers AI auch automatisch erstellt).
2. In `wrangler.jsonc` `"ROUTE_VIA_AI_GATEWAY": "true"` setzen → Gemini und Claude laufen dann ebenfalls über das Gateway.
3. Ist das Gateway „authenticated“, im Dashboard die Provider-Keys im Gateway hinterlegen (BYOK) oder die Authentifizierung deaktivieren.

> Gemini Live (Sprache) verbindet den Browser **direkt** mit Google (WebSocket mit kurzlebigem Token, niedrigste Latenz)
> und läuft daher nicht über das Gateway.

---

## 8. Häufige Probleme

| Problem | Lösung |
|---|---|
| `Property 'CACHE' does not exist on type 'Env'` | `pnpm cf-typegen` nach Änderungen an `wrangler.jsonc` |
| Chat antwortet „Es ist ein Fehler aufgetreten“ | Gemini überlastet oder Kontingent aufgebraucht (429). Fallback-Modelle greifen automatisch; sonst `GEMINI_TEXT_FALLBACKS` anpassen, Billing im AI Studio aktivieren, Logs prüfen |
| Sprachdialog startet nicht | Mikrofon-Freigabe im Browser; nur `https://` / `localhost`; Kontingent für Live-Modelle prüfen |
| `CLOUDFLARE_API_TOKEN` fehlt (CI) | API-Token mit „Edit Workers“ erstellen und als Umgebungsvariable setzen |
| Alte Daten / neue Personas fehlen | `curl -X POST <url>/api/gov/admin/reset` (Gedächtnis bleibt erhalten) |
| Browser zeigt alten Stand | `node_modules/.vite` löschen, `pnpm dev` neu starten |

---

## 9. Demo-Drehbuch (2 Minuten)

1. Login als **Oksana Kovalenko** (Ukrainisch, 2 Kinder) → Oberfläche erscheint auf Ukrainisch, große Schrift (aus dem Gedächtnis).
2. Chip „Familienbeihilfe“ → IDA prüft den Anspruch, öffnet **Beih 100** rechts, vorausgefüllt (Kinder, Partner, SVNR, IBAN).
3. *„Перекладіть, будь ласка, форму українською“* → Übersetzungsebene über dem Original; „Gedrückt halten“ zeigt das deutsche Original.
4. Live-Sprachdialog starten → IDA fragt fehlende Felder ab und füllt sie live; Untertitel laufen mit.
5. „Prüfen und absenden“ → Bestätigungsdialog (ID-Austria-Signatur simuliert) → Referenznummer.
6. Login als **Josef Gruber** → *„I brauch an Termin für mein Pass, am Montag in da Fruah“* → Terminauswahl rechts, Vorschläge markiert → Klick → Bestätigen → Karte mit Referenznummer; danach „Meine Termine“ zeigen (.ics, Stornieren).
7. Profil → *„Was IDA über mich weiß“* → Gedächtnis-Einträge (Sprache, Barrieren) – transparent und löschbar.
