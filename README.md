# SMAIBY Web Updater PoC

Browser-basierter PoC zum Aktualisieren des AI-Modells auf Seeed Grove Vision AI V2 über USB-C/WebSerial/XMODEM.

## Voraussetzungen

- Desktop Chrome oder Edge
- Vision AI V2 per USB-C am PC/Mac
- HTTPS Hosting, z. B. GitLab Pages
- Modell-Binary, das vom Vision V2 Bootloader auf die Model-Partition geschrieben werden kann

## Lokal starten

```bash
npm install
npm run dev
```

Dann Chrome/Edge öffnen und die lokale URL nutzen.

## GitLab Pages

1. Neues GitLab-Projekt erstellen.
2. Alle Dateien aus diesem Ordner committen.
3. Branch `main` pushen.
4. GitLab CI baut automatisch nach `public/`.

Falls dein Pages-Projekt unter einem Unterpfad läuft, setze in GitLab CI/CD Variables:

```text
VITE_BASE_PATH=/<dein-projektname>/
```

## Manifest

Beispiel:

```json
{
  "version": "1.0.1",
  "url": "https://example.com/smaiby_model_v1_0_1.bin",
  "size": 734512,
  "sha256": "..."
}
```

## Ablauf

1. Connect
2. AT-Test
3. Manifest laden
4. Modell laden und SHA256 prüfen
5. Bootloader starten
6. Offset `0x400000` senden
7. Modell per XMODEM senden
8. Reboot bestätigen

## Hinweis

Dieser PoC ist bewusst klein gehalten. Vor echtem Kundeneinsatz sollten Signaturen, Rollout-Kanäle, bessere Fehlerführung und Browser-Kompatibilitätschecks ergänzt werden.
