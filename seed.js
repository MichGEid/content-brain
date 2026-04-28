/* =====================================================================
   Content Brain — Seed data
   Hentet fra:
     - Noen av innleggene mine.docx       → published
     - Chat med Copilot om ev innlegg 1-3 → drafts (Michel valgte versjoner)
     - Articles to reflect on.docx        → ideas (lese-/inspirasjonskilder)
   Lastes kun ved første åpning. Etter det: ren localStorage.
   ===================================================================== */

const SEED_POSTS = [

  /* ============================ PUBLISHED ============================ */

  {
    id: "p_pub_001",
    status: "published",
    pillar: 1,
    title: "The quiet work of connective leadership",
    body:
`Some leadership roles are visible.
Others are connective, and often misunderstood.

Connective leadership happens in the spaces between domains: engineering and compliance, strategy and operations, internal capability and external signals. It's about connecting context early, before there's a formal request. Surfacing signals before they become problems.

And that's what makes it a vulnerable role.

A neutral external perspective can be read as evaluation. Early sharing can feel like escalation. Not because anyone is wrong, but because strong ownership is, by nature, protective.

One lesson I've learned: connective leaders are rarely judged on what they say, but on what others believe it signals.

The answer isn't more explanation. It's clarity and restraint.

Healthy organizations need connective leadership. Without it, silos optimize locally and fail systemically. But it requires precision in language, respect for ownership, and knowing exactly when to let go.

If you recognize yourself in this role, you're not overthinking. You're operating where leadership is felt more than seen.`,
    publishedAt: "2026-04-10",
    capturedAt: "2026-04-05T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: ""
  },

  {
    id: "p_pub_002",
    status: "published",
    pillar: 4,
    title: "Volunteering with Sammen om en jobb",
    body:
`Volunteering is a strong part of Norwegian culture, and I feel genuinely privileged to join Sammen om en jobb as a volunteer mentor.

Meeting talented people with diverse backgrounds, new perspectives and strong motivation is inspiring — and the learning definitely goes both ways.

It was also great to meet my dear colleague Hilde Tertnæs at the kickoff in Stavanger.`,
    publishedAt: "2026-03-20",
    capturedAt: "2026-03-15T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: ""
  },

  {
    id: "p_pub_003",
    status: "published",
    pillar: 1,
    title: "We're growing — and we're doing it together",
    body:
`At Laerdal Medical, we don't hire people to "fill roles". We invite people to join a mission — a mission where your work genuinely matters and helps save lives.

Right now, we're opening 10 new positions across our organization. And what we're really looking for isn't just strong CVs — it's curious minds, kind collaborators, and people who want to grow together with others — and who care deeply about their craft and their colleagues.

You'll work with talented and fun people.
You'll be trusted with real responsibility.
You'll be encouraged to be yourself — and do your best work.

If you're looking for a place where purpose meets professionalism, where people really matter — we'd love to hear from you.`,
    publishedAt: "2026-03-05",
    capturedAt: "2026-03-01T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: "Laerdal recruiting drive — 10 roles."
  },

  {
    id: "p_pub_004",
    status: "published",
    pillar: 2,
    title: "Jeg gruer meg",
    body:
`"Jeg gruer meg," she said to me before the tournament.
I tried to cheer her up — not sure how much it helped.

She knew she was going to play with boys and girls she had never met before. Many older than her. Many at a higher level.

16 teams. 7 kids per team. 2 hours of matches. 3 games each.
A lot to take in when you are five.

But once on the ice, something changed. She was smiling. Finding her place. Playing with others, not next to them.

And she wasn't the only one. Kids who had never met before had to adapt quickly, read each other, support one another, and pull it together as a team. No time to overthink. No time to compare. Just play.

At the end, every child received a medal. Not for being the best — but for showing up, contributing, and being part of something together.

When I asked her afterwards how it went, and how she managed to get through it, her answer was simple:

"Jeg fokuserte. Og så hadde jeg det gøy."

Focus over fear. Joy over pressure. Team over self.

There is a lesson in that — one many of us spend years trying to relearn.`,
    publishedAt: "2026-02-22",
    capturedAt: "2026-02-20T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: ""
  },

  {
    id: "p_pub_005",
    status: "published",
    pillar: 1,
    title: "Engineering Manager — lead with empathy",
    body:
`Imagine waking up each day knowing your work helps save lives. At Laerdal Medical, this isn't just a vision — it's our reality.

We're looking for an Engineering Manager who believes that technology, paired with purpose and heart, can change the world. If you're driven by curiosity, compassion, and a desire to lift others up, this could be your next chapter.

Join a global team where your leadership empowers talented people, your ideas shape the future of healthcare, and your impact reaches far beyond the office walls.

If you're ready to lead with empathy, inspire with vision, and help us reach our bold goal — saving one million more lives every year by 2030 — we'd love to meet you.`,
    publishedAt: "2026-02-08",
    capturedAt: "2026-02-05T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: "EM job ad share."
  },

  {
    id: "p_pub_006",
    status: "published",
    pillar: 1,
    title: "The hardest part of leadership: saying goodbye",
    body:
`One of the hardest parts of leadership is saying goodbye to great people.

Recently, a valued colleague decided to move on, and it reminded me of something important: behind every resignation is a story — sometimes it's about growth, sometimes about life circumstances, and sometimes about things beyond our control.

When someone leaves, it's easy to focus on the gap they create. But the truth is, their impact doesn't disappear. It lives on in the culture they shaped, the knowledge they shared, and the relationships they built.

Losing talent reminds us of two things:
• People are more than their roles — they have lives, families, and priorities that matter.
• Our job as leaders is to make their time with us meaningful, so when they move on, they leave stronger than when they arrived.

Let's never take for granted the privilege of working with incredible people. Every day counts.`,
    publishedAt: "2026-01-28",
    capturedAt: "2026-01-25T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: ""
  },

  {
    id: "p_pub_007",
    status: "published",
    pillar: 2,
    title: "Saturday morning. Hockey bag. Big dreams.",
    body:
`Saturday morning. Hockey bag, tiny skates, and big dreams.

This morning I helped my mini-me get ready for training — and while we were in the dressing room, I was struck by how powerful it is to see girls owning their space on the ice with confidence and joy.

Ice hockey isn't just for boys. It's for anyone who wants to challenge themselves, learn teamwork, and feel the thrill of progress. And it starts early — with support, cheers, and a place in the locker room.

Girl power on ice. Together we are strong.`,
    publishedAt: "2026-01-18",
    capturedAt: "2026-01-15T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: ""
  },

  {
    id: "p_pub_008",
    status: "published",
    pillar: 1,
    title: "Positions are temporary — how you treat people is remembered",
    body:
`A powerful reminder for all of us in leadership:

"Positions are temporary. Ranks and titles are limited. But the way you treat people will always be remembered."

Whether you're leading a team, mentoring others, or simply navigating your professional journey — this quote speaks volumes. It's easy to get caught up in titles and achievements, but the real legacy we leave is in how we treat those around us.

I'm not sure who originally said this, so I'll refrain from attributing it — but its message is timeless.

Let's lead with empathy, not ego.`,
    publishedAt: "2026-01-04",
    capturedAt: "2026-01-02T09:00:00.000Z",
    linkedinUrl: "",
    source: "",
    notes: ""
  },

  /* ============================ DRAFTS / READY ============================ */

  {
    id: "p_drf_001",
    status: "ready",
    pillar: 1,
    title: "Trust Creates Competence (Not the Other Way Around)",
    body:
`There's a hard truth many organizations miss:
Competence doesn't grow in isolation.
It grows in the slipstream of trust.

When people are trusted slightly more than they're ready for, they rise.
They learn faster.
They take ownership.
They close the gap.

When trust is withheld until competence is "proven," the opposite happens:
Progress slows. Initiative drops. Capability stagnates.
Distrust creates drag — even for highly capable people.

If performance feels capped, the question isn't always:
"Are we competent enough?"
It's often:
"Are we trusted enough to become competent?"

Great leadership understands this balance.
Not blind trust. Not rigid control.
But trust that pulls people forward — and lets competence catch up.`,
    capturedAt: "2026-04-22T10:00:00.000Z",
    publishedAt: null,
    linkedinUrl: "",
    source: "https://mdalmijn.com/p/the-slipstream-model-of-competence",
    notes: "Anchored in Maarten Dalmijn's 'Slipstream Model'. Klar — kjør neste pilar-1-uke."
  },

  {
    id: "p_drf_002",
    status: "draft",
    pillar: 1,
    title: "The cost of ignoring early insight",
    body:
`There's a pattern I've seen in many organizations, and it deserves more attention than it gets:

A well-reasoned, thoroughly developed case is presented early. It has the right people involved, the right expertise, and a clear path forward. But because it isn't presented by the "right" title, nothing happens.

Months pass. Years pass. The need becomes clearer.
The same idea returns — repackaged, re-endorsed, and suddenly embraced.

And here's the irony: what was once considered "too big," "too complex," or "too slow to execute" becomes viable the moment someone with a different title says it.

I've experienced this firsthand. Work was done. Analysis was solid. Cross-functional input was gathered. The opportunity was real.
Had we started then, we'd be finished now.

This phenomenon isn't about people — it's about mindsets.
It's about how organizations filter ideas: through authority, not insight.
And the cost is measurable: lost time, stalled momentum, and missed advantage.

High-performing organizations treat early insight as strategic signal — regardless of who delivers it. Because competence is distributed, not hierarchical. And the people who see the future earliest are often not the ones with the loudest platform.

If we want to move faster, we have to value ideas when they're first presented — not when they're re-presented by someone "senior" enough to make them acceptable.

The future doesn't wait for hierarchy. And neither should we.`,
    capturedAt: "2026-04-22T10:30:00.000Z",
    publishedAt: null,
    linkedinUrl: "",
    source: "Inspirert av 2021-saken (simulerte instrumenter, OKR foundational work)",
    notes: "Anonymisert allerede. Vurder kortere variant før publisering."
  },

  {
    id: "p_drf_003",
    status: "draft",
    pillar: 1,
    title: "Stop hiring molds. Start growing people.",
    body:
`If your org treats "Engineering Manager material" like a cookie cutter, you're not screening for excellence — you're screening out potential.

We don't grow leaders by categorizing people into molds ("an EM must look like this, talk like that"). We grow leaders by calibrating trust ahead of competence — on purpose.

The most effective teams I've seen do one thing consistently: they lend a little more trust than today's skill would strictly justify, and pair it with coaching and clear guardrails. That "slipstream" pulls people forward faster than any rubric ever could.

When we label people as "not management material," here's the second-order effect: they self-select out of stretch work, peers stop nominating them for hard problems, and we end up promoting the best performers of the mold, not the best builders of people.

Three substitutions to replace molds with momentum:
• Trust > competence (by a notch). Assign work one step above comfort, plus coaching.
• Service over status. "As a leader, my job is to make the next 3 promotions possible."
• Proof over posture. Show outcomes, not theatrics.

Titles should clarify service, not confer superiority. If your title is the strongest argument you bring into a room, you've already lost the room.`,
    capturedAt: "2026-04-23T08:00:00.000Z",
    publishedAt: null,
    linkedinUrl: "",
    source: "Slipstream model + second-order thinking",
    notes: "Mini-serie med 'Saving face' nedenfor."
  },

  {
    id: "p_drf_004",
    status: "draft",
    pillar: 1,
    title: "The cost of saving face — when change management breaks trust",
    body:
`Change doesn't fail because people hate change.
It fails because people hate being changed at.

Most "change fatigue" is trust fatigue. When leaders push waves of reorganizations without narrative, pacing, or learning loops, people stop believing that today's "why" will still be true next sprint. That's not resistance — that's experience.

Second-order thinking test:
• If we hide errors during a rollout to look competent — then what? People detect the gap, institutional trust drops, and future truth-telling becomes politically expensive.
• If leaders won't admit ignorance — then what? Teams invent their own stories, alignment fractures, and the best people disengage. Quietly at first. Permanently later.

Four operating practices that protect trust during change:
1. Minimum Viable Change. Slice changes into testable increments — hypotheses, success metrics, fast feedback.
2. Pre-briefs → back-briefs. Leaders pre-brief intent and constraints; teams back-brief what they understood and will do.
3. Error rituals. Make correction visible: "We were wrong about X because Y; we're changing Z by D."
4. The unknowns log. Normalize "I don't know — yet." Track open questions publicly, with owners.

Change that preserves trust admits mistakes, explains trade-offs, and uses second-order thinking to avoid damage you only notice after the applause.`,
    capturedAt: "2026-04-23T08:15:00.000Z",
    publishedAt: null,
    linkedinUrl: "",
    source: "Nokia acceleration trap (Mike Fisher) + Phil McKinney second-order thinking",
    notes: "Par med 'Stop hiring molds' som mini-serie."
  },

  {
    id: "p_drf_005",
    status: "draft",
    pillar: 4,
    title: "Second-order thinking is becoming a leadership superpower",
    body:
`Second-order thinking is becoming a superpower for leaders — especially in strategy.

Most decisions look good in the moment. They solve an immediate pain. They satisfy a request. They "get things moving."

But the real impact — positive or negative — unfolds in the second and third order effects:
• What will this decision enable?
• What will it constrain later?
• What new behaviours will it unintentionally create?
• What systemic ripple effects are we missing?

Reading about HP's turnaround and the contrast with Teligent was a powerful reminder:
Success rarely comes from the first answer. It comes from leaders who pause, zoom out, and design for consequences — not just conditions.

In a world where complexity is increasing, and where technologies like AI accelerate both opportunity and risk, second-order thinking isn't just an advantage. It's a responsibility.

As leaders, we need to cultivate this more deliberately — in how we build strategy, design products, structure teams, and make trade-offs.

Slow down the decision.
Speed up the insight.
Think beyond the obvious.

This is where real, meaningful, and sustainable progress starts.`,
    capturedAt: "2026-04-24T09:00:00.000Z",
    publishedAt: null,
    linkedinUrl: "",
    source: "https://philmckinney.substack.com/p/from-teligent-disaster-to-hp-success",
    notes: "Pilar 4 fordi det er strategi/krysspollinering. Kunne også vært pilar 1."
  },

  {
    id: "p_drf_006",
    status: "ready",
    pillar: 1,
    title: "A problem is the difference between things as perceived and desired",
    body:
`Quote I keep coming back to:

"A problem is the difference between things as perceived and desired."
— Gerald Weinberg

Most "problems" are really misaligned perceptions and desires.

Align reality.
Define outcomes.
Expose the system.

Then design changes that remove the gap, not just mute the symptoms.

#leadership #execution #systemsthinking`,
    capturedAt: "2026-04-24T10:00:00.000Z",
    publishedAt: null,
    linkedinUrl: "",
    source: "https://andreasfragner.com/writing/three-ways-to-solve-problems",
    notes: "Klar versjon, korrekt sitert (Weinberg, ikke Fragner)."
  },

  /* ============================ IDEAS — reading list ============================ */
  // Disse kommer fra "Articles to reflect on.docx".
  // Status: idea. Tittel = artikkel-tittel. Source = URL. Body = tom (fyll inn etter lesing).

  ...[
    ["Executive amplification", "https://mikefisher.substack.com/p/executive-amplification", 1],
    ["Strategic choices: When both options are good", "https://longform.asmartbear.com/strategic-choices/", 1],
    ["The Shift to Managing Managers", "https://kevingoldsmith.substack.com/p/the-shift-to-managing-managers", 1],
    ["How to Beat Decision Fatigue", "https://philmckinney.substack.com/p/how-to-beat-decision-fatigue", 1],
    ["The question behind the question", "https://newsletter.weskao.com/p/question-behind-the-question", 1],
    ["Friction Focused Management", "https://thesocraticleadership.substack.com/p/friction-focused-management", 1],
    ["The Complicators, The Drama Aggregators, and The Avoiders", "https://randsinrepose.com/archives/the-complicators-the-drama-aggregators-and-the-avoiders/", 1],
    ["Bias towards action", "https://addyosmani.com/blog/bias-towards-action/", 3],
    ["Shell Had Six Years to Prepare. I Had Four Months", "https://philmckinney.substack.com/p/shell-had-six-years-to-prepare-i", 4],
    ["Ideas Over Implementation", "https://boz.com/articles/ideas-implementation", 3],
    ["The Cobra Effect: When Good Incentives Go Bad", "https://read.perspectiveship.com/p/the-cobra-effect", 4],
    ["Welcome to the Room", "https://www.jsnover.com/blog/2026/02/01/welcome-to-the-room/", 1],
    ["Code Is Cheap Now. Software Isn't.", "https://www.chrisgregori.dev/opinion/code-is-cheap-now-software-isnt", 3],
    ["A Random Walk", "https://writing.nikunjk.com/p/a-random-walk", 3],
    ["Talking to Executives: That's Not a Derailment, That's the Meeting", "https://kevingoldsmith.substack.com/p/talking-to-executives-thats-not-a", 1],
    ["Nobody gets promoted for simplicity", "https://terriblesoftware.org/2026/03/03/nobody-gets-promoted-for-simplicity/", 1],
    ["Your manager is already investing in you", "https://newsletter.weskao.com/p/your-manager-is-already-investing", 1],
    ["The Rewrite That Was Really a Resignation Letter", "https://pragmatist.nl/the-rewrite-that-was-really-a-resignation-letter/", 1],
    ["How to earn credibility with engineers", "https://dev.jimgrey.net/2026/03/11/how-to-earn-credibility-with-engineers-lessons-from-a-college-radio-station/", 3],
    ["Exploit vs Explore", "https://mikefisher.substack.com/p/exploit-vs-explore", 1],
    ["The Reason Most People Are Terrible Communicators", "https://alifeengineered.substack.com/p/the-reason-most-people-are-terrible", 1],
    ["The strategy lifecycle and adoption (Post I)", "https://learnings.aleixmorgadas.dev/p/the-strategy-lifecycle-and-adoption", 4],
    ["Seeing Everything, Understanding Nothing (The Context Trap)", "https://cutlefish.substack.com/p/tbm-406-seeing-everything-understanding", 1],
    ["How Do You Know If You're a Good Leader?", "https://mikefisher.substack.com/p/how-do-you-know-if-youre-a-good-leader", 1],
    ["The invisible foundation of engineering transformation", "https://dev.jimgrey.net/2026/03/04/the-invisible-foundation-of-engineering-transformation/", 3],
    ["Work Expands. Time Vanishes. Here's Why.", "https://read.perspectiveship.com/p/planning-laws", 3],
    ["Twitching Before You Sprint", "https://mikefisher.substack.com/p/twitching-before-you-sprint", 1],
    ["When should a manager step in?", "https://www.dein.fr/posts/2026-03-17-when-a-manager-should-step-in", 1],
    ["Architecture Is Not a Blueprint. It's a Set of Decisions.", "https://scottmillett.medium.com/architecture-is-not-a-blueprint-its-a-set-of-decisions-61c4692f5222", 3],
    ["Why I Still Write Code as an Engineering Manager", "https://terriblesoftware.org/2026/01/22/why-i-still-write-code-as-an-engineering-manager/", 3],
    ["Things I've learned in my 10 years as an engineering manager", "https://www.jampa.dev/p/lessons-learned-after-10-years-as", 3],
    ["Autonomy Is Overrated: Why Alignment Beats Autonomy", "https://mdalmijn.com/p/autonomy-is-overrated-why-alignment", 1],
    ["The Alignment Tax: What a Real C-Level Relationship Looks Like", "https://insideproductorg.substack.com/p/the-alignment-tax-what-a-real-cto", 1],
    ["On the Socially Acceptable Use of AI in Business", "https://kellblog.com/2026/03/29/on-the-socially-acceptable-use-of-ai-in-business/", 4],
    ["Nobody Is Coming to Save Your Career", "https://alifeengineered.substack.com/p/nobody-is-coming-to-save-your-career", 1],
    ["Leading What You've Never Done Before", "https://kevingoldsmith.substack.com/p/leading-what-youve-never-done-before", 1],
    ["How I Bankrupted Two Companies", "https://philmckinney.substack.com/p/how-i-bankrupted-two-companies", 1],
    ["Finding Comfort in the Uncertainty", "https://annievella.com/posts/finding-comfort-in-the-uncertainty/", 1],
    ["What I Learned From Nearly 1,000 Interviews at Amazon", "https://alifeengineered.substack.com/p/what-i-learned-from-nearly-1000-interviews", 1],
    ["One bottleneck at a time", "https://www.theengineeringmanager.com/growth/one-bottleneck-at-a-time/", 3],
    ["Say the Thing You Want", "https://terriblesoftware.org/2026/04/01/say-the-thing-you-want/", 1],
    ["Relocating Rigor", "https://aicoding.leaflet.pub/3mbrvhyye4k2e", 3],
    ["The Alarm That Went Silent", "https://mikefisher.substack.com/p/the-alarm-that-went-silent", 1],
  ].map(([title, url, pillar], i) => ({
    id: `p_idea_${String(i + 1).padStart(3, "0")}`,
    status: "idea",
    pillar: pillar,
    title: title,
    body: "",
    capturedAt: "2026-04-25T12:00:00.000Z",
    publishedAt: null,
    linkedinUrl: "",
    source: url,
    notes: "Fra leselista. Les → koble til pilar → skriv hook."
  }))
];

window.SEED_POSTS = SEED_POSTS;
