/**
 * A local stand-in for the Twilio Verify API (Verifications and
 * VerificationCheck), so the real gateway (fetch, Basic auth, form bodies,
 * error codes) runs without the network and without sending messages. By
 * default it behaves as Twilio does: a code per number (always `code`), a
 * check that approves it once and deletes it, 404 for a number without a
 * pending code. `respond` scripts any other answer. The requests are kept.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type ReceivedRequest = { path: string; authorization: string | undefined; form: Record<string, string> };
type ScriptedAnswer = { status: number; body: Record<string, unknown> };

export async function startFakeTwilioVerifyServer(options: {
  code?: string;
  /** An answer for this request in place of the default behaviour; undefined keeps the default. */
  respond?: (request: ReceivedRequest, index: number) => ScriptedAnswer | undefined;
  port?: number;
} = {}) {
  const code = options.code ?? "123456";
  const requests: ReceivedRequest[] = [];
  const pending = new Map<string, { channel: string; sid: string }>();

  const answer = (received: ReceivedRequest): ScriptedAnswer => {
    const match = /^\/v2\/Services\/([^/]+)\/(Verifications|VerificationCheck)$/.exec(received.path);
    if (!match) return { status: 404, body: { code: 20404, message: "The requested resource was not found", status: 404 } };
    const [, serviceSid, resource] = match;
    const to = received.form.To ?? "";
    if (resource === "Verifications") {
      const sid = `VEfake${requests.length}`;
      pending.set(to, { channel: received.form.Channel ?? "sms", sid });
      return { status: 201, body: { sid, service_sid: serviceSid, to, channel: received.form.Channel, status: "pending", valid: false } };
    }
    const verification = pending.get(to);
    if (!verification) {
      return { status: 404, body: { code: 20404, message: `The requested resource /Services/${serviceSid}/VerificationCheck was not found`, status: 404 } };
    }
    if (received.form.Code !== code) {
      return { status: 200, body: { sid: verification.sid, to, channel: verification.channel, status: "pending", valid: false } };
    }
    pending.delete(to);
    return { status: 200, body: { sid: verification.sid, to, channel: verification.channel, status: "approved", valid: true } };
  };

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
      const received: ReceivedRequest = { path: (request.url ?? "").split("?")[0], authorization: request.headers.authorization, form };
      const index = requests.push(received) - 1;
      const result = options.respond?.(received, index) ?? answer(received);
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v2`,
    code,
    requests,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
