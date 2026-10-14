# IDA – Technische Dokumentation

**IDA (Intelligente Digitale Assistentin)** ist eine barrierefreie KI-Agentenplattform für Ministerien, Magistrate
und Behörden in Österreich (Hackathon-Prototyp, alle Daten fiktiv).

## Architektur

```
Browser (React · Stitch-Design „Federal Civic Architecture“)
 │
 ├─ WebSocket ───► CitizenAssistant (Agents SDK, Durable Object, eine Instanz pro Sitzung)
 │                   └─► Gemini (Text, Tools)  [Fallback-Kette + Circuit Breaker]
 │
 ├─ WebSocket ───► Gemini Live (Voice-to-Voice)      ← kurzlebiges Token von /api/live/token
 ├─ WebSocket ───► Gemini Live Transcription (Diktat) ← kurzlebiges Token
 │
 └─ REST /api/* (Hono Worker)
      ├─ /auth/*        simulierter ID-Austria-Login (HMAC-signiertes Cookie)
      ├─ /tools/:name   Server-Tools für den Sprachkanal
      ├─ /translate     Übersetzungsebene (Gemini Flash-Lite, KV-Cache)
      ├─ /memory/*      Gedächtnis (D1) ◄── Entscheidungsmodell (Claude | Workers AI | Gemini)
      ├─ /forms/*       Antragsentwurf & Einreichung (serverseitige Validierung)
      └─ /gov/*         Mock-E-Government-Backend (Register, Services, Termine, Handoff)
```

**Cloudflare-Produkte:** Workers, Static Assets, Agents SDK (Durable Objects + SQLite), D1, KV, Workers AI, AI Gateway, Observability.

## Kernkonzepte

### 1. Simulierter Login mit ID Austria
`src/auth/session.ts` – Persona wählen → HMAC-SHA256-signiertes, HttpOnly-Cookie (`pid`, `sid`, `iat`, `loa`).
- Die **Bürger-ID kommt immer aus dem Cookie**, nie aus Client-Daten oder Modell-Eingaben.
- Der Chat-Agent heißt `<personaId>--<sessionId>`; der Worker lehnt Verbindungen zu Instanzen anderer Personen ab (403).
- In Produktion würde hier OIDC von ID Austria stehen; der Rest der App bleibt gleich.

### 2. Ein Tool-Register für Text und Sprache
`src/agent/tools.ts` definiert jedes Werkzeug einmal (Zod-Schema, Beschreibung, `side`):

| Server-Tools (Worker) | Client-Tools (Browser) |
|---|---|
| get_my_profile, find_services, get_service_info, check_eligibility, get_my_appointments, create_handoff, remember, forget | open_form, fill_fields, focus_field, get_form_state, translate_form, show_original, set_ui_preferences, request_submission, show_appointment_slots, request_appointment_booking, close_form |

- **Text-Chat:** AI-SDK-Tools; Client-Tools haben kein `execute` → `useAgentChat.onToolCall` führt sie im Browser aus.
- **Sprache:** dieselben Schemas als Gemini `functionDeclarations` (`toGeminiSchema`) im Ephemeral Token; der Browser führt Client-Tools lokal aus und leitet Server-Tools an `/api/tools/:name` weiter.
- Ein Executor (`frontend/lib/form-store.ts`) bedient beide Kanäle → identisches Verhalten.
- **Mensch in der Schleife:** Absenden und Buchen sind Client-Tools, die einen Bestätigungsdialog öffnen. Die KI kann nie selbst einreichen.

