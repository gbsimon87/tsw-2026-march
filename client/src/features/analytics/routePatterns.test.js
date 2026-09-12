import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { getRoutePattern } from './routePatterns';

describe('analytics route manifest', () => {
  test('recognises every concrete route declared by AppRouter', () => {
    const routerSource = fs.readFileSync(path.resolve('src/app/router/AppRouter.jsx'), 'utf8');
    const declaredPaths = [...routerSource.matchAll(/path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== '*');

    expect(declaredPaths.length).toBeGreaterThan(0);
    for (const path of declaredPaths) {
      const examplePath = path.replace(/:[^/]+/g, 'safe-id');
      expect(getRoutePattern(examplePath), path).not.toBe('unknown');
    }
  });

  test('never returns an unknown raw path', () => {
    expect(getRoutePattern('/reset-password/private-token')).toBe('unknown');
  });
});
