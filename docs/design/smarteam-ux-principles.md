# Smarteam UX Constitution

This document establishes the foundational design system, information architecture, interaction models, and aesthetic principles for Smarteam EMS.

---

## The 20 Principles of Smarteam UX

1. **Backend Defines Capability**
   Every interface element, table, filter, and card must map directly to an actual entity, relation, or attribute in the Smarteam backend. Never invent fake CRUD or unbacked features.

2. **Permission Defines Access**
   Access control is driven by granular backend permission keys (`teams.write`, `leave.approve`, `organizations.read`, etc.), not hard-coded role string checks. The UI dynamically adapts to the user's authorized scope.

3. **Zoho is Inspiration, Not Specification**
   Use enterprise baselines for information hierarchy, but build an elevated, Google/Stripe-level product design language with custom typography, deliberate layouts, and clean ergonomics.

4. **Never Invent Business Concepts**
   Do not introduce extraneous modules (travel booking, performance OKRs, letter builders) unless supported by the Smarteam platform schema.

5. **Prefer Progressive Disclosure**
   Avoid exposing 30 controls at once. Surface the single most critical primary action prominently, and place secondary actions in contextual overflow menus (`•••`).

6. **One Primary Action per Context**
   Every screen and drawer must feature at most one dominant primary action (e.g. `+ New Team`, `Check In`, `Submit Request`). Secondary actions must use subtle, muted styling.

7. **Use Color Sparingly**
   Reserve color for states that require human attention (critical errors, active timers, unread alerts). Use crisp typography, subtle borders, and micro-indicators for standard states.

8. **Motion Communicates State, Not Decoration**
   Animation exists solely to convey spatial relationships (drawers sliding), hierarchy (accordion expand/collapse), or state transitions (punch in timer starting). Avoid gratuitous floating or bouncing effects.

9. **Dense Tables for Relational Data**
   Tabular data (employee directories, attendance records, audit logs) must have high information density, high readability, and clean tabular alignment.

10. **Structured Cards for Summaries & Overviews**
    Use card structures only for dashboards, aggregate metrics, and high-level summaries. Never turn dense operational tables into a wall of generic cards.

11. **Drawers for Contextual Inspection**
    Use right-side slide-over drawers for rapid entity inspection (employee profiles, project details). Users should never lose their place in a list just to inspect a record.

12. **Mobile is a First-Class Responsive Layout**
    Every workflow must degrade gracefully to mobile screens with dedicated bottom bars, drawer navigation, and touch-friendly targets without horizontal canvas overflow.

13. **Never Page-Level Horizontal Scroll**
    Horizontal scrolling is restricted to contained data tables and tag strips. The primary application canvas must strictly scroll vertically.

14. **Navigation is Permission & Context-Aware**
    Navigation items, top bar spaces, and command palette search results reflect the user's actual scope (personal workspace, assigned squad, managed branch, tenant admin).

15. **Relationships are Explicit First-Class Visuals**
    Visually articulate multi-dimensional relationships: **Employee $\leftrightarrow$ Multiple Teams $\leftrightarrow$ Projects $\leftrightarrow$ Allocation Percentage Bars $\leftrightarrow$ Reporting Manager**.

16. **Empty States Explain What Happens Next**
    Empty states must never just state "No data found". They must explain why the section is empty, what will appear there, and provide an authorized action trigger if permitted.

17. **Forms Provide Immediate Useful Feedback**
    Inputs validate on blur/change, highlight errors with contextual explanations, and provide immediate confirmation toasts on successful execution.

18. **Accessibility is Built-In**
    Use semantic HTML, aria-labels on icon buttons, keyboard shortcuts (`⌘K`, `Esc`), high-contrast color ratios, and visible focus rings.

19. **Components Remain Small, Focused, and Composable**
    Decompose complex screens into small, reusable sub-components with single responsibilities.

20. **Consistency Across Every Module**
    Ensure shared visual rhythm, border radii (`rounded-[6px]`), font scales, spacing tokens, and modal patterns across all screens.
