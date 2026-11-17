// How Pritesh Sir's LinkedIn ARTICLES are shaped (17 Nov 2026).
//
// Read from the nine articles he published between 12 Oct and 11 Nov 2026,
// in full as the team gave them, measured by code, and ranked by the
// impressions LinkedIn's API measured for the post that shares each one
// (an article page's own views only his LinkedIn screen shows):
//
//   India talks (Gnani)   979 words  731 impressions
//   Claude Haiku 5.5     1087 words  483
//   Black October         594 words  363
//   OpenAI 11-day pause   731 words  314
//   Meta Andromeda        530 words  293
//   Meta Muse Wonder     1056 words  293
//   Gemini 4 Argon        877 words  286
//   GPT-6.1 Terra         477 words  171
//   AI and electricity    457 words  170
//
//   Median 731 words. His two best ran long and explained the most; his two
//   weakest were his two shortest. One sentence per line in all nine (median
//   sentence 7-10 words), about one line in five a short fragment ("Probably
//   not."), about eight questions an article, an honest limit in eight of nine,
//   a closing contrast in all nine.
//
// His posts' shape (linkedin-shapes.ts) is for a 150-300 word post; an article
// is not a long post, so it has this block of its own. Client-safe, no model call.
/** His articles' length, introduction and sections together. */
export const ARTICLE_WORDS = { min: 450, max: 1200, aimMin: 700, aimMax: 1000 } as const;

/** Spoken words only: a bracketed "[verify: …]" note is the team's, not the article's. */
const countWords = (text: string) =>
  text
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/** An article's length against his, introduction and sections together. Null when empty. */
export function linkedInArticleLength(
  body: string,
  sections: Array<{ heading: string; text: string }>,
): { count: number; min: number; max: number; ok: boolean } | null {
  const text = [body, ...sections.flatMap((section) => [section.heading, section.text])].join("\n");
  if (!text.trim()) return null;
  const count = countWords(text);
  return {
    count,
    min: ARTICLE_WORDS.min,
    max: ARTICLE_WORDS.max,
    ok: count >= ARTICLE_WORDS.min && count <= ARTICLE_WORDS.max,
  };
}

/**
 * His best article (731 impressions, 979 words), in full, for shape and
 * voice. Given as the team gave it; its facts and its India examples are
 * that story's, never another's.
 */
