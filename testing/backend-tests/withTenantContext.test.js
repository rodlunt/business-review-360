/**
 * Issue #744: withTenantContext unit tests.
 *
 * Mocks the sequelize module so the helper can be exercised without a real
 * Postgres. The integration test
 * (testing/backend-tests-integration/emailQueueWorkerRls.test.js)
 * proves the SET LOCAL ROLE + SET LOCAL app.tenant_id semantics against a
 * real container.
 *
 * APP_DB_ROLE is read once at module load via `process.env.APP_DB_ROLE`,
 * so we set it BEFORE importing the helper. The "no APP_DB_ROLE" branch
 * is covered by wrapTenantTransaction.test.js, which uses the same gating
 * pattern; replicating it here would require module-cache gymnastics.
 */
process.env.APP_DB_ROLE = "br360_app_user";

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  jest,
} from "@jest/globals";

const transactionMock = jest.fn();
const queryMock = jest.fn();

jest.unstable_mockModule("../../backend/src/models/database.js", () => ({
  sequelize: {
    transaction: transactionMock,
    query: queryMock,
  },
}));

let withTenantContext;
beforeAll(async () => {
  ({ withTenantContext } = await import(
    "../../backend/src/utils/withTenantContext.js"
  ));
});

beforeEach(() => {
  transactionMock.mockReset();
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

const installManagedTransaction = () => {
  const commitMock = jest.fn();
  const rollbackMock = jest.fn();
  let txnError;
  transactionMock.mockImplementation(async (callback) => {
    try {
      const result = await callback({ LOCK: "fake-tx-token" });
      commitMock();
      return result;
    } catch (err) {
      rollbackMock();
      txnError = err;
      throw err;
    }
  });
  return { commitMock, rollbackMock, getTxnError: () => txnError };
};

describe("withTenantContext", () => {
  it("throws synchronously when tenantId is missing", async () => {
    await expect(withTenantContext(null, async () => "noop")).rejects.toThrow(
      /tenantId is required/i
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("throws when tenantId is the empty string (falsy)", async () => {
    await expect(withTenantContext("", async () => "noop")).rejects.toThrow(
      /tenantId is required/i
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("opens a transaction, switches role, sets app.tenant_id, runs the callback, returns its result", async () => {
    const { commitMock, rollbackMock } = installManagedTransaction();

    const result = await withTenantContext("tenant-uuid-1", async () => 42);

    expect(result).toBe(42);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(rollbackMock).not.toHaveBeenCalled();

    // Two queries inside the transaction: SET LOCAL ROLE first, then SET
    // LOCAL app.tenant_id. Order matters because the role change must apply
    // before the app.tenant_id assignment runs against it.
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toBe(`SET LOCAL ROLE "br360_app_user"`);
    expect(queryMock.mock.calls[1][0]).toBe(`SET LOCAL app.tenant_id = :tid`);
    expect(queryMock.mock.calls[1][1]).toMatchObject({
      replacements: { tid: "tenant-uuid-1" },
    });
  });

  it("rolls back when the callback throws", async () => {
    const { commitMock, rollbackMock } = installManagedTransaction();

    await expect(
      withTenantContext("tenant-uuid-2", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(rollbackMock).toHaveBeenCalledTimes(1);
    expect(commitMock).not.toHaveBeenCalled();
  });
});
