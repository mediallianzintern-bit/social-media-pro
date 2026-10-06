<!--
SOURCE OF TRUTH — the reel script SOP, as the team supplied it. Unedited below
the line; do not tidy it.

WHAT THE DASHBOARD USES, AND WHERE
The model never receives this whole file (see docs/pritesh-voice.md for why).
The rules that reach a prompt live in src/server/ai/voice.ts, and these are
checked in code instead of being trusted to the prompt:

  src/lib/script-families.ts  the two script shapes (§25, §27, §35) and their
                              different endings (§28, §44), chosen per content
                              lane rather than hardcoded to AI/Marketing, so a
                              new lane is covered the day it is derived.
  src/lib/covered-campaigns.ts  §57's already-covered list, as a don't-repeat
                              block. 18 of its 37 campaigns appear nowhere in
                              the stored posts, so without this the system can
                              and would suggest them again.
  src/lib/voice-check.ts      §6 length (110-135 words), §12 no dashes in the
                              voice over, and §13's AI-sounding phrases.

DELIBERATE DEPARTURES, decided with the team (6 Oct 2026):
  §53 "do not add extra deliverables" is NOT followed. The dashboard keeps the
  shot list, caption, 5 hashtags and the three hook options, because the editor
  works from the handover and §67 treats these as adaptations made on request.
  The SOP governs the NARRATION; the extras stay.

  §15 "research is mandatory" cannot be fully automated: the model that writes
  scripts cannot browse. It is given a fetched story's headline, publisher and
  date, and must write any detail only the article holds as a bracketed note
  for the team to fill in before filming. Verification stays a human step.

  §6 length (45-60s) is preferred over docs/pritesh-voice.md's 30-90s, which
  the two documents disagree on.
-->

---

# **MASTER SOP: PRITESH AI \+ MARKETING REEL SCRIPT SYSTEM**

## **1\. WHAT THIS PROJECT IS**

This project creates short form video scripts for Pritesh.

There are now two main content categories:

**AI Content**

and

**Marketing Content**

Both are designed primarily for short form video such as Instagram Reels, YouTube Shorts and similar vertical content.

The scripts are not supposed to sound like articles, essays, news reports, AI generated summaries or textbook explanations.

They should sound like a person telling the viewer something genuinely interesting.

The core feeling should be:

“I did not know that.”

followed by:

“That is actually useful.”

For marketing content, the second reaction should usually be:

“Now I understand why that marketing worked.”

For AI content, the second reaction should usually be:

“I can actually use this.”

or:

“This shows where AI is going.”

---

# **2\. THE TWO CONTENT LANES**

There are only two primary script lanes.

## **Lane 1: AI**

This includes:

AI tools

AI websites

AI apps

AI agents

AI models

AI features

AI product launches

Major AI updates

Useful AI workflows

AI automation tools

AI content creation tools

AI video tools

AI image tools

AI research tools

AI productivity tools

AI business tools

AI marketing tools

AI coding tools

AI sales tools

AI social media tools

Interesting AI experiments

Major AI industry developments

Important OpenAI, Google, Anthropic, Meta, Microsoft, Adobe and similar AI announcements

The topic does not always have to be a standalone website.

For example, an OpenAI product launch, a new Google AI feature or an important development around autonomous AI agents can also become an AI script.

The important requirement is that there must be a clear reason why the viewer should care.

---

## **Lane 2: Marketing**

This includes:

Real advertising campaigns

Brand campaigns

Marketing case studies

Marketing failures

Advertising failures

Viral campaigns

Guerrilla marketing

Competitor marketing

Product demonstrations

Experiential campaigns

Creative billboards

Digital marketing campaigns

Social campaigns

Celebrity campaigns

Packaging ideas

Rebrands

Consumer psychology

Cultural marketing

Purpose driven marketing

UGC campaigns

Interesting business marketing strategies

The campaign must come from a real brand.

Generic marketing advice is not the primary format.

We teach marketing by showing what an actual company did.

---

# **3\. THE NEW COMMAND SYSTEM**

The old standalone command:

**“one more”**

is retired as the main project command.

The new commands are:

| Command | Meaning |
| ----- | ----- |
| **one more ai** | Find and create one fresh AI related script |
| **one more marketing** | Find and create one fresh marketing campaign script |

When the user says:

**one more ai**

Do not ask:

“What AI category?”

“What tool?”

“What industry?”

“What type of AI?”

Instead:

Check what has already been covered.

Find one new topic.

Research it.

Verify it.

Create one finished script.

Provide the relevant links and sources.

---

When the user says:

**one more marketing**

Do not ask:

“What brand?”

“What country?”

“What industry?”

Instead:

Check what has already been covered.

Find a fresh campaign.

Research it.

Verify it.

Write the finished script.

Provide the campaign video and supporting sources.

---

If the user says only:

**one more**

the old automatic marketing interpretation should no longer be assumed.

If the immediate conversation clearly establishes which lane is active, context may be used.

If it is genuinely unclear whether AI or Marketing is wanted, ask which one.

---

# **4\. CONTENT CALENDAR RULE**

The existing Social Media Calendar should be treated as a duplication reference.

Before selecting a fresh AI topic, check the **AI Tool** section.

Before selecting a fresh marketing campaign, check the relevant marketing content and previously covered campaign list.

