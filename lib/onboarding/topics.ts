/**
 * lib/onboarding/topics — the "What you follow" catalog, and the sensitive
 * categories on the privacy screen. Client-safe plain data.
 * ────────────────────────────────────────────────────────────────────────────
 * Three levels, so somebody can be specific instead of broad:
 *
 *   CATEGORY   "Cars & motorsport"   a collapsible section on the screen
 *     CHIP     "Motorsport"          tapping it selects it AND reveals its subs
 *       SUB    "Formula 1"           the specific thing people actually follow
 *
 * Every pick (chip or sub) has a globally unique id, and the walkthrough stores
 * a flat list of those ids — so the shape of WalkthroughAnswers did not have to
 * change when this grew from 18 picks to a few hundred.
 *
 * What a pick does:
 *  - `topics`  interest topic ids from lib/persona/interests TOPICS. Optional:
 *              a pick with none still ranks, because deriveInterests falls back
 *              to the pick's own label as a custom keyword ("I follow bouldering."
 *              → keyword "bouldering"). tests/walkthrough.test.ts proves every
 *              single pick derives something.
 *  - `feeds`   ids from lib/brief/feed-catalog.json. Optional: plenty of picks
 *              (Local news, your own craft) have no good public feed, and that
 *              is fine — they still shape the Persona and the Brief's ranking.
 *  - `aka`     extra words the search box should match.
 *
 * LABEL RULE, enforced by a test: a label must be at most three words and start
 * with a letter or digit, because that is what lib/persona/interests can lift
 * back out of "I follow <label>." Anything longer derives nothing and is a
 * silent no-op.
 */

export type SensitiveId = "finance" | "health" | "family" | "location";

export interface TopicPick {
  id: string;
  label: string;
  /** Interest topic ids from lib/persona/interests TOPICS. */
  topics?: string[];
  /** Feed ids from lib/brief/feed-catalog.json. */
  feeds?: string[];
  /** Extra search terms. */
  aka?: string[];
  /** Overrides the category's category-wide tag. */
  sensitive?: SensitiveId;
}

export interface TopicChip extends TopicPick {
  /** Revealed under the chip once it is selected. */
  subs?: TopicPick[];
}

export interface TopicCategory {
  id: string;
  label: string;
  /** Applies to every pick inside unless the pick says otherwise. */
  sensitive?: SensitiveId;
  chips: TopicChip[];
}

/** Chips shown before "Show all" inside an expanded category. */
export const CHIPS_BEFORE_MORE = 6;

