"use client";
import { createContext, useContext } from "react";
import type { LifeAreas } from "@/lib/life";

/** Which parts of the app this user sees (school, work). Set once by the app shell. */
export const LifeAreasContext = createContext<LifeAreas>({ school: true, work: true });
export const useLifeAreas = () => useContext(LifeAreasContext);
