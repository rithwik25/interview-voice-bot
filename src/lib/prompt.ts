// Builds the full system instructions sent to the Realtime model:
// active base instructions + reconciled profile + STAR stories.
// Kept entirely server-side so the interviewer's browser never sees the prompt.

import profile from "@/data/profile.json";
import stars from "@/data/star-stories.json";
import personalQa from "@/data/personal-qa.json";
import { deepDives } from "@/data/deep-dives";
import type { PromptVersion } from "./types";

function renderProfile(): string {
  const p = profile;
  const exp = p.work_experience
    .map(
      (w) =>
        `- ${w.role} @ ${w.company} (${w.location}), ${w.duration}${
          "is_current" in w && w.is_current ? " [CURRENT]" : ""
        }:\n` + w.description.map((d) => `    • ${d}`).join("\n")
    )
    .join("\n");
  const intern = p.internships
    .map(
      (w) =>
        `- ${w.role} @ ${w.company} (${w.location}), ${w.duration}:\n` +
        w.description.map((d) => `    • ${d}`).join("\n")
    )
    .join("\n");
  const projects = p.projects
    .map((pr) => `- ${pr.name}${"date" in pr && pr.date ? ` (${pr.date})` : ""}: ${pr.description}`)
    .join("\n");

  return [
    `Name: ${p.full_name}`,
    `Education: ${p.education.degree}, ${p.education.institute} (CGPA ${p.education.cgpa}, ${p.education.graduation_year})`,
    `Total experience: ~${p.years_experience} year ${p.additional_months_experience} months`,
    `Location: ${p.location}`,
    `Work authorization: ${p.work_authorization} (requires sponsorship: ${p.requires_sponsorship})`,
    `Compensation: current ~${p.current_ctc_lpa} LPA, expected ~${p.expected_ctc_lpa} LPA`,
    `Logistics: notice — ${p.logistics.notice_period}; relocation — ${p.logistics.relocation}`,
    `Skills: ${p.skills.join(", ")}`,
    `Preferred domains: ${p.preferred_domains.join(", ")}`,
    ``,
    `WORK EXPERIENCE:\n${exp}`,
    ``,
    `INTERNSHIPS:\n${intern}`,
    ``,
    `PROJECTS:\n${projects}`,
    ``,
    `ACHIEVEMENTS:\n${p.achievements.map((a) => `- ${a}`).join("\n")}`,
    ``,
    `Links: portfolio ${p.portfolio_url} | github ${p.github_url} | linkedin ${p.linkedin_url}`,
  ].join("\n");
}

function renderStories(): string {
  return stars.stories
    .map(
      (s, i) =>
        `${i + 1}. ${s.title} [${s.tags.join(", ")}]\n` +
        `   S: ${s.situation}\n   T: ${s.task}\n   A: ${s.action}\n   R: ${s.result}`
    )
    .join("\n\n");
}

function renderDeepDives(): string {
  return deepDives
    .map(
      (d) =>
        `### ${d.title}  (${d.context})\n${d.content}`
    )
    .join("\n\n----------------------------------------\n\n");
}

function renderPersonalQa(): string {
  return personalQa.answers
    .map(
      (a) =>
        `Q: ${a.question}\nPreferred answer: ${a.answer}` +
        (a.notes ? `\n(Guidance: ${a.notes})` : "")
    )
    .join("\n\n");
}

function renderJobDescription(jd?: string): string {
  if (!jd || !jd.trim()) return "";
  return [
    "",
    "================ TARGET ROLE — JOB & COMPANY DESCRIPTION ================",
    "This is the role and company I'm interviewing for. Treat it as important context for EVERY answer, not only 'why this role':",
    "- Lead with the experience, projects, and skills most relevant to THIS role. When choosing which STAR story, project, or deep dive to highlight, pick the one that best matches this description.",
    "- Mirror the role's language, tech stack, and priorities, and explicitly connect my background to what they care about.",
    "- For 'why this role/company', fit, and motivation questions, ground the answer specifically in this description — the company's domain/product and what the role focuses on.",
    "- Weave alignment in naturally; don't force it or sound like I'm reciting the JD.",
    "- Still never claim skills or experience I don't actually have — bridge from my closest real experience instead.",
    "",
    jd.trim(),
  ].join("\n");
}

/**
 * Compose the complete instructions string for a given base prompt version.
 * Optionally tailor to a specific job description.
 */
export function buildInstructions(base: PromptVersion, jobDescription?: string): string {
  return [
    base.instructions,
    "",
    "================ CANDIDATE PROFILE (source of truth) ================",
    renderProfile(),
    "",
    "================ STAR STORIES (use for behavioral questions) ========",
    renderStories(),
    "",
    "================ PERSONAL / HR ANSWERS (use for fit & behavioral questions) ========",
    "These are my preferred answers to common HR/personal questions. Deliver them naturally and conversationally in first person — do NOT read them verbatim or sound scripted. Adapt to how the question is actually asked.",
    "",
    renderPersonalQa(),
    "",
    "================ TECHNICAL DEEP DIVES (use for deep technical questions) ========",
    "These are detailed, confirmed notes on each role/project for answering deep technical follow-ups.",
    "",
    renderDeepDives(),
    renderJobDescription(jobDescription),
  ].join("\n");
}
