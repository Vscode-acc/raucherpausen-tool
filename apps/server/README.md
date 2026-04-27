# @raucherpausen/server

Kleiner Realtime-Server (WebSocket) für:
- Presence (wer ist online)
- Rauch-Status (pro Nutzer)
- Majority-State (>50% rauchen) als Broadcast

## Start

```bash
cd raucherpausen-tool
npm install
npm run dev:server
```

## Konfiguration
- `PORT` (Default: `8787`)

## Protokoll (JSON)
- Client → Server:
  - `{ "type": "joinRoom", "code": "TEAM1", "name": "Henning" }`
  - `{ "type": "toggleSmoking", "isSmoking": true }`
- Server → Clients:
  - `{ "type": "joined", "id": "...", "code": "TEAM1" }`
  - `{ "type": "presenceUpdate", "code": "TEAM1", "members": [...], "majorityActive": false }`
  - `{ "type": "smokingNotice", "id": "...", "name": "…", "isSmoking": true }`
  - `{ "type": "majorityState", "isActive": true }`

