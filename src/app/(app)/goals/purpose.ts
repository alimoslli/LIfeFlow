import { pixel, type IconLike } from "@/components/pixel/pixel-icon";
import type { GoalPurpose } from "@/server/db/schema";

// our pixel pictures for each kind of money goal (owner: the icons were generic)
export const PURPOSE: Record<GoalPurpose, { label: string; icon: IconLike }> = {
  emergency: { label: "Emergency fund", icon: pixel("shield") },
  travel: { label: "Travel", icon: pixel("plane") },
  car: { label: "Car", icon: pixel("car") },
  home: { label: "Home or apartment", icon: pixel("home") },
  debt: { label: "Pay off debt", icon: pixel("card") },
  investing: { label: "Investing", icon: pixel("money") },
  education: { label: "Education", icon: pixel("class") },
  big_purchase: { label: "Big purchase", icon: pixel("bag") },
  other: { label: "Something else", icon: pixel("star") },
};