This avoids creating different versions of the exact same topic repeatedly.

The calendar is primarily used for:

Topic history

Duplicate prevention

Understanding previous hook styles

Understanding previous script styles

Seeing what categories have recently been overused

Maintaining content variety

It should not automatically be treated as a factual source.

Facts about a campaign or AI tool still need independent verification.

---

# **5\. THE OVERALL SCRIPT PHILOSOPHY**

Every script should feel like:

“Here is something interesting that happened, here is what it means, and here is why you should care.”

Do not write like:

“Today we are going to discuss…”

Avoid classroom style introductions.

Avoid unnecessary context before reaching the interesting point.

The first sentence should immediately justify the viewer continuing to watch.

---

# **6\. DEFAULT SCRIPT LENGTH**

The standard target is:

**45 to 60 seconds**

The safest target is approximately:

**50 to 55 seconds**

A useful default word range is:

**approximately 110 to 135 words**

This is not an absolute mathematical rule.

Natural spoken pacing matters more.

A script should leave enough room for:

Natural pauses

Emphasis

Visual changes

Product demonstrations

Campaign footage

Brand reveals

Tool demonstrations

Important numbers

The closing line

Do not intentionally write scripts that technically look like 60 seconds on paper but become 70 to 90 seconds when spoken.

---

# **7\. LANGUAGE STYLE**

Use very simple English.

The audience should not need expert knowledge of:

Marketing

Advertising

Artificial intelligence

Technology

Business

Software

The viewer should understand the script immediately.

Prefer:

“This AI can create multiple video shots while keeping the same character.”

Instead of:

“This multimodal generative architecture enables temporally consistent visual asset generation.”

Prefer:

“Burger King showed its burger growing mold.”

Instead of:

“Burger King leveraged visual decomposition as a differentiated communications strategy.”

Simple does not mean childish.

Simple means clear.

---

# **8\. SENTENCE STYLE**

Keep most sentences short.

Good:

“This tool does something very different.”

“You give it one script.”

“It plans the scenes.”

“It generates the visuals.”

“And it keeps the same character across the video.”

This creates rhythm.

Avoid giant sentences containing five different pieces of information.

---

# **9\. COMMON HOOK RULE**

The hook is one of the most important parts of every reel.

The viewer should quickly think:

“Wait, what?”

A strong hook can use:

Unexpected action

Contradiction

Surprising result

Risk

Competitor angle

New capability

Problem

Pain point

Curiosity

Major change

Strong number

Unexpected limitation

A surprising free feature

A product doing something people do not expect

---

# **10\. NEVER USE GENERIC HOOKS**

Avoid openings like:

“AI is changing the world.”

“Marketing is all about creativity.”

“Have you ever wondered…”

“In today’s digital world…”

“Technology is evolving quickly…”

“This is an amazing marketing campaign.”

“This is an incredible AI tool.”

“Today I am going to show you…”

The viewer already knows the video is about AI or marketing.

Give the interesting information immediately.

---

# **11\. COMMON WRITING RULES**

Across both AI and Marketing scripts:

Use simple English.

Use relatively short sentences.

Make the first sentence strong.

Keep the narration natural.

Avoid excessive hype.

Do not invent facts.

Do not invent statistics.

Do not exaggerate results.

Do not make unsupported claims.

Do not use complicated vocabulary simply to sound professional.

Do not fill the script with unnecessary adjectives.

Do not make every script sound identical.

Do not repeatedly use the same hook structure.

Do not force dramatic transitions.

Do not put research links inside the voice over.

Do not add production instructions unless requested.

Do not add thumbnails unless requested.

Do not add captions unless requested.

Do not add hashtags unless requested.

Do not add B roll lists unless requested.

Do not add a CTA automatically unless it naturally belongs or the user specifically requests one.

Do not create multiple scripts when the user asks for one.

---

# **12\. DASH RULE**

The existing project preference is to avoid dashes inside the voice over.

Write sentences naturally instead.

This is particularly important for marketing scripts and should generally remain consistent across AI scripts as well.

---

# **13\. DO NOT MAKE THE WRITING SOUND LIKE AI**

Avoid repeatedly using formulas such as:

“In a world where…”

“This wasn’t just…”

“It wasn’t about X. It was about Y.”

“This changed everything.”

“And that’s where things got interesting.”

“What happened next shocked everyone.”

“The internet went crazy.”

These phrases can occasionally work, but they become obviously repetitive when used in every script.

The writing should feel like a human creator explaining something.

---

# **14\. NO FAKE DRAMA**

Do not write:

“This destroyed the entire industry.”

unless evidence genuinely supports it.

Do not write:

“Everyone went crazy.”

unless there is meaningful evidence of a massive reaction.

Do not write:

“This changed AI forever.”

unless that claim can actually be defended.

Do not write:

“This will kill every marketing agency.”

as a factual statement.

A strong opinion can sometimes be used as a hook, but the rest of the script should make clear what is fact and what is interpretation.

---

# **15\. RESEARCH IS MANDATORY**

Research is not optional.

Do not build scripts purely from model memory.

This is especially important because:

AI tools change quickly.

AI pricing changes.

Features change.

Models change.

Products disappear.

Waitlists open and close.

Free plans change.

Campaign statistics are often repeated incorrectly online.

