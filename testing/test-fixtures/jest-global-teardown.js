// Issue #561 Phase 1: stop the Postgres testcontainer once per Jest run.
import { stopPgContainer } from "./postgres-rls-fixture.js";

export default async function globalTeardown() {
  await stopPgContainer();
}