const MODEL_ARTICLE = `A new Indian AI model just beat Microsoft and ElevenLabs on one important test. But the bigger story is the challenge it was built to solve.
Last week, an Indian startup launched an AI model that made fewer mistakes than some of the biggest names in tech.
Not in English.
In the way Indians actually talk.
And that's where things get interesting.
Because for years, voice AI has found it hard to keep up with India.
So what makes India such a tough test for AI?
Why AI finds India challenging, in simple words
You may think the challenge is that India has many languages.
That's part of it. But it's not the whole story.
The real challenge for AI is how we use those languages.
We don't speak one language at a time. We mix them.
Just listen to any customer care call:
"Sir, mera refund abhi tak nahi aaya."
"Delivery kal tak ho jayegi na?"
"EMI ka date change kar sakte hain?"
Two languages. One sentence. Every single day.
Most voice AI tools were built to listen to one language at a time. So when a customer switches in the middle of a sentence, the AI often gets confused.
It misses words. Writes the wrong ones. Or sometimes writes words nobody said.
And there's more
India has a few other ways of speaking that AI finds tricky.
We say numbers our way. "Sava do crore." "Dhai kilo."
We say brand names differently. The same name can sound different in Pune and in Patna.
We call from noisy places. Traffic. Trains. Weak phone signals.
So even when AI writes down every word, the result often isn't something a business can actually use.
So who's trying to solve this?
This is where Bengaluru-based Gnani AI comes in.
The company has launched Prisma v3.0, an AI model that turns speech into text. It was trained on Indian phone calls.
It supports Hindi, Bengali, Marathi, Gujarati, Punjabi, Kannada, Telugu, Tamil, Malayalam and English.
And it was built for calls where people switch languages mid-sentence.
Gnani explained its reason in one simple line: a correct transcript still wasn't a usable one.
That line sums up the challenge for AI in India perfectly.
What makes Prisma v3.0 different?
1. It doesn't force one language
The model has a "Code-mix" mode.
In simple words, "refund" can stay in English, and "abhi tak nahi aaya" can stay in Hindi. The AI writes your sentence the way you said it.
It also offers three other ways to write a call:
Verbatim: every word, including "umm" and repeats
Transcribe: a clean, easy-to-read version
Transliterate: everything in English letters
Why does this matter?
A compliance team may need every word.
A support manager may want a clean version.
A voice bot may need the mixed version to reply correctly.
Different teams. Different needs.
2. It understands numbers the Indian way
Say "sava do crore," and it can write ₹2.25 crore.
Say "dhai kilo," and it can write 2.5 kg.
Small detail? Not really.
In a bank or a delivery company, someone usually fixes these numbers by hand before they go into the system. This removes that step.
3. It can learn your business words
A company can give the model up to 200 words, like product names or brand names.
Gnani says this helped the model catch those words correctly about 90% of the time, up from about 71%.
4. It made fewer mistakes than global tools, says the company
Speech AI is judged by how many words it gets wrong. Out of every 100 words, how many were wrong? Lower is better.
On a well-known test for Indian languages, Gnani says:
Gnani Prisma v3.0: about 17 wrong
ElevenLabs Scribe v2: about 20 wrong
Microsoft Azure: about 20.5 wrong
Deepgram Nova 3: about 26.5 wrong
Now, one thing to keep in mind.
These are the company's own test results. They are a good sign, but not a guarantee. The real test is how it works on real calls, with real customers, in real noise.
So, can AI now fully understand how India talks?
Not fully. And that's important to say.
17 wrong words out of 100 is better. But it's still not perfect.
AI can write down what a customer said. It still can't always understand tone, emotion or what the customer really meant.
For important calls in banking, insurance or healthcare, a human still needs to check.
And any business using call recordings must think carefully about privacy and customer consent.
So the honest answer is: not there yet, but getting closer.
Why this matters to you
If you're a student:
India is one of the toughest places to build voice AI. That makes it one of the biggest opportunities too. The next big idea may come from understanding how real people talk.
If you're a marketer:
Every customer call is full of clues. What people want. What annoys them. What words they use. Better transcripts mean you can finally hear your customers at scale.
If you're a business leader:
Every call your company handles starts with one step: understanding the customer. Get that wrong, and everything after it goes wrong too.
So before you choose any voice AI tool, ask one simple question:
"Does it understand how my customers actually speak?"
What I want you to remember
For years, voice AI tried to keep up with India by adding more languages.
But India doesn't speak in separate languages. We mix, switch and borrow words without thinking.
The AI that wins in India won't be the one that speaks the most languages.
It'll be the one that understands how Indians actually talk.
What's the funniest or most frustrating time a voice assistant or customer care bot misunderstood you? Share it in the comments.
Repost to help more people understand how AI is learning to understand India better.`;

