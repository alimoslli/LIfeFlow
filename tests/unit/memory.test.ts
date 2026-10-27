import { describe, expect, it } from "vitest";
import { explicitMemoryRequest, similarContent } from "@/server/services/memory";

describe("explicit memory requests (checked against the user's own words)", () => {
  const requests = [
    "remember that I work Tuesdays",
    "Please remember I'm vegetarian",
    "Jarvis, remember my rent is due on the 1st",
    "ok remember this: I hate early classes",
    "Can you remember that my sister's birthday is May 3?",
    "could you please keep in mind that I have a car",
    "Don't forget I'm saving for Montréal",
    "Keep that in mind for next week",
    "make a note that I prefer evening shifts",
    "save this to your memory: I take the bus",
    "update your memory, I moved to Boston",
    "From now on, show amounts in whole dollars",
    "I switched jobs. Please remember that.",
    "I always want short answers, I'd like you to remember that",
  ];
  const notRequests = [
    "Do you remember what I spent on food last month?",
    "did you remember to add my quiz?",
    "I don't remember when my exam is",
    "I always forget my keys",
    "I can't remember my class schedule, what is it?",
    "what's on my calendar tomorrow",
    "I'm vegetarian, any cheap dinner ideas?",
    "add a task to remember the milk", // "remember" inside a task title is not a memory request
    "/tool save_memory {\"content\":\"Prefers studying in the morning.\"}",
  ];
  it.each(requests)("treats %j as an explicit request", (t) => expect(explicitMemoryRequest(t)).toBe(true));
  it.each(notRequests)("does not treat %j as an explicit request", (t) => expect(explicitMemoryRequest(t)).toBe(false));
});

describe("similar memories", () => {
  it("matches rewordings and ignores punctuation and case", () => {
    expect(similarContent("Prefers studying in the morning.", "prefers studying in the morning")).toBe(true);
    expect(similarContent("Works at the campus library on Tuesdays and Thursdays", "Works at the campus library on Tuesdays and Thursdays.")).toBe(true);
  });
  it("keeps different facts apart", () => {
    expect(similarContent("Prefers studying in the morning.", "Prefers studying at night.")).toBe(false);
    expect(similarContent("Rent is $900", "Rent is $1,200")).toBe(false);
    expect(similarContent("Has a car", "Has a cat")).toBe(false);
  });
});
