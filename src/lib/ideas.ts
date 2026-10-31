import type { LifeAreas } from "./life";

export type Idea = { emoji: string; title: string; detail: string; prompt: string };
export type IdeaGroup = { name: string; ideas: Idea[] };

/** What Jarvis can do, written as offers. Every idea maps to a skill and real tools; the prompt goes into the chat box for the user to send. */
export function ideaCatalog(a: LifeAreas): IdeaGroup[] {
  return [
    ...(a.school
      ? [
          {
            name: "School",
            ideas: [
              {
                emoji: "📄",
                title: "Send me your syllabus. I'll set up your whole semester.",
                detail: "Every due date, exam and weight goes into Classes and your calendar.",
                prompt: "Here's my syllabus. Add every due date and exam.",
              },
              {
                emoji: "🗂️",
                title: "Share a project or paper. I'll break it into steps with dates.",
                detail: "Small to-dos that end the day before it's due.",
                prompt: "Break my next big assignment into steps with dates before it's due.",
              },
              {
                emoji: "📚",
                title: "Exam coming? I'll plan your studying.",
                detail: "Study blocks in your real free time, around classes and shifts.",
                prompt: "Plan study time for my next exam in my free time.",
              },
              {
                emoji: "❓",
                title: "Quiz me before a test.",
                detail: "One question at a time, with hints. I never do graded work for you.",
                prompt: "Quiz me on my next exam's topics, one question at a time.",
              },
              {
                emoji: "✉️",
                title: "Need an extension? I'll draft the email.",
                detail: "A polite note to your professor that you review and send.",
                prompt: "Help me write a polite email to my professor asking for an extension.",
              },
              {
                emoji: "🎓",
                title: "Never miss an aid or scholarship deadline.",
                detail: "Tell me the dates and I'll remind you a week and a day before.",
                prompt: "Help me track my financial aid and scholarship deadlines.",
              },
            ],
          },
        ]
      : []),
    {
      name: "Money",
      ideas: [
        {
          emoji: "🔎",
          title: "Where did my money go this month?",
          detail: "Your top categories compared with last month, from your real records.",
          prompt: "Where did my money go this month?",
        },
        {
          emoji: "💰",
          title: "Set a savings goal. I'll tell you if you drift.",
          detail: "A weekly amount you can keep, tracked from your accounts.",
          prompt: "Help me set a savings goal and a weekly amount I can actually keep.",
        },
        {
          emoji: "🧾",
          title: "Find subscriptions you forgot about.",
          detail: "I list them with prices and show you how to cancel. You decide.",
          prompt: "Find subscriptions I might have forgotten about.",
        },
        {
          emoji: "🏷️",
          title: "Check for student prices.",
          detail: "Which of your subscriptions have a cheaper student plan, with sources.",
          prompt: "Which of my subscriptions have a student discount? Show the sources.",
        },
        {
          emoji: "📖",
          title: "Find the cheapest textbook.",
          detail: "Buy, rent or used, with links. I never buy anything for you.",
          prompt: "Find the cheapest way to get this textbook, with links: ",
        },
      ],
    },
    ...(a.work
      ? [
          {
            name: "Work",
            ideas: [
              {
                emoji: "📸",
                title: "Screenshot your schedule. I'll add every shift.",
                detail: "Shifts go on your calendar and I warn you about clashes.",
                prompt: "Add my shifts from this screenshot of my schedule.",
              },
              {
                emoji: "💵",
                title: "Does my paycheck match my hours?",
                detail: "I compare it with the shifts you worked.",
                prompt: "Does my last paycheck match the hours I worked?",
              },
              {
                emoji: "🕗",
                title: "Same hours every week? Set them once.",
                detail: "Like Monday to Friday, 8 to 5. Shifts fill in for you.",
                prompt: "I work the same hours every week. Set my regular hours.",
              },
            ],
          },
        ]
      : []),
    {
      name: "Health",
      ideas: [
        {
          emoji: "🔁",
          title: "Name a habit. I'll nudge you at the right moment.",
          detail: "With a streak that forgives one miss.",
          prompt: "Help me start a habit and remind me at the right time.",
        },
        {
          emoji: "❤️",
          title: "How did I sleep and move this week?",
          detail: "From Apple Health, once it's connected.",
          prompt: "How did I sleep and move this week?",
        },
      ],
    },
    {
      name: "Life",
      ideas: [
        {
          emoji: "🌙",
          title: "Give me the job before bed. I'll report at breakfast.",
          detail: "Tomorrow's plan, what's due and what needs you, ready in the morning.",
          prompt: "Plan tomorrow for me and tell me what needs me first.",
        },
        {
          emoji: "🗓️",
          title: "Plan my week in one go.",
          detail: "The three things to get ahead on, placed in your free time.",
          prompt: "Look at my week and tell me the three things to get ahead on.",
        },
        {
          emoji: "👋",
          title: "Losing touch with someone? I'll find a free time.",
          detail: "A slot that's actually free in your calendar.",
          prompt: "Find a free time this week to call someone I've been meaning to catch up with.",
        },
        { emoji: "🧠", title: "Bring what your other AI knows about you.", detail: "Paste it in. Nothing is saved until you approve each item.", prompt: "" },
      ],
    },
  ];
}
