# Primary accessibility sources checked

Read in this run on6October2026(local). These support the contrast/target/dialog criteria; actual application failures are independently measured in browser/source.

- [W3C WCAG2.2 SC1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html):4.5:1normal,3:1large; do not round borderline values into a pass; hover/focus/placeholder text also considered. Formula matches design_census.py and computed-color mockup QA.
- [W3C WCAG2.2 SC2.5.8 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):24×24CSSpx minimum with enumerated exceptions; do not label every5pxglyph a violation without checking hit area/spacing/equivalent controls.
- [W3C ARIA APG Modal Dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):keyboard and focus management contract. Source role declarations do not prove it is implemented; K-001 uses actual Tab/Escape/focus observations.

Sources are links and paraphrases, not copied articles. No screenshots, code, user data or credentials were uploaded.
