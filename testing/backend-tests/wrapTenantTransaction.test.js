/**
 * Issue #561 -- wrapTenantTransaction middleware unit tests.
 *
 * Mocks the sequelize import so the wrapper can be exercised without a real
 * Postgres. The integration test (testing/backend-tests-integration/
 * analyticsRls.test.js) covers the SET LOCAL semantics against a real DB.
 *
 * Cases (per spec section 9 unit-tests block):
 *   1. Skip when req.tenant is absent -- next() called immediately.
 *   2. Open transaction with SET LOCAL using req.tenant.id -- commit on 200.
 *   3. Roll back when handler responds with 500.
 *   4. Roll back when client closes the socket before res.finish.
 *   5. Late close after a clean finish is a no-op (still commits).
 */
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

let wrapTenantTransaction;
beforeAll(async () => {
  ({ wrapTenantTransaction } = await import(
    "../../backend/src/middleware/wrapTenantTransaction.js"
  ));
});

beforeEach(() => {
  transactionMock.mockReset();
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

const makeReqRes = (tenant) => {
  const handlers = {};
  const req = { tenant };
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    once: (event, fn) => {
      handlers[event] = fn;
    },
    _emit: (event) => handlers[event] && handlers[event](),
  };
  return { req, res };
};

const installManagedTransaction = () => {
  const commitMock = jest.fn();
  const rollbackMock = jest.fn();
  transactionMock.mockImplementation(async (callback) => {
    try {
      await callback({ LOCK: "fake-tx-token" });
      commitMock();
    } catch (err) {
      rollbackMock();
    }
  });
  return { commitMock, rollbackMock };
};

const flush = () => new Promise((r) => setImmediate(r));

describe("wrapTenantTransaction", () => {
  it("skips the wrapper when req.tenant is absent", () => {
    const { req, res } = makeReqRes(undefined);
    const next = jest.fn();

    wrapTenantTransaction(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("opens a transaction, fires SET LOCAL with req.tenant.id, attaches req.transaction, calls next, commits on 200 finish", async () => {
    const { commitMock, rollbackMock } = installManagedTransaction();
    const { req, res } = makeReqRes({ id: "tenant-abc" });
    const next = jest.fn();

    wrapTenantTransaction(req, res, next);
    await flush();

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(
      "SET LOCAL app.tenant_id = :tid",
      expect.objectContaining({
        replacements: { tid: "tenant-abc" },
      })
    );
    expect(req.transaction).toEqual({ LOCK: "fake-tx-token" });
    expect(next).toHaveBeenCalledTimes(1);

    res.statusCode = 200;
    res.writableEnded = true;
    res._emit("finish");
    await flush();

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(rollbackMock).not.toHaveBeenCalled();
  });

  it("rolls back when the handler responds with a 5xx", async () => {
    const { commitMock, rollbackMock } = installManagedTransaction();
    const { req, res } = makeReqRes({ id: "tenant-fail" });
    const next = jest.fn();

    wrapTenantTransaction(req, res, next);
    await flush();

    res.statusCode = 500;
    res.writableEnded = true;
    res._emit("finish");
    await flush();

    expect(rollbackMock).toHaveBeenCalledTimes(1);
    expect(commitMock).not.toHaveBeenCalled();
  });

  it("rolls back when the client disconnects before res.finish", async () => {
    const { commitMock, rollbackMock } = installManagedTransaction();
    const { req, res } = makeReqRes({ id: "tenant-disconnect" });
    const next = jest.fn();

    wrapTenantTransaction(req, res, next);
    await flush();

    res.writableEnded = false;
    res._emit("close");
    await flush();

    expect(rollbackMock).toHaveBeenCalledTimes(1);
    expect(commitMock).not.toHaveBeenCalled();
  });

  it("leaves a clean commit alone when close fires after finish", async () => {
    const { commitMock, rollbackMock } = installManagedTransaction();
    const { req, res } = makeReqRes({ id: "tenant-late-close" });
    const next = jest.fn();

    wrapTenantTransaction(req, res, next);
    await flush();

    res.statusCode = 200;
    res.writableEnded = true;
    res._emit("finish");
    res._emit("close");
    await flush();

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(rollbackMock).not.toHaveBeenCalled();
  });
});
