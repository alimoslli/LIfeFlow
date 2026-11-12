/**
 * Made-up statement lines, labelled by hand with one of our default categories before any model saw them (Step 0 of
 * docs/backlog/2026-11-12-local-models.md). They add to the simulator's shops (scripts/local-models/build-purchases.ts) so
 * the sorting test has 300 different shops, weighted toward what's hard: local places, card-reader prefixes (SQ *, TST*,
 * PAYPAL *), plain-word names, and shops whose name doesn't say what they sell. Format: "statement line | label".
 */
export const PURCHASE_BANK = `
SQ *MAMA LUPES TAQUERIA | Restaurants
TST* THE GREEN FORK 0231 | Restaurants
TST* PHO SAIGON KITCHEN | Restaurants
SQ *SUNRISE BAGELS | Restaurants
TOAST*BROOKLYN PIZZA CO | Restaurants
SQ *KIMCHI HOUSE | Restaurants
DOORDASH*SHAKE SHACK | Food Delivery
UBER *EATS PENDING | Food Delivery
GRUBHUB*THAIORCHID | Food Delivery
DD *DOORDASH PANERA | Food Delivery
POSTMATES ORDER 88213 | Food Delivery
SQ *BLUE BOTTLE COFFEE | Coffee
TST* RISE AND GRIND CAFE | Coffee
SQ *BEAN THERE ESPRESSO | Coffee
DUNKIN #346120 | Coffee
PEETS COFFEE 00412 | Coffee
SQ *THE DAILY GRIND | Coffee
TRADER JOE'S #552 | Groceries
SAFEWAY #1844 | Groceries
H-E-B #622 | Groceries
PUBLIX SUPER MAR 1291 | Groceries
WHOLEFDS MKT 10322 | Groceries
SPROUTS FARMERS MKT 412 | Groceries
LIDL US 2233 | Groceries
FOOD LION #0874 | Groceries
SQ *FARMERS MARKET STAND | Groceries
INSTACART*SUBSCRIPTION | Groceries
MEIJER # 211 | Groceries
SQ *THE TIPSY OWL BAR | Bars & Alcohol
TOTAL WINE AND MORE 1104 | Bars & Alcohol
TST* HOPS AND BARLEY TAPROOM | Bars & Alcohol
BINNYS BEVERAGE DEPOT | Bars & Alcohol
SHELL OIL 57444211 | Gas
CHEVRON 0204571 | Gas
EXXONMOBIL 4421 | Gas
CIRCLE K # 08124 | Gas
WAWA 8821 | Gas
SUNOCO 0771206 | Gas
TESLA SUPERCHARGER US | EV Charging
CHARGEPOINT INC | EV Charging
ELECTRIFY AMERICA 2203 | EV Charging
LYFT *RIDE TUE 8PM | Rideshare
LYFT *RIDE SAT 11PM | Rideshare
PARKMOBILE 8841 | Parking
SPOTHERO 2281101 | Parking
CITY OF CHICAGO PARKING METER | Parking
UNIVERSITY PARKING SVCS | Parking
CTA VENTRA 6621 | Public Transit
MTA*NYCT PAYGO | Public Transit
BART CLIPPER RELOAD | Public Transit
AMTRAK .COM 2311 | Travel
JIFFY LUBE #1882 | Car Maintenance
MIDAS #4410 | Car Maintenance
DISCOUNT TIRE 0443 | Car Maintenance
AUTOZONE #3302 | Car Maintenance
SQ *MIKES AUTO REPAIR | Car Maintenance
OLD NAVY ON-LINE 2210 | Clothing
H&M 0432 | Clothing
UNIQLO USA 1192 | Clothing
SHEIN.COM | Clothing
SQ *THRIFT ON MAIN | Clothing
NIKE.COM 8821 | Clothing
FOOT LOCKER #1022 | Clothing
BEST BUY 00011232 | Electronics
MICRO CENTER #071 | Electronics
B&H PHOTO 800-606-6969 | Electronics
APPLE STORE R142 | Electronics
IKEA SCHAUMBURG | Household
BED BATH BEYOND 0221 | Household
HOME DEPOT #1912 | Household
LOWES #00907 | Household
DOLLAR TREE 4412 | Household
SQ *THE HARDWARE CORNER | Household
CONTAINER STORE 41 | Household
ETSY.COM*SMALLSHOPCO | Online Shopping
EBAY O*12-08812-11231 | Online Shopping
TEMU.COM | Online Shopping
WAYFAIR*1234567 | Online Shopping
PAYPAL *ALIEXPRESS | Online Shopping
NETFLIX.COM | Streaming
DISNEY PLUS 888-905-7888 | Streaming
MAX.COM | Streaming
YOUTUBE PREMIUM | Streaming
PARAMOUNT+ | Streaming
PEACOCK 9C3B1 PREMIUM | Streaming
STEAMGAMES.COM 4259522985 | Games
PLAYSTATION NETWORK | Games
NINTENDO CB141137080 | Games
XBOX GAME PASS | Games
TICKETMASTER*KENDRICK | Events
EVENTBRITE*SPRING FORMAL | Events
SEATGEEK* GAME 1123 | Events
SQ *OPEN MIC NIGHT | Events
AMC THEATRES 9600 | Activities
REGAL CINEMAS 1144 | Activities
ROUND1 BOWLING ARCADE | Activities
SQ *CLIMB NATION GYM DAY | Activities
DAVE & BUSTERS #42 | Activities
TOPGOLF CHICAGO | Activities
MICHAELS STORES 4412 | Hobbies & Sports
JOANN STORES #2232 | Hobbies & Sports
GUITAR CENTER #331 | Hobbies & Sports
DICKS SPORTING GOODS 1204 | Hobbies & Sports
REI #145 SEATTLE | Hobbies & Sports
WALGREENS #1188 | Pharmacy
RITE AID STORE 05521 | Pharmacy
CVS/PHARMACY #09912 | Pharmacy
PLANET FITNESS 33021 | Fitness
ANYTIME FITNESS 2211 | Fitness
SQ *CORE POWER YOGA | Fitness
CLASSPASS* MONTHLY | Fitness
ORANGETHEORY FITNESS 0442 | Fitness
STUDENT HEALTH CENTER COPAY | Medical
QUEST DIAGNOSTICS | Medical
MINUTECLINIC #1243 | Medical
URGENT CARE OF EVANSTON | Medical
LABCORP 800-845-6167 | Medical
SMILE BRANDS DENTAL | Dental & Vision
WARBY PARKER 3302 | Dental & Vision
ASPEN DENTAL 1182 | Dental & Vision
LENSCRAFTERS #0432 | Dental & Vision
BETTERHELP 6501 | Mental Health
TALKSPACE | Mental Health
SQ *MINDFUL COUNSELING LLC | Mental Health
UNIV BURSAR TUITION PMT | Tuition
FLYWIRE*TUITION | Tuition
COLLEGE REGISTRATION FEE | Tuition
CHEGG ORDER 8821 | Books & Supplies
BARNES & NOBLE COLLEGE 2211 | Books & Supplies
PEARSON EDUCATION | Books & Supplies
STAPLES 00122 | Books & Supplies
OFFICE DEPOT #2201 | Books & Supplies
VERIZON WRLS P1023-01 | Phone
AT&T*BILL PAYMENT | Phone
MINT MOBILE | Phone
VISIBLE SERVICE | Phone
GEICO *AUTO | Insurance
STATE FARM INSURANCE 1232 | Insurance
LEMONADE INSURANCE | Insurance
PROGRESSIVE *INSURANCE | Insurance
ADOBE *CREATIVE CLOUD | Software
MICROSOFT*365 PERSONAL | Software
NOTION LABS INC | Software
GOOGLE *GOOGLE ONE | Software
DROPBOX*7H2K2 | Software
GRAMMARLY | Software
OPENAI *CHATGPT SUBSCR | Software
AMAZON PRIME*2K4L1 | Subscriptions
SPOTIFY P1A2B3C4 | Streaming
AUDIBLE*2L3K9 | Subscriptions
PATREON* MEMBERSHIP | Subscriptions
NYTIMES DIGITAL | Subscriptions
DUOLINGO PLUS | Subscriptions
COMED 0123456789 | Utilities
PG&E WEB ONLINE | Utilities
CITY WATER DEPT | Utilities
CONED ENERGY BILL | Utilities
XFINITY INTERNET 8772 | Internet
SPECTRUM 855-707-7328 | Internet
GOOGLE FIBER | Internet
STARLINK INTERNET | Internet
APARTMENTS RENT PORTAL | Rent
CAMPUS EDGE APTS RENT | Rent
ZILLOW RENT PAYMENT | Rent
GREAT CLIPS #8821 | Personal Care
SUPERCUTS 4432 | Personal Care
ULTA BEAUTY #422 | Personal Care
SEPHORA 0912 | Personal Care
SQ *NAIL SPA LOUNGE | Personal Care
SQ *FADED BARBERSHOP | Personal Care
PETCO 1442 | Pets
PETSMART # 0441 | Pets
CHEWY.COM | Pets
BANFIELD PET HOSPITAL | Pets
SQ *DOG GROOMING STUDIO | Pets
ATM WITHDRAWAL 1123 MAIN ST | Cash & ATM
CASH WITHDRAWAL CHASE ATM | Cash & ATM
ALLPOINT ATM 4421 | Cash & ATM
DELTA AIR 0062341123 | Flights
UNITED 0162211231 | Flights
SOUTHWEST AIR 5262211 | Flights
SPIRIT AIRLINES 4871 | Flights
AIRBNB HMQ3K2 | Hotels & Lodging
MARRIOTT CHICAGO DT | Hotels & Lodging
HOLIDAY INN EXPRESS 221 | Hotels & Lodging
HOSTELWORLD.COM | Hotels & Lodging
EXPEDIA 7212341 | Travel
GREYHOUND LINES 2211 | Travel
FLIXBUS 12093 | Travel
GOFUNDME *HELP SARAH | Gifts & Donations
REDCROSS DONATION | Gifts & Donations
SQ *CHURCH GIVING | Gifts & Donations
1-800-FLOWERS.COM | Gifts & Donations
EDIBLE ARRANGEMENTS 431 | Gifts & Donations
MONTHLY MAINTENANCE FEE | Fees & Interest
LATE FEE | Fees & Interest
FOREIGN TRANSACTION FEE | Fees & Interest
INTEREST CHARGE ON PURCHASES | Fees & Interest
OUT OF NETWORK ATM FEE | Fees & Interest
SQ *ROSIES DONUTS | Restaurants
TST* SMOKE AND BONES BBQ | Restaurants
SQ *HALAL GUYS CART | Restaurants
TST* SUSHI ZEN | Restaurants
SQ *WAFFLE WAGON | Restaurants
CAVA 0221 | Restaurants
SWEETGREEN 1142 | Restaurants
WINGSTOP 1182 | Restaurants
PANDA EXPRESS #2231 | Restaurants
SQ *BOBA BLISS | Coffee
KUNG FU TEA 221 | Coffee
SQ *SECOND CUP CAFE | Coffee
COSTCO WHSE #0388 | Groceries
SAMS CLUB #6432 | Groceries
ALDI 66032 | Groceries
SQ *CORNER BODEGA | Groceries
GOPUFF 8821 | Food Delivery
SQ *LA PALOMA BAKERY | Restaurants
TST* OLIVE AND THYME | Restaurants
SQ *NOODLE BAR 88 | Restaurants
FIVE GUYS 1142 | Restaurants
JERSEY MIKES 22311 | Restaurants
PORTILLOS #22 | Restaurants
SQ *CAFE MOCHA LOFT | Coffee
INTELLIGENTSIA COFFEE | Coffee
JEWEL OSCO 3341 | Groceries
MARIANOS #8834 | Groceries
WINCO FOODS #112 | Groceries
SQ *ASIAN MART | Groceries
VALERO 4412 | Gas
MARATHON PETRO 1123 | Gas
BP#9933224 | Gas
CASEY'S #3021 | Gas
ZARA USA 3391 | Clothing
FOREVER 21 #221 | Clothing
TJ MAXX #0771 | Clothing
ROSS STORES #1122 | Clothing
GAMESTOP #4412 | Games
SQ *BOARD GAME CAFE | Activities
SIX FLAGS GREAT AMERICA | Activities
SQ *ESCAPE ROOM LOOP | Activities
HOBBY LOBBY #431 | Hobbies & Sports
BLICK ART MATERIALS | Books & Supplies
BOOKSHOP.ORG | Books & Supplies
T-MOBILE POSTPAID | Phone
CRICKET WIRELESS | Phone
ALLSTATE INSURANCE 2201 | Insurance
SQ *TAILOR AND ALTERATIONS | Personal Care
SQ *TATTOO PARLOR 13 | Personal Care
`;

/** The bank as rows. */
export const purchaseBank = () =>
  PURCHASE_BANK.trim()
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .map(([description, label]) => ({ description, label }));
