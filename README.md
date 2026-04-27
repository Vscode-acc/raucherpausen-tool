# Raucherpausen-Tool (MVP)

## Lokale Entwicklung

### Voraussetzungen
- Node.js (empfohlen: aktuelle LTS)

### Install

```bash
cd raucherpausen-tool
npm install
```

### Start (Server + Desktop)

```bash
npm run dev
```

## Konfiguration

Der Desktop-Client verbindet sich per WebSocket zum Server.

- **Server**: Standardmäßig `http://localhost:8787`
- **Desktop**: kann per Umgebungsvariable `SERVER_URL` überschrieben werden

