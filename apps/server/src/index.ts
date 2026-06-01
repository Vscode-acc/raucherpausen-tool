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
  name: string;
  members: Map<string, Member>;
  sockets: Map<string, WebSocket>;
  majorityActive: boolean;
};

// Minimal type to avoid pulling DOM lib in tsconfig
type WebSocket = import("ws").WebSocket;

const FIXED_ROOMS = ["Rauchen", "memes", "Chat"] as const;
const rooms = new Map<string, Room>();

// Initialize fixed rooms
for (const roomName of FIXED_ROOMS) {
  rooms.set(roomName, {
    name: roomName,
    members: new Map(),
    sockets: new Map(),
    majorityActive: false,
  });
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
  roomName: z.enum(["Rauchen", "memes", "Chat"]),
  name: z.string().min(1).max(48),
});

const ToggleMsg = z.object({
  type: z.literal("toggleSmoking"),
  isSmoking: z.boolean(),
});

const ChatMsg = z.object({
  type: z.literal("chatMessage"),
  text: z.string().max(500).optional(),
  fileDataUrl: z.string().optional(),
}).refine((msg) => msg.text || msg.fileDataUrl, {
  message: "Either text or fileDataUrl must be provided",
});

const PingMsg = z.object({
  type: z.literal("ping"),
});

const ClientMsg = z.discriminatedUnion("type", [JoinMsg, ToggleMsg, ChatMsg, PingMsg]);

type ServerPresenceMember = { id: string; name: string; isSmoking: boolean };

function presencePayload(room: Room) {
  const members: ServerPresenceMember[] = Array.from(room.members.values()).map((m) => ({
    id: m.id,
    name: m.name,
    isSmoking: m.isSmoking,
  }));
  return { type: "presenceUpdate" as const, roomName: room.name, members, majorityActive: room.majorityActive };
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

  console.log(`[ws:connect] ${socketId}`);

  ws.on("pong", () => {
    isAlive = true;
  });

  ws.on("message", (buf) => {
    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString());
    } catch {
      console.log(`[ws:error:json] ${socketId} - Invalid JSON`);
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const parsed = ClientMsg.safeParse(raw);
    if (!parsed.success) {
      console.log(`[ws:error:parse] ${socketId} - Invalid message format`);
      send(ws, { type: "error", message: "Invalid message" });
      return;
    }

    const msg = parsed.data;
    if (msg.type === "joinRoom") {
      const roomName = msg.roomName as string;
      room = rooms.get(roomName) || null;
      if (!room) {
        console.log(`[ws:error] ${socketId} - Invalid room: ${roomName}`);
        send(ws, { type: "error", message: "Invalid room" });
        return;
      }
      memberId = socketId;

      const safeName = msg.name.trim().slice(0, 48);
      room.members.set(memberId, { id: memberId, name: safeName, isSmoking: false });
      room.sockets.set(memberId, ws);

      console.log(`[ws:join] ${memberId} joined room ${room.name} as "${safeName}" (${room.members.size} total)`);

      // send initial presence to joiner + broadcast update
      send(ws, { type: "joined", id: memberId, roomName: room.name });
      broadcast(room, presencePayload(room));
      maybeEmitMajority(room);
      return;
    }

    if (msg.type === "toggleSmoking") {
      if (!room || !memberId) {
        console.log(`[ws:error] ${socketId} - toggleSmoking but not joined`);
        send(ws, { type: "error", message: "Not joined" });
        return;
      }
      const member = room.members.get(memberId);
      if (!member) return;

      member.isSmoking = msg.isSmoking;
      console.log(`[ws:smoking] ${memberId} in ${room.name}: ${msg.isSmoking ? "smoking" : "not smoking"}`);
      broadcast(room, { type: "smokingNotice", id: member.id, name: member.name, isSmoking: member.isSmoking });
      broadcast(room, presencePayload(room));
      maybeEmitMajority(room);
      return;
    }

    if (msg.type === "chatMessage") {
      if (!room || !memberId) {
        console.log(`[ws:error] ${socketId} - chatMessage but not joined`);
        send(ws, { type: "error", message: "Not joined" });
        return;
      }
      const member = room.members.get(memberId);
      if (!member) return;
      const text = (msg.text || "").trim().slice(0, 500);
      if (!text && !msg.fileDataUrl) return;
      console.log(`[ws:chat] ${memberId} in ${room.name}: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`);
      const payload: any = {
        type: "chatMessage",
        id: member.id,
        name: member.name,
        text,
        createdAt: Date.now(),
      };
      if (msg.fileDataUrl) {
        payload.fileDataUrl = msg.fileDataUrl;
      }
      broadcast(room, payload);
      return;
    }

    if (msg.type === "ping") {
      // Log keep-alive ping from client
      if (room && memberId) {
        console.log(`[ws:ping] ${memberId} in ${room.name} - keep-alive`);
      } else {
        console.log(`[ws:ping] ${socketId} - keep-alive (not joined)`);
      }
      return;
    }
  });

  ws.on("close", () => {
    console.log(`[ws:close] ${memberId ? `${memberId} from ${room?.name}` : socketId}`);
    if (!room || !memberId) return;
    room.sockets.delete(memberId);
    room.members.delete(memberId);
    broadcast(room, presencePayload(room));
    maybeEmitMajority(room);
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
  
  // Self-ping to prevent free tier from spinning down due to inactivity
  // HTTP requests count as real activity, unlike WebSocket pings
  // Run every 8 minutes to ensure server stays active (spindown typically after ~15 mins)
  setInterval(() => {
    // Log current server status
    let totalMembers = 0;
    let roomStatus = "";
    for (const [roomName, room] of rooms) {
      totalMembers += room.members.size;
      roomStatus += `${roomName}:${room.members.size} `;
    }
    console.log(`[status-check] active rooms: [${roomStatus.trim()}] | total members: ${totalMembers}`);
    
    // Send HTTP request to trigger real activity
    const req = http.get(`http://localhost:${PORT}/health`, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        console.log(`[keep-alive] HTTP ping sent successfully`);
      });
    });
    req.on("error", (err) => {
      console.error(`[keep-alive] error: ${err.message}`);
    });
  }, 8 * 60 * 1000); // Every 8 minutes
});

