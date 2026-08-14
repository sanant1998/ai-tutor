import { boardGroups } from "@/components/sections/Boards";
import {
  BENTO_TILES,
  COMPARE_SECTION,
  REGION,
  FAQS,
  HERO,
  HOW_STEPS,
  PLANS_BY_COUNTRY,
  TESTIMONIALS_ROW_1,
  TESTIMONIALS_ROW_2,
} from "@/lib/content";

/* Static, crawlable mirror of the page for crawlers and browsers without
   JavaScript. Most AI answer engines (GPTBot, ClaudeBot, PerplexityBot) do
   not execute JS, so this is the full landing copy they read. It lives in a
   noscript element, so visitors with JS never see it. Generated from the same
   content module as the visible page, so the two cannot drift apart. */
export function SeoMirror() {
  const testimonials = [...TESTIMONIALS_ROW_1, ...TESTIMONIALS_ROW_2];

  return (
    <noscript>
      <main>
        <h1>
          {HERO.headline.lead} {HERO.headline.accent}
        </h1>
        <p>{HERO.sub}</p>
        {/* The default region's figures. A crawler has no toggle, and the
            boards section below spells out both countries in full. */}
        <ul>
          {[...REGION.in.stats, ...HERO.stats].map((stat) => (
            <li key={stat.label}>
              {stat.value} {stat.label}
            </li>
          ))}
        </ul>
        <p>
          <a href="/signup">Start free</a>
        </p>

        <section>
          <h2>One place for every part of revision</h2>
          {BENTO_TILES.map((tile) => (
            <div key={tile.id}>
              <h3>{tile.title}</h3>
              <p>{tile.body}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>How it works</h2>
          {HOW_STEPS.map((step) => (
            <div key={step.n}>
              <h3>{step.title}</h3>
              <p>{step.body ?? REGION.in.firstStep}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>{COMPARE_SECTION.heading}</h2>
          <h3>{COMPARE_SECTION.after.label}</h3>
          <ul>
            {COMPARE_SECTION.after.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Boards and subjects</h2>
          {Object.values(boardGroups()).map((group) => (
            <div key={group.region}>
              <h3>{group.region}</h3>
              <p>{group.sub}</p>
              <ul>
                {group.cards.map((board) => (
                  <li key={board.name}>
                    {board.name} — {board.detail}.{" "}
                    {board.ready ? `Open now: ${board.ready}.` : `${board.basis}. Not open yet.`}
                  </li>
                ))}
              </ul>
              <p>{group.footnote}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>What students say</h2>
          {testimonials.map((item) => (
            <blockquote key={item.name}>
              <p>{item.quote}</p>
              <cite>
                {item.name} — {item.detail}
              </cite>
            </blockquote>
          ))}
        </section>

        <section>
          <h2>Pricing</h2>
          {PLANS_BY_COUNTRY.in.map((plan) => (
            <div key={plan.id}>
              <h3>
                {plan.name} — {plan.price} {plan.period}
              </h3>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>Everything you need to know</h2>
          {FAQS.map((faq) => (
            <div key={faq.q}>
              <h3>{faq.q}</h3>
              <p>{faq.a}</p>
            </div>
          ))}
        </section>

        <p>This site requires JavaScript for the full interactive app.</p>
      </main>
    </noscript>
  );
}
