import http from "node:http";
import { WebSocketServer } from "ws";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? "8787");

type Member = {
  id: string;
  name: string;
  isSmoking: boolean;
};

type Room = {
  code: string;
  members: Map<string, Member>;
  sockets: Map<string, WebSocket>;
  majorityActive: boolean;
};

// Minimal type to avoid pulling DOM lib in tsconfig
type WebSocket = import("ws").WebSocket;

const rooms = new Map<string, Room>();

function getOrCreateRoom(codeRaw: string): Room {
  const code = codeRaw.trim().toUpperCase();
  const existing = rooms.get(code);
  if (existing) return existing;
  const created: Room = {
    code,
    members: new Map(),
    sockets: new Map(),
    majorityActive: false,
  };
  rooms.set(code, created);
  return created;
}

function computeMajorityActive(room: Room): boolean {
  const onlineCount = room.members.size;
  if (onlineCount === 0) return false;
  let smoking = 0;
  for (const m of room.members.values()) if (m.isSmoking) smoking++;
  return smoking > onlineCount / 2;
}

function broadcast(room: Room, payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

const JoinMsg = z.object({
  type: z.literal("joinRoom"),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(48),
});

const ToggleMsg = z.object({
  type: z.literal("toggleSmoking"),
  isSmoking: z.boolean(),
});

const ChatMsg = z.object({
  type: z.literal("chatMessage"),
  text: z.string().trim().min(1).max(500),
});

const ClientMsg = z.discriminatedUnion("type", [JoinMsg, ToggleMsg, ChatMsg]);

type ServerPresenceMember = { id: string; name: string; isSmoking: boolean };

function presencePayload(room: Room) {
  const members: ServerPresenceMember[] = Array.from(room.members.values()).map((m) => ({
    id: m.id,
    name: m.name,
    isSmoking: m.isSmoking,
  }));
  return { type: "presenceUpdate" as const, code: room.code, members, majorityActive: room.majorityActive };
}

function maybeEmitMajority(room: Room) {
  const next = computeMajorityActive(room);
  if (next === room.majorityActive) return;
  room.majorityActive = next;
  broadcast(room, { type: "majorityState", isActive: next });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("raucherpausen server");
});

const wss = new WebSocketServer({ server });

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

wss.on("listening", () => {
  // eslint-disable-next-line no-console
  console.log("[server] websocket ready");
});

wss.on("connection", (ws) => {
  const socketId = makeId();
  let room: Room | null = null;
  let memberId: string | null = null;
  let isAlive = true;

  ws.on("pong", () => {
    isAlive = true;
  });

  ws.on("message", (buf) => {
    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const parsed = ClientMsg.safeParse(raw);
    if (!parsed.success) {
      send(ws, { type: "error", message: "Invalid message" });
      return;
    }

    const msg = parsed.data;
    if (msg.type === "joinRoom") {
      room = getOrCreateRoom(msg.code);
      memberId = socketId;

      const safeName = msg.name.trim().slice(0, 48);
      room.members.set(memberId, { id: memberId, name: safeName, isSmoking: false });
      room.sockets.set(memberId, ws);

      // send initial presence to joiner + broadcast update
      send(ws, { type: "joined", id: memberId, code: room.code });
      broadcast(room, presencePayload(room));
      maybeEmitMajority(room);
      return;
    }

    if (msg.type === "toggleSmoking") {
      if (!room || !memberId) {
        send(ws, { type: "error", message: "Not joined" });
        return;
      }
      const member = room.members.get(memberId);
      if (!member) return;

      member.isSmoking = msg.isSmoking;
      broadcast(room, { type: "smokingNotice", id: member.id, name: member.name, isSmoking: member.isSmoking });
      broadcast(room, presencePayload(room));
      maybeEmitMajority(room);
      return;
    }

    if (msg.type === "chatMessage") {
      if (!room || !memberId) {
        send(ws, { type: "error", message: "Not joined" });
        return;
      }
      const member = room.members.get(memberId);
      if (!member) return;
      const text = msg.text.trim().slice(0, 500);
      if (!text) return;
      broadcast(room, {
        type: "chatMessage",
        id: member.id,
        name: member.name,
        text,
        createdAt: Date.now(),
      });
    }
  });

  ws.on("close", () => {
    if (!room || !memberId) return;
    room.sockets.delete(memberId);
    room.members.delete(memberId);
    broadcast(room, presencePayload(room));
    maybeEmitMajority(room);
    if (room.members.size === 0) rooms.delete(room.code);
  });

  const interval = setInterval(() => {
    if (!isAlive) {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      clearInterval(interval);
      return;
    }
    isAlive = false;
    try {
      ws.ping();
    } catch {
      // ignore
    }
  }, 30_000);

  ws.on("close", () => clearInterval(interval));
});

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});

