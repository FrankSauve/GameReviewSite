import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@apollo/client";
import { GET_ME } from "../graphql/mutations";
import { startSignIn, startSignOut } from "../lib/auth";

export interface AuthUser {
  id: string;
  username: string;
  email?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (returnTo?: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: () => undefined,
  signOut: () => undefined,
});

/**
 * Identity comes from the session cookie the backend issued after the OIDC
 * login flow. There is no token to store, and none the JavaScript could read
 * even if there were: the server tells us who we are via the `me` query.
 *
 * A signed-out visitor gets `{ me: null }` with a 200. That is the ordinary
 * anonymous path, not an error — reviews are public, so the app carries on.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useQuery<{ me: AuthUser | null }>(GET_ME);

  return (
    <AuthContext.Provider
      value={{
        user: data?.me ?? null,
        loading,
        signIn: startSignIn,
        signOut: startSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
