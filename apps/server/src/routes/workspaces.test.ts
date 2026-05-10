import app from "../server";

// Simple smoke test that does not require vitest to be installed.
// When vitest is available, wrap these in describe/it blocks.
async function runSmokeTest() {
  if (!app) {
    throw new Error("App should be defined");
  }

  const res = await app.request("/health");
  if (res.status !== 200) {
    throw new Error(`Expected status 200, got ${res.status}`);
  }

  const json = (await res.json()) as { status: string };
  if (json.status !== "ok") {
    throw new Error(`Expected status ok, got ${json.status}`);
  }

  console.log("Smoke test passed");
}

runSmokeTest().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});

export {};