export const CATEGORIES: readonly TopicCategory[] = [
  {
    id: "tech",
    label: "Tech",
    chips: [
      { id: "software", label: "Software", aka: ["coding", "developer", "engineering"], topics: ["frontend", "programming"], feeds: ["stackoverflow", "hn"], subs: [
        { id: "frontend", label: "Front-end", topics: ["frontend", "css"], feeds: ["css-tricks", "smashing"] },
        { id: "react", label: "React", topics: ["react-next"], feeds: ["react", "overreacted"] },
        { id: "css", label: "CSS", topics: ["css"], feeds: ["css-tricks", "tailwind"] },
        { id: "python", label: "Python", topics: ["programming"], feeds: ["realpython"] },
        { id: "rust", label: "Rust", aka: ["rustlang"], topics: ["programming"], feeds: ["rustblog"] },
        { id: "golang", label: "Golang", aka: ["go", "go lang"], topics: ["programming"], feeds: ["goblog"] },
        { id: "databases", label: "Databases", aka: ["sql", "postgres"], topics: ["programming"], feeds: ["postgres"] },
        { id: "devops", label: "DevOps", aka: ["kubernetes", "docker", "ci"], topics: ["programming"], feeds: ["kubernetes"] },
        { id: "opensource", label: "Open source", topics: ["open-source"], feeds: ["githubblog", "lobsters"] },
      ] },
      { id: "ai", label: "AI", aka: ["artificial intelligence", "llm"], topics: ["ai-tools"], feeds: ["simonwillison", "techreview"], subs: [
        { id: "llms", label: "LLMs", aka: ["chatgpt", "claude", "gpt"], topics: ["ai-tools"], feeds: ["simonwillison"] },
        { id: "local-models", label: "Local models", aka: ["ollama", "lm studio", "offline ai"], topics: ["local-models"], feeds: ["huggingface", "bair"] },
        { id: "ai-tools", label: "AI tools", topics: ["ai-tools"], feeds: ["swyx"] },
        { id: "machine-learning", label: "Machine learning", aka: ["ml", "training"], topics: ["ai-tools"], feeds: ["bair"] },
        { id: "ai-policy", label: "AI policy", aka: ["regulation", "safety"], topics: ["ai-tools"], feeds: ["techreview"] },
      ] },
      { id: "security", label: "Security", aka: ["infosec", "hacking"], topics: ["privacy-security"], feeds: ["bleepingcomputer", "krebs"], subs: [
        { id: "privacy", label: "Privacy", aka: ["tracking", "surveillance"], topics: ["privacy-security"], feeds: ["eff"] },
        { id: "encryption", label: "Encryption", topics: ["privacy-security"], feeds: ["schneier"] },
        { id: "breaches", label: "Breaches", aka: ["ransomware", "malware"], topics: ["privacy-security"], feeds: ["bleepingcomputer"] },
      ] },
      { id: "gadgets", label: "Gadgets", aka: ["hardware", "devices"], topics: ["hardware"], feeds: ["theverge", "engadget"], subs: [
        { id: "phones", label: "Phones", aka: ["android", "iphone"], topics: ["hardware"], feeds: ["androidauthority", "macrumors"] },
        { id: "laptops", label: "Laptops", aka: ["pc", "mac"], topics: ["hardware"], feeds: ["arstechnica"] },
        { id: "wearables", label: "Wearables", aka: ["watch", "fitness tracker"], topics: ["hardware"], feeds: ["engadget"] },
        { id: "chips", label: "Chips", aka: ["cpu", "gpu", "silicon"], topics: ["hardware"], feeds: ["arstechnica"] },
      ] },
      { id: "selfhosting", label: "Self-hosting", aka: ["homelab", "nas", "docker"], topics: ["self-hosting"], feeds: ["selfhst"], subs: [
        { id: "homelab", label: "Homelab", topics: ["self-hosting"], feeds: ["selfhst"] },
        { id: "home-automation", label: "Home automation", aka: ["smart home"], topics: ["self-hosting"], feeds: ["homeassistant"] },
        { id: "raspberry-pi", label: "Raspberry Pi", topics: ["making", "hardware"], feeds: ["raspberrypi"] },
        { id: "backups", label: "Backups", topics: ["self-hosting"] },
      ] },
      { id: "design", label: "Design", aka: ["ux", "ui"], topics: ["product-design", "design-systems"], feeds: ["smashing", "sidebar"], subs: [
        { id: "design-systems", label: "Design systems", topics: ["design-systems"], feeds: ["smashing"] },
        { id: "typography", label: "Typography", aka: ["fonts", "type"], topics: ["typography"], feeds: ["ia"] },
        { id: "accessibility", label: "Accessibility", aka: ["a11y", "screen reader"], topics: ["accessibility"], feeds: ["a11yproject", "adrianroselli"] },
        { id: "user-research", label: "User research", topics: ["ux-research"], feeds: ["nngroup"] },
        { id: "product-design", label: "Product design", topics: ["product-design"], feeds: ["alistapart"] },
      ] },
      { id: "tech-news", label: "Tech news", topics: ["ai-tools", "hardware"], feeds: ["arstechnica", "wired"] },
    ],
  },
  {
    id: "making",
    label: "Making & DIY",
    chips: [
      { id: "woodworking", label: "Woodworking", aka: ["carpentry", "joinery"], topics: ["woodworking"], feeds: ["finewoodworking", "popularwoodworking"], subs: [
        { id: "furniture-making", label: "Furniture", topics: ["woodworking"], feeds: ["finewoodworking"] },
        { id: "hand-tools", label: "Hand tools", aka: ["chisel", "plane"], topics: ["woodworking"], feeds: ["popularwoodworking"] },
        { id: "cnc", label: "CNC", aka: ["router", "milling"], topics: ["woodworking", "making"] },
      ] },
      { id: "printing3d", label: "3D printing", aka: ["3d printer", "filament", "resin"], topics: ["3d-printing"], feeds: ["3dprintcom", "makezine"], subs: [
        { id: "fdm", label: "Filament printing", aka: ["fdm"], topics: ["3d-printing"], feeds: ["3dprintcom"] },
        { id: "resin", label: "Resin printing", topics: ["3d-printing"], feeds: ["3dprintcom"] },
        { id: "cad", label: "CAD", aka: ["modelling", "fusion"], topics: ["3d-printing", "making"] },
      ] },
      { id: "electronics", label: "Electronics", aka: ["circuits", "arduino"], topics: ["making"], feeds: ["hackaday"], subs: [
        { id: "arduino", label: "Arduino", topics: ["making"], feeds: ["hackaday"] },
        { id: "soldering", label: "Soldering", topics: ["making"], feeds: ["hackaday"] },
        { id: "retro-computing", label: "Retro computing", topics: ["making", "hardware"], feeds: ["timeextension"] },
      ] },
      { id: "crafts", label: "Crafts", aka: ["handmade"], topics: ["making"], feeds: ["makezine"], subs: [
        { id: "sewing", label: "Sewing", topics: ["making"] },
        { id: "knitting", label: "Knitting", aka: ["crochet", "yarn"], topics: ["making"] },
        { id: "leatherwork", label: "Leatherwork", topics: ["making"] },
        { id: "pottery", label: "Pottery", aka: ["ceramics"], topics: ["making"] },
      ] },
      { id: "repair", label: "Repair", aka: ["fixing", "restore"], topics: ["repair"], feeds: ["ifixit"], subs: [
        { id: "right-to-repair", label: "Right to repair", topics: ["repair"], feeds: ["ifixit"] },
        { id: "restoration", label: "Restoration", topics: ["repair"], feeds: ["ifixit"] },
      ] },
    ],
  },
  {
    id: "cars",
    label: "Cars & motorsport",
    chips: [
      { id: "motorsport", label: "Motorsport", aka: ["racing", "race"], topics: ["motorsport"], feeds: ["msf1"], subs: [
        { id: "f1", label: "Formula 1", aka: ["f1", "grand prix"], topics: ["motorsport"], feeds: ["msf1", "autosportf1"] },
        { id: "nascar", label: "NASCAR", aka: ["stock car"], topics: ["motorsport"], feeds: ["msnascar"] },
        { id: "indycar", label: "IndyCar", aka: ["indy 500"], topics: ["motorsport"], feeds: ["msindycar"] },
        { id: "wec", label: "Endurance racing", aka: ["wec", "le mans", "imsa"], topics: ["motorsport"], feeds: ["mswec"] },
        { id: "rally", label: "Rally", aka: ["wrc"], topics: ["motorsport"], feeds: ["mswrc"] },
        { id: "motogp", label: "MotoGP", aka: ["bike racing"], topics: ["motorsport"], feeds: ["msmotogp"] },
        { id: "karting", label: "Karting", aka: ["go kart"], topics: ["motorsport"] },
        { id: "sim-racing", label: "Sim racing", aka: ["iracing"], topics: ["motorsport", "gaming"] },
      ] },
      { id: "cars-general", label: "Cars", aka: ["automotive"], topics: ["cars"], feeds: ["jalopnik", "caranddriver"], subs: [
        { id: "evs", label: "Electric cars", aka: ["ev", "tesla"], topics: ["cars", "climate"], feeds: ["electrek"] },
        { id: "classic-cars", label: "Classic cars", aka: ["vintage"], topics: ["cars"], feeds: ["hagerty"] },
        { id: "jdm", label: "JDM", aka: ["japanese imports"], topics: ["cars"], feeds: ["jalopnik"] },
        { id: "car-maintenance", label: "Car maintenance", aka: ["servicing", "wrenching"], topics: ["cars", "repair"] },
        { id: "track-days", label: "Track days", topics: ["cars", "motorsport"] },
      ] },
      { id: "motorcycles", label: "Motorcycles", aka: ["bikes", "riding"], topics: ["cars"], subs: [
        { id: "adventure-riding", label: "Adventure riding", topics: ["cars", "outdoors"] },
        { id: "sportbikes", label: "Sportbikes", topics: ["cars"] },
      ] },
    ],
  },
  {
    id: "sports",
    label: "Sports",
    chips: [
      { id: "football", label: "Football", aka: ["soccer"], topics: ["sports"], feeds: ["espnsoccer"], subs: [
        { id: "premier-league", label: "Premier League", topics: ["sports"], feeds: ["espnsoccer"] },
        { id: "champions-league", label: "Champions League", topics: ["sports"], feeds: ["espnsoccer"] },
        { id: "world-cup", label: "World Cup", topics: ["sports"], feeds: ["espnsoccer"] },
      ] },
      { id: "nfl", label: "American football", aka: ["nfl", "gridiron"], topics: ["sports"], feeds: ["espnnfl"] },
      { id: "basketball", label: "Basketball", aka: ["nba", "hoops"], topics: ["sports"], feeds: ["espnnba"] },
      { id: "baseball", label: "Baseball", aka: ["mlb"], topics: ["sports"], feeds: ["espnmlb"] },
      { id: "hockey", label: "Hockey", aka: ["nhl"], topics: ["sports"], feeds: ["espnnhl"] },
      { id: "tennis", label: "Tennis", topics: ["sports"], feeds: ["espntennis"] },
      { id: "golf", label: "Golf", topics: ["sports"], feeds: ["espngolf"] },
      { id: "combat-sports", label: "Combat sports", aka: ["mma", "ufc", "boxing"], topics: ["sports"], feeds: ["espnmma"] },
      { id: "running", label: "Running", aka: ["marathon", "5k"], topics: ["running"], feeds: ["runnersworld"], subs: [
        { id: "marathon", label: "Marathon", topics: ["running"], feeds: ["runnersworld"] },
        { id: "trail-running", label: "Trail running", topics: ["running", "outdoors"] },
      ] },
      { id: "cycling", label: "Cycling", aka: ["bike", "riding"], topics: ["cycling"], feeds: ["bicycling"], subs: [
        { id: "tour-de-france", label: "Tour de France", topics: ["cycling"], feeds: ["bicycling"] },
        { id: "gravel", label: "Gravel riding", topics: ["cycling", "outdoors"], feeds: ["bicycling"] },
        { id: "bike-commuting", label: "Bike commuting", topics: ["cycling"] },
      ] },
      { id: "sports-news", label: "Sports news", topics: ["sports"], feeds: ["espn"] },
    ],
  },
  {
    id: "money",
    label: "Money & business",
    sensitive: "finance",
    chips: [
      { id: "personal-finance", label: "Personal finance", aka: ["budget", "saving"], topics: ["personal-finance"], feeds: ["mrmoneymustache", "ofdollarsanddata"], subs: [
        { id: "budgeting", label: "Budgeting", topics: ["personal-finance"], feeds: ["mrmoneymustache"] },
        { id: "saving", label: "Saving", topics: ["personal-finance"], feeds: ["mrmoneymustache"] },
        { id: "index-funds", label: "Index funds", topics: ["personal-finance"], feeds: ["ofdollarsanddata"] },
        { id: "retirement", label: "Retirement", aka: ["fire", "pension"], topics: ["personal-finance"], feeds: ["awoc"] },
        { id: "debt-payoff", label: "Debt payoff", topics: ["personal-finance"] },
      ] },
      { id: "investing", label: "Investing", aka: ["stocks", "markets"], topics: ["personal-finance"], feeds: ["awoc"], subs: [
        { id: "stocks", label: "Stocks", topics: ["personal-finance"], feeds: ["awoc"] },
        { id: "real-estate", label: "Real estate", aka: ["property"], topics: ["personal-finance"] },
        { id: "crypto", label: "Crypto", aka: ["bitcoin", "ethereum"], topics: ["crypto"], feeds: ["coindesk"] },
      ] },
      { id: "startups", label: "Startups", aka: ["founders"], topics: ["indie-business"], feeds: ["hn"], subs: [
        { id: "indie-hacking", label: "Indie hacking", aka: ["bootstrapped", "side project"], topics: ["indie-business"], feeds: ["hn"] },
        { id: "saas", label: "SaaS", topics: ["indie-business", "pricing"] },
        { id: "fundraising", label: "Fundraising", aka: ["vc", "investors"], topics: ["indie-business"] },
      ] },
      { id: "small-business", label: "Small business", aka: ["freelance", "self employed"], topics: ["indie-business"], subs: [
        { id: "freelancing", label: "Freelancing", aka: ["contracting", "client work"], topics: ["indie-business"] },
        { id: "pricing", label: "Pricing", topics: ["pricing"] },
        { id: "marketing", label: "Marketing", aka: ["seo", "ads"], topics: ["indie-business"] },
      ] },
      { id: "economy", label: "Economy", aka: ["economics", "inflation"], topics: ["personal-finance"], feeds: ["marginalrevolution", "econlib"], subs: [
        { id: "inflation", label: "Inflation", topics: ["personal-finance"], feeds: ["marginalrevolution"] },
        { id: "housing-market", label: "Housing market", topics: ["personal-finance"], feeds: ["econlib"] },
      ] },
    ],
  },
  {
    id: "science",
    label: "Science",
    chips: [
      { id: "space", label: "Space", aka: ["astronomy", "nasa"], topics: ["spaceflight", "science"], feeds: ["spacenews", "universetoday"], subs: [
        { id: "astronomy", label: "Astronomy", aka: ["telescope", "stars"], topics: ["science"], feeds: ["universetoday"] },
        { id: "spaceflight", label: "Spaceflight", aka: ["rockets", "launches"], topics: ["spaceflight"], feeds: ["spacenews", "nasa"] },
        { id: "mars", label: "Mars", topics: ["spaceflight"], feeds: ["nasa"] },
      ] },
      { id: "physics", label: "Physics", topics: ["science"], feeds: ["physorg", "quanta"] },
      { id: "biology", label: "Biology", aka: ["life science"], topics: ["science"], feeds: ["sciencedaily"], subs: [
        { id: "genetics", label: "Genetics", aka: ["dna", "crispr"], topics: ["science"], feeds: ["sciencedaily"] },
        { id: "neuroscience", label: "Neuroscience", aka: ["brain"], topics: ["science"], feeds: ["neurosciencenews"] },
      ] },
      { id: "climate", label: "Climate", aka: ["global warming"], topics: ["climate"], feeds: ["insideclimate", "grist"], subs: [
        { id: "renewables", label: "Renewables", aka: ["solar", "wind"], topics: ["climate"], feeds: ["grist"] },
        { id: "conservation", label: "Conservation", aka: ["wildlife"], topics: ["climate"], feeds: ["audubon"] },
      ] },
      { id: "maths", label: "Maths", aka: ["math", "mathematics"], topics: ["science"], feeds: ["quanta"] },
      { id: "psychology", label: "Psychology", aka: ["behaviour"], topics: ["science", "mental-health"], feeds: ["neurosciencenews"] },
    ],
  },
  {
    id: "health",
    label: "Health & fitness",
    sensitive: "health",
    chips: [
      { id: "fitness", label: "Fitness", aka: ["exercise", "training"], topics: ["fitness"], feeds: ["strongerbyscience"], subs: [
        { id: "strength-training", label: "Strength training", aka: ["lifting", "gym"], topics: ["fitness"], feeds: ["strongerbyscience"] },
        { id: "yoga", label: "Yoga", topics: ["fitness"] },
        { id: "mobility", label: "Mobility", aka: ["stretching"], topics: ["fitness"] },
      ] },
      { id: "nutrition", label: "Nutrition", aka: ["diet", "eating"], topics: ["nutrition"], feeds: ["nutritionfacts"], subs: [
        { id: "meal-prep", label: "Meal prep", topics: ["nutrition", "cooking"], feeds: ["minimalistbaker"] },
        { id: "supplements", label: "Supplements", aka: ["protein"], topics: ["nutrition"], feeds: ["strongerbyscience"] },
      ] },
      { id: "sleep", label: "Sleep", aka: ["insomnia", "rest"], topics: ["sleep"], feeds: ["mindful"] },
      { id: "mental-health", label: "Mental health", aka: ["anxiety", "depression"], topics: ["mental-health"], feeds: ["mindful"], subs: [
        { id: "mindfulness", label: "Mindfulness", aka: ["meditation"], topics: ["mental-health"], feeds: ["mindful"] },
        { id: "therapy", label: "Therapy", topics: ["mental-health"] },
        { id: "burnout", label: "Burnout", topics: ["mental-health"], feeds: ["nesslabs"] },
      ] },
      { id: "adhd", label: "ADHD", aka: ["focus", "executive function"], topics: ["adhd-habits"], feeds: ["additude"], subs: [
        { id: "focus", label: "Focus", topics: ["adhd-habits", "productivity"], feeds: ["nesslabs"] },
        { id: "habits", label: "Habits", aka: ["routine", "streak"], topics: ["adhd-habits"], feeds: ["jamesclear"] },
      ] },
      { id: "longevity", label: "Longevity", aka: ["ageing", "healthspan"], topics: ["nutrition", "fitness"] },
      { id: "parenting", label: "Parenting", aka: ["kids", "children"], topics: ["parenting"], sensitive: "family" },
      { id: "relationships", label: "Relationships", aka: ["partner", "friendship"], topics: ["parenting"], sensitive: "family" },
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    chips: [
      { id: "cooking", label: "Cooking", aka: ["recipes", "kitchen"], topics: ["cooking"], feeds: ["smittenkitchen", "bonappetit"], subs: [
        { id: "weeknight-dinners", label: "Weeknight dinners", topics: ["cooking"], feeds: ["smittenkitchen"] },
        { id: "baking", label: "Baking", topics: ["cooking"], feeds: ["kingarthur"] },
        { id: "sourdough", label: "Sourdough", aka: ["bread"], topics: ["cooking"], feeds: ["kingarthur"] },
        { id: "grilling", label: "Grilling", aka: ["bbq", "barbecue"], topics: ["cooking"] },
        { id: "fermentation", label: "Fermentation", aka: ["pickling", "kimchi"], topics: ["cooking"] },
      ] },
      { id: "coffee", label: "Coffee", aka: ["espresso", "beans"], topics: ["coffee"], feeds: ["sprudge"], subs: [
        { id: "espresso", label: "Espresso", topics: ["coffee"], feeds: ["sprudge"] },
        { id: "pour-over", label: "Pour over", aka: ["filter coffee"], topics: ["coffee"], feeds: ["sprudge"] },
      ] },
      { id: "drinks", label: "Drinks", aka: ["bar"], topics: ["drinks"], feeds: ["vinepair"], subs: [
        { id: "cocktails", label: "Cocktails", topics: ["drinks"], feeds: ["vinepair"] },
        { id: "wine", label: "Wine", topics: ["drinks"], feeds: ["vinepair"] },
        { id: "beer", label: "Beer", aka: ["brewing"], topics: ["drinks"], feeds: ["vinepair"] },
      ] },
      { id: "restaurants", label: "Restaurants", aka: ["eating out", "dining"], topics: ["cooking"], feeds: ["eater"] },
      { id: "vegetarian", label: "Vegetarian", aka: ["vegan", "plant based"], topics: ["cooking", "nutrition"], feeds: ["minimalistbaker"] },
    ],
  },
  {
    id: "home",
    label: "Home & garden",
    chips: [
      { id: "home-improvement", label: "Home improvement", aka: ["renovation", "remodel"], topics: ["home"], feeds: ["familyhandyman"], subs: [
        { id: "renovation", label: "Renovation", topics: ["home"], feeds: ["familyhandyman"] },
        { id: "plumbing", label: "Plumbing", topics: ["home", "repair"], feeds: ["familyhandyman"] },
        { id: "painting", label: "Painting", aka: ["decorating"], topics: ["home"] },
      ] },
      { id: "interiors", label: "Interiors", aka: ["decor", "design"], topics: ["home"], feeds: ["apartmenttherapy"], subs: [
        { id: "furniture", label: "Furniture", topics: ["home"], feeds: ["apartmenttherapy"] },
        { id: "small-spaces", label: "Small spaces", aka: ["apartment"], topics: ["home"], feeds: ["apartmenttherapy"] },
      ] },
      { id: "gardening", label: "Gardening", aka: ["plants", "garden"], topics: ["gardening"], feeds: ["savvygardening", "gardenersworld"], subs: [
        { id: "vegetable-garden", label: "Vegetable garden", aka: ["allotment", "growing food"], topics: ["gardening"], feeds: ["epicgardening"] },
        { id: "houseplants", label: "Houseplants", topics: ["gardening"], feeds: ["savvygardening"] },
        { id: "native-plants", label: "Native plants", aka: ["pollinators"], topics: ["gardening", "climate"] },
      ] },
      { id: "organising", label: "Organising", aka: ["tidying", "storage"], topics: ["home", "productivity"], feeds: ["becomingminimalist"], subs: [
        { id: "decluttering", label: "Decluttering", aka: ["minimalism"], topics: ["home"], feeds: ["becomingminimalist"] },
        { id: "cleaning", label: "Cleaning", topics: ["home"] },
      ] },
    ],
  },
  {
    id: "gaming",
    label: "Gaming",
    chips: [
      { id: "pc-gaming", label: "PC gaming", aka: ["steam"], topics: ["gaming"], feeds: ["pcgamer", "rps"] },
      { id: "console-gaming", label: "Console gaming", topics: ["gaming"], feeds: ["polygon"], subs: [
        { id: "nintendo", label: "Nintendo", aka: ["switch"], topics: ["gaming"], feeds: ["nintendolife"] },
        { id: "playstation", label: "PlayStation", aka: ["ps5", "sony"], topics: ["gaming"], feeds: ["eurogamer"] },
        { id: "xbox", label: "Xbox", topics: ["gaming"], feeds: ["eurogamer"] },
      ] },
      { id: "indie-games", label: "Indie games", topics: ["gaming"], feeds: ["rps"] },
      { id: "game-dev", label: "Game dev", aka: ["gamedev", "unity", "godot"], topics: ["gaming", "programming"], feeds: ["gamedeveloper"] },
      { id: "tabletop", label: "Tabletop", aka: ["board games"], topics: ["tabletop"], feeds: ["dicebreaker"], subs: [
        { id: "board-games", label: "Board games", topics: ["tabletop"], feeds: ["dicebreaker"] },
        { id: "ttrpg", label: "TTRPG", aka: ["dnd", "dungeons and dragons"], topics: ["tabletop"], feeds: ["dicebreaker"] },
      ] },
      { id: "retro-gaming", label: "Retro gaming", aka: ["emulation"], topics: ["gaming"], feeds: ["timeextension"] },
      { id: "esports", label: "Esports", aka: ["competitive gaming"], topics: ["gaming"], feeds: ["pcgamer"] },
    ],
  },
  {
    id: "arts",
    label: "Arts & media",
    chips: [
      { id: "film", label: "Film", aka: ["movies", "cinema"], topics: ["film"], feeds: ["rogerebert"], subs: [
        { id: "film-reviews", label: "Film reviews", topics: ["film"], feeds: ["rogerebert"] },
        { id: "documentaries", label: "Documentaries", topics: ["film"], feeds: ["rogerebert"] },
      ] },
      { id: "tv", label: "TV", aka: ["television", "streaming"], topics: ["tv"], feeds: ["variety"] },
      { id: "music", label: "Music", topics: ["music"], feeds: ["stereogum"], subs: [
        { id: "new-releases", label: "New releases", topics: ["music"], feeds: ["stereogum"] },
        { id: "vinyl", label: "Vinyl", aka: ["records"], topics: ["music"] },
        { id: "guitar", label: "Guitar", topics: ["music"] },
        { id: "music-production", label: "Music production", aka: ["synths", "recording"], topics: ["music"] },
      ] },
      { id: "books", label: "Books", aka: ["reading"], topics: ["books"], feeds: ["lithub"], subs: [
        { id: "fiction", label: "Fiction", aka: ["novels"], topics: ["books"], feeds: ["lithub"] },
        { id: "non-fiction", label: "Non-fiction", topics: ["books"], feeds: ["marginalian"] },
        { id: "sci-fi", label: "Sci-fi", aka: ["science fiction", "fantasy"], topics: ["books"], feeds: ["reactormag"] },
      ] },
      { id: "writing", label: "Writing", topics: ["writing"], feeds: ["ia"], subs: [
        { id: "essays", label: "Essays", topics: ["writing"], feeds: ["marginalian"] },
        { id: "newsletters", label: "Newsletters", topics: ["writing"], feeds: ["longreads"] },
        { id: "fiction-writing", label: "Fiction writing", topics: ["writing", "books"], feeds: ["lithub"] },
      ] },
      { id: "photography", label: "Photography", aka: ["camera", "photos"], topics: ["photography"], feeds: ["petapixel"], subs: [
        { id: "street-photography", label: "Street photography", topics: ["photography"], feeds: ["petapixel"] },
        { id: "camera-gear", label: "Camera gear", aka: ["lenses"], topics: ["photography"], feeds: ["dpreview"] },
        { id: "photo-editing", label: "Photo editing", aka: ["lightroom"], topics: ["photography"] },
      ] },
      { id: "art", label: "Art", aka: ["illustration", "drawing"], topics: ["photography"], feeds: ["colossal"] },
      { id: "podcasts", label: "Podcasts", topics: ["writing"], feeds: ["longreads"] },
    ],
  },
  {
    id: "outdoors",
    label: "Outdoors",
    chips: [
      { id: "hiking", label: "Hiking", aka: ["walking", "trails"], topics: ["outdoors"], feeds: ["sectionhiker", "backpacker"], subs: [
        { id: "backpacking", label: "Backpacking", aka: ["thru hiking"], topics: ["outdoors"], feeds: ["backpacker"] },
        { id: "day-hikes", label: "Day hikes", topics: ["outdoors"], feeds: ["sectionhiker"] },
      ] },
      { id: "camping", label: "Camping", topics: ["outdoors"], feeds: ["outside"], subs: [
        { id: "car-camping", label: "Car camping", topics: ["outdoors", "cars"] },
        { id: "overlanding", label: "Overlanding", topics: ["outdoors", "cars"] },
      ] },
      { id: "climbing", label: "Climbing", topics: ["climbing"], feeds: ["climbingcom"], subs: [
        { id: "bouldering", label: "Bouldering", topics: ["climbing"], feeds: ["climbingcom"] },
        { id: "sport-climbing", label: "Sport climbing", topics: ["climbing"], feeds: ["climbingcom"] },
      ] },
      { id: "water-sports", label: "Water sports", topics: ["outdoors"], feeds: ["surfer"], subs: [
        { id: "kayaking", label: "Kayaking", aka: ["paddling", "canoe"], topics: ["outdoors"] },
        { id: "surfing", label: "Surfing", topics: ["outdoors"], feeds: ["surfer"] },
        { id: "fishing", label: "Fishing", aka: ["angling"], topics: ["fishing"], feeds: ["fieldandstream"] },
      ] },
      { id: "snow-sports", label: "Snow sports", aka: ["winter"], topics: ["snow-sports"], feeds: ["powder"], subs: [
        { id: "skiing", label: "Skiing", topics: ["snow-sports"], feeds: ["powder"] },
        { id: "snowboarding", label: "Snowboarding", topics: ["snow-sports"], feeds: ["powder"] },
      ] },
      { id: "birding", label: "Birding", aka: ["birdwatching", "birds"], topics: ["outdoors"], feeds: ["audubon"] },
      { id: "nature", label: "Nature", aka: ["wildlife"], topics: ["outdoors", "climate"], feeds: ["outside"] },
    ],
  },
  {
    id: "work",
    label: "Work & career",
    chips: [
      { id: "career-growth", label: "Career growth", aka: ["promotion"], topics: ["career"], feeds: ["pragmaticengineer"], subs: [
        { id: "job-hunting", label: "Job hunting", aka: ["resume", "cv"], topics: ["career"], feeds: ["zapierblog"] },
        { id: "interviewing", label: "Interviewing", topics: ["career"], feeds: ["pragmaticengineer"] },
        { id: "negotiation", label: "Negotiation", aka: ["salary"], topics: ["career"], feeds: ["pragmaticengineer"] },
      ] },
      { id: "management", label: "Management", aka: ["leadership"], topics: ["management"], feeds: ["lethain"], subs: [
        { id: "leading-teams", label: "Leading teams", topics: ["management"], feeds: ["lethain"] },
        { id: "hiring", label: "Hiring", topics: ["management"], feeds: ["pragmaticengineer"] },
        { id: "one-on-ones", label: "One-on-ones", topics: ["management"], feeds: ["lethain"] },
      ] },
      { id: "remote-work", label: "Remote work", aka: ["wfh", "hybrid"], topics: ["career", "productivity"], feeds: ["zapierblog"] },
      { id: "productivity", label: "Productivity", aka: ["getting things done"], topics: ["productivity"], feeds: ["nesslabs"], subs: [
        { id: "time-blocking", label: "Time blocking", aka: ["calendar"], topics: ["productivity"], feeds: ["nesslabs"] },
        { id: "note-taking", label: "Note taking", aka: ["second brain", "obsidian"], topics: ["productivity"], feeds: ["nesslabs"] },
        { id: "deep-work", label: "Deep work", aka: ["focus time"], topics: ["productivity"], feeds: ["jamesclear"] },
      ] },
      { id: "learning", label: "Learning", aka: ["study", "courses"], topics: ["productivity"], feeds: ["nesslabs"], subs: [
        { id: "languages", label: "Languages", aka: ["spanish", "french"], topics: ["productivity"] },
        { id: "courses", label: "Courses", aka: ["moocs"], topics: ["productivity"] },
      ] },
    ],
  },
  {
    id: "news",
    label: "News & world",
    chips: [
      { id: "world-news", label: "World news", aka: ["international"], topics: ["world-news"], feeds: ["bbcworld", "guardianworld"] },
      { id: "politics", label: "Politics", aka: ["election", "government"], topics: ["politics"], feeds: ["nprpolitics"] },
      { id: "business-news", label: "Business news", topics: ["indie-business", "personal-finance"], feeds: ["marginalrevolution"] },
      { id: "us-news", label: "National news", topics: ["world-news"], feeds: ["nprnews"] },
      { id: "longform", label: "Longform", aka: ["longreads", "features"], topics: ["writing"], feeds: ["longreads"] },
    ],
  },
  {
    id: "local",
    label: "Local",
    sensitive: "location",
    chips: [
      { id: "local-news", label: "Local news", topics: ["world-news"] },
      { id: "community-events", label: "Community events", aka: ["what's on"], topics: ["outdoors"] },
      { id: "transit", label: "Transit", aka: ["commute", "public transport"], topics: ["cars"] },
      { id: "weather", label: "Weather", aka: ["forecast"], topics: ["climate"] },
    ],
  },
] as const;

// ── A flat index over everything above ─────────────────────────────────────

export interface FlatPick extends TopicPick {
  categoryId: string;
  categoryLabel: string;
  /** Set on a sub-pick: the chip it sits under. */
  parentId?: string;
  parentLabel?: string;
  /** Resolved from the pick, else the category. */
  sensitiveId?: SensitiveId;
}

function flatten(): FlatPick[] {
  const out: FlatPick[] = [];
  for (const cat of CATEGORIES) {
    for (const chip of cat.chips) {
      const base = { categoryId: cat.id, categoryLabel: cat.label, sensitiveId: chip.sensitive ?? cat.sensitive };
      const { subs: _subs, ...chipPick } = chip;
      out.push({ ...chipPick, ...base });
      for (const sub of chip.subs ?? []) {
        out.push({ ...sub, ...base, sensitiveId: sub.sensitive ?? chip.sensitive ?? cat.sensitive, parentId: chip.id, parentLabel: chip.label });
      }
    }
  }
  return out;
}

export const ALL_PICKS: readonly FlatPick[] = flatten();

const BY_ID = new Map(ALL_PICKS.map((p) => [p.id, p] as const));

export const pickById = (id: string): FlatPick | undefined => BY_ID.get(id);

export const PICK_COUNT = ALL_PICKS.length;

/** Sub-picks of a chip, in catalog order. */
export const subsOf = (chipId: string): FlatPick[] => ALL_PICKS.filter((p) => p.parentId === chipId);

/**
 * Search over labels, synonyms, the parent chip and the category — so "f1"
 * finds Formula 1, and "racing" finds the whole Motorsport family. Ranked:
 * a label that starts with the query beats one that merely contains it.
 */
export function searchPicks(query: string, limit = 40): FlatPick[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { pick: FlatPick; score: number }[] = [];
  for (const pick of ALL_PICKS) {
    const label = pick.label.toLowerCase();
    const aka = (pick.aka ?? []).map((a) => a.toLowerCase());
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if (aka.some((a) => a === q || a.startsWith(q))) score = 50;
    else if (aka.some((a) => a.includes(q))) score = 40;
    else if ((pick.parentLabel ?? "").toLowerCase().includes(q)) score = 20;
    else if (pick.categoryLabel.toLowerCase().includes(q)) score = 10;
    if (score) scored.push({ pick, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.pick.label.localeCompare(b.pick.label))
    .slice(0, limit)
    .map((s) => s.pick);
}

// ── Privacy ────────────────────────────────────────────────────────────────

export interface SensitiveCategory {
  id: SensitiveId;
  label: string;
  /** Plain words, on the screen. No "PII", no "routing". */
  plain: string;
  defaultOn: boolean;
  /** The persona rule written when it is protected. Local-only, so the router withholds it. */
  rule: string;
}

export const SENSITIVE: readonly SensitiveCategory[] = [
  { id: "finance", label: "Money", plain: "Pay, bills, savings, what things cost.", defaultOn: true, rule: "Anything about my money — pay, bills, savings, what things cost — stays on this machine." },
  { id: "health", label: "Health", plain: "Symptoms, medication, how you are doing.", defaultOn: true, rule: "Anything about my health — symptoms, medication, how I am doing — stays on this machine." },
  { id: "family", label: "Family & people", plain: "Your household, your friends, your colleagues.", defaultOn: true, rule: "Anything about the people in my life — family, friends, colleagues — stays on this machine." },
  { id: "location", label: "Where you are", plain: "Your address, your town, where you travel.", defaultOn: true, rule: "Anything about where I live or travel stays on this machine." },
] as const;

export const DEFAULT_LOCAL_ONLY: SensitiveId[] = SENSITIVE.filter((s) => s.defaultOn).map((s) => s.id);

export const isSensitiveId = (v: unknown): v is SensitiveId => SENSITIVE.some((s) => s.id === v);

/** Interest topic ids that must be tagged local-only given the protected categories. */
export function localOnlyTopics(protectedIds: string[]): Set<string> {
  const out = new Set<string>();
  for (const pick of ALL_PICKS) {
    if (pick.sensitiveId && protectedIds.includes(pick.sensitiveId)) for (const t of pick.topics ?? []) out.add(t);
  }
  return out;
}