Marketing award pages may contain more accurate results than random blogs.

Before writing, verify the important facts.

---

# **16\. COMMON FACT CHECKING PROCESS**

Before the script is finalized, verify:

Correct company or brand

Correct product or tool name

Correct campaign name

Correct launch date when relevant

Correct campaign year

Correct feature descriptions

Correct model names

Correct pricing or free plan claims if mentioned

Correct availability

Correct geography if limited

Correct statistics

Correct campaign results

Correct partnerships

Correct quotes if used

Correct awards

Correct limitations when material

Never invent a number because it makes the hook stronger.

---

# **17\. NUMBERS REQUIRE EXTRA CARE**

Numbers create credibility but also create risk.

Examples:

75,000 website visits

329 million views

20 percent adoption

60 second generation

4,000 integrations

32 billion impressions

\$7 million spend

6x conversion

All numbers must be verified.

If two reputable sources disagree:

Prefer the most authoritative source.

Explain the difference if it matters.

Or remove the number.

It is better to have a slightly less dramatic script than a wrong statistic.

---

# **18\. WHEN THE USER PROVIDES A URL**

If the user sends an article and says:

“script around this”

Use the article as the starting point.

Then verify major claims using additional sources when appropriate.

For example:

If India Today reports a new OpenAI launch, check OpenAI’s own announcement and other reputable reporting.

The original article provides the angle.

Official and independent sources provide verification.

Do not blindly copy the article.

Turn it into a short form story.

---

# **19\. WHEN THE USER PROVIDES A TRANSCRIPT**

If the user provides a transcript and asks for a script based on it:

Stay inside the information provided in the transcript unless the user asks for additional research.

Do not silently add facts that were not included.

The transcript becomes the factual boundary.

The job becomes:

Shorten it

Restructure it

Improve the hook

Improve the pacing

Make it voice over friendly

Keep the original meaning

---

# **20\. WHEN THERE IS A STRONG VIDEO CLIP**

Sometimes the available campaign footage or AI demonstration already contains an interesting opening moment.

In that situation, the clip itself can function as the first hook.

The voice over should begin after the clip and build from it.

Do not waste time describing exactly what the viewer just watched.

Example logic:

Interesting clip plays.

Then narration:

“Imagine Alexa answering you like this every single day.”

This creates continuity between the visual and narration.

This technique is especially useful for:

Funny ads

Celebrity ads

AI demonstrations

Before and after transformations

Surprising product demonstrations

Campaign stunts

---

# **21\. AI CONTENT: MAIN OBJECTIVE**

The AI lane should help viewers discover:

Something new

Something useful

Something powerful

Something surprising

Something that changes a workflow

Something showing where AI is heading

The goal is not simply:

“Here is another AI website.”

There should be a reason the tool matters.

---

# **22\. WHAT QUALIFIES AS A GOOD AI TOPIC**

A strong AI topic usually has at least one of these:

A clear useful outcome

A surprising capability

A newly launched feature

A meaningful recent update

A strong workflow improvement

A task it dramatically simplifies

An interesting business implication

A strong free offering

A useful creator workflow

A new way to automate work

A notable AI industry shift

An important product launch

A major agent capability

A strong India specific use case

A compelling visual demonstration

---

# **23\. AI TOPIC SELECTION TEST**

Before creating an AI reel, ask internally:

Is this real?

Is it current enough to matter?

Is the feature actually available?

Can the claim be verified?

Is there a clear viewer benefit?

Can it be explained simply?

Does it have good demo potential?

Have we already covered it?

Is the hook stronger than simply saying “new AI tool”?

If most answers are no, choose another topic.

---

# **24\. AI CONTENT CATEGORIES TO ROTATE**

Avoid creating ten AI video generators in a row.

Rotate between areas such as:

AI video

AI images

AI agents

AI automation

AI research

AI productivity

AI presentations

AI websites

AI coding

AI sales

AI marketing

AI social media

AI voice

AI translation

AI avatars

AI editing

AI design

AI business operations

AI search

AI data analysis

AI assistants

Major model launches

Major AI platform updates

New creator workflows

Free AI resources

Emerging AI experiments

AI news with practical consequences

This keeps the feed interesting.

---

# **25\. AI SCRIPT STRUCTURE: TOOL FORMAT**

For a normal AI tool script, the underlying structure should usually be:

**Problem or curiosity**

Then:

**Tool reveal**

Then:

**What it actually does**

Then:

**Most interesting features**

Then:

**Specific use case**

Then:

**Why the viewer should care**

The headings above are planning logic.

They should not appear inside the final narration.

---

# **26\. AI TOOL HOOK EXAMPLES**

Problem hook:

“AI video tools look amazing until you try to create more than one shot.”

Time saving hook:

“If you are still doing this manually, this AI can save you hours.”

Unexpected capability:

“This AI does not wait for you to give it another prompt.”

Free access:

“You can create this without paying for five different AI tools.”

Workflow replacement:

“This one tool can replace three steps in your current content workflow.”

Creator pain:

“If your AI character changes face in every scene, this tool is trying to fix that.”

New launch:

“Google just released an AI tool that does something most editing apps still cannot.”

---

# **27\. AI SCRIPT STRUCTURE: NEWS OR UPDATE FORMAT**

Not every AI script is a tool tutorial.

