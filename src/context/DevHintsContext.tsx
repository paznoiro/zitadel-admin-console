import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface DevHintsCtx {
  showHints: boolean;
  toggle: () => void;
}

const Ctx = createContext<DevHintsCtx>({ showHints: false, toggle: () => {} });

export function DevHintsProvider({ children }: { children: ReactNode }) {
  const [showHints, setShowHints] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setShowHints((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Ctx.Provider value={{ showHints, toggle: () => setShowHints((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDevHints(): DevHintsCtx {
  return useContext(Ctx);
}
