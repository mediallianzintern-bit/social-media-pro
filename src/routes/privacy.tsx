import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth";

/**
 * The public privacy policy.
 *
 * Deliberately outside the _app layout AND outside the login gate: LinkedIn and
 * Meta both require a privacy policy URL that their reviewers can open without
 * an account, and a page behind a sign-in wall fails that check. It is also
 * server-rendered rather than ssr:false, so the text is in the HTML a reviewer
 * or a crawler fetches rather than appearing only after hydration.
 *
 * Everything below describes what this codebase actually does. When the system
 * changes, this page changes with it — a policy that describes a system that no
 * longer exists is worse than none.
 */
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — Social Command Center" },
      {
        name: "description",
        content:
          "How the Mediallianz Social Command Center collects, uses and stores social media analytics data.",
      },
    ],
  }),
  component: PrivacyPage,
});

/**
 * Details that are a business fact rather than a code fact, kept together so
 * they can be confirmed and corrected in one place instead of hunted through
 * prose. CONFIRM THESE before the policy is relied on: the registered entity
 * name, the address, whether the mailbox exists, and the governing jurisdiction.
 */
const ENTITY = {
  name: "Mediallianz",
  contactEmail: "privacy@mediallianz.com",
  product: "Social Command Center",
  site: "social.mediallianz.com",
  lastUpdated: "29 September 2026",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:py-16">
      <header className="space-y-4">
        <Wordmark className="h-7" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Privacy policy</h1>
          <p className="text-sm text-muted-foreground">
            For the {ENTITY.product} at {ENTITY.site}. Last updated {ENTITY.lastUpdated}.
          </p>
        </div>
      </header>

      <div className="space-y-8">
        <Section title="What this product is">
          <p>
            The {ENTITY.product} is an internal analytics tool used by {ENTITY.name} staff to
            measure the performance of social media accounts we manage, and to plan content for
            them. It is not a consumer product, it is not open to public sign-up, and it sells
            nothing.
          </p>
          <p>
            Access is restricted to people with an{" "}
            <span className="font-medium text-foreground">@{ALLOWED_EMAIL_DOMAIN}</span> email
            address. That restriction is enforced in the sign-up form, the route guard, the server
            middleware and the database, so no single layer is relied on alone.
          </p>
        </Section>

        <Section title="Who the data is about">
          <p>There are three groups, and they are treated differently.</p>
          <p>
            <span className="font-medium text-foreground">Our staff.</span> People who sign in. We
            store the email address used to sign in and the role assigned to them.
          </p>
          <p>
            <span className="font-medium text-foreground">Accounts we manage.</span> Social media
            accounts whose owner has engaged {ENTITY.name} to manage them, and who has connected
            those accounts to this tool.
          </p>
          <p>
            <span className="font-medium text-foreground">
              Public accounts we benchmark against.
            </span>{" "}
            A small set of named competitor and industry accounts, chosen by our team. We record
            only what their profiles publish publicly. We hold no private data about them, we do not
            contact them through this tool, and we do not attempt to identify anyone who is not
            already publishing under their own name. If you are one of these accounts and want your
            data removed, see <span className="font-medium text-foreground">Your choices</span>{" "}
            below.
          </p>
        </Section>

        <Section title="What we collect">
          <p>
            <span className="font-medium text-foreground">From public profiles</span> — profile
            name, handle, biography line, follower and following counts, post count, and for each
            post its permalink, caption, format, publication time and public engagement counts
            (views where a platform publishes them, likes, comments, shares).
          </p>
          <p>
            <span className="font-medium text-foreground">
              From a managed account&rsquo;s own analytics
            </span>{" "}
            — where the account owner has authorised it, the private metrics a platform makes
            available to the account holder about their own posts: reach, saves, shares, watch time,
            profile visits and follows. For Instagram this is the Meta Graph API.
          </p>
          <p>
            <span className="font-medium text-foreground">Audience demographics</span> — where a
            platform provides them for a managed account, aggregate breakdowns by age band, gender,
            country and city. These are counts, never individual followers. We cannot see, and do
            not receive, the identity of anyone in these figures.
          </p>
          <p>
            <span className="font-medium text-foreground">Staff account data</span> — email address,
            role, and an authentication session.
          </p>
          <p>
            We do not collect payment details, government identifiers, precise location, health
            data, private messages, or any special-category personal data.
          </p>
        </Section>

        <Section title="How LinkedIn data is used">
          <p>
            Where a LinkedIn account is connected, we use LinkedIn data only to report on that
            account&rsquo;s own performance to the person or organisation that owns it, and to
            inform what content we plan for them. Specifically: follower counts over time, each
            post&rsquo;s public engagement, and — where the owner has authorised it — the analytics
            LinkedIn provides to the account holder about their own posts.
          </p>
          <p>
            We do not use LinkedIn data to build profiles of individual LinkedIn members, to train
            machine-learning models, for advertising or ad targeting, or for any purpose unrelated
            to managing the connected account. We do not sell it, rent it, or share it with data
            brokers. We do not combine it with data from other sources to identify individual
            members.
          </p>
        </Section>

        <Section title="Why we process it">
          <p>
            To measure how the accounts we manage are performing, to compare that performance
            against public benchmarks in the same field, and to decide what content to make next.
            That is the whole purpose of the product.
          </p>
          <p>
            Where the UK GDPR or EU GDPR applies, our lawful basis for processing public profile
            data is legitimate interests — providing a social media management service that a client
            has asked us for — balanced against the limited, public and professional nature of the
            data. For a connected account, processing is carried out on the instructions of the
            account owner under our contract with them. For staff accounts, the basis is our
            legitimate interest in running a secure internal tool.
          </p>
        </Section>

        <Section title="Who we share it with">
          <p>
            We do not sell personal data and we do not share it for advertising. We use the
            following processors, each for one job:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-foreground">Supabase</span> — the database and
              authentication that store everything described above.
            </li>
            <li>
              <span className="font-medium text-foreground">Apify</span> — collects public profile
              and post data from social platforms on our behalf.
            </li>
            <li>
              <span className="font-medium text-foreground">Meta</span> — supplies a connected
              Instagram account&rsquo;s own analytics, via the Graph API.
            </li>
            <li>
              <span className="font-medium text-foreground">OpenAI</span> — analyses stored post
              captions and performance figures to produce written summaries and content suggestions.
              Content sent to OpenAI through its API is not used to train its models.
            </li>
            <li>
              <span className="font-medium text-foreground">Google News</span> — we search a public
              news feed for articles on our clients&rsquo; subjects. This sends the search terms,
              not your data.
            </li>
            <li>
              <span className="font-medium text-foreground">Lovable</span> — hosts the application.
            </li>
          </ul>
          <p>
            We may also disclose data where the law requires it. Processing takes place in the
            regions these providers operate in, which may be outside your country; where personal
            data leaves the UK or EEA, it is transferred under the safeguards those providers offer,
            such as standard contractual clauses.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Performance history is the product: a follower count from six months ago is what makes
            today&rsquo;s figure mean anything, so account and post metrics are retained for as long
            as we manage the account, and are deleted within 90 days of an engagement ending.
          </p>
          <p>
            Data about public benchmark accounts is deleted when we stop tracking that account. A
            staff account and its data are deleted when the person leaves.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Data is held in a managed Postgres database reachable only by our server, which holds
            the credentials; they are never sent to the browser. Access requires a password and an @
            {ALLOWED_EMAIL_DOMAIN} address. Platform access tokens are stored as server-side
            environment variables and are never exposed to the client. Traffic is encrypted in
            transit.
          </p>
          <p>
            No system is perfectly secure. If we become aware of a breach affecting personal data,
            we will notify the people affected and the relevant regulator as the law requires.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            Depending on where you live, you may have the right to ask for a copy of your personal
            data, to have it corrected or deleted, to object to or restrict our processing of it,
            and to complain to your data protection authority.
          </p>
          <p>
            <span className="font-medium text-foreground">
              If you run a public account we benchmark against
            </span>{" "}
            and you would rather we did not, write to us at the address below with your handle. We
            will stop collecting it and delete what we hold. You do not have to give a reason.
          </p>
          <p>
            <span className="font-medium text-foreground">
              If you are a client whose account is connected
            </span>
            , you can disconnect it at any time by revoking this application&rsquo;s access in your
            Instagram or LinkedIn settings. That stops all further collection immediately.
          </p>
          <p>
            We aim to answer any request within 30 days. We will not charge you or treat you
            differently for making one.
          </p>
        </Section>

        <Section title="Cookies and tracking">
          <p>
            This application sets no advertising or analytics cookies and runs no third-party
            trackers. It stores a sign-in session in your browser so you are not asked to log in on
            every page. That is the only thing it keeps there, and clearing your browser storage
            removes it.
          </p>
        </Section>

        <Section title="Children">
          <p>
            This is an internal business tool. It is not directed at children and we do not
            knowingly collect data from anyone under 16.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change what we collect or what we do with it, we will update this page and the
            date at the top. Material changes will be communicated to the clients affected directly.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            For any privacy question or request, including data access and deletion, write to{" "}
            <a
              href={`mailto:${ENTITY.contactEmail}`}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {ENTITY.contactEmail}
            </a>
            .
          </p>
        </Section>
      </div>

      <footer className="border-t pt-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {ENTITY.name} — {ENTITY.product}. This policy describes the application at {ENTITY.site}{" "}
          and no other {ENTITY.name} service.
        </p>
      </footer>
    </main>
  );
}
