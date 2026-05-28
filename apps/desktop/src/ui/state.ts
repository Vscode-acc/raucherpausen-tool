import { create } from "zustand";

export type Member = { id: string; name: string; isSmoking: boolean };
export type Room = "Rauchen" | "memes" | "Chat";

type Toast = { id: string; title: string; body: string; createdAt: number };
export type ChatMessage = { id: string; name: string; text: string; createdAt: number; fileDataUrl?: string };

type AppState = {
  serverUrl: string;
  currentRoom: Room | null;
  myId: string | null;
  myName: string;
  members: Member[];
  majorityActive: boolean;

  isSmoking: boolean;

  chatMessages: Record<Room, ChatMessage[]>;
  toasts: Toast[];
  unreadCounts: Record<Room, number>;

  setServerUrl: (url: string) => void;
  setCurrentRoom: (room: Room | null) => void;
  setMyName: (name: string) => void;
  setMyId: (id: string | null) => void;
  setMembers: (members: Member[]) => void;
  setMajorityActive: (active: boolean) => void;
  setIsSmoking: (val: boolean) => void;

  addChatMessage: (room: Room, msg: ChatMessage) => void;
  clearChat: (room: Room) => void;
  clearUnread: (room: Room) => void;
  clearAllUnread: () => void;

  pushToast: (t: { title: string; body: string }) => void;
  popToast: (id: string) => void;
};

// Server URL: Production on Render, dev on localhost
const defaultServer = (import.meta as any).env?.VITE_SERVER_URL ?? "https://raucherpausen-server.onrender.com";

export const useAppState = create<AppState>((set, get) => ({
  serverUrl: String(defaultServer),
  currentRoom: null,
  myId: null,
  myName: "",
  members: [],
  majorityActive: false,

  isSmoking: false,

  chatMessages: {
    Rauchen: [],
    memes: [],
    Chat: [],
  },
  toasts: [],
  unreadCounts: {
    Rauchen: 0,
    memes: 0,
    Chat: 0,
  },

  setServerUrl: (serverUrl) => set({ serverUrl }),
  setCurrentRoom: (currentRoom) => set({ currentRoom }),
  setMyName: (myName) => set({ myName }),
  setMyId: (myId) => set({ myId }),
  setMembers: (members) => set({ members }),
  setMajorityActive: (majorityActive) => set({ majorityActive }),
  setIsSmoking: (isSmoking) => set({ isSmoking }),

  addChatMessage: (room, msg) => {
    const newState = {
      chatMessages: {
        ...get().chatMessages,
        [room]: [...get().chatMessages[room], msg].slice(-200)
      },
    };

    // Only increment unread if message is NOT from current user
    if (msg.name !== get().myName) {
      newState.unreadCounts = {
        ...get().unreadCounts,
        [room]: get().unreadCounts[room] + 1,
      };
    }

    set(newState);
  },
  clearChat: (room) => 
    set({
      chatMessages: {
        ...get().chatMessages,
        [room]: []
      }
    }),
  clearUnread: (room) =>
    set({
      unreadCounts: {
        ...get().unreadCounts,
        [room]: 0,
      }
    }),
  clearAllUnread: () =>
    set({
      unreadCounts: {
        Rauchen: 0,
        memes: 0,
        Chat: 0,
      }
    }),

  pushToast: ({ title, body }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, title, body, createdAt: Date.now() };
    set({ toasts: [toast, ...get().toasts].slice(0, 5) });
    setTimeout(() => get().popToast(id), 4000);
  },
  popToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

