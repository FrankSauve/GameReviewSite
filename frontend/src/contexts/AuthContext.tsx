import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@apollo/client";
import { GET_ME } from "../graphql/mutations";
import { startSignIn, startSignOut } from "../lib/authentik";

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
 * Identity comes from the authentik proxy outpost, which sits in front of the
 * authenticated GraphQL endpoint. There is no token to store: the server tells
 * us who we are via the `me` query.
 *
 * For a signed-out visitor that endpoint answers 401, which surfaces here as a
 * network error. That is the expected anonymous path, not a failure — reviews
 * are public, so the app carries on with `user: null`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useQuery<{ me: AuthUser | null }>(GET_ME, {
    errorPolicy: "all",
  });

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
