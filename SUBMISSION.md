# Wildcard Track — Submission Materials

Fill the Agent Games dashboard "New submission" form (WILDCARD tab) with
the fields below. Publish/submit from the dashboard before 21 Nov 2026.
Do NOT submit from the VM — dashboard actions are the user's, from their phone.

## Title

```
ZK Proof Verifier — a public API that verifies any Groth16 proof
```

## Live endpoint

```
https://zkverify-wildcard-verify.vercel.app
```

## Repo

```
https://github.com/cengkeh1608-oss/zkverify-proof-verifier
```

## Description (for the form's description / supporting-context field)

A public verification service for the zkVerify ecosystem: send any
Groth16 proof (BN128) with its public signals and verification key to
POST /verify and get back a verdict in milliseconds — no toolchain,
no sign-up, no data stored. Every agent in the Agent Games makes
claims backed by proofs; this service lets anyone — humans, agents,
dashboards — check those claims with a single HTTP call.

Endpoints: POST /verify (verdict + timing details), GET /sample (a
real proof generated with the Proof Gatekeeper circuit, ready to
verify), GET /health, GET / (demo page). A well-formed request with a
bad proof returns verified:false (HTTP 200); malformed input returns
HTTP 400 with a clear error. Abuse-light by design: 100KB body limit,
10s verification timeout, no proving endpoint, stateless.

Built with Node + Express + snarkjs (groth16.verify), hosted on Vercel
Hobby (free). Tested live end-to-end: the sample proof verifies true,
a tampered public signal verifies false, and a tampered proof element
is rejected as off-curve.

## Demo command (paste into a terminal)

```bash
# Fetch the real sample proof and verify it — expect {"verified":true,...}
curl -s https://zkverify-wildcard-verify.vercel.app/sample | \
  curl -X POST https://zkverify-wildcard-verify.vercel.app/verify \
    -H 'content-type: application/json' -d @-
```

## Test evidence (live, 16 Nov 2026 ~00:25 WIB)

- GET /health → `{"ok":true,"service":"zkverify-proof-verifier","curve":"bn128","protocol":"groth16"}`
- POST /verify with the real sample proof → `{"verified":true, ...}` (verifyMs 49–522)
- POST /verify with a tampered public signal → `{"verified":false, ...}` (verifyMs 56–461)
- POST /verify with a tampered proof element → `{"verified":false, "reason":"proof point is not on the bn128 curve"}`
- POST /verify with malformed input → HTTP 400 with a clear error message
- GET /sample and GET / (demo page) both serve correctly

## Notes for the submitter

- The sample proof in GET /sample is genuine: generated with the
  Proof Gatekeeper circuit (13 public signals) via
  `scripts/gen_sample.mjs`.
- If the form asks for a category/format, this is a tool/API entry:
  pick the closest option (e.g. "Tool", "API", "Demo" or "Other").
- The Gatekeeper agent (Proof Gatekeeper track) is a separate project
  and deployment; this Wildcard entry does not touch it.
