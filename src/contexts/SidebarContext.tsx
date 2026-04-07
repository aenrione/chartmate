import {createContext, useContext, useState, type ReactNode} from 'react';

type SidebarContextValue = {
  sidebarContent: ReactNode | null;
  setSidebarContent: (content: ReactNode | null) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({children}: {children: ReactNode}) {
  const [sidebarContent, setSidebarContent] = useState<ReactNode | null>(null);

  return (
    <SidebarContext.Provider value={{sidebarContent, setSidebarContent}}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
