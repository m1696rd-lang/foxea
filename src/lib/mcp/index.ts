import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getFundOverview from "./tools/get-fund-overview";
import listMyPositions from "./tools/list-my-positions";
import listMyMovements from "./tools/list-my-movements";
import listMyCycleHistory from "./tools/list-my-cycle-history";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged and Vite inlines it at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "scalping-fox-mcp",
  title: "SCALPING FOX Capital Fund",
  version: "0.1.0",
  instructions:
    "Herramientas de solo lectura del fondo algorítmico SCALPING FOX. Cada llamada actúa como el usuario autenticado, por lo que solo devuelve las posiciones financieras y los movimientos que ese usuario tiene permitido ver. Usa get_fund_overview para el estado del fondo y del corte actual, list_my_positions para las posiciones del usuario y el resto del fondo agregado, list_my_movements para aportaciones y retiros, y list_my_cycle_history para las liquidaciones de cortes cerrados.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getFundOverview, listMyPositions, listMyMovements, listMyCycleHistory],
});
