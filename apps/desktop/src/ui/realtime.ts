import { useAppState } from "./state";

type JoinedMsg = { type: "joined"; id: string; roomName: string };
type PresenceUpdateMsg = { type: "presenceUpdate"; roomName: string; members: { id: string; name: string; isSmoking: boolean }[]; majorityActive: boolean };
type SmokingNoticeMsg = { type: "smokingNotice"; id: string; name: string; isSmoking: boolean };
type MajorityStateMsg = { type: "majorityState"; isActive: boolean };
type ChatMessageMsg = { type: "chatMessage"; id: string; name: string; text: string; createdAt: number; fileDataUrl?: string };
type ErrorMsg = { type: "error"; message: string };

type Incoming = JoinedMsg | PresenceUpdateMsg | SmokingNoticeMsg | MajorityStateMsg | ChatMessageMsg | ErrorMsg;

// MVP nutzt ein simples JSON-WebSocket-Protokoll (kein socket.io).

export type RpSocket = {
  close: () => void;
  send: (msg: unknown) => void;
};

export function connectRealtime(serverUrl: string): RpSocket {
  // Convert http(s) to ws(s)
  const wsUrl = serverUrl.startsWith("https") 
    ? serverUrl.replace(/^https/, "wss") 
    : serverUrl.replace(/^http/, "ws");
  
  window.rp?.log(`[realtime] connecting to ${wsUrl}`);
  const ws = new WebSocket(wsUrl);
  const messageQueue: unknown[] = [];

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
      return;
    }

    if (data.type === "presenceUpdate") {
      window.rp?.log(`[realtime:presence] roomName=${data.roomName} members=${data.members.length}`);
      s.setMembers(data.members);
      s.setMajorityActive(Boolean((data as any).majorityActive));
      return;
    }

    if (data.type === "smokingNotice") {
      const who = data.name;
      window.rp?.log(`[realtime:smoking] ${who}: ${data.isSmoking ? "smoking" : "not smoking"}`);
      s.pushToast({ title: "Rauchen-Status", body: `${who} ist ${data.isSmoking ? "auf Rauchen" : "wieder da"}` });
      try {
        window.rp?.notify("Raucherpause", `${who} ist ${data.isSmoking ? "auf Rauchen" : "wieder da"}`);
      } catch {
        // ignore
      }
      return;
    }

    if (data.type === "majorityState") {
      window.rp?.log(`[realtime:majority] isActive=${data.isActive}`);
      s.setMajorityActive(data.isActive);
      if (data.isActive) {
        s.pushToast({ title: "Mehrheit raucht", body: "DU MUSS RAUCHEN" });
        try {
          window.rp?.notify("Mehrheit raucht", "DU MUSS RAUCHEN");
        } catch {
          // ignore
        }
      } else {
        s.pushToast({ title: "Entwarnung", body: "Mehrheit nicht mehr aktiv" });
      }
      return;
    }

    if (data.type === "chatMessage") {
      window.rp?.log(`[realtime:chat] from ${data.name}: "${data.text.slice(0, 50)}${data.text.length > 50 ? "..." : ""}"`);
      s.addChatMessage({
        id: data.id,
        name: data.name,
        text: data.text,
        createdAt: Number(data.createdAt || Date.now()),
        fileDataUrl: data.fileDataUrl,
      });
      return;
    }

    if (data.type === "error") {
      window.rp?.logError(`[realtime:error] ${data.message}`);
      s.pushToast({ title: "Server-Fehler", body: data.message });
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
  });

  ws.addEventListener("close", () => {
    window.rp?.log(`[realtime:close] disconnected`);
    const s = useAppState.getState();
    s.setCurrentRoom(null);
    s.setMyId(null);
    s.setMembers([]);
    s.setMajorityActive(false);
    s.pushToast({ title: "Socket", body: "Getrennt" });
  });

  ws.addEventListener("error", (ev) => {
    window.rp?.logError(`[realtime:ws-error]`, ev);
  });

  return {
    close: () => ws.close(),
    send,
  };
}