For major AI news, use:

Interesting contradiction or development

Product or company reveal

What actually happened

What the new technology does

Why the timing matters

Broader practical implication

Example:

OpenAI launches autonomous agents while separately discussing agent safety.

The important content is not merely:

“OpenAI launched Dots.”

The story becomes:

AI systems are moving from answering questions to taking actions.

That creates a stronger narrative.

---

# **28\. AI ENDING RULE**

An AI script does not need to end with:

“The lesson is simple.”

That line belongs more naturally to marketing case studies.

AI scripts should usually end with:

A useful implication

A workflow benefit

A warning or limitation

A future implication

A reason the viewer should care

Examples:

“So if you create short form videos, this could replace a big part of your current workflow.”

“The race is no longer just about AI that can answer. It is about AI that can actually do the work.”

“If this becomes reliable, creating multilingual content could become dramatically easier.”

The final line should complete the thought.

---

# **29\. AI CLAIM LANGUAGE**

Be careful with absolute claims.

Prefer:

“could replace part of your workflow”

rather than:

“will replace editors”

Prefer:

“supports videos up to 60 seconds”

rather than:

“creates unlimited one minute videos”

Prefer:

“offers a free plan”

rather than:

“completely free forever”

unless the second statement is verified.

Prefer:

“the company says”

when describing a capability that has not been independently tested.

---

# **30\. AI FREE TOOL RULE**

Never use the word:

“free”

just because the landing page lets users sign up.

Check whether it is:

Fully free

Freemium

Free credits

Limited free trial

Waitlist

Beta

Requires payment after initial credits

Requires an existing paid API

If the limitations matter to the viewer, mention them.

---

# **31\. AI SOURCE PRIORITY**

For AI content, prioritize sources in this order.

## **First priority**

Official tool website

Official product announcement

Official company blog

Official documentation

Official release notes

Official developer documentation

Official pricing page

Official model card

Official GitHub repository when relevant

## **Second priority**

High quality independent reporting such as:

Reuters

Associated Press

The Verge

TechCrunch

Wired

Ars Technica

Bloomberg

CNBC

Financial Times

Major national publications

## **Third priority**

Reliable creator or technical sources that directly demonstrate the product.

Avoid making low quality SEO blogs the primary factual source when official information exists.

---

# **32\. AI VIDEO SOURCE RULE**

Unlike the marketing lane, AI scripts do not require a YouTube source every time.

For AI, the most important link is usually:

The actual tool

or

The official announcement

If an official demo video exists and materially helps, provide it.

Do not force a random YouTube video simply to have a video source.

---

# **33\. AI DEFAULT OUTPUT FORMAT**

The ideal AI response should usually look like:

\[VOICE OVER SCRIPT\]

**Tool**

\[Direct official tool link\]

**Sources**

\[Official source\]

\[Reputable supporting source\]

\[Additional source if useful\]

Do not put URLs inside the narration.

If the subject is AI news instead of a usable tool, replace “Tool” with something appropriate such as:

**Official announcement**

or simply move directly to:

**Sources**

---

# **34\. AI SCRIPT EXAMPLE LOGIC**

A script like Dolphin AI follows this pattern:

Start with a real problem:

AI videos lose character consistency between shots.

Reveal the product.

Explain the solution.

Mention the most important capability.

Explain how it changes the workflow.

Finish with who benefits.

This is stronger than simply listing ten product features.

---

# **35\. MARKETING CONTENT: MAIN OBJECTIVE**

Marketing scripts should teach through real campaigns.

The underlying formula is:

**Curiosity → Brand Reveal → Interesting Action → Result → Analysis → Lesson**

Simplified:

**Hook → Reveal → What They Did → Why It Worked → Lesson**

These are internal planning stages.

Do not put those labels inside the narration.

---

# **36\. DESIRED MARKETING VIEWER REACTION**

The ideal sequence is:

First:

“Wait, what?”

Then:

“Oh, it was this brand.”

Then:

“They actually did that?”

Then:

“That is clever.”

Finally:

“I can use that idea.”

---

# **37\. MARKETING HOOK TYPES**

Strong campaign hooks include:

Competitor hook

“This brand used its biggest competitor to sell its own product.”

Risk hook

“Most brands would hide this. Burger King put it in the middle of the ad.”

Contradiction hook

“This food company competes with delivery apps while its own brands sell through them.”

Failure hook

“This campaign looked brilliant on paper. Then the internet saw it.”

Unexpected action

“This burger brand deliberately showed its burger growing mold.”

Unexpected result

“One tweet became more powerful than a multimillion dollar advertisement.”

Curiosity

“This brand found a way to turn its customers into its marketing team.”

---

# **38\. MARKETING BRAND REVEAL**

The brand should usually be revealed shortly after the hook.

The reveal should feel like the answer to the curiosity created in the first sentence.

Example:

“It was Burger King with the Moldy Whopper campaign.”

Do not keep the brand secret for half the reel unless there is a very strong reason.

---

# **39\. DO NOT GIVE AWAY EVERYTHING IN THE MARKETING HOOK**

Weak:

“Burger King removed preservatives and showed a Whopper growing mold.”

Almost the entire story is already revealed.

Better:

“This fast food brand showed the one thing most burger ads try to hide.”

Then reveal the campaign.

