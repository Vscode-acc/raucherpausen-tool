import { useAppState } from "./state";

type JoinedMsg = { type: "joined"; id: string; code: string };
type PresenceUpdateMsg = { type: "presenceUpdate"; code: string; members: { id: string; name: string; isSmoking: boolean }[]; majorityActive: boolean };
type SmokingNoticeMsg = { type: "smokingNotice"; id: string; name: string; isSmoking: boolean };
type MajorityStateMsg = { type: "majorityState"; isActive: boolean };
type ChatMessageMsg = { type: "chatMessage"; id: string; name: string; text: string; createdAt: number };
type ErrorMsg = { type: "error"; message: string };

type Incoming = JoinedMsg | PresenceUpdateMsg | SmokingNoticeMsg | MajorityStateMsg | ChatMessageMsg | ErrorMsg;

// MVP nutzt ein simples JSON-WebSocket-Protokoll (kein socket.io).

export type RpSocket = {
  close: () => void;
  send: (msg: unknown) => void;
};

export function connectRealtime(serverUrl: string): RpSocket {
  const wsUrl = serverUrl.replace(/^https?/, (match) => match === "https" ? "wss" : "ws");
  const ws = new WebSocket(wsUrl);

  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
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
      s.setMyId(data.id);
      s.setJoined(true);
      s.pushToast({ title: "Verbunden", body: `Raum ${data.code}` });
      return;
    }

    if (data.type === "presenceUpdate") {
      s.setMembers(data.members);
      s.setMajorityActive(Boolean((data as any).majorityActive));
      return;
    }

    if (data.type === "smokingNotice") {
      const who = data.name;
      s.pushToast({ title: "Rauchen-Status", body: `${who} ist ${data.isSmoking ? "auf Rauchen" : "wieder da"}` });
      try {
        window.rp?.notify("Raucherpause", `${who} ist ${data.isSmoking ? "auf Rauchen" : "wieder da"}`);
      } catch {
        // ignore
      }
      return;
    }

    if (data.type === "majorityState") {
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
      s.addChatMessage({
        id: data.id,
        name: data.name,
        text: data.text,
        createdAt: Number(data.createdAt || Date.now()),
      });
      return;
    }

    if (data.type === "error") {
      s.pushToast({ title: "Server-Fehler", body: data.message });
    }
  });

  ws.addEventListener("open", () => {
    useAppState.getState().pushToast({ title: "Socket", body: "Verbunden" });
  });

  ws.addEventListener("close", () => {
    const s = useAppState.getState();
    s.setJoined(false);
    s.setMyId(null);
    s.setMembers([]);
    s.setMajorityActive(false);
    s.pushToast({ title: "Socket", body: "Getrennt" });
  });

  return {
    close: () => ws.close(),
    send,
  };
}

