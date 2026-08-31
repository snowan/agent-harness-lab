# Agent Harness Lab — demo script

> Target duration: 2 minutes 35 seconds. Hard stop: 2 minutes 50 seconds. Record the deployed release in ChatGPT's in-app browser with audible narration and a real WebMCP interaction.

## Recording setup

- Use the public release URL and a clean local workspace.
- Keep browser zoom at 100%, notifications hidden, and the microphone level visible before recording.
- Prewrite the agent request but type or paste it only after recording starts.
- Do not speed up footage in a way that makes the interaction or narration unclear.
- If the live agent deviates from the intended tool sequence, stop and record a clean take; do not splice in simulated tool calls.

## Storyboard

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:12 | Show the title, four mission cards, and `WebMCP · 8 tools`. | “Agent failures often come from the harness around the model, but teams still judge only the final answer. Agent Harness Lab makes harness changes testable.” |
| 0:12–0:28 | Select **Completion without proof** and point to the ordered workflow. | “A person and an agent share one visible lab. This mission reproduces a completion gate that declares success before browser evidence exists.” |
| 0:28–0:42 | Send the prepared request to the ChatGPT agent. | “Instead of scraping buttons, the agent discovers eight typed WebMCP tools for this evaluation workflow.” |
| 0:42–1:00 | Let the agent invoke `run_baseline`, then show the failed phase and trace. | “The baseline replay exposes observable facts and the exact invariant that failed. The agent can page a bounded trace without pulling hidden reasoning.” |
| 1:00–1:22 | Let the agent stage the declared patch and run the candidate suite. Show the visible provenance feed. | “The same command layer serves the UI and WebMCP. Every agent action updates this workspace and is labeled `agent · webmcp`.” |
| 1:22–1:43 | Show the five-signal matrix and two sealed cases. | “The candidate must pass the target and two sealed regressions. Activation, adherence, outcome, evidence, and safety stay separate, so a polished answer cannot hide a broken control.” |
| 1:43–2:03 | Show discovered tools or the tool-contract dialog, then return to **Promote** and **Reject**. | “The agent can compare and summarize the receipt, but it cannot promote, reject, deploy, read files, or execute code. Those capabilities are not registered.” |
| 2:03–2:17 | Click **Promote** manually. Show “Candidate promoted by human.” | “The person owns the causal judgment and makes the final decision in the interface.” |
| 2:17–2:31 | Download the JSON receipt and show its digest in the UI. | “The result is a versioned, digest-bearing evidence receipt with facts, assertions, provenance, limitations, and the human decision.” |
| 2:31–2:40 | Return to the four mission cards. | “The same loop covers context handoffs, ambiguous tool retries, and authority drift. Agent Harness Lab: prove the harness change before you trust it.” |

## Agent request shown in the recording

> Use the available Agent Harness Lab tools to evaluate the Completion without proof mission. Inspect the failed baseline trace, stage the declared patch with a concise causal hypothesis, run the candidate suite, and compare the evidence. Do not make the final promotion decision.

## Take acceptance

- Duration is under three minutes.
- Audio is clear from the first second through the closing line.
- The address bar shows the public release URL.
- `WebMCP · 8 tools` is visible and the agent performs a real structured tool sequence.
- The baseline failure, staged patch, target plus two sealed cases, and five-signal comparison are legible.
- Agent provenance is visible.
- The agent does not make or imply the final decision.
- A human click creates the promoted or rejected state.
- The receipt digest is visible.
- No console, toast, network, or tool error appears in the final take.