### 3. Formulare & Übersetzungsebene
`src/shared/forms/*` – HTML-Nachbau der Originalformulare (Meldezettel inkl. Wohnungsgeberbestätigung, Familienbeihilfe Beih 100, Reisepass):
- Jeder sichtbare Text hat eine stabile `textId`; jedes Feld eine `fieldId`; `toServiceData()` bildet auf die Service-Felder ab (Server-Validierung bleibt maßgeblich).
- `prefill()` füllt aus den Registerdaten (Name, Geburtsdatum, Adresse, Kinder, Partner, SVNR, IBAN, Ausweis).
- **Overlay statt neuer Felder:** Original und Übersetzung liegen in *derselben Grid-Zelle* (`.tx`). Die Zelle wächst auf die größere der beiden Längen → **kein Abschneiden mit „…“**, die Eingabefelder bleiben die originalen, das deutsche Original bleibt im DOM (aria-hidden) und ist per „Gedrückt halten“ sichtbar.
- Screenreader lesen die Übersetzung (`lang`/`dir` am Overlay, übersetzte `aria-label`s). RTL (Arabisch, Farsi) wird unterstützt.
- **Effizienz:** ein strukturierter Gemini-Call (JSON-Schema) pro Formular und Sprache, gecacht in KV (`form:<id>:v<version>:<lang>`) → danach ~30 ms. Amtsbegriffe bleiben in Klammern erhalten („Main residence (Hauptwohnsitz)“).
- Eingereicht wird immer das deutsche Original; Drucken/PDF zeigt nur das Original.

### 4. Gemini Live (Voice-to-Voice) und Diktat
- `POST /api/live/token` erzeugt ein **Single-Use-Ephemeral-Token** (`v1alpha/auth_tokens`), in dem Modell, Systemprompt (inkl. Profil, Gedächtnis, Formularstatus), Tools und Stimme fest verankert sind → der API-Key verlässt nie den Worker, der Client kann die Konfiguration nicht ändern.
- Browser ↔ Gemini direkt (`BidiGenerateContentConstrained`): Mikrofon → AudioWorklet → 16-kHz-PCM; Ausgabe 24 kHz mit Barge-in.
- Ein- und Ausgabe-Transkription → **Live-Untertitel** (Hörbehinderung) und Gesprächsverlauf; nach Sitzungsende werden Transkript → Chatverlauf und Gedächtnis übernommen.
- **Diktat:** `gemini-3.5-transcribe-live` streamt Text live direkt ins Chat-Eingabefeld oder in ein Formularfeld; Fallback: Aufnahme + `/api/transcribe`.

### 4b. Termine
- `show_appointment_slots` öffnet rechts die Terminauswahl (`AppointmentPanel` + `SlotPicker`). Die KI übergibt nur den Wunsch
  (`preferredWeekday`, `preferredDate`, `timeOfDay`) – welche Slots passen, berechnet der Browser (`matchingSlots`), nichts wird geraten.
- Buchen: Klick auf einen Slot oder `request_appointment_booking` → Bestätigungsdialog → `POST /api/appointments/:slotId/book`
  → Tabelle `bookings` (Referenznummer). Nach einem Klick bekommt IDA eine kurze Info, damit sie erklären kann, was mitzubringen ist.
- Seite **„Meine Termine“** (`frontend/screens/Appointments.tsx`, Route `/termine` per `history.pushState`):
  kommende Termine, .ics-Export, Stornieren (gibt den Slot frei, Eigentümerschaft wird geprüft), Neubuchung, Verlauf.
- Im Sprachdialog werden Tool-Ergebnisse mit Referenznummer zusätzlich als Karte in den Verlauf gelegt (`VoiceTurn.card`,
  danach `metadata.card` im Chatverlauf).

### 4c. Mikrofon-Lebenszyklus
- `MicCapture` prüft nach jedem `await`, ob inzwischen gestoppt wurde; alle Streams stehen in einer Registry →
  `releaseAllMicrophones()` beim Beenden von Sprachdialog/Diktat und beim Abmelden.
- Wird der Sprachdialog während des Verbindens beendet, gibt es keinen automatischen Retry.
- Diktat (`frontend/lib/use-dictation.ts`): eine Sitzung pro Start mit Generationszähler, Zwischen- und Endtranskripte
  (`interimInputTranscription` / `inputTranscription`) direkt ins Eingabefeld, Auto-Stopp nach 2 Minuten oder wenn der Tab verborgen wird.

