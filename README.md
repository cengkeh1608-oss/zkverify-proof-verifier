# ZK Proof Verifier — zkVerify Agent Games (Wildcard Track)

A public API that verifies arbitrary **Groth16 proofs (BN128)**.
Send a proof, its public signals and the verification key — get back
a verdict in milliseconds. No sign-up, no data stored.

Built for the **Wildcard Track** of the
[zkVerify Agent Games](https://agentgames.zkverify.io) (21 Oct – 21 Nov 2026).

## Why it matters

Every agent in the zkVerify ecosystem makes claims backed by proofs.
Checking a claim today means installing a toolchain and wiring up a
verifier by hand. This service turns that into one HTTP call — the
plumbing that lets humans, agents and dashboards trust-but-verify
without running any ZK software themselves.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/verify` | Verify a Groth16 proof |
| `GET` | `/sample` | A real sample proof + signals + verification key |
| `GET` | `/health` | `{"ok": true}` |
| `GET` | `/` | Demo page with curl examples |

### POST /verify

Request body (JSON):

```json
{
  "proof": {
    "pi_a": ["…", "…", "1"],
    "pi_b": [["…", "…"], ["…", "…"], ["1", "0"]],
    "pi_c": ["…", "…", "1"]
  },
  "publicSignals": ["…"],
  "verificationKey": {
    "protocol": "groth16",
    "curve": "bn128",
    "vk_alpha_1": ["…", "…", "1"],
    "vk_beta_2": [["…", "…"], ["…", "…"], ["1", "0"]],
    "vk_gamma_2": [["…", "…"], ["…", "…"], ["1", "0"]],
    "vk_delta_2": [["…", "…"], ["…", "…"], ["1", "0"]],
    "vk_alphabeta_12": [[["…", "…"], ["…", "…"]], [["…", "…"], ["…", "…"]]],
    "IC": [["…", "…", "1"]]
  }
}
```

Proofs are accepted in native snarkjs format (`pi_a`/`pi_c` with
3 elements) or in 2-element (Solidity-style) form.

Success response (HTTP 200):

```json
{ "verified": true, "details": { "protocol": "groth16", "curve": "bn128", "nPublic": 13, "verifyMs": 179 } }
```

A well-formed request whose proof does **not** verify returns HTTP 200
with `{"verified": false, …}` — a false proof is a verdict, not an
error. Malformed input returns HTTP 400 with a clear error message.

### Try it

```bash
# Fetch the real sample proof and verify it (expect verified: true)
curl -s https://<deployment>/sample | \
  curl -X POST https://<deployment>/verify \
    -H 'content-type: application/json' -d @-
```

The sample proof was generated with the Proof Gatekeeper circuit from
the same competition (13 public signals). Tamper with any signal and
the verdict flips to `false`.

## Limits (abuse-light by design)

- 100KB request body limit, 10s verification timeout.
- No proving endpoint (proving is CPU-heavy; this service only verifies).
- Stateless: nothing is stored, every request is verified in-memory.

## Stack

Node + Express + [snarkjs](https://github.com/iden3/snarkjs) (`groth16.verify`).
Hosted on Vercel (Hobby, free). No secrets, no database.

## Local development

```bash
npm install
npm start            # listens on :3000
node scripts/gen_sample.mjs   # regenerate data/sample.json with the
                              # gatekeeper circuit (needs the sibling
                              # zkverify-agent-games project, read-only)
```

## License

MIT.