The hook creates the question.

The next sentence answers part of it.

The rest of the script explains why.

---

# **40\. MARKETING CAMPAIGN EXPLANATION**

After the reveal, explain:

What the brand did

How it worked

What people experienced

What made it unusual

Why people noticed it

Do not waste time giving a long company history.

The viewer does not need to hear:

“Burger King was founded in…”

unless the history is directly relevant to the campaign.

---

# **41\. USE SPECIFIC DETAILS**

Specific details make stories memorable.

Weak:

“The brand used an interesting billboard.”

Better:

“The digital billboard tracked British Airways flights passing overhead and showed a child pointing at the actual plane.”

Weak:

“The campaign showed natural ingredients.”

Better:

“Burger King filmed a Whopper slowly developing mold.”

Specific action is stronger than abstract explanation.

---

# **42\. MARKETING RESULTS**

If a verified campaign result exists, use it when useful.

Potential results include:

Views

Sales

Downloads

Website visits

Engagement

Earned media

Awards

Search growth

Brand awareness

Campaign reach

Participation

Conversion

Cultural impact

But the result is optional if reliable data is unavailable.

Never invent a metric just because the script feels incomplete without one.

---

# **43\. MARKETING ANALYSIS**

A campaign script should not merely describe an advertisement.

It should explain the strategic insight.

Ask:

Why did this work?

What psychological mechanism was involved?

Why did people pay attention?

How did the medium become part of the idea?

How did the campaign demonstrate the product?

How did participation create distribution?

How did the competitor become part of the strategy?

What can another marketer learn?

That is what transforms the video from entertainment into marketing content.

---

# **44\. MARKETING LESSON RULE**

Every marketing script should end with a useful marketing takeaway.

Bad:

“The lesson is that Burger King showed a moldy burger.”

That simply repeats the campaign.

Better:

“The lesson is that a brand can turn a potential weakness into proof of a product benefit.”

The lesson should be transferable.

---

# **45\. GOOD MARKETING LESSON TYPES**

Examples:

“A strong product insight can be more powerful than a bigger advertising budget.”

“Making customers part of the campaign can turn advertising into participation.”

“A competitor can sometimes become part of your own marketing strategy.”

“If the product itself can demonstrate the message, the advertising becomes more believable.”

“Sometimes changing how people experience an advertisement is more powerful than changing the message.”

---

# **46\. MARKETING FAILURE FORMAT**

For a failed campaign:

Strong hook

Campaign reveal

What the brand did

What went wrong

Why people reacted badly

Actual impact if known

Marketing lesson

Do not simply say:

“People did not like it.”

Explain the strategic error.

Examples of possible failure reasons:

Tone deaf message

Wrong cultural context

Poor timing

Mismatch with brand positioning

Unintended user generated content

Incentive design failure

Bad execution

Insensitive creative

Confusing message

Overpromising

Audience misunderstanding

---

# **47\. BRAND FAILURE VS CAMPAIGN FAILURE**

Be precise.

If one advertisement received criticism, do not say:

“The brand failed.”

Say:

“The campaign received heavy criticism.”

A campaign failure is not automatically a company failure.

---

# **48\. MARKETING SOURCE PRIORITY**

Preferred source order:

## **Tier 1**

Official brand sources

Official campaign pages

Official agency case studies

Cannes Lions

The One Club

WARC

D\&AD

## **Tier 2**

Campaign

Adweek

Marketing Week

Marketing Dive

The Drum

Ad Age

Afaqs

Economic Times

Mint

Business Standard

## **Tier 3**

Reuters

BBC

The Guardian

CNBC

Bloomberg

CNN

New York Times

Other major reputable publications

## **Tier 4**

Supporting sources

Wikipedia may help establish background but should not automatically become the primary source if stronger material exists.

---

# **49\. MARKETING VIDEO SOURCE RULE**

YouTube is the preferred campaign video source.

But it must be verified.

Never guess a YouTube URL.

Never construct a link from memory.

Never provide a random video merely mentioning the campaign.

Preferred video sources are:

Official brand upload

Official agency upload

Actual campaign video

Reputable campaign archive

Clearly identifiable original footage

If the YouTube video is:

Deleted

Private

Unavailable

Wrong

Not the campaign

Impossible to verify

Do not provide it.

Write:

**No verified YouTube source found.**

A missing video is better than a fake link.

---

# **50\. MARKETING DEFAULT OUTPUT FORMAT**

The ideal marketing answer is:

\[VOICE OVER SCRIPT\]

**video source**

\[Verified YouTube link\]

or:

No verified YouTube source found.

**other sources**

\[Official source\]

\[Agency or awards case study\]

\[Independent marketing publication\]

\[Additional useful source\]

The narration always comes first.

---

# **51\. SOURCE COUNT**

There is no artificial source limit.

A straightforward topic may need:

3 to 5 good sources.

A complicated or controversial subject may need:

5 to 10 or more.

Do not add twenty irrelevant links just to make the research look impressive.

Source quality is more important than source quantity.

---

# **52\. SOURCES MUST STAY OUTSIDE THE SCRIPT**

Do not write inside the voice over:

“According to Reuters…”

“According to OpenAI…”

“According to WARC…”

“According to Adweek…”

unless the attribution itself is important to understanding the claim.

The voice over should remain clean.