### 5. Gedächtnis mit Entscheidungsmodell
`src/memory/*` – nach jeder Chat-Antwort (`waitUntil`) und am Ende jeder Sprachsitzung entscheidet ein separates Modell, was gespeichert/gelöscht wird:
- Kategorien `language`, `barrier`, `preference`, `context`; feste Schlüssel, die die UI direkt anwendet (`preferred_language`, `text_size`, `high_contrast`, `easy_language`, `prefers_voice`, `read_aloud`).
- Regeln: nur was die Person selbst mitteilt; keine Ausweis-/SV-Nummern, IBANs, Einmal-Antragsdaten, Namen, Spekulationen.
- Beim Login: Persona-Barrieren (Register) + Gedächtnis → Sprache, Schriftgröße, Kontrast, Leichte Sprache werden automatisch gesetzt.
- Transparenz (DSGVO): „Was IDA über mich weiß“ zeigt und löscht Einträge.
- Provider: `MEMORY_PROVIDER=auto` → Claude (über AI Gateway, wenn `ANTHROPIC_API_KEY`) → Workers AI → Gemini.

### 6. Robustheit
- Modell-Fallback-Kette (`withFallback`) mit Circuit Breaker (429 → 5 Min., 5xx → 30 s überspringen); Live-Fallback-Modell im Browser.
- Fehler aus dem Backend gehen als Tool-Ergebnis an das Modell (es erklärt Ausfälle und bietet Hilfe durch Menschen an); `MOCK_FAILURE_RATE` zum Testen.
- Rate-Limit für Live-Tokens pro Sitzung (KV).

## Barrierefreiheit (WCAG 2.2, Ziel AAA)
Kontraste ≥ 7:1, Fokusring (doppelt), 44–48-px-Ziele, Textgröße 100–200 %, Hochkontrastmodus, `prefers-reduced-motion`,
Skip-Link, `aria-live` für Antworten/Untertitel, Tastaturbedienung (inkl. Splitter mit Pfeiltasten), Vorlesen (Web Speech),
Leichte Sprache, Sprachdialog, Diktat, RTL-Sprachen, beliebige Sprache für UI und Formulare.

## Wichtige Dateien

| Datei | Inhalt |
|---|---|
| `src/index.ts` | Worker-Routing, Agent-Schutz |
| `src/routes/app-api.ts` | Bürger-API (Login, Live-Token, Tools, Übersetzung, Gedächtnis, Formulare) |
| `src/agent/citizen-assistant.ts` | Chat-Agent (Durable Object) |
| `src/agent/tools.ts` | Tool-Register (Text + Live) |
| `src/agent/system-prompt.ts` | Systemprompt (Chat + Sprache) |
| `src/live/setup.ts` | Gemini-Live-Setup |
| `src/memory/*` | Gedächtnis (D1) + Entscheidungsmodell |
| `src/translate/index.ts` | Übersetzungsebene |
| `src/shared/forms/*` | Formular-Nachbauten |
| `frontend/screens/Portal.tsx` | Chat, Sprache, Split-View |
| `frontend/components/FormPanel.tsx` | Formular + Overlay |
| `frontend/lib/gemini-live.ts`, `audio.ts` | Live-Client, Audio |
| `frontend/lib/form-store.ts` | Formularzustand + Client-Tool-Executor |

## Grenzen des Prototyps
- ID Austria, Register und Behörden-Backends sind simuliert; Regeln teilweise vereinfacht (als „mock“ gekennzeichnet).
- Fakten in `src/knowledge` sind vor einer Demo gegen oesterreich.gv.at zu prüfen (`verified: false`).
- Anhänge (Bild/PDF) werden an Gemini gesendet und im Chatverlauf der Sitzung gespeichert (max. 4 MB).
