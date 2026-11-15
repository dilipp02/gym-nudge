import type { User } from './db/repo';

declare global {
  interface Env {
    /** Test-only: "enabled" lets X-Test-Now pin the clock. Never set outside tests. */
    TEST_CLOCK?: string;
  }
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User };
};