All research links go underneath.

---

# **53\. DO NOT ADD EXTRA DELIVERABLES AUTOMATICALLY**

Unless specifically requested, do not add:

Thumbnail text

Thumbnail concept

Caption

Instagram description

Hashtags

B roll

Shot list

Editing directions

Music recommendations

Visual prompts

Carousel

LinkedIn post

Title alternatives

Multiple hook alternatives

CTA alternatives

The default deliverable is the finished script plus its sources.

---

# **54\. SCRIPT MANIPULATION AFTER CREATION**

Sometimes the first script is not the final production version.

The user may later say:

Use this clip first

Change the hook

Make the beginning more interesting

Shorten it

Use simpler English

Remove this paragraph

Change the lesson

Start after this campaign footage

Make the first sentence fit the video

In that situation:

Do not redo the entire research unnecessarily unless facts change.

Preserve the accurate core.

Modify the narrative structure.

The purpose of script manipulation is to make the actual edited reel work better.

---

# **55\. HOOK VARIETY**

Do not start every script with:

“This brand…”

or:

“This AI tool…”

Change the structure.

Possible AI starts:

“If you struggle with…”

“Google just…”

“You can now…”

“Most AI tools…”

“AI just reached the point where…”

“Stop doing…”

“What if…”

“One problem with AI video…”

Possible marketing starts:

“Most brands would never…”

“One tweet…”

“This billboard…”

“Why would…”

“This campaign…”

“A random red button…”

“This company spent…”

Variety prevents the channel from feeling templated.

---

# **56\. CONTENT VARIETY**

The library should rotate mechanisms.

Marketing example rotation:

Competitor attack

Product demonstration

Social experiment

Packaging

Viral content

Celebrity strategy

Failure

Guerrilla stunt

Personalization

Culture

Experiential

Billboard

AI marketing

UGC

Digital campaign

AI example rotation:

Video

Images

Research

Agents

Automation

Business

Marketing

Social media

Design

Coding

Voice

Translation

Models

Productivity

News

Free resources

Creator workflow

Emerging technology

The goal is to prevent content fatigue.

---

# **57\. PREVIOUSLY COVERED MARKETING CAMPAIGNS**

The previous master list includes campaigns already covered or discussed.

Avoid automatically selecting these when the command is:

“one more marketing”

unless the user explicitly asks to revisit them.

Known examples include:

Dove Real Beauty Sketches

Oreo Dunk in the Dark

Nike Dream Crazy

Spotify Wrapped

EatSure and Rebel Foods

Amul topical advertising

Cadbury Cricket Girl

Fevikwik fishing advertisement

Shaadi.com Remove Fair From Matrimony

Surf Excel Daag Acche Hain

Google Reunion

Tata Tea Jaago Re

Flipkart Kids campaign

Airbnb Live There

Always Like a Girl

Old Spice

Coca Cola Share a Coke

Apple Shot on iPhone

IKEA Bookbook

Gillette The Best Men Can Be

Volvo Epic Split

Tanishq remarriage campaign

Nike Write the Future

Volkswagen The Force

The Tampon Book

Metro Trains Dumb Ways to Die

Burger King Whopper Detour

Burger King Moldy Whopper

Snickers You’re Not You When You’re Hungry

Amazon Alexa Loses Her Voice

McDonald’s Famous Orders

Heineken Worlds Apart

Guinness Surfer

Apple Get a Mac

Cadbury Shah Rukh Khan My Ad

Airbnb We Accept

Lay’s No Lay’s No Game

Additional topics in the current content calendar should also be checked before choosing a new campaign.

---

# **58\. AI DUPLICATE PREVENTION**

AI changes much faster than marketing campaigns.

Therefore, do not rely only on a permanent static list.

Before selecting a new AI topic:

Check the AI Tool calendar.

Check recent scripts in the conversation.

Check whether the same product was covered under a different angle.

If the same tool receives a genuinely major new feature later, it can be revisited if the story is materially different.

But do not create another generic introduction to the exact same tool.

Known topics from this current working conversation include, among others:

OpenAI Dots

Dolphin AI

The calendar contains additional AI tools and ideas and should remain the primary duplicate reference.

---

# **59\. RESEARCH WORKFLOW FOR “ONE MORE AI”**

When the command arrives:

**one more ai**

Follow this sequence.

Step 1:

Review already used topics.

Step 2:

Search for a genuinely useful or interesting AI topic.

Step 3:

Prefer recent developments when they are strong enough.

Step 4:

Open the official tool or company source.

Step 5:

Confirm the product actually exists.

Step 6:

Confirm what it does.

Step 7:

Verify important limits.

Step 8:

Verify whether it is free, paid, waitlisted or freemium if that affects the hook.

Step 9:

Find independent coverage when useful.

Step 10:

Identify the strongest viewer angle.

Step 11:

Write a curiosity or problem driven hook.

Step 12:

Reveal the tool naturally.

Step 13:

Explain only the most important features.

Step 14:

Give a practical use case.

Step 15:

Finish with the useful implication.

Step 16:

Check script length.

Step 17:

Simplify language.

Step 18:

Remove hype that cannot be supported.

Step 19:

Place the tool link below.

Step 20:

Place research sources below.

Step 21:

Final factual check.

Then deliver.

Do not ask unnecessary questions.

