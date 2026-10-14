import { expect, test } from "bun:test";

test("config and agent loads share an in-flight inventory, but never cache completed or failed reads", async () => {
  const previous = globalThis.window;
  let calls = 0;
  let fail = false;
  let name = "Custom agent";
  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (_cmd: string, { args }: { args: string[] }) => {
        if (args[0] === "projects") {
          return { ok: true, stdout: JSON.stringify({ projects: [] }), stderr: "" };
        }
        calls++;
        started.resolve();
        await gate.promise;
        return {
          ok: !fail,
          stdout: JSON.stringify({
            agents: [{ id: "cursor", name, short: "C", global: "~/.cursor/skills", projConvention: ".cursor/skills", installed: true, custom: true }],
            scopes: [],
            deployments: {},
          }),
          stderr: fail ? "inventory failed" : "",
        };
      },
    },
  } as unknown as Window & typeof globalThis;
  try {
    // A fresh module evaluates the actual desktop detection against this IPC host.
    const { loadAgents, loadConfig } = await import("./skl.ts?inventory-sharing");
    const pending = Promise.all([loadAgents(), loadConfig()]);
    await started.promise;
    gate.resolve();
    const [agents, config] = await pending;
    expect(calls).toBe(1);
    expect(agents.agents).toEqual([]); // display-hidden agents stay hidden
    expect(config.agents[0].name).toBe("Custom agent"); // config keeps hidden custom agents
    expect(config.agents[0].inheritsGlobal).toBe(true);

    name = "Changed agent";
    expect((await loadConfig()).agents[0].name).toBe("Changed agent");
    expect(calls).toBe(2);
    fail = true;
    await expect(loadAgents()).rejects.toThrow("inventory failed");
    fail = false;
    await loadAgents();
    expect(calls).toBe(4);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "window");
    else globalThis.window = previous;
  }
});
