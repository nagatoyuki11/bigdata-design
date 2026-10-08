import React, { createContext, useContext, useState, useCallback } from 'react';

export type DrawerType = 'song' | 'artist' | 'network' | 'collab' | 'imagery' | 'album' | 'lyric';

interface DrawerState {
  open: boolean;
  type: DrawerType | null;
  data: any;
}

interface DrawerContextValue {
  state: DrawerState;
  history: DrawerState[];
  openDrawer: (type: DrawerType, data: any) => void;
  closeDrawer: () => void;
  goBack: () => void;
}

const DrawerContext = createContext<DrawerContextValue>(null!);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DrawerState>({ open: false, type: null, data: null });
  const [history, setHistory] = useState<DrawerState[]>([]);

  const openDrawer = useCallback((type: DrawerType, data: any) => {
    setState(prev => {
      if (prev.open) setHistory(h => [...h, prev]);
      return { open: true, type, data };
    });
  }, []);

  const closeDrawer = useCallback(() => {
    setState({ open: false, type: null, data: null });
    setHistory([]);
  }, []);

  const goBack = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) { closeDrawer(); return h; }
      const prev = h[h.length - 1];
      setState(prev);
      return h.slice(0, -1);
    });
  }, [closeDrawer]);

  return (
    <DrawerContext.Provider value={{ state, history, openDrawer, closeDrawer, goBack }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer() { return useContext(DrawerContext); }