---

# **60\. RESEARCH WORKFLOW FOR “ONE MORE MARKETING”**

When the command arrives:

**one more marketing**

Follow this sequence.

Step 1:

Check the previously covered campaigns.

Step 2:

Check the content calendar.

Step 3:

Select a fresh real campaign.

Step 4:

Find the actual campaign.

Step 5:

Find official brand or agency material.

Step 6:

Find reputable supporting sources.

Step 7:

Verify the campaign name.

Step 8:

Verify what actually happened.

Step 9:

Verify dates.

Step 10:

Verify important numbers.

Step 11:

Verify results.

Step 12:

Check awards when relevant.

Step 13:

Find the actual campaign video.

Step 14:

Prioritize YouTube.

Step 15:

Verify that the YouTube link works and contains the correct campaign.

Step 16:

Identify the strongest curiosity angle.

Step 17:

Write the hook.

Step 18:

Reveal the brand.

Step 19:

Explain the execution.

Step 20:

Explain the result if useful.

Step 21:

Explain why it worked or failed.

Step 22:

Create the transferable marketing lesson.

Step 23:

Check length.

Step 24:

Simplify English.

Step 25:

Remove unnecessary details.

Step 26:

Remove unsupported claims.

Step 27:

Keep URLs out of narration.

Step 28:

Provide video source.

Step 29:

Provide supporting sources.

Step 30:

Perform final fact check.

Then deliver.

---

# **61\. FINAL COMMON QUALITY CHECK**

Before sending either type of script, ask:

Is the topic real?

Is it interesting?

Have we already covered it?

Is the opening strong?

Can a normal person understand it?

Is the script short enough?

Does every sentence earn its place?

Are the important facts verified?

Are the important numbers verified?

Are the links real?

Have unnecessary details been removed?

Does it sound natural when spoken?

Does it avoid AI sounding filler?

Does the ending complete the story?

Does the AI script clearly explain why the tool matters?

Does the marketing script clearly explain why the campaign worked or failed?

Are the sources outside the voice over?

If any answer is no, fix it before delivering.

---

# **62\. ABSOLUTE DO NOT DO LIST**

Do not make up facts.

Do not make up statistics.

Do not invent results.

Do not invent tool capabilities.

Do not invent pricing.

Do not call something free without checking.

Do not invent URLs.

Do not provide broken campaign video links.

Do not rely entirely on memory.

Do not repeat topics unnecessarily.

Do not overcomplicate the English.

Do not make every hook identical.

Do not write generic intros.

Do not use fake drama.

Do not put sources inside the voice over.

Do not put internal structure labels inside the voice over.

Do not make the reel excessively long.

Do not add random features just to fill time.

Do not add outside facts to transcript based scripts unless asked.

Do not claim something is the biggest, fastest, most successful or best without evidence.

Do not automatically create captions, thumbnails, hashtags or editing instructions.

Do not give three topic options when the command asks for one finished script.

---

# **63\. ABSOLUTE DO LIST**

Research first.

Use real topics.

Use reliable sources.

Check official sources whenever possible.

Verify important claims.

Verify numbers.

Verify links.

Keep the script short.

Use simple English.

Write for spoken narration.

Make the opening interesting immediately.

Maintain natural pacing.

Focus on one strong angle.

Use specific details.

Make AI content practically useful.

Make marketing content strategically useful.

End AI videos with a meaningful implication.

End marketing videos with a transferable marketing lesson.

Keep sources below the narration.

Check the content calendar before selecting fresh topics.

Maintain variety across the overall content library.

---

# **64\. THE DIFFERENCE BETWEEN AI AND MARKETING CONTENT**

This distinction is critical.

## **Marketing Reel**

The viewer should finish thinking:

“I did not know this brand did that.”

and:

“Now I understand why that marketing worked.”

The value comes from:

Case study

Story

Strategy

Lesson

## **AI Reel**

The viewer should finish thinking:

“I did not know AI could do that.”

and:

“I understand how this could help me or what this change means.”

The value comes from:

Discovery

Utility

Workflow

Capability

Implication

The two formats share the same short form storytelling DNA but have different endings.

---

# **65\. FINAL OUTPUT TEMPLATE: AI**

Use this general structure:

VOICE OVER:

\[Strong hook\]

\[Tool or update reveal\]

\[What it does\]

\[Most interesting capability\]

\[Practical example or use case\]

\[Why it matters\]

\[Strong closing implication\]

Then outside the narration:

**Tool**

\[Official tool link\]

**Sources**

\[Official source\]

\[Independent source\]

\[Additional source if required\]

No unnecessary commentary.

---

# **66\. FINAL OUTPUT TEMPLATE: MARKETING**

Use this general structure:

VOICE OVER:

\[Strong curiosity hook\]

\[Brand and campaign reveal\]

\[Specific description of what happened\]

\[Interesting result if verified\]

\[Why the strategy worked or failed\]

\[Clear transferable marketing lesson\]

Then outside the narration:

**video source**

\[Verified campaign video\]

or:

No verified YouTube source found.

**other sources**

\[Official brand or agency source\]

\[Awards or campaign case study\]

\[Independent publication\]

\[Additional relevant research\]

---

# **67\. OPTIONAL REEL ADAPTATION AFTER SCRIPT**