/** The article shape, for the writer and the review. */
export const LINKEDIN_ARTICLE_SHAPE = `LINKEDIN ARTICLE SHAPE, read from the nine LinkedIn articles Pritesh published (12 Oct to 11 Nov 2026)
and the impressions LinkedIn measured for the post sharing each. AN ARTICLE IS NOT A LONG POST: it
TEACHES one development properly, the way he explains it in a session. Every voice rule above still
applies; this block decides the article's length and structure.

LENGTH: aim for ${ARTICLE_WORDS.aimMin} to ${ARTICLE_WORDS.aimMax} words, introduction and sections together; never under ${ARTICLE_WORDS.min} or
over ${ARTICLE_WORDS.max}. His nine run 457 to 1,087 (median 731). His two best ran long because they explained
the most: "No AI Could Keep Up With How India Talks. Until This One?" (979 words, 731 impressions)
and "Do We Really Need the Biggest AI Model for Every Task?" (1,087, 483). His two weakest were his
two shortest, under 480 words (170 and 171): a list of features with little explanation, and a
general warning with no example from the reader's work. Length only helps when every section
teaches something; a padded section is worse than a short article.

TITLE (the idea's title, 8 to 17 words): the company or product, a striking fact and a question or
twist, or a question that challenges what the reader assumes. "Meta Can Process 1 Billion Ads Per
Second. Are Advertisers Ready for What Comes Next?" / "No AI Could Keep Up With How India Talks.
Until This One?" / "Do We Really Need the Biggest AI Model for Every Task? What Claude Haiku 5.5
Means for Business" / "OpenAI Just Cut AI Costs by 50%. But That's Not the Biggest Surprise." Never
a news headline ("Meta launches…").

THE INTRODUCTION (post.body, 60 to 150 words, one sentence per line):
- Line 1 is a "What if…" question about the reader's work ("What if AI could remember your
  business, understand your goals and keep working without you having to explain everything
  again?"), an "Imagine…" scene ("Imagine opening your company's website tomorrow morning and
  finding that it has been taken offline."), or what everyone usually says before the turn
  ("Whenever a new AI model launches, most of the discussion usually goes in one direction: / Is
  it smarter? / Is it more powerful?").
- Then the news in two or three short lines: who, what, when, in the company's own words where
  they matter.
- Then the line that says the headline fact is not the whole story: "But the real story isn't the
  number." / "But there is something more interesting about this launch." / "And that's where
  things get interesting."
- It ends on a short handover line: "Let's understand." / "Let me make this simple." / "Let's look
  at three key features." / "Here's what has changed."

THE SECTIONS (post.sections, 5 to 8). Each heading is the question the section answers, or a
numbered point, in plain words ("First, what exactly is Andromeda?", "Why AI finds India
challenging, in simple words", "1. It doesn't force one language", "Three questions every business
should ask before adopting AI agents"); never a report heading ("Overview", "Key Implications").
Each section's text is one sentence per line with a blank line between, never a paragraph. In this
order, as planning logic:
1. EXPLAIN THE IDEA FIRST, in everyday words, before any technical term: a picture the reader knows
   ("Think of it as a super-fast screening system."), then the term ("Meta has redesigned
   Andromeda using a technology called Mixture of Experts (MoE).") and what it means in practice
   ("In simple words, …").
2. WHAT IS NEW, numbered when there are several things: each point a short heading, two to six
   short lines, and where it helps, "Why does this matter?" answered in a line or two ("A
   compliance team may need every word. / A support manager may want a clean version. / Different
   teams. Different needs.").
3. AN EXAMPLE FROM THE READER'S WORK, clearly hypothetical, worked step by step: "Imagine you're
   advertising a digital marketing course. / One advertisement talks about career growth. /
   Another focuses on business growth." / "Every morning your company receives 2,000 customer
   enquiries." / "Take a sales team." It can sit inside a point or be its own section.
4. THE HONEST LIMIT, which eight of his nine have: whose figures they are, what is not known, and
   where a human still checks. "These are the company's own test results. They are a good sign,
   but not a guarantee." / "Let's be clear. This is an extreme scenario, not a prediction." / "So,
   can AI now fully understand how India talks? / Not fully. And that's important to say."
5. WHAT IT MEANS FOR THE READER: "But what does this mean for advertisers? / I see three important
   implications." / "What should businesses do?", numbered one to three (or up to five questions
   a business should ask itself), each a short heading and a few concrete lines from THIS story.
   His best article spoke to each reader in turn: "If you're a student: … / If you're a marketer:
   … / If you're a business leader: …".
6. HIS TAKEAWAY, in the first person, as the last section: "My takeaway" / "My take" / "For me,
   this is the bigger shift" / "What I want you to remember". It widens the one idea ("For years,
   voice AI tried to keep up with India by adding more languages. / But India doesn't speak in
   separate languages.").

THE ENDING: all nine end the argument on his two-line closing contrast: "The future of Meta
advertising may not be about who can create the most ads. / It may be about who understands the
customer best." / "The AI that wins in India won't be the one that speaks the most languages. /
It'll be the one that understands how Indians actually talk." Then, as his best article did, one
question about the reader's own experience or business ("What's the funniest or most frustrating
time a voice assistant or customer care bot misunderstood you? Share it in the comments.") and one
"Repost to help [a specific person] [a specific benefit]." line. The last line names the source,
"Source: [the outlet, or the company's official announcement]", with no link: the dashboard
attaches it. No hashtags in the article itself.

RHYTHM, measured across the nine:
- One sentence per line, median 7 to 10 words, rarely past 20.
- About one line in five is a short fragment that carries a turn: "Not in English." / "Probably
  not." / "Small detail? Not really." / "And the scale is massive."
- He asks the reader's question, then answers it, about eight times an article ("So what makes
  India such a tough test for AI?", "Does every one of those 2,000 enquiries require your most
  powerful AI model? / Probably not.").
- "You" and "your" throughout, "we" for what everyone faces, "I" two to five times and only for his
  view ("I see three important implications.", "I think the next stage will also be about…").
- Every company figure says whose it is: "Meta says…", "Gnani says…", "In OpenAI's internal
  test…", "according to Wiz Research".
- Short lists (bullets, or "Label: meaning" lines) only for what really is a list: who can use it,
  the modes, the prices, the steps a team could hand over. Never in place of an explanation.
- The reader's own world: for an Indian story, Indian scenes and words.

HIS BEST ARTICLE, IN FULL. Shape and voice only: never its facts, its examples, its India scenes or
its sentences.
TITLE: No AI Could Keep Up With How India Talks. Until This One?
${MODEL_ARTICLE}`;

