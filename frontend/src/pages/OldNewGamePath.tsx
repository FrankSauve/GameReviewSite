import { Navigate, useParams } from "react-router-dom";
import { newGamePath } from "../lib/links";

/** The path before game sources: every id then was RAWG's. */
export function OldNewGamePath() {
  const { id = "" } = useParams<{ id: string }>();
  return <Navigate to={newGamePath("RAWG", id)} replace />;
}
