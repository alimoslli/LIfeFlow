# LifeFlow Creative Studio

LifeFlow's own video production system: concepts in, finished videos out, made from code, the real app, open models on
rented GPUs and premium generation where it earns it. Isolated from the app (its own package; the app never imports it).

- How to run and extend it: [docs/STUDIO.md](docs/STUDIO.md)
- Why it's built this way, the research and the modes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Remote GPUs (Higgsfield GPU Harness) and the rules for paid work: [docs/GPU.md](docs/GPU.md)
- Measured speed, memory and cost: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

```bash
npm install && npm run sync-app        # once
npm run dashboard                       # http://localhost:4100
npm run render -- skyling-ad --preview  # a draft
```
