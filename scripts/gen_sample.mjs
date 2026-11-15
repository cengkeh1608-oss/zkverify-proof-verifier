// One-shot: generate a REAL Groth16 proof with the gatekeeper circuit
// (read-only use of ~/workspace/projects/zkverify-agent-games) and save
// it + public signals + VK as the wildcard service's /sample payload.
// Run: node /tmp/gen_sample.mjs
import fs from "node:fs";
import { prove } from "/home/hatch/workspace/projects/zkverify-agent-games/src/prover.mjs";
import * as snarkjs from "snarkjs";

const GK = "/home/hatch/workspace/projects/zkverify-agent-games";
const OUT = "/home/hatch/workspace/projects/zkverify-wildcard-verify/data/sample.json";

// A fully-valid task input: every checklist check passes, decision APPROVE.
const taskInput = {
  registered_vk: "0x" + "11".repeat(32),
  proof_vk: "0x" + "11".repeat(32),
  minimum: "100",
  public_balance: "1000",
  expiry_block: "1000",
  current_block: "100",
  recipient: "0x1111111111111111111111111111111111111111",
  condition_recipient: "0x1111111111111111111111111111111111111111",
  amount: "10",
  max_transfer: "100",
};

const { proof, publicSignals, proveMs } = await prove(taskInput, "wildcard-sample-001", 1n);
console.log(`proved in ${proveMs}ms, ${publicSignals.length} public signals`);

const verificationKey = JSON.parse(fs.readFileSync(`${GK}/circuits/gatekeeper_vk.json`, "utf8"));

// Sanity-check the proof verifies locally before shipping it as the sample.
const ok = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
console.log("local groth16.verify:", ok);
if (!ok) {
  console.error("sample proof does NOT verify — aborting");
  process.exit(1);
}

const sample = {
  note: "Real Groth16 proof (BN128) generated with the zkVerify Agent Games Proof Gatekeeper circuit. POST this whole object to /verify — it verifies true.",
  proof,
  publicSignals,
  verificationKey,
};
fs.writeFileSync(OUT, JSON.stringify(sample, null, 2));
console.log(`wrote ${OUT} (${fs.statSync(OUT).size} bytes)`);
process.exit(0);
