# SMAIBY Web Updater PoC

WebSerial-basierter PoC zum Aktualisieren des KI-Modells auf einem Grove Vision AI V2 über USB-C.

## Lokal starten

```bash
npm install
npm run dev
```

Dann in Chrome oder Edge öffnen. WebSerial funktioniert nur in unterstützten Desktop-Browsern und in einem sicheren Kontext, also `https://` oder `localhost`.

## GitHub Pages Deployment

Dieses Projekt enthält bereits einen GitHub-Actions-Workflow:

```text
.github/workflows/deploy.yml
```

Vorgehen:

1. Neues GitHub-Repo erstellen.
2. Projektinhalt committen und auf `main` pushen.
3. In GitHub unter **Settings → Pages** als Source **GitHub Actions** auswählen.
4. Workflow laufen lassen.
5. Die veröffentlichte URL öffnen.

## OTA-Dateien

Die Web-App erwartet ein Manifest, z. B.:

https://raw.githubusercontent.com/SMAIBY/smaiby-ota/refs/heads/main/model-manifest.json

```json
{
  "version": "1.0.1",
  "url": "https://raw.githubusercontent.com/SMAIBY/smaiby-ota/refs/heads/main/2026-06-29_ei-mark1-object-detection-tensorflow-lite-int8-quantized-model.264_vela.tflite",
  "size": 734512,
  "sha256": "PUT_REAL_SHA256_HERE"
}
```

Das Modell muss das deploybare Grove/SenseCraft-kompatible Binary sein, nicht zwingend eine rohe `.tflite` Datei.

## Browser-Hinweis

Für das Flashen muss der Grove Vision AI V2 per USB-C direkt am PC/Mac hängen. Chrome oder Edge Desktop verwenden.
