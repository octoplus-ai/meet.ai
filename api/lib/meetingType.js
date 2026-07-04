// Shared meeting-type awareness for the AI doc + deck generators. The model FIRST classifies the
// meeting into exactly one type, then tailors the ENTIRE deliverable to that type. It happens inside
// the same generation call, so there is no extra latency or cost. Keeping the guidance in one place
// means the document and the slide deck classify the same way and stay consistent with each other.

// Stable, language-neutral keys. The UI can map these to a localized badge; the model also returns a
// short label already in the meeting's language (meetingTypeLabel) so we never show an English word
// on a Spanish deck.
export const MEETING_TYPES = ["sales", "informative", "training", "decision", "other"];

// The classification instruction shared by both generators.
export const CLASSIFY_INTRO = `FIRST, silently classify this meeting into EXACTLY ONE type, based on what was actually discussed and the meeting's real goal:
- "sales": a client or prospect conversation - discovery, demo, pitch, negotiation, renewal. The goal is to advance a deal.
- "informative": an update or briefing - status report, all-hands, standup, report-out. The goal is to inform.
- "training": teaching, onboarding, enablement or a workshop. The goal is for someone to LEARN something.
- "decision": planning, prioritization or strategy. The goal is to DECIDE a direction or make choices.
- "other": anything where none of the above clearly dominates (1:1, brainstorm, retro, interview).
Weigh the whole transcript, not just a few words. Then build the ENTIRE deliverable specifically for that type using the matching focus below. Do NOT print the type name as a heading; just let it shape what you include and emphasize.`;

// Per-type guidance for the DOCUMENT (section-oriented, reusable working doc).
export const DOC_GUIDANCE = `TYPE-SPECIFIC FOCUS - apply ONLY the one that matches your classification:
- sales: center the whole doc on the client. Surface their context and pain points, the needs uncovered, objections raised and how they were handled (and stronger rebuttals for next time), the value props that landed, budget / pricing / commercial terms discussed, competitors named, the decision criteria and who the stakeholders are, buying signals and sentiment, and a concrete plan to advance the deal.
- informative: center the doc on the updates. Distill the announcements and status by workstream, the metrics and numbers shared, what changed since last time, decisions that were communicated, owners, FYIs and open questions. Someone who missed the meeting should be fully caught up by reading it.
- training: build it as a REUSABLE LEARNING RESOURCE, not a recap. Explain each concept taught clearly, lay out any step-by-step process, include the worked examples and demos, do's and don'ts, a cheat-sheet of the most important points, the learners' questions with their answers, resources referenced, and a short self-check. Someone should be able to learn this topic from the document alone and train the next person with it.
- decision: build it as a durable DECISION RECORD. State each decision and its rationale, the options that were considered with their tradeoffs, the strategic direction or bets, risks and mitigations, what was explicitly rejected and why, owners and timelines, the success metrics, and any decisions still left open.
- other: choose the structure that best fits what actually happened.`;

// Per-type guidance for the DECK (slide-oriented).
export const DECK_GUIDANCE = `TYPE-SPECIFIC FOCUS - apply ONLY the one that matches your classification:
- sales: shape it as a deal recap / review. Lead with the opportunity and the client's needs, map those needs to the solution, show the objection handling, the commercial terms, the buying signals, and a clear next-steps / close-plan closing slide.
- informative: shape it as a crisp status / update deck. Highlights, the key metrics on bigStat slides, a progress timeline, decisions communicated, and a clear "what's next".
- training: shape it as a teaching deck. Open with the learning objectives, then one concept per slide in a logical teaching order, worked examples, a recap/summary slide, and a short knowledge-check on the closing slide.
- decision: shape it as a strategy / decision briefing. Put the decision(s) up front, weigh the options (twoColumn), give the rationale, show a roadmap/timeline, the risks, and the owners.
- other: choose the flow that best fits what actually happened.`;
