import { describe, expect, test } from "bun:test";
import { isTransientGitError, fetchRepo, parseSource, cleanupStaging } from "./fetch.ts";

// The retry gate for cloneWithRetry/lsRemoteWithRetry. Getting this wrong is
// costly in BOTH directions: a definitive failure classed transient burns 3
// attempts on a 404/auth that can never succeed; a real transient classed
// definitive fails a whole `skl update --repo` run on one network blip.
describe("isTransientGitError — retry gate", () => {
  test("the observed LibreSSL handshake blip is transient (retry)", () => {
    // The exact fault that failed all 35 skills in one dry-run this session.
    expect(
      isTransientGitError(
        "fatal: unable to access 'https://github.com/owner/repo.git/': LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to github.com:443",
      ),
    ).toBe(true);
  });

  test.each([
    "fatal: unable to access '...': Failed to connect to github.com port 443: Connection reset by peer",
    "fatal: unable to access '...': Could not resolve host: github.com",
    "error: RPC failed; curl 92 HTTP/2 stream 0 was not closed cleanly",
    "fatal: the remote end hung up unexpectedly\nfatal: early EOF",
    "fatal: unable to access '...': Operation timed out after 30001 milliseconds",
    "fatal: the remote end hung up unexpectedly",
    "fatal: protocol error: bad pack header",
    "error: unexpected disconnect while reading sideband packet",
    "kex_exchange_identification: Connection closed by remote host",
  ])("transient network fault → retry: %s", (stderr) => {
    expect(isTransientGitError(stderr)).toBe(true);
  });

  test.each([
    "fatal: repository 'https://github.com/owner/gone.git/' not found",
    "remote: Repository not found.",
    "fatal: Authentication failed for 'https://github.com/owner/private.git/'",
    "fatal: unable to access '...': The requested URL returned error: 404",
    "fatal: unable to access '...': The requested URL returned error: 403",
    "remote: Permission denied",
  ])("definitive failure → fail fast (no retry): %s", (stderr) => {
    expect(isTransientGitError(stderr)).toBe(false);
  });

  test("a 404 that also says 'unable to access' still fails fast (guard wins)", () => {
    // "unable to access" is a transient signal, but the 404 must veto it — else
    // a missing repo would be retried 3× for nothing.
    expect(
      isTransientGitError(
        "fatal: unable to access '...': The requested URL returned error: 404",
      ),
    ).toBe(false);
  });

  test("empty / unrecognized stderr is not treated as transient", () => {
    expect(isTransientGitError("")).toBe(false);
    expect(isTransientGitError("fatal: something totally novel")).toBe(false);
  });
});

// Integration guard for the retry loop's fail-fast path: a clone of a nonexistent
// local repo fails with a DEFINITIVE error ("does not appear to be a git repository"),
// so cloneWithRetry must NOT burn 3 attempts on it — it returns quickly with ok:false.
// (The happy path of cloneWithRetry/lsRemoteWithRetry is exercised by the update
// rename/orphan test and the outdated online-stale test over real local repos.)
describe("fetchRepo — non-transient clone failure fails fast", () => {
  test("a missing local git repo returns ok:false without retry churn", async () => {
    const started = performance.now();
    const res = await fetchRepo(parseSource("git:/no/such/skillshelf/repo/xyz"));
    const elapsedMs = performance.now() - started;

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("git clone failed");
      await cleanupStaging(res.staging);
    }
    // 3 transient retries would add ~0.9s of backoff; fail-fast stays well under that.
    expect(elapsedMs).toBeLessThan(800);
  });
});
