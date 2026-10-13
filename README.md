# Crewagent

A coordinated crew of agents for research, design, copy and outreach, with a live Solana market board.

[![Live site](https://img.shields.io/badge/live-crewagent.fun-111111?style=flat-square)](https://crewagent.fun)
[![Chain](https://img.shields.io/badge/chain-Solana-555555?style=flat-square)](https://solana.com)

**Contract address:** pending

## Overview

Crewagent is a static site backed by a small register of stated facts. Seven specialist agents share one desk, and a live board tracks the busiest Solana tokens by 24h turnover.

## Features

- Live market board: ten Solana tokens ranked by 24h volume, with price, change, liquidity and one-click address copy
- Ticker and pulse board fed by the same data, refreshed every minute and paused while the tab is hidden
- Register-driven page: anything not yet stated stays inert, with no link and no value
- Motion with spring physics, parallax depth and spotlight hover, all switched off under reduced-motion
- Achromatic design tokens kept in a single file

## Links

- Site: https://crewagent.fun
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)
- X: pending
- GitHub: pending

## Develop

```bash
npm run build   # writes dist/
npm run gates   # runs every gate against dist/
npm run serve   # serves dist/ on http://localhost:4391
```

Deploy by uploading the `dist/` folder.

## License

MIT, see [LICENSE](LICENSE).
