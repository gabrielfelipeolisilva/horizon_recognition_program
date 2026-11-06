# How this project was built with AI

This repository is part of a portfolio about **using AI to build software**. This document records the process: the specification, how the work was planned and checked, what the review found, and the decisions made along the way.

The whole project was built with Claude (Anthropic) working as an agent. It wrote the code, ran the tests and checked the pages in a headless browser. A person set the goals, answered the questions and approved each plan.

---

## 1. Starting point: a detailed specification

The work started from a structured prompt (in Portuguese) with these sections:

| Section | What it defined |
|---|---|
| `<role>` | Senior front-end engineer; graded on functional and visual fidelity |
| `<objective>` | Employee awards platform with 3 linked panels, browser-only, `localStorage` |
| `<hard_constraints>` | No real brands or people; vanilla HTML/CSS/JS; only SheetJS and ExcelJS from a CDN; EN/PT-BR i18n; complete files with no placeholders |
| `<deliverables>` | The exact file tree |
| `<data_model>` | The `NOMINATION` and `WORKER` objects and the mock users |
| `<business_rules>` | Categories, scoring, 60-point eligibility, prizes by position, consolidated score, status workflow |
| `<functional_spec>` | Every screen and interaction of the 4 pages |
| `<design_spec>` | Design tokens (light/dark), typography, scales, required components |
| `<tests_spec>` | Jest unit tests for scoring, prizes and validation |
| `<quality_checklist>` | 8 end-to-end flows to simulate, with *"fix the code, not the rule"* |

A precise spec like this works well with AI. Every rule can be traced to code and to a test.

## 2. How the work was done

1. **Plan before code.** The agent set up a task list (core rules → design system → panels → tests → verification) and built in stages instead of in one pass.
2. **One source of truth for the rules.** All business rules live in a pure module (`src/core.js`). It runs in the browser and in Node, so the Jest tests check the exact code the interface uses.
3. **Automated checks at every stage:**
   - unit tests with Jest (now 120);
   - a script that checks every i18n key used in the code exists in both languages;
   - an end-to-end script in headless Chrome (Playwright) that runs the QA flows (now 95 checks), parses the exported `.xlsx` files and takes screenshots;
   - a visual review of those screenshots in light/dark mode and on mobile.
4. **Changes go through a plan first.** For the login feature (v1.1), the request was *"present the plan and wait for my approval; ask if anything is unclear"*. The agent:
   - presented the plan (files, flow, risks);
   - asked 4 multiple-choice questions where the request had more than one reasonable answer (one password or one per profile; fixed user list or managed in the panel; session length; whether the admin can see the board);
   - showed the final plan with the chosen answers and proposed passwords;
   - implemented only after a "yes".

5. **The same loop for v1.2 (self-nomination).** The request changed a rule from the original spec (self-nomination was forbidden). The agent first checked the user's folder for edits made since the last delivery: the READMEs and screenshots had changed, so those versions became the base. It then presented the plan and asked 4 questions (group or individual only; what to do with the "relationship" field; whether the Board and Admin should see it; locked or editable copy). It implemented only after approval.

## 3. What the review found

The specification was followed, but the checks surfaced points that needed a decision. These are often the most interesting part of working with AI.

| Finding | What was done |
|---|---|
| **A 55-point nomination cannot happen.** With S/A/B = 10/7/4 over 5 criteria, the criteria sum is always `20 + 3k`, so totals like 55 cannot be reached from the form. | The rule (< 60 is not eligible) stayed as written. A test proves which totals are reachable, and QA flow 3 uses 56 (the nearest reachable value below 60). |
| **The 1-star limits can never apply.** Tier B goes to positions 3–5 (at most 3 awards), but the limits are 10/5/5. | Implemented as a configurable cap that is enforced, tested with lower limits, and documented. |
| **The conflict-of-interest flow needs several evaluators,** but the spec defines only one board user. | Added two fictitious evaluators. In v1.1 these became real logins. |
| **A visual bug the code review missed:** the tier letter inside the star badge was white on white (`background: currentColor` resolved to the letter color). | Caught in the screenshot review and fixed. |
| **The password field had no styling** in v1.1: the CSS selector listed `text`, `email` and `search`, but not `password`. | Caught in the screenshot review and fixed. |
| **A test failed for the wrong reason (v1.2):** the self-nomination check used an ID that an earlier step had removed by uploading a test directory. | The code was right. The test now restores the default directory first. |
| **"Session expired" redirect:** a test expected the wrong redirect target after login. | The behaviour was right (a board user is sent to their own panel). The test was fixed, not the code. |

## 4. Honest limits

- The login (v1.1) is **access control for a prototype, not security**. Everything runs in the browser. The demo passwords are public on purpose (fictitious data), and only their SHA-256 hashes are in the code.
- The CDN hosts could not be reached from the build environment, so the end-to-end tests served the libraries from npm. ExcelJS was the same version (4.4.0). SheetJS was version 0.18.5, which has the same API, in place of 0.20.1.
- The end-to-end script was used during development but is not part of this repository. Porting it to Playwright Test (JavaScript) in CI is on the roadmap.

## 5. Takeaways

- **Precise specs → traceable results.** Each rule maps to a function and to a test.
- **Ask for a plan and approve it** before larger changes, and answer the questions the AI raises.
- **Make the AI check its own work with tools** (tests, browser, screenshots), not only by reading the code. Both visual bugs were invisible in the code and obvious in the screenshots.
- **Review findings go to a human decision** ("fix the code, not the rule"), and they are written down.
