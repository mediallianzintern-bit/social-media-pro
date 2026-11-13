// The team's checks on a LinkedIn post (13 Nov 2026), built from the CTV
// story: the dashboard's draft and the hand-checked version of the same post.
import { describe, expect, it } from "vitest";

import { unexplainedTerms, writingProblems } from "@/lib/linkedin-readability";
import { problemsOf } from "@/server/ai/linkedin-review";

const STORY =
  "LinkedIn launches connected TV ads in the UK\n" +
  "LinkedIn launched CTV ads in the US in April 2024. UK partners include LG, Paramount+ and Titan OS. " +
  "LinkedIn says brands whose CTV ad was seen first saw 30% lower cost per lead. " +
  "LinkedIn says its CTV ads are 2.6 times more likely to reach B2B audiences.";

const DRAFT = `Is LinkedIn changing how UK brands advertise?
LinkedIn has launched connected TV (CTV) ads in the UK.
This means UK businesses can now run video campaigns on home TV sets.
The ads are shown through partners like LG and Paramount+.
Here's why this matters.
LinkedIn's CTV ads are 2.6 times more likely to reach B2B audiences than other CTV options.
I see three chances for marketers:
1. Reach B2B audiences where they watch
LinkedIn's CTV ads can target viewers on streaming TV.
2. Save on conversion costs
Brands that had their CTV ad seen first cost 30% less to get sales leads.
3. Extend beyond LinkedIn's app
This taps into the trend of more video watching.
Video is becoming more central to marketing plans.
Would your brand benefit from LinkedIn's CTV ads?
♻️ Repost to help a business explore new advertising opportunities.`;

const MODEL = `LinkedIn ads on your TV?
Yes. That's now happening in the UK.
LinkedIn launched these TV ads in the US in April 2024.
Now UK businesses can use them too.

So what is CTV?
Let me make it simple.
It's TV you watch through the internet.
Like streaming apps on a smart TV.
Free shows have ads.
Now businesses can show their video ads there.
UK partners include LG, Paramount+ and Titan OS.

Why does this matter?
The person who says yes to your deal at work
also watches TV at home.
LinkedIn says people who saw a brand's TV ad first
cost 30% less to turn into leads.
(That's LinkedIn's own number. Keep that in mind.)

Here's a simple example:
→ Your TV ad makes people remember your name
→ Your LinkedIn ad then asks them to book a call
→ They say yes more often, because they already know you

One mistake to avoid:
Don't judge TV ads by clicks.
Nobody clicks on a TV.

Here's what I want you to remember:
The TV ad helps people remember you.
The follow-up ad asks them to act.

Would you spend B2B budget on TV?

♻️ Repost to help more marketers understand this change.
#LinkedInAds #B2BMarketing #ConnectedTV #DigitalMarketing`;

const raw = { format: "text_post", title: "LinkedIn launches CTV ads in the UK", angle: "" };

describe("the team's LinkedIn checks", () => {
  const draft = problemsOf(raw as never, DRAFT, [], undefined, STORY).join("\n");

  it("catches the vague first line", () => {
    expect(draft).toMatch(/general question about change/);
  });
  it("catches company figures stated as facts", () => {
    expect(draft).toMatch(/without saying whose number/);
    expect(draft).toMatch(/2\.6 times|30%/);
  });
  it("catches CTV never explained", () => {
    expect(draft).toMatch(/uses CTV without saying what it means/);
  });
  it("catches consultant lines", () => {
    expect(draft).toMatch(
      /taps into the trend|becoming more central|new advertising opportunities/,
    );
  });
  it("catches the missing example", () => {
    expect(draft).toMatch(/It has no example/);
  });

  it("passes the hand-checked post on every one of these checks", () => {
    const model = problemsOf(raw as never, MODEL, [], undefined, STORY).join("\n");
    expect(model).not.toMatch(
      /general question about change|without saying whose number|without saying what it means|no example|taps into|no turn line/,
    );
  });
});

describe("unexplained terms", () => {
  it("leaves a brand named in capitals once alone", () => {
    expect(
      unexplainedTerms("Partners include LG and Paramount+. CTV ads. What is CTV? It is TV."),
    ).toEqual([]);
  });
  it("flags a term used twice and never explained", () => {
    expect(unexplainedTerms("CTV ads are here. CTV ads work.")).toEqual(["CTV"]);
  });
  it("is part of the writing checks", () => {
    expect(writingProblems("CTV ads are here.\nCTV ads work.").join(" ")).toMatch(/CTV/);
  });
});
