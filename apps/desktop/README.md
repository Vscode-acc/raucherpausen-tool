# @raucherpausen/desktop

Electron Desktop-App:
- Raum-Code + Name joinen
- Online-Liste + „🚬 auf Rauchen“ toggeln
- Toasts + native Notification (best effort)
- GIF auswählen → Ränder trimmen → DVD-Bounce mit Slidern
- Wenn >50% rauchen: Freeze + „DU MUSS RAUCHEN“

## Start (Dev)

Wichtig: Die in Cursor mitgelieferte `node.exe` hat hier **kein npm**. Bitte eine normale Node.js Installation verwenden (inkl. `npm` im PATH).

```bash
cd raucherpausen-tool
npm install
npm run dev
```

## Build / Installer

```bash
cd raucherpausen-tool
npm install
npm run build
npm run dist -w @raucherpausen/desktop
```

## Konfiguration
- Desktop verbindet zu Server: `VITE_SERVER_URL` (Default: `http://localhost:8787`)