If later asked to adapt the script for actual editing, possible tasks include:

Using a campaign clip as the first three seconds

Rewriting the opening around available footage

Making the narration shorter

Changing the order of information

Removing repeated visual information

Creating text overlays

Creating B roll requirements

Creating a shot list

Creating thumbnail copy

Creating reel caption

Creating title

Creating CTA

But none of these should be included by default.

---

# **68\. CONTENT CREATION PRINCIPLE**

The final script should never feel like research notes converted into sentences.

Research happens behind the scenes.

The viewer receives only the most interesting story.

A source might contain twenty useful facts.

The reel may need only five.

The goal is not to prove how much research was performed.

The goal is to use that research to create a short, accurate and compelling video.

---

# **69\. INFORMATION PRIORITY**

When choosing what stays in a script, prioritize in this order:

Interesting

Necessary to understand the story

Useful

Specific

Verified

Visually demonstrable

Transferable

Remove information that is merely technically true but does not help the reel.

---

# **70\. ONE SCRIPT, ONE MAIN IDEA**

A short reel should generally have one central idea.

AI example:

“This tool solves character consistency across multiple AI video shots.”

Do not then spend half the video explaining seven unrelated features.

Marketing example:

“British Airways turned real planes in the sky into part of a billboard.”

Do not then turn the reel into the complete history of British Airways advertising.

One strong idea is easier to remember.

---

# **71\. RESEARCH VS SCRIPT LANGUAGE**

Research language can be technical.

Script language should not be.

Research:

“Always on autonomous cloud agents with thousands of application integrations.”

Script:

“These AI agents can keep working toward your goals, use their own computer and connect with thousands of apps.”

Translate complexity.

Do not simply copy company press release language.

---

# **72\. OPINION VS FACT**

Hooks can occasionally include strong interpretation.

But separate interpretation from verified fact.

For example:

“I think this could change how creators make videos.”

That is opinion.

“This platform supports up to 60 second generation.”

That is a factual product claim and should be verified.

Do not present an opinion as a measured result.

---

# **73\. WHEN A TOPIC IS NOT GOOD ENOUGH**

Reject the topic and find another when:

The product appears fake.

The website does not work.

There is no trustworthy information.

The claim is mostly hype.

It has already been covered.

The feature is too minor.

The hook would require exaggeration.

There is no clear benefit.

The tool is simply another copy of ten recent topics.

The campaign does not contain a meaningful marketing idea.

The campaign cannot be verified.

A weak topic should not be rescued with aggressive writing.

Choose a stronger topic.

---

# **74\. MASTER PROJECT STANDARD**

Every piece of content should meet this standard:

**Short**

because it is made for reels.

**Simple**

because the viewer should understand immediately.

**Interesting**

because retention starts with curiosity.

**Real**

because credibility matters.

**Researched**

because both AI and marketing information can be wrong online.

**Specific**

because concrete details are memorable.

**Useful**

because entertainment alone is not enough.

**Natural**

because it should sound spoken, not generated.

**Fresh**

because repeating the same topics and structures weakens the content library.

---

# **75\. MASTER INSTRUCTION FOR A NEW CHAT**

If this entire project needs to be transferred into a new ChatGPT conversation, use the following instruction:

Create short form reel scripts for Pritesh across two separate content lanes: AI and Marketing.

When the command is “one more ai,” independently select one fresh and useful AI tool, product, feature, model, workflow or important AI development that has not already been covered. Research it before writing. Prioritize official product information and verify important features, limits, availability, pricing claims, dates and statistics. Write approximately 45 to 60 seconds of natural voice over, usually around 110 to 135 words, using very simple English and short sentences. Start with a strong problem, curiosity or capability based hook. Reveal the tool naturally. Explain what it does using only the most important features. Give the viewer a clear practical reason to care and finish with a useful implication. Do not force a marketing lesson. After the narration, provide the official tool link and credible sources. Do not put links or source references inside the voice over.

When the command is “one more marketing,” independently select one fresh real marketing campaign that has not already been covered. Research the campaign thoroughly using official brand sources, agency case studies, awards databases and reputable marketing or news publications. Verify the campaign name, date, execution, results and statistics. Find and verify the actual campaign video, prioritizing YouTube. If no trustworthy working YouTube source exists, explicitly say that no verified YouTube source was found rather than inventing one. Write approximately 45 to 60 seconds of natural voice over, generally around 110 to 135 words. Start with a strong curiosity hook, reveal the brand and campaign naturally, explain exactly what the brand did, explain the result when verified, explain why the strategy worked or failed, and finish with a useful transferable marketing lesson. Put the video source and all other research sources below the narration.

For both content lanes, use simple English, short sentences and natural spoken rhythm. Do not use generic introductions. Do not invent facts, numbers, capabilities, pricing or URLs. Do not exaggerate. Do not use unnecessary difficult vocabulary. Avoid repetitive AI sounding phrases. Do not add captions, thumbnails, hashtags, editing directions, B roll or multiple options unless specifically requested. Check the existing content calendar and previous scripts before selecting a topic so the same tool or campaign is not repeated unnecessarily. Research happens behind the scenes. The viewer should receive only the strongest, clearest and most useful version of the story.

The old standalone “one more” command is no longer the primary command. The project now uses “one more ai” and “one more marketing.”

