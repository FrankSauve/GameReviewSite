import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation } from "@apollo/client";
import { UPDATE_PROFILE } from "../graphql/mutations";
import { useAuth } from "./AuthContext";
import {
  applyAppearance,
  readStoredAppearance,
  resolveAppearance,
  storeAppearance,
  type Appearance,
  type PaletteKey,
  type ThemeKey,
} from "../lib/theme";

interface ThemeContextValue extends Appearance {
  setTheme: (theme: ThemeKey) => void;
  setPalette: (palette: PaletteKey) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "hud",
  palette: "midnight",
  setTheme: () => undefined,
  setPalette: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [updateProfile] = useMutation(UPDATE_PROFILE);

  // Read once: after a pick, `picked` is what answers, so re-reading storage on
  // every render would only ever return what we just wrote.
  const [stored] = useState(readStoredAppearance);
  // What was chosen in this tab, which outranks both the account and storage
  // because it is the most recent thing the viewer actually asked for.
  const [picked, setPicked] = useState<Partial<Appearance>>({});

  const base = resolveAppearance(user, stored);
  const theme = picked.theme ?? base.theme;
  const palette = picked.palette ?? base.palette;

  useEffect(() => {
    applyAppearance({ theme, palette });
  }, [theme, palette]);

  // A visitor who picked a look before signing in keeps it: the local choice is
  // pushed up once, rather than the empty account silently discarding it.
  const adopted = useRef(false);
  useEffect(() => {
    if (!user || adopted.current) return;
    adopted.current = true;
    if (user.theme ?? user.palette) return;
    if (!(stored.theme ?? stored.palette)) return;
    void updateProfile({ variables: { input: { theme, palette } } });
  }, [user, stored, theme, palette, updateProfile]);

  const choose = useCallback(
    (next: Partial<Appearance>) => {
      setPicked((prev) => ({ ...prev, ...next }));
      storeAppearance(next);
      if (user) void updateProfile({ variables: { input: next } });
    },
    [user, updateProfile],
  );

  const setTheme = useCallback(
    (theme: ThemeKey) => choose({ theme }),
    [choose],
  );
  const setPalette = useCallback(
    (palette: PaletteKey) => choose({ palette }),
    [choose],
  );

  return (
    <ThemeContext.Provider value={{ theme, palette, setTheme, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
