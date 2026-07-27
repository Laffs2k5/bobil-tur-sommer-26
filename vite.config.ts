import { defineConfig } from 'vitest/config';

// base './' makes the build relocatable, so it works both at the GitHub Pages
// project subpath (https://<user>.github.io/<repo>/) and any local preview.
export default defineConfig({
  base: './',
  build: {
    sourcemap: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // The data layer and pure view-model/formatting helpers carry all the
      // logic and are unit-tested here. DOM/Leaflet glue (src/ui, main.ts) is
      // deliberately thin and is exercised by the Playwright E2E suite.
      include: ['src/data/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['src/data/types.ts'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
        'src/data/**/*.ts': {
          statements: 98,
          branches: 95,
          functions: 100,
          lines: 98,
        },
      },
    },
  },
});
