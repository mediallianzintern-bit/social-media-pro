import { describe, expect, it } from "vitest";

import { keepSearchStory } from "@/lib/search-trends";

describe("the SEO, AEO and GEO chips on Trends", () => {
  it("keeps real search news", () => {
    expect(
      keepSearchStory(
        "seo",
        "Google November 2026 core update rolling out now",
        "Search Engine Land",
      ),
    ).toBe(true);
    expect(
      keepSearchStory(
        "seo",
        "Semrush’s Algorithm Update Sharpens Traffic & Market Data",
        "Semrush",
      ),
    ).toBe(true);
    expect(
      keepSearchStory(
        "aeo",
        "Google AI Overviews in France: Big click losses, but not for everyone",
        "Search Engine Land",
      ),
    ).toBe(true);
    expect(
      keepSearchStory(
        "aeo",
        "Google’s AI Features Sent One Site An Estimated 21% Of Its Clicks",
        "Search Engine Journal",
      ),
    ).toBe(true);
    expect(
      keepSearchStory(
        "geo",
        "71% of ChatGPT citations go to sites missing from Google’s first page",
        "StreetInsider",
      ),
    ).toBe(true);
    expect(
      keepSearchStory(
        "geo",
        "Scrunch launches tool to track AI answer citations",
        "IT Brief Australia",
      ),
    ).toBe(true);
  });

  it("drops names that read as SEO", () => {
    expect(
      keepSearchStory(
        "seo",
        "Park Seo Ham sings Japanese songs at first Tokyo fan meeting for 10th anniversary",
        "allkpop",
      ),
    ).toBe(false);
    expect(
      keepSearchStory(
        "seo",
        "Lee Seo-jin Shows Loyalty to Kim Jong-kook on 'My Genie Secretary'",
        "SBS Star",
      ),
    ).toBe(false);
  });

  it("drops agencies selling their own services, crypto and cybercrime", () => {
    expect(
      keepSearchStory(
        "seo",
        "Blessed Arc Media Refocuses on Local SEO to Help Local Businesses Rank in Local Map Pack",
        "Digital Journal",
      ),
    ).toBe(false);
    expect(
      keepSearchStory(
        "seo",
        "Magnetize Me Expands Local SEO Services for Georgia Small Businesses",
        "USA Today",
      ),
    ).toBe(false);
    expect(
      keepSearchStory(
        "geo",
        "Pivotal Point Marketing Expands GEO & AI Search Optimization Services to Help Businesses Get Discovered",
        "The Northwest Florida Daily News",
      ),
    ).toBe(false);
    expect(
      keepSearchStory("geo", "Top 10 Best GEO Agencies, Compared With Pricing", "Online Tech Tips"),
    ).toBe(false);
    expect(
      keepSearchStory(
        "seo",
        "Pearl Leads Crypto Search Rankings With a 23.93% 24-Hour Gain",
        "www.tokenpost.com",
      ),
    ).toBe(false);
    expect(
      keepSearchStory(
        "seo",
        "FBI links SEO Poisoning Campaign to $28 Million in Ransomware Payments",
        "Cybersecurity Insiders",
      ),
    ).toBe(false);
  });

  it("needs SEO itself outside the search trade press", () => {
    expect(
      keepSearchStory(
        "seo",
        "Beyond the realm of 180,000… Park Seo-jin holds No. 1 in Star Ranking’s Male Trot category",
        "스타뉴스",
      ),
    ).toBe(false);
    expect(
      keepSearchStory(
        "seo",
        "Clifftop venues claim top two places in Google reviews survey",
        "The Scarborough News",
      ),
    ).toBe(false);
    expect(
      keepSearchStory(
        "seo",
        "Defyned SEO Participates in 2026 Shed Builder Expo in Knoxville, Tennessee",
        "The Des Moines Register",
      ),
    ).toBe(false);
    expect(
      keepSearchStory(
        "seo",
        "Google Search Analytics API gains new filters and reporting",
        "Search Engine Land",
      ),
    ).toBe(true);
    expect(
      keepSearchStory(
        "seo",
        "Rank Math SEO WordPress Plugin Hit By 16 Vulnerabilities In 2026",
        "Search Engine Journal",
      ),
    ).toBe(true);
  });

  it("leaves paid search to Ad platforms, and drops a row that is only the outlet", () => {
    expect(
      keepSearchStory(
        "seo",
        "6 ways to stay on budget with Google Ads Smart Bidding",
        "Search Engine Land",
      ),
    ).toBe(false);
    expect(keepSearchStory("seo", "- Search Engine Land", "Search Engine Land")).toBe(false);
  });
});
