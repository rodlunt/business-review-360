import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSubdomainOrgId, isOnSubdomain, orgPath, getSubdomainURL } from "../../utils/orgPath";

function mockHostname(hostname) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, hostname },
    writable: true,
    configurable: true,
  });
}

describe("getSubdomainOrgId", () => {
  afterEach(() => {
    mockHostname("localhost");
  });

  it("returns null on localhost", () => {
    mockHostname("localhost");
    expect(getSubdomainOrgId()).toBeNull();
  });

  it("returns null on bare br360.example.com (main domain)", () => {
    mockHostname("br360.example.com");
    expect(getSubdomainOrgId()).toBeNull();
  });

  it("returns tenant slug for demo-corp.br360.example.com", () => {
    mockHostname("demo-corp.br360.example.com");
    expect(getSubdomainOrgId()).toBe("demo-corp");
  });

  it("returns null for multi-segment subdomain", () => {
    mockHostname("foo.bar.br360.example.com");
    expect(getSubdomainOrgId()).toBeNull();
  });

  it("returns null for IP address", () => {
    mockHostname("192.168.1.1");
    expect(getSubdomainOrgId()).toBeNull();
  });
});

describe("orgPath", () => {
  afterEach(() => {
    mockHostname("localhost");
  });

  it("uses /org/:id prefix on main domain", () => {
    mockHostname("br360.example.com");
    expect(orgPath("demo-corp", "login")).toBe("/org/demo-corp/login");
    expect(orgPath("demo-corp", "")).toBe("/org/demo-corp");
    expect(orgPath("demo-corp")).toBe("/org/demo-corp");
  });

  it("uses bare path on tenant subdomain", () => {
    mockHostname("demo-corp.br360.example.com");
    expect(orgPath("demo-corp", "login")).toBe("/login");
    expect(orgPath("demo-corp", "")).toBe("/");
  });
});

describe("getSubdomainURL", () => {
  function mockLocation(hostname, protocol = "http:") {
    Object.defineProperty(window, "location", {
      value: { ...window.location, hostname, protocol },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    mockLocation("localhost", "http:");
  });

  it("builds a full subdomain URL with a page path", () => {
    mockLocation("localhost", "http:");
    expect(getSubdomainURL("demo-corp", "login")).toBe("http://demo-corp.br360.example.com/login");
  });

  it("uses the root path when page is omitted", () => {
    mockLocation("localhost", "http:");
    expect(getSubdomainURL("demo-corp")).toBe("http://demo-corp.br360.example.com/");
  });

  it("uses https: when served over HTTPS", () => {
    mockLocation("br360.example.com", "https:");
    expect(getSubdomainURL("acme", "home")).toBe("https://acme.br360.example.com/home");
  });

  it("includes the correct org slug in the subdomain", () => {
    mockLocation("localhost", "http:");
    const url = getSubdomainURL("test-org-2", "home");
    expect(url).toContain("test-org-2.br360.example.com");
  });

  it("preserves query strings passed as part of the page argument", () => {
    mockLocation("localhost", "http:");
    const url = getSubdomainURL("demo-corp", "reset-password?token=abc123");
    expect(url).toBe("http://demo-corp.br360.example.com/reset-password?token=abc123");
  });
});