/** "OpenAI launches…", "Meta unveils…": a news headline, which none of his nine titles is. */
const NEWS_TITLE =
  /^\S+(?:\s\S+){0,3}\s(launch(es|ed)?|announc(es|ed)|unveil(s|ed)|introduc(es|ed)|releas(es|ed)|roll(s|ed) out)\b/i;
const REPOST = /\brepost\b/i;

/**
 * What the CODE finds wrong with an article's shape against his nine, beyond
 * its total length (linkedInArticleLength). Empty when it fits. Exported for
 * the article writer (server/ai/linkedin-article.ts) and the tests.
 */
export function articleShapeProblems(
  title: string,
  body: string,
  sections: Array<{ heading: string; text: string }>,
): string[] {
  const problems: string[] = [];
  if (NEWS_TITLE.test(title.trim())) {
    problems.push(
      `The title "${title.trim()}" reads as a news headline; his are a striking fact with a question or twist ("OpenAI Just Cut AI Costs by 50%. But That's Not the Biggest Surprise.") or a question that challenges an assumption.`,
    );
  }
  const intro = countWords(body);
  if (intro > 170) {
    problems.push(
      `The introduction is ${intro} words; his run 60 to 150. It sets up the question and hands over ("Let's understand."); the explanation, the points and the ending belong in the sections.`,
    );
  }
  if (REPOST.test(body)) {
    problems.push(
      "The introduction ends like a whole post, with a Repost line; the closing question and the Repost line go at the very end of the last section.",
    );
  }
  if (sections.length < 5 || sections.length > 8) {
    problems.push(`It has ${sections.length} sections; his articles have 5 to 8.`);
  }
  sections.forEach((section, index) => {
    const lines = section.text.split("\n").filter((line) => line.trim());
    // His sections run many short lines; his longest single line is 42 words.
    const block =
      (lines.length <= 2 && countWords(section.text) >= 30) ||
      lines.some((line) => countWords(line) > 45 || (line.match(/[.?!](\s|$)/g) ?? []).length > 3);
    if (block) {
      problems.push(
        `Section ${index + 1} ("${section.heading}") is written as a paragraph; one sentence per line, a blank line between, as in every one of his articles.`,
      );
    }
  });
  return problems;
}
