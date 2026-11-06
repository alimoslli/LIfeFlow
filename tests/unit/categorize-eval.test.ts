import { describe, expect, it } from "vitest";
import { keywordCategory } from "@/server/services/finance/categorize";

/** Statement lines as banks send them → the category a person would pick (null = too ambiguous to guess). */
const CASES: [description: string, merchantName: string | null, amountCents: number, expected: string | null][] = [
  // Income must never land in a spending category.
  ["TARGET CORP PAYROLL PPD ID: 1410296", "Target", 64512, "Paycheck"],
  ["ADP PAYROLL DIR DEP", null, 81200, "Paycheck"],
  ["GUSTO PAY 123456", null, 54000, "Paycheck"],
  ["WALMART ASSOCIATES DIR DEP", "Walmart", 70100, "Paycheck"],
  ["DOORDASH DASHER PAYMENT", "DoorDash", 18450, "Side Income"],
  ["UBER DRIVER PAYOUT", "Uber", 22000, "Side Income"],
  ["INTEREST PAID", null, 112, "Interest Income"],
  ["AMAZON.COM REFUND", "Amazon", 2599, null],
  ["ZELLE FROM JORDAN SMITH", null, 4000, null],
  // Bills
  ["GEORGIA POWER CO AUTOPAY", "Georgia Power", -11220, "Utilities"],
  ["DUKE ENERGY PAYMENT", null, -9100, "Utilities"],
  ["CITY OF ATLANTA WATER", null, -4300, "Utilities"],
  ["T-MOBILE *AUTOPAY 800-937-8997 WA", "T-Mobile", -6812, "Phone"],
  ["VERIZON WRLS P1234-01", "Verizon", -7500, "Phone"],
  ["XFINITY MOBILE", "Xfinity", -4500, "Phone"],
  ["COMCAST XFINITY INTERNET", "Comcast", -6500, "Internet"],
  ["PROGRESSIVE *INSURANCE", "Progressive", -11840, "Insurance"],
  ["RENT PAYMENT CAMPUS EDGE APTS", null, -95000, "Rent"],
  ["CHASE CREDIT CRD AUTOPAY", null, -25000, "Credit Card Payment"],
  ["CAPITAL ONE MOBILE PMT", "Capital One", -12000, "Credit Card Payment"],
  // Subscriptions
  ["NETFLIX.COM 866-579-7172 CA", "Netflix", -1549, "Streaming"],
  ["SPOTIFY USA", "Spotify", -1199, "Streaming"],
  ["OPENAI *CHATGPT SUBSCR", "OpenAI", -2000, "Software"],
  ["APPLE.COM/BILL 866-712-7753 CA", "Apple", -299, "Subscriptions"],
  ["Amazon Prime*2K4L59AB3", "Amazon Prime", -1499, "Subscriptions"],
  ["PLANET FITNESS CLUB FEES", "Planet Fitness", -2499, "Fitness"],
  // Everyday spending
  ["STARBUCKS STORE 08812", "Starbucks", -545, "Coffee"],
  ["KROGER #432 ATLANTA GA", "Kroger", -6200, "Groceries"],
  ["CHIPOTLE 2291 ATLANTA GA", "Chipotle", -1250, "Restaurants"],
  ["UBER *TRIP HELP.UBER.COM", "Uber", -1800, "Rideshare"],
  ["UBER EATS", "Uber Eats", -2400, "Food Delivery"],
  ["SHELL OIL 57444810", "Shell", -4000, "Gas"],
  ["TARGET T-1294 ATLANTA GA", "Target", -4218, "Household"],
  ["AMZN Mktp US*2K1AB", "Amazon", -3200, "Online Shopping"],
  ["CVS/PHARMACY #1234", "CVS", -1500, "Pharmacy"],
  ["GEORGIA STATE UNIV BURSAR", null, -150000, "Tuition"],
  ["OVERDRAFT FEE FOR A TRANSACTION", null, -3500, "Fees & Interest"],
  ["NON-NETWORK ATM FEE", null, -300, "Fees & Interest"],
  ["VENMO PAYMENT 1029384756", "Venmo", -2500, null],
  ["DELTA DENTAL OF GA", null, -4500, "Insurance"],
];

describe("categorizing statement lines", () => {
  it("puts each line where a person would, and income never in spending", () => {
    const wrong = CASES.map(([description, merchantName, amountCents, expected]) => ({
      description,
      expected,
      got: keywordCategory({ description, merchantName }, amountCents),
    })).filter((c) => c.got !== c.expected);
    console.log(`${CASES.length - wrong.length}/${CASES.length} right`, JSON.stringify(wrong, null, 1));
    expect(wrong).toEqual([]);
  });
});

describe("newer categories", () => {
  it("sorts online shopping, bars, pets, car care, subscriptions and cash", () => {
    const k = (d: string) => keywordCategory({ description: d });
    expect(k("AMZN Mktp US*2K4")).toBe("Online Shopping");
    expect(k("ETSY.COM")).toBe("Online Shopping");
    expect(k("TARGET STORE 1234")).toBe("Household"); // the store, not the website
    expect(k("TOTAL WINE & MORE")).toBe("Bars & Alcohol");
    expect(k("PETSMART #482")).toBe("Pets");
    expect(k("JIFFY LUBE 4411")).toBe("Car Maintenance");
    expect(k("AMAZON PRIME*TX")).toBe("Subscriptions");
    expect(k("ATM WITHDRAWAL 1ST ST")).toBe("Cash & ATM");
  });
});

describe("travel, lifestyle, activities, sports and health", () => {
  it("sorts them into the right place", () => {
    const k = (d: string) => keywordCategory({ description: d });
    expect(k("DELTA AIR 0062341")).toBe("Flights");
    expect(k("AIRBNB * HMXYZ")).toBe("Hotels & Lodging");
    expect(k("MARRIOTT DOWNTOWN")).toBe("Hotels & Lodging");
    expect(k("TESLA SUPERCHARGER")).toBe("EV Charging");
    expect(k("DICKS SPORTING GOODS")).toBe("Sports");
    expect(k("TOPGOLF ATLANTA")).toBe("Activities");
    expect(k("ZOO ATLANTA TICKETS")).toBe("Activities");
    expect(k("SERENITY DAY SPA")).toBe("Lifestyle");
    expect(k("BRIGHT SMILES DENTIST")).toBe("Dental & Vision");
    expect(k("BETTERHELP INC")).toBe("Mental Health");
    expect(k("PUBLIX SUPER MARKETS")).toBe("Groceries"); // not "pub"
  });
});
