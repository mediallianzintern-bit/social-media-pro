-- 0030 — Past Instagram scripts as tone references.
--
-- Scripts Pritesh posted, given to the script writer as examples of how he
-- sounds: his phrasing, his point of view, how he talks to business owners.
-- Voice only: their facts are old, and a new script's facts come from its own
-- research (lib/research.ts), never from these. See server/ai/tone.ts.
--
-- Seeded from "Pritesh Social Media Master Tracker - Oct 2026", sheet
-- Instagram, rows 1-9 (14-26 Oct 2026), script text exactly as in the sheet.
-- Row 10 is left out: its title names a different story and its script is
-- generic, with no brand or example. Row 8's title in the sheet named a Meta
-- story; its script is the PHP story, so it is stored under that title.
--
-- More can be added as rows; `active` false takes one out of use.
-- Server-only. Idempotent.

create table if not exists public.voice_references (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  title text not null,
  script text not null,
  posted_at date,
  lane text,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (platform, title)
);

alter table public.voice_references enable row level security;

comment on table public.voice_references is
  'Past scripts used as tone references for new scripts. Voice only, never facts. Server-only.';

insert into public.voice_references (platform, title, script, posted_at, lane, source) values
  ('instagram', $ref$Google wants AI to do your online tasks.$ref$, $ref$Google wants AI to do your online tasks.

Imagine asking your phone to book parking, order groceries or fill out a lengthy online form.

And instead of giving you instructions, AI actually does the work for you.

That's what Google is bringing to Chrome with Gemini and its new Auto Browse feature.

Google is rolling out Gemini inside Chrome for Android users in India.

You can ask Gemini to summarise lengthy webpages, answer questions about what you're reading, extract information and even generate or edit images using Nano Banana.

It can also connect with Google services like Keep and Calendar.

But Auto Browse is the really interesting part.

You give Gemini an instruction, and it can navigate websites and complete certain multi-step tasks for you.

Of course, sensitive actions like purchases still require your confirmation.

Now, think about the bigger picture.

Until now, businesses have designed websites for people to search, click, compare and buy.

But what happens when AI agents start doing these things on behalf of customers?

That's a completely different way of interacting with the internet.

And businesses need to start thinking about it.$ref$, '2026-10-14', 'Frontier AI developments', 'Master Tracker Oct 2026, row 1'),
  ('instagram', $ref$What if I told you that you could create an entire advertising campaign just by entering your website URL?$ref$, $ref$What if I told you that you could create an entire advertising campaign just by entering your website URL?

No copywriting. No designing creatives. No manually selecting your target audience.

Sounds interesting?

That's exactly what X is trying to do with its new AI advertising product called X Lift.

Here's how it works.

You enter your website URL, and X's AI analyses your business and generates multiple ad creatives, including images and copy.

It can also recommend targeting and build the campaign around your advertising objective.

All you need to do is review, set your budget and approve the campaign.

Traditionally, advertisers had to handle creative development, audience selection and campaign setup separately.

X wants AI to take care of most of that work.

And it's not alone. Meta and TikTok are also investing heavily in AI-powered advertising.

But here's where I'd be careful.

Just because AI can create an advertisement doesn't mean it understands your business, your customer or your positioning.

Use AI to accelerate campaign creation, but don't outsource your marketing judgement.

Because launching an ad campaign has never been the biggest challenge. Making it profitable is.

Follow for daily AI and marketing updates. See you tomorrow.$ref$, '2026-10-15', 'Frontier AI developments', 'Master Tracker Oct 2026, row 2'),
  ('instagram', $ref$Imagine your business gets hundreds of messages asking, “What time do you open?” or “What’s your return policy?”$ref$, $ref$Imagine your business gets hundreds of messages asking, “What time do you open?” or “What’s your return policy?”

AI can help answer these. But every answer has a cost.

Anthropic has launched Claude Haiku 5.5. The company says it costs around 75% less to run, on average, than Haiku 4.5.

That doesn’t mean your entire customer support bill drops by 75%. But handling routine questions could become cheaper.

Here’s what matters for your business.

Choose AI based on the job you need done. Test a cheaper option on simple questions. Check that its answers are accurate before letting it respond to customers.$ref$, '2026-10-16', 'Frontier AI developments', 'Master Tracker Oct 2026, row 3'),
  ('instagram', $ref$What if a smaller AI model could do the job of a much bigger one, but cost less?$ref$, $ref$What if a smaller AI model could do the job of a much bigger one, but cost less?

That's what Reflection AI claims with its new model, Beam.

Beam has 501 billion parameters. Think of these as the parts that help AI learn and answer questions.

But here's the clever part.

Beam uses a system called Mixture of Experts.

Think of it like a restaurant kitchen. Not every chef needs to work on every order. Only the right people handle each dish.

Beam works in a similar way. It uses only 23 billion parameters at a time.

Reflection AI says Beam can give similar results to top Chinese open AI models while using up to four times less computing power.

Why does this matter?

Running AI is like running a large office. More resources mean higher costs.

Less computing power can save businesses money.

The AI race isn't just about building bigger models. It's about getting better results with fewer resources.$ref$, '2026-10-19', 'Frontier AI developments', 'Master Tracker Oct 2026, row 4'),
  ('instagram', $ref$Disney just cut its famous logo in half. And turned it into an ad!$ref$, $ref$Disney just cut its famous logo in half. And turned it into an ad!

The campaign is running on billboards in Canada.

It brings half of the Disney logo and half of the Hulu logo together.

The result? "Hu Dis?"

It sounds like "Who dis?"

But there's a smart idea behind the joke.

Disney wants people to know that Hulu shows are now part of Disney+.

The campaign, made by agency Courage, also shows popular shows like The Kardashians and Scrubs.

Here's what I find smart.

Disney didn't use a long message to explain the change.

It used two logos that people already know.

The lesson? Sometimes, changing something people know can say more than creating something new.$ref$, '2026-10-20', 'Marketing stunts', 'Master Tracker Oct 2026, row 5'),
  ('instagram', $ref$This candy brand is attacking another brand's ad. And it's doing it on purpose!$ref$, $ref$This candy brand is attacking another brand's ad. And it's doing it on purpose!

Meet Sour Patch Kids.

The brand has launched its first UK ad campaign, called "Not As Sweet As They Look".

One billboard shows Sour Patch Kids tearing apart a nearby Oreo ad.

Why Oreo? The two brands already have a fun rivalry on social media, where Sour Patch Kids often roast Oreo.

Now, they're taking that fight to the streets.

Other ads show a tug of war that rips a Sour Patch Kid in half and a tennis match that turns rough.

Here's the smart part.

Sour Patch Kids doesn't just talk about its taste. It shows its playful side through its ads.

That's how you turn a brand personality into advertising.$ref$, '2026-10-21', 'Marketing stunts', 'Master Tracker Oct 2026, row 6'),
  ('instagram', $ref$Stop staring at a blank screen, trying to write the perfect hook.$ref$, $ref$Stop staring at a blank screen, trying to write the perfect hook.

Here's how to turn one viral YouTube video into 20 hooks for your niche using AI.

Step 1: Install the Glasp Chrome extension. Use it to get the video's transcript with one click.

Step 2: Copy the transcript into ChatGPT and use this prompt:

"Find the 10 best hooks in this video. Rewrite them for a digital marketing trainer in India with 21 years of experience. My audience includes digital marketers, business owners and students. Keep the same style and curiosity, but use new examples and simple words. Don't copy the original hooks."

Step 3: Save your favourite hooks in Notion and build your own hook bank.

You can also ask ChatGPT to adapt them for your city, product, business or audience.

Remember, don't copy viral content. Understand why a hook works and make it your own.

Comment **HOOKS** and I'll share the exact prompt I use.$ref$, '2026-10-22', 'AI tool workflows', 'Master Tracker Oct 2026, row 7'),
  ('instagram', $ref$Websites went dark worldwide after AI found PHP security flaws$ref$, $ref$If you’re a digital marketer, pay attention. Websites just went dark around the world.

Every ad you run, every post you share, every email you send. All of it leads to one place. A website.

So what happens when that website suddenly goes offline?

This week, government websites in France, the Netherlands and Belgium did exactly that. Security holes were found in PHP, the software many WordPress sites run on.

And here’s the interesting part. Security firms used AI from OpenAI and Google to find them. Since AI is finding these problems faster, expect more updates, more often.

For you, a site that’s down mid-campaign means paying for clicks that land on a broken page.

So add one question to every client check-in. Is the website updated?$ref$, '2026-10-23', 'Frontier AI developments', 'Master Tracker Oct 2026, row 8'),
  ('instagram', $ref$What if a brand made an entire ad using just hands?$ref$, $ref$What if a brand made an entire ad using just hands?

That's exactly what health-tech brand Ōura has done.

Its new campaign, 'Wear Your Best Life', made by Nice&frank, takes place in a tiny handmade world.

You see hands making sushi, skating, fighting and doing everyday things. And they all wear an Ōura Ring.

The ring tracks sleep, activity, stress and heart health.

But here's what I find smart.

Instead of showing screens, numbers and tech features, Ōura shows how the ring fits into daily life.

The message is simple. It's not just about tracking health. It's about living better.

That's a lesson for brands: Show people how your product fits into their lives, not just what it does.$ref$, '2026-10-26', 'Brand strategy lessons', 'Master Tracker Oct 2026, row 9')
on conflict (platform, title) do nothing;
