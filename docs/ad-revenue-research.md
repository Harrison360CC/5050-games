# 5050 Games: ad monetization research (Oct 22, 2026)

## Recommended setup

Use Google AdSense plus H5 Games Ads (Ad Placement API) as the primary stack. It is the only mainstream product that lets an individual put interstitial and rewarded units inside a self-hosted HTML5 game, it has no stated traffic minimum, and the rewarded unit explicitly supports "watch an ad for a bonus life." Keep classic AdSense display out of the game canvas (one banner on the leaderboard page at most). Apply for an AdSense account on play5050games.com now, with real content pages (rules, prize terms, privacy, past winners), because AdSense approval must come before the H5 application and neither is guaranteed (https://developers.google.com/ad-placement/docs/signup).

Placement plan per game:
- Interstitial (adBreak type 'next' on the restart tap): first one after the 2nd death, then every 3rd death, minimum ~90 seconds between ads. Google enforces its own frequency cap server side and returns `frequencyCapped`, so always call `adBreakDone` and continue (https://playgama.com/blog/?p=14137).
- Rewarded (type 'reward'): one "watch to continue your run" offer per session, never chained, same-size "No thanks" button. Never "double score" or any multiplier.
- Caps: max 4 interstitials per session, max 12 interstitials and 3 rewarded per player per day.

## Formula

pot_per_game = plays x impressions_per_play x (eCPM / 1000) x fill_rate x revenue_share x 0.5

With the plan above and ~8 runs per play: impressions_per_play ≈ 2.0 interstitials + 0.15 rewarded ≈ 2.15. Ads per minute of play ≈ 0.6. Published eCPMs are net of the network cut, so revenue_share = 1.0 for AdSense/H5, 0.5 to 0.6 via Poki/CrazyGames.

Week-one scenarios (per game, mobile web, mostly US/CA/UK, fill 70%, AdSense direct). Blended eCPM: low $1.50, mid $4, high $8.

| Plays | Filled impressions | Low pot | Mid pot | High pot |
|---|---|---|---|---|
| 2,000 | ~3,000 | $2 | $6 | $12 |
| 5,000 | ~7,500 | $6 | $15 | $30 |
| 20,000 | ~30,000 | $23 | $60 | $120 |

At a few thousand plays the weekly prize is single-digit dollars; the whole site earns under $100/week until roughly 20,000 plays per game. AdSense pays out at C$100 (https://support.google.com/adsense/answer/1709871), so first cash arrives a month or two after launch. A visible pot on day one has to be seeded by hand.

## Products and policies

AdSense base account: 18+, own the site, original content, no traffic minimum (https://support.google.com/adsense/answer/9724). Classic display cannot be tied to gameplay in any way (https://services.google.com/fh/files/helpcenter/h5_games_policy_best_practices_infographic.pdf).

H5 Games Ads / Ad Placement API: application only, needs approved AdSense, "approval is not guaranteed," still labelled beta (https://developers.google.com/ad-placement/docs/beta). Full-screen ads only at natural transition points; not after every interaction, not during continuous play, not back to back (https://support.google.com/publisherpolicies/answer/11975916). Placement types: preroll, start, pause, next, browse, reward; the documented reward example is a bonus life (https://developers.google.com/ad-placement/docs/placement-types).

Rewarded policy caveats: rewards must be opt-in, disclosed, skippable, and "direct monetary items may not be offered as rewards under any circumstance" (cash, crypto, gift cards) (https://support.google.com/adsense/answer/9121589). An extra run passes. Do not word anything as "watch to win cash," and never let an ad view change score.

Applixir: $8 to $15 CPM web rewarded, $0.50 to $2 display; 5,000 DAU minimum, $100 payout, net-30 (https://www.applixir.com/faq/). Not usable at launch.
AdinPlay: contact-sales, no published terms (https://www.adinplay.com/publishers).
GameMonetize: 45% dev share, $1.50 to $3 per 1,000 views (https://gamemonetize.com/).
Poki / CrazyGames: 50% / ~60% share, €100 minimum, no exclusivity, human QA; CrazyGames caps midgame ads to one per 3 minutes and bans "out of lives" offers on every death (https://docs.crazygames.com/requirements/ads/). Catch: portal controls the ad tag, so no real-time per-game revenue for the pot, and a cash-prize game may not pass review.

## eCPM evidence (2025/2026)

- Web rewarded: $6 to $25+ global; Tier 1 $12 to $30; Tier 2 $6 to $15; Tier 3 $2 to $6 (https://www.applixir.com/blog/whats-the-highest-paying-ad-format-for-html5-games-right-now). Playgama: US $15 to $28 gross, EU $8 to $15 (https://app.cinevva.com/guides/web-game-monetization).
- Web interstitials: $2 to $6 global; assume top of range for US/CA/UK, $0.50 to $2 rest of world.
- Web display: $0.20 to $1.50.
- App benchmarks for comparison: rewarded Tier 1 $15 to $30; interstitial Tier 1 $5 to $8; banner Tier 1 $0.50 to $1.50 (https://blog.playio.co/mobile-game-ecpm-benchmarks-2026). Sources disagree by up to 4x; apps pay 2 to 4x more than mobile web.
- Fill: no published mobile-web benchmark; plan on 60 to 75% for a new property. iOS Safari tracking limits drag mobile-web eCPM down.

## Placement and frequency evidence

- Unity: delaying the first interstitial beat showing it immediately for retention and ARPU; test two weeks and back off if D1 drops (https://unity.com/blog/best-practices-for-maximizing-revenue-from-interstitial-ads-in-your-app).
- ironSource: ads at end of timed segments, skip at 5 to 7 s, pacing by A/B test (https://is.com/community/academy/monetization/interstitial-and-banner-ads-best-practices).
- AdReact (May 2026): ceiling 4 to 6 interstitials per session, 2 to 3 minutes between; GameAnalytics 2026 median session 3.1 to 3.5 min, 3.8 to 3.9 sessions/day (https://blog.playio.co/mobile-game-ad-revenue-calculator).

Recommended: 0.5 to 0.7 ads per minute of play; 2 to 4 interstitials plus at most 1 rewarded per session; 12 interstitials and 3 rewarded per player per day; first interstitial no earlier than the second death; rewarded continue once per run, never on consecutive runs.

## Canada

- Income tax: self-employment income on a T2125, or the company's return if it contracts.
- GST/HST: advertising supplied to a non-resident non-registrant is zero-rated (Schedule VI Part V s.8); CRA's example is a Canadian site owner paid for banner ads (https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/b-090/gst-hst-electronic-commerce-2.html). Zero-rated sales still count toward the $30,000 small-supplier threshold (https://www.taxtips.ca/gst/small-supplier.htm).
- Cash prizes and ad approval: Google's gambling restriction covers games where value is paid or wagered to win money; a free-entry skill contest does not meet that wording, but cash-prize framing can draw manual review (https://support.google.com/publisherpolicies/answer/10437795). Keep entry free, keep ads never tied to the cash in copy or mechanics, publish rules, include a skill-testing question for Canadian winners.
