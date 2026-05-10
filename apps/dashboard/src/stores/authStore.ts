import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user?: User | null) => void;
  setToken: (token: string) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const storedToken = localStorage.getItem('cg_token');
const storedUserRaw = localStorage.getItem('cg_user');
const storedUser: User | null = storedUserRaw ? JSON.parse(storedUserRaw) : null;

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  user: storedUser,
  setAuth: (token, user) => {
    localStorage.setItem('cg_token', token);
    if (user) {
      localStorage.setItem('cg_user', JSON.stringify(user));
    }
    set({ token, user: user ?? null });
  },
  setToken: (token) => {
    localStorage.setItem('cg_token', token);
    set({ token });
  },
  setUser: (user) => {
    if (user) localStorage.setItem('cg_user', JSON.stringify(user));
    else localStorage.removeItem('cg_user');
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('cg_token');
    localStorage.removeItem('cg_user');
    set({ token: null, user: null });
  },
}));
