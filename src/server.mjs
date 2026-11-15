// Public Groth16 proof verification service — zkVerify Agent Games
// Wildcard Track entry.
//
//   POST /verify  { proof, publicSignals, verificationKey } -> { verified }
//   GET  /sample  a real working proof + signals + VK (gatekeeper circuit)
//   GET  /health  { ok: true }
//   GET  /        demo page with curl examples
//
// Groth16 / BN128 only. No auth (public demo API), no data stored:
// every request is verified in-memory and forgotten. Abuse-light by
// design: 100KB body limit, 10s verification timeout, no proving
// endpoint (proving is CPU-heavy; this service only verifies).
//
// Verification uses snarkjs groth16.verify. A well-formed request whose
// proof does not verify is NOT an error — it returns 200 with
// { verified: false }. Malformed input fails closed with a clear 400.

import express from "express";
import * as snarkjs from "snarkjs";
import sample from "../data/sample.json" with { type: "json" };

const PORT = Number(process.env.PORT || 3000);
const VERIFY_TIMEOUT_MS = 10_000;
const BODY_LIMIT = "100kb";

const app = express();
app.disable("x-powered-by");

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// --- structural validation (fail closed with a clear 400) ---------------

function isNumStr(v) {
  return (typeof v === "string" && /^-?\d+$/.test(v)) || typeof v === "number";
}

// Native snarkjs proofs carry G1 points as [x, y, 1] (3 elements) and
// G2 points as 3 rows; Solidity-style exports use 2. Accept both forms.
function isG1Point(v) {
  return (
    Array.isArray(v) &&
    (v.length === 2 || v.length === 3) &&
    v.every((el) => isNumStr(el))
  );
}

function isG2Point(v) {
  return (
    Array.isArray(v) &&
    (v.length === 2 || v.length === 3) &&
    v.every((row) => Array.isArray(row) && row.length === 2 && row.every((el) => isNumStr(el)))
  );
}

// BN128 base-field modulus; curve y^2 = x^3 + 3. A tampered coordinate
// almost always lands off-curve — that is a *false proof*, not a malformed
// request, so it earns verified:false (200), not a 400. Only affine
// points are checked here (z == 1); projective points pass through to
// snarkjs, which handles them.
const BN128_Q =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function g1OnCurve(pt) {
  if (pt.length === 3 && BigInt(pt[2]) !== 1n) return true; // projective: let snarkjs decide
  const x = ((BigInt(pt[0]) % BN128_Q) + BN128_Q) % BN128_Q;
  const y = ((BigInt(pt[1]) % BN128_Q) + BN128_Q) % BN128_Q;
  return (y * y) % BN128_Q === (x * x * x + 3n) % BN128_Q;
}

function validateVerifyBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "request body must be a JSON object with proof, publicSignals and verificationKey";
  }
  const { proof, publicSignals, verificationKey } = body;

  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    return "proof must be an object with pi_a, pi_b and pi_c";
  }
  if (proof.protocol !== undefined && proof.protocol !== "groth16") {
    return "only protocol 'groth16' is supported";
  }
  if (proof.curve !== undefined && proof.curve !== "bn128") {
    return "only curve 'bn128' is supported";
  }
  if (!isG1Point(proof.pi_a)) {
    return "proof.pi_a must be a G1 point: 2 or 3 field elements";
  }
  if (!isG2Point(proof.pi_b)) {
    return "proof.pi_b must be a G2 point: 2 or 3 rows of 2 field elements";
  }
  if (!isG1Point(proof.pi_c)) {
    return "proof.pi_c must be a G1 point: 2 or 3 field elements";
  }

  if (!Array.isArray(publicSignals) || publicSignals.length === 0) {
    return "publicSignals must be a non-empty array";
  }
  for (const s of publicSignals) {
    if (!isNumStr(s)) return "publicSignals entries must be decimal strings or numbers";
  }

  if (!verificationKey || typeof verificationKey !== "object" || Array.isArray(verificationKey)) {
    return "verificationKey must be a Groth16 verification-key object";
  }
  if (verificationKey.protocol !== undefined && verificationKey.protocol !== "groth16") {
    return "only protocol 'groth16' is supported";
  }
  if (verificationKey.curve !== undefined && verificationKey.curve !== "bn128") {
    return "only curve 'bn128' is supported";
  }
  for (const k of ["vk_alpha_1", "vk_beta_2", "vk_gamma_2", "vk_delta_2", "IC"]) {
    if (verificationKey[k] === undefined) {
      return `verificationKey is missing required field: ${k}`;
    }
  }
  if (!Array.isArray(verificationKey.IC) || verificationKey.IC.length === 0) {
    return "verificationKey.IC must be a non-empty array";
  }
  if (verificationKey.IC.length !== publicSignals.length + 1) {
    return `verificationKey.IC has ${verificationKey.IC.length} entries but publicSignals has ${publicSignals.length} (expected IC length = signals + 1)`;
  }
  return null; // valid
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// --- routes ---------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "zkverify-proof-verifier", curve: "bn128", protocol: "groth16" });
});

app.get("/sample", (_req, res) => {
  res.setHeader("cache-control", "public, max-age=3600");
  res.json(sample);
});

