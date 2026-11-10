"use server";
import { everythingDoors } from "./everything-data";

/** The doors of "Everything else", fresh each time the sheet opens. */
export async function everythingDoorsAction() {
  return everythingDoors();
}
