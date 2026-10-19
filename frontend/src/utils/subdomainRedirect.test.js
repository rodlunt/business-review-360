import { describe, it, expect } from "vitest";
import { willHopToSubdomain } from "./subdomainRedirect";

describe("willHopToSubdomain (Issue #836)", () => {
  it("returns true on the bare apex domain", () => {
    expect(willHopToSubdomain("br360.example.com", "br360.example.com")).toBe(true);
  });

  it("returns false on a tenant subdomain", () => {
    expect(willHopToSubdomain("demo-corp.br360.example.com", "br360.example.com")).toBe(false);
  });

  it("returns false on localhost", () => {
    expect(willHopToSubdomain("localhost", "br360.example.com")).toBe(false);
  });

  it("returns false on a raw IP", () => {
    expect(willHopToSubdomain("127.0.0.1", "br360.example.com")).toBe(false);
  });

  it("returns false on an unrelated preview domain", () => {
    expect(willHopToSubdomain("preview.example.com", "br360.example.com")).toBe(false);
  });

  it("returns false when hostname is falsy (SSR / Node)", () => {
    expect(willHopToSubdomain("", "br360.example.com")).toBe(false);
    expect(willHopToSubdomain(undefined, "br360.example.com")).toBe(false);
    expect(willHopToSubdomain(null, "br360.example.com")).toBe(false);
  });

  it("honours a non-default baseDomain (env override path)", () => {
    expect(willHopToSubdomain("staging.example.org", "staging.example.org")).toBe(true);
    expect(willHopToSubdomain("www.staging.example.org", "staging.example.org")).toBe(true);
    expect(willHopToSubdomain("tenant.staging.example.org", "staging.example.org")).toBe(false);
  });
});
