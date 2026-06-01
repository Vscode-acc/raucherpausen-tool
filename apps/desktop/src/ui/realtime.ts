import { useAppState } from "./state";

type JoinedMsg = { type: "joined"; id: string; roomName: string };
type PresenceUpdateMsg = { type: "presenceUpdate"; roomName: string; members: { id: string; name: string; isSmoking: boolean }[]; majorityActive: boolean };
type SmokingNoticeMsg = { type: "smokingNotice"; id: string; name: string; isSmoking: boolean };
type MajorityStateMsg = { type: "majorityState"; isActive: boolean };
type ChatMessageMsg = { type: "chatMessage"; id: string; name: string; text: string; createdAt: number; fileDataUrl?: string };
type ErrorMsg = { type: "error"; message: string };
type ForceReconnectMsg = { type: "forceReconnect"; reason: string };

type Incoming = JoinedMsg | PresenceUpdateMsg | SmokingNoticeMsg | MajorityStateMsg | ChatMessageMsg | ErrorMsg | ForceReconnectMsg;

// MVP nutzt ein simples JSON-WebSocket-Protokoll (kein socket.io).

export type RpSocket = {
  close: () => void;
  send: (msg: unknown) => void;
};

// State für Auto-Reconnect
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let lastJoinInfo: { roomName: string; name: string } | null = null;

export function connectRealtime(serverUrl: string): RpSocket {
  // Convert http(s) to ws(s)
  const wsUrl = serverUrl.startsWith("https") 
    ? serverUrl.replace(/^https/, "wss") 
    : serverUrl.replace(/^http/, "ws");
  
  window.rp?.log(`[realtime] connecting to ${wsUrl}`);
  const ws = new WebSocket(wsUrl);
  const messageQueue: unknown[] = [];
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  const send = (msg: unknown) => {
    window.rp?.log(`[realtime:send] ${JSON.stringify(msg)}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      // Queue message if not open yet
      window.rp?.log(`[realtime:queue] message queued, readyState=${ws.readyState}`);
      messageQueue.push(msg);
    }
  };

  ws.addEventListener("message", (ev) => {
    let data: Incoming;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    const s = useAppState.getState();

    if (data.type === "joined") {
      window.rp?.log(`[realtime:joined] id=${data.id} roomName=${data.roomName}`);
      s.setMyId(data.id);
      s.setCurrentRoom(data.roomName as any);
      s.pushToast({ title: "Verbunden", body: `Raum ${data.roomName}` });
      // Save join info for auto-rejoin
      lastJoinInfo = { roomName: data.roomName, name: s.myName || "" };
      reconnectAttempts = 0; // Reset on successful join
      return;
    }

    if (data.type === "presenceUpdate") {
      window.rp?.log(`[realtime:presence] members=${data.members.length}`);
      s.setMembers(data.members);
      s.setMajorityActive(Boolean((data as any).majorityActive));
      return;
    }

    if (data.type === "smokingNotice") {
      const who = data.name;
      window.rp?.log(`[realtime:smoking] ${who}: ${data.isSmoking ? "smoking" : "not smoking"}`);
      s.pushToast({ title: "Rauchen-Status", body: `${who} ist ${data.isSmoking ? "auf Rauchen" : "wieder da"}` });
      return;
    }

    if (data.type === "majorityState") {
      window.rp?.log(`[realtime:majority] isActive=${data.isActive}`);
      s.setMajorityActive(data.isActive);
      return;
    }

    if (data.type === "chatMessage") {
      window.rp?.log(`[realtime:chat] from ${data.name}: "${data.text.slice(0, 50)}${data.text.length > 50 ? "..." : ""}"`);
      const room = s.currentRoom;
      if (room) {
        s.addChatMessage(room, {
          id: data.id,
          name: data.name,
          text: data.text,
          createdAt: Number(data.createdAt || Date.now()),
          fileDataUrl: data.fileDataUrl,
        });
      }
      return;
    }

    if (data.type === "error") {
      window.rp?.logError(`[realtime:error] ${data.message}`);
      s.pushToast({ title: "Server-Fehler", body: data.message });
      return;
    }

    if (data.type === "forceReconnect") {
      window.rp?.log(`[realtime:forceReconnect] server initiated: ${data.reason}`);
      s.pushToast({ title: "Server-Update", body: "Kurz neuvebunden..." });
      // Close and reconnect after a tiny delay
      ws.close(1000, "Server requested reconnect");
      return;
    }
  });

  ws.addEventListener("open", () => {
    window.rp?.log(`[realtime:open] connected`);
    // Send any queued messages
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      ws.send(JSON.stringify(msg));
    }
    useAppState.getState().pushToast({ title: "Socket", body: "Verbunden" });
    
    // Send ping every 60 seconds to keep connection active
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        window.rp?.log(`[realtime:ping] sending keep-alive ping`);
        send({ type: "ping" });
      }
    }, 60_000);
  });

  const scheduleReconnect = () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      window.rp?.logError(`[realtime:reconnect] max attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`);
      const s = useAppState.getState();
      s.pushToast({ title: "Verbindung verloren", body: "Bitte App neustarten" });
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, ...
    const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    
    window.rp?.log(`[realtime:reconnect] attempt ${reconnectAttempts} in ${delay}ms`);
    reconnectTimeout = setTimeout(() => {
      const socket = connectRealtime(serverUrl);
      
      // Auto-rejoin if we have saved join info
      if (lastJoinInfo) {
        window.rp?.log(`[realtime:auto-rejoin] rejoining ${lastJoinInfo.roomName}`);
        socket.send({
          type: "joinRoom",
          roomName: lastJoinInfo.roomName,
          name: lastJoinInfo.name,
        });
      }
    }, delay);
  };

  ws.addEventListener("close", () => {
    window.rp?.log(`[realtime:close] disconnected`);
    if (pingInterval) clearInterval(pingInterval);
    
    const s = useAppState.getState();
    s.pushToast({ title: "Socket", body: "Getrennt - versuche zu reconnecten..." });
    
    // Schedule reconnect
    scheduleReconnect();
  });

  ws.addEventListener("error", (ev) => {
    window.rp?.logError(`[realtime:ws-error]`, ev);
  });

  return {
    close: () => {
      if (reconnectTimeout) clearInterval(reconnectTimeout);
      if (pingInterval) clearInterval(pingInterval);
      ws.close();
    },
    send,
  };
}