app.post("/verify", express.json({ limit: BODY_LIMIT }), async (req, res) => {
  const err = validateVerifyBody(req.body);
  if (err) {
    return res.status(400).json({ error: err });
  }
  const { proof, publicSignals, verificationKey } = req.body;
  const t0 = Date.now();
  // Off-curve proof points are a false proof, not a malformed request.
  if (!g1OnCurve(proof.pi_a) || !g1OnCurve(proof.pi_c)) {
    log(`verify -> false (off-curve point, ${Date.now() - t0}ms)`);
    return res.json({
      verified: false,
      details: {
        protocol: "groth16",
        curve: "bn128",
        nPublic: publicSignals.length,
        verifyMs: Date.now() - t0,
        reason: "proof point is not on the bn128 curve",
      },
    });
  }
  try {
    const verified = await withTimeout(
      snarkjs.groth16.verify(verificationKey, publicSignals, proof),
      VERIFY_TIMEOUT_MS
    );
    log(`verify -> ${verified} (${Date.now() - t0}ms, ${publicSignals.length} signals)`);
    return res.json({
      verified: Boolean(verified),
      details: {
        protocol: "groth16",
        curve: "bn128",
        nPublic: publicSignals.length,
        verifyMs: Date.now() - t0,
      },
    });
  } catch (e) {
    if (e && e.message === "timeout") {
      log("verify -> timeout");
      return res.status(503).json({ error: "verification timed out (10s limit)" });
    }
    // snarkjs throws on structurally-invalid keys/proofs that passed the
    // shallow checks above (bad curve points, wrong IC length, ...).
    log(`verify -> 400 (${e.message.split("\n")[0]})`);
    return res.status(400).json({ error: `invalid proof or verification key: ${e.message.split("\n")[0]}` });
  }
});

const DEMO_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZK Proof Verifier — zkVerify Agent Games (Wildcard)</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0b1020;color:#e6e9f2;margin:0;padding:2rem;line-height:1.6}
main{max-width:720px;margin:0 auto}
h1{font-size:1.6rem;margin-bottom:.2rem}
.sub{color:#9aa3b2;margin-top:0}
code,pre{background:#141b33;border:1px solid #26304d;border-radius:6px}
code{padding:.1rem .35rem}
pre{padding:1rem;overflow-x:auto;font-size:.85rem}
a{color:#7dd3fc}
.badge{display:inline-block;background:#7c3aed;color:#fff;border-radius:999px;padding:.15rem .7rem;font-size:.8rem}
li{margin-bottom:.4rem}
</style></head><body><main>
<span class="badge">zkVerify Agent Games &middot; Wildcard Track</span>
<h1>ZK Proof Verifier</h1>
<p class="sub">A public API that verifies arbitrary Groth16 proofs (BN128).
Send a proof, its public signals and the verification key &mdash; get back
a verdict in milliseconds. No sign-up, no data stored.</p>
<h2>Verify a proof</h2>
<pre>curl -X POST /verify \\
  -H 'content-type: application/json' \\
  -d '{"proof": {"pi_a": ["…","…"], "pi_b": [["…","…"],["…","…"]], "pi_c": ["…","…"]},
       "publicSignals": ["…"],
       "verificationKey": { "protocol": "groth16", "curve": "bn128", … }}'</pre>
<p>Response: <code>{"verified": true, "details": {"protocol": "groth16",
"curve": "bn128", "nPublic": 13, "verifyMs": 42}}</code>.
A well-formed request with a bad proof returns
<code>{"verified": false, …}</code> (HTTP 200); malformed input returns
HTTP 400 with a clear error message. Proofs are accepted in native
snarkjs format (<code>pi_a</code>/<code>pi_c</code> with 3 elements) or
in 2-element form.</p>
<h2>Try it with a real proof</h2>
<pre>curl -s /sample | curl -X POST /verify \\
  -H 'content-type: application/json' -d @-</pre>
<p><a href="/sample">GET /sample</a> returns a genuine proof generated
with the Proof Gatekeeper circuit, plus its public signals and
verification key &mdash; it verifies <code>true</code>. Tamper with any
signal and it flips to <code>false</code>.</p>
<h2>Endpoints</h2>
<ul>
<li><code>POST /verify</code> &mdash; verify a Groth16 proof (100KB body limit, 10s timeout)</li>
<li><code>GET /sample</code> &mdash; a real sample proof + signals + verification key</li>
<li><code>GET /health</code> &mdash; <code>{"ok": true}</code></li>
</ul>
<p>Built with Node + snarkjs. Why it matters: every agent in the
zkVerify ecosystem makes claims backed by proofs &mdash; this service
lets anyone check those claims with one HTTP call, no toolchain needed.</p>
</main></body></html>`;

app.get("/", (_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(DEMO_PAGE);
});

// JSON parse errors from express.json() land here (fail closed, clear 400).
app.use((err, _req, res, _next) => {
  if (err && (err.type === "entity.parse.failed" || err.type === "entity.too.large")) {
    const msg =
      err.type === "entity.too.large"
        ? `request body exceeds the ${BODY_LIMIT} limit`
        : "request body is not valid JSON";
    return res.status(400).json({ error: msg });
  }
  console.error("[server] unhandled error:", err);
  return res.status(500).json({ error: "internal error" });
});

export { app };
export default app;

import { pathToFileURL } from "node:url";
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const server = app.listen(PORT, () => {
    log(`listening on :${PORT}`);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 20000;
}
