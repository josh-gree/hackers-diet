# The Hacker's Diet — PWA

An installable, offline-first weight tracker implementing the trend-and-feedback method from
[*The Hacker's Diet*](https://www.fourmilab.ch/hackdiet/) by John Walker.

Weigh in every morning. Your daily weight is noisy (water, salt, digestion), so the app shows a
**trend** — a 10% exponentially-smoothed moving average — that reveals what your body is actually doing:

```
trendₙ = trendₙ₋₁ + 0.1 × (weightₙ − trendₙ₋₁)
```

From the slope of that trend it derives your weekly rate of change and your average daily calorie
surplus/deficit (3500 kcal ≈ 1 lb of fat), plus a forecast date for an optional goal weight.

## Features
- Daily weigh-in log (kg or lb), editable, stored locally on your device
- Canvas trend chart with 30d / 90d / 1y / all ranges, goal line
- Stats: current trend, weekly rate, daily calorie balance, time-to-goal forecast
- Export / import your data as JSON
- Works fully offline; installable to your phone's home screen (PWA)

## Tech
Pure vanilla HTML/CSS/JS — no build step, no dependencies. Hosted on GitHub Pages.

*Unofficial personal project based on the freely-published book. Not medical advice.*
