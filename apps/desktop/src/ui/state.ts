import { create } from "zustand";

export type Member = { id: string; name: string; isSmoking: boolean };

type Toast = { id: string; title: string; body: string; createdAt: number };
export type ChatMessage = { id: string; name: string; text: string; createdAt: number };
export type DisplayInfo = {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
};

type AppState = {
  serverUrl: string;
  joined: boolean;
  roomCode: string;
  myId: string | null;
  myName: string;
  members: Member[];
  majorityActive: boolean;

  isSmoking: boolean;

  alwaysOnTop: boolean;
  fullScreen: boolean;
  displays: DisplayInfo[];
  selectedDisplayId: number | null;

  // animation params
  scale: number; // 0.2..3
  speed: number; // px/s
  animSpeed: number; // 0.25..6 (multiplier)

  gifBytesBase64: string | null;
  gifVisible: boolean;
  gifRunning: boolean;
  chatMessages: ChatMessage[];
  toasts: Toast[];

  setServerUrl: (url: string) => void;
  setMyName: (name: string) => void;
  setRoomCode: (code: string) => void;
  setJoined: (joined: boolean) => void;
  setMyId: (id: string | null) => void;
  setMembers: (members: Member[]) => void;
  setMajorityActive: (active: boolean) => void;
  setIsSmoking: (val: boolean) => void;
  setAlwaysOnTop: (val: boolean) => void;
  setFullScreen: (val: boolean) => void;
  setDisplays: (val: DisplayInfo[]) => void;
  setSelectedDisplayId: (val: number | null) => void;

  setScale: (val: number) => void;
  setSpeed: (val: number) => void;
  setAnimSpeed: (val: number) => void;
  setGifBytesBase64: (b64: string | null) => void;
  setGifVisible: (visible: boolean) => void;
  setGifRunning: (running: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;

  pushToast: (t: { title: string; body: string }) => void;
  popToast: (id: string) => void;
};

const defaultServer = (import.meta as any).env?.VITE_SERVER_URL ?? "http://localhost:8787";

export const useAppState = create<AppState>((set, get) => ({
  serverUrl: String(defaultServer),
  joined: false,
  roomCode: "",
  myId: null,
  myName: "",
  members: [],
  majorityActive: false,

  isSmoking: false,

  // Keep the control tool window normal by default.
  alwaysOnTop: false,
  fullScreen: false,
  displays: [],
  selectedDisplayId: null,

  scale: 0.2,
  // Make it feel snappy out of the box; user can tune via sliders.
  speed: 420,
  animSpeed: 5,

  gifBytesBase64: null,
  gifVisible: true,
  gifRunning: false,
  chatMessages: [],
  toasts: [],

  setServerUrl: (serverUrl) => set({ serverUrl }),
  setMyName: (myName) => set({ myName }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setJoined: (joined) => set({ joined }),
  setMyId: (myId) => set({ myId }),
  setMembers: (members) => set({ members }),
  setMajorityActive: (majorityActive) => set({ majorityActive }),
  setIsSmoking: (isSmoking) => set({ isSmoking }),
  setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
  setFullScreen: (fullScreen) => set({ fullScreen }),
  setDisplays: (displays) => set({ displays }),
  setSelectedDisplayId: (selectedDisplayId) => set({ selectedDisplayId }),

  setScale: (scale) => set({ scale }),
  setSpeed: (speed) => set({ speed }),
  setAnimSpeed: (animSpeed) => set({ animSpeed }),
  setGifBytesBase64: (gifBytesBase64) => set({ gifBytesBase64 }),
  setGifVisible: (gifVisible) => set({ gifVisible }),
  setGifRunning: (gifRunning) => set({ gifRunning }),
  addChatMessage: (msg) => set({ chatMessages: [...get().chatMessages, msg].slice(-200) }),
  clearChat: () => set({ chatMessages: [] }),

  pushToast: ({ title, body }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, title, body, createdAt: Date.now() };
    set({ toasts: [toast, ...get().toasts].slice(0, 5) });
    setTimeout(() => get().popToast(id), 4000);
  },
  popToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

