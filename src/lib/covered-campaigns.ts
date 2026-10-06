// Campaigns already covered, from the reel SOP §57.
//
// The strategist is already told not to repeat a subject, and it is given the
// opening line of every stored post, the content calendar and every idea
// previously suggested to work that out. All three are records this system
// holds — and that is the gap this file fills: the team covered campaigns
// before this dashboard existed, or on channels it does not read.
//
// Measured against the stored posts on 6 Oct 2026, 18 of the 37 below appear
// nowhere in them: Moldy Whopper, Share a Coke, Shot on iPhone, Heineken
// Worlds Apart, Nike Dream Crazy and thirteen others. Without this list the
// system could suggest any of those tomorrow as though they were new.
//
// A hand-maintained list, deliberately. It is the one input here that no
// amount of stored data can reconstruct, so when the team covers a campaign
// outside the dashboard, add it — the cost of a stale entry is one idea not
// suggested, and the cost of a missing one is a repeat the team has to catch.
//
// Client-safe. See docs/pritesh-reel-sop.md §57.
export const COVERED_CAMPAIGNS: string[] = [
  "Dove Real Beauty Sketches",
  "Oreo Dunk in the Dark",
  "Nike Dream Crazy",
  "Spotify Wrapped",
  "EatSure and Rebel Foods",
  "Amul topical advertising",
  "Cadbury Cricket Girl",
  "Fevikwik fishing advertisement",
  "Shaadi.com Remove Fair From Matrimony",
  "Surf Excel Daag Acche Hain",
  "Google Reunion",
  "Tata Tea Jaago Re",
  "Flipkart Kids campaign",
  "Airbnb Live There",
  "Always Like a Girl",
  "Old Spice",
  "Coca Cola Share a Coke",
  "Apple Shot on iPhone",
  "IKEA Bookbook",
  "Gillette The Best Men Can Be",
  "Volvo Epic Split",
  "Tanishq remarriage campaign",
  "Nike Write the Future",
  "Volkswagen The Force",
  "The Tampon Book",
  "Metro Trains Dumb Ways to Die",
  "Burger King Whopper Detour",
  "Burger King Moldy Whopper",
  "Snickers You're Not You When You're Hungry",
  "Amazon Alexa Loses Her Voice",
  "McDonald's Famous Orders",
  "Heineken Worlds Apart",
  "Guinness Surfer",
  "Apple Get a Mac",
  "Cadbury Shah Rukh Khan My Ad",
  "Airbnb We Accept",
  "Lay's No Lay's No Game",
];

/** The don't-repeat block for the prompt. Empty string when the list is empty. */
export function coveredCampaignsBlock(): string {
  if (!COVERED_CAMPAIGNS.length) return "";
  return `ALREADY COVERED ELSEWHERE — campaigns this creator has already made content about, outside
anything in the data above. Every one is SPENT: do not build an idea on it, and treat a different
angle on the same campaign as a repeat. Suggesting one of these is the clearest possible signal
that the system is not paying attention.
${COVERED_CAMPAIGNS.map((campaign) => `- ${campaign}`).join("\n")}`;
}
