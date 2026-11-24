/**
 * A local stand-in for the Messages API that speaks its streaming protocol,
 * so the real gateway (SDK, stream, tool blocks) can be exercised without the
 * network and without spending. Each request is answered with the next turn
 * of the script; the bodies received are kept for the test to inspect.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type FakeTurn =
  | { status: number; error: { type: string; message: string } }
  | {
    /** Web searches of the turn: each one is a `server_tool_use` and its result block. */
    searches?: Array<{ query: string; results?: Array<{ url: string; title: string }>; errorCode?: string; direct?: boolean }>;
    /** Pages the provider opens after its searches: each one is a `server_tool_use` of web_fetch and its result, with the page's text or an error. */
    fetches?: Array<{ url: string; text?: string; errorCode?: string }>;
    /** Text the model writes outside any tool. */
    text?: string;
    /** The input of the `report_results` call that ends the turn. */
    report?: unknown;
    stopReason: "tool_use" | "end_turn" | "pause_turn" | "refusal" | "max_tokens";
    /** Milliseconds before the turn ends, to try time limits. */
    delayMs?: number;
    usage?: { input_tokens: number; output_tokens: number };
  };

type ReceivedRequest = { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };

export async function startFakeAnthropicServer(turns: FakeTurn[] | ((request: ReceivedRequest, index: number) => FakeTurn), port = 0) {
  const requests: ReceivedRequest[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const received: ReceivedRequest = { headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown> };
      const index = requests.push(received) - 1;
      const turn = typeof turns === "function" ? turns(received, index) : turns[Math.min(index, turns.length - 1)];
      if ("status" in turn) {
        response.writeHead(turn.status, { "content-type": "application/json", "x-should-retry": "false" });
        response.end(JSON.stringify({ type: "error", error: turn.error }));
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const send = (event: Record<string, unknown>) => response.write(`event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`);
      const usage = turn.usage ?? { input_tokens: 21_000, output_tokens: 1_500 };
      send({
        type: "message_start",
        message: {
          id: `msg_fake_${index}`, type: "message", role: "assistant", model: String(received.body.model), content: [],
          stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1 },
        },
      });
      let block = 0;
      const whole = (content: Record<string, unknown>, json?: unknown) => {
        send({ type: "content_block_start", index: block, content_block: content });
        if (json !== undefined) send({ type: "content_block_delta", index: block, delta: { type: "input_json_delta", partial_json: JSON.stringify(json) } });
        send({ type: "content_block_stop", index: block });
        block += 1;
      };
      (turn.searches ?? []).forEach((search, position) => {
        const id = `srvtoolu_fake_${index}_${position}`;
        // As the provider does by default with dynamic filtering: the search is run from its code execution.
        const caller = search.direct ? { type: "direct" } : { type: "code_execution_20260120", tool_id: `srvtoolu_fake_code_${index}` };
        whole({ type: "server_tool_use", id, name: "web_search", input: {}, caller }, { query: search.query });
        whole({
          type: "web_search_tool_result",
          tool_use_id: id,
          caller,
          content: search.errorCode
            ? { type: "web_search_tool_result_error", error_code: search.errorCode }
            : (search.results ?? []).map((result) => ({ type: "web_search_result", url: result.url, title: result.title, encrypted_content: "ZmFrZQ==", page_age: null })),
        });
      });
      (turn.fetches ?? []).forEach((fetched, position) => {
        const id = `srvtoolu_fake_fetch_${index}_${position}`;
        whole({ type: "server_tool_use", id, name: "web_fetch", input: {}, caller: { type: "direct" } }, { url: fetched.url });
        whole({
          type: "web_fetch_tool_result",
          tool_use_id: id,
          caller: { type: "direct" },
          content: fetched.errorCode
            ? { type: "web_fetch_tool_result_error", error_code: fetched.errorCode }
            : {
              type: "web_fetch_result", url: fetched.url, retrieved_at: null,
              content: { type: "document", title: null, citations: null, source: { type: "text", media_type: "text/plain", data: fetched.text ?? "" } },
            },
        });
      });
      if (turn.text) {
        send({ type: "content_block_start", index: block, content_block: { type: "text", text: "" } });
        send({ type: "content_block_delta", index: block, delta: { type: "text_delta", text: turn.text } });
        send({ type: "content_block_stop", index: block });
        block += 1;
      }
      if (turn.report !== undefined) whole({ type: "tool_use", id: `toolu_fake_${index}`, name: "report_results", input: {} }, turn.report);
      const finish = () => {
        send({
          type: "message_delta",
          delta: { stop_reason: turn.stopReason, stop_sequence: null },
          usage: { ...usage, server_tool_use: { web_search_requests: turn.searches?.length ?? 0, web_fetch_requests: turn.fetches?.length ?? 0 } },
        });
        send({ type: "message_stop" });
        response.end();
      };
      if (turn.delayMs) setTimeout(finish, turn.delayMs);
      else finish();
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
