import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';

type LayoutContextValue = {
  hideHeaderOnMobile: boolean;
  setHideHeaderOnMobile: (hide: boolean) => void;
  hideBottomNavOnMobile: boolean;
  setHideBottomNavOnMobile: (hide: boolean) => void;
  mobilePageTitle: string;
  setMobilePageTitle: (title: string) => void;
};

const LayoutContext = createContext<LayoutContextValue>({
  hideHeaderOnMobile: false,
  setHideHeaderOnMobile: () => {},
  hideBottomNavOnMobile: false,
  setHideBottomNavOnMobile: () => {},
  mobilePageTitle: '',
  setMobilePageTitle: () => {},
});

export function LayoutProvider({children}: {children: ReactNode}) {
  const [hideHeaderOnMobile, setHideHeaderOnMobile] = useState(false);
  const [hideBottomNavOnMobile, setHideBottomNavOnMobile] = useState(false);
  const [mobilePageTitle, setMobilePageTitle] = useState('');

  return (
    <LayoutContext.Provider value={{
      hideHeaderOnMobile, setHideHeaderOnMobile,
      hideBottomNavOnMobile, setHideBottomNavOnMobile,
      mobilePageTitle, setMobilePageTitle,
    }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}

/** Call in a component to hide the mobile header for the duration of its mount. */
export function useHideHeaderOnMobile() {
  const {setHideHeaderOnMobile} = useLayout();
  useEffect(() => {
    setHideHeaderOnMobile(true);
    return () => setHideHeaderOnMobile(false);
  }, [setHideHeaderOnMobile]);
}

/** Call in a component to hide the mobile bottom nav for the duration of its mount. */
export function useHideBottomNavOnMobile() {
  const {setHideBottomNavOnMobile} = useLayout();
  useEffect(() => {
    setHideBottomNavOnMobile(true);
    return () => setHideBottomNavOnMobile(false);
  }, [setHideBottomNavOnMobile]);
}

/** Call in a component to set the mobile page title for the duration of its mount. */
export function useMobilePageTitle(title: string) {
  const {setMobilePageTitle} = useLayout();
  useEffect(() => {
    setMobilePageTitle(title);
    return () => setMobilePageTitle('');
  }, [title, setMobilePageTitle]);
}
