// Issue #561 Phase 1: spin up the Postgres testcontainer once per Jest run.
import { startPgContainer } from "./postgres-rls-fixture.js";

export default async function globalSetup() {
  await startPgContainer();
}
