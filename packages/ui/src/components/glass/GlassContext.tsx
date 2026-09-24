import { createContext, useContext } from "react";

export const GlassContext = createContext({ enabled: false, reduced: false });
export const useGlass = () => useContext(GlassContext);
