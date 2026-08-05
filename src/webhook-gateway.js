import { createServer, request as httpRequest } from "node:http";

const gatewayPort = Number(process.env.WEBHOOK_GATEWAY_PORT || 3001);
const applicationPort = Number(process.env.PORT || 3000);

createServer((incoming, outgoing) => {
  const url = new URL(incoming.url, "http://localhost");
  if (url.pathname !== "/webhook") {
    outgoing.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return outgoing.end("Not found");
  }

  const proxy = httpRequest({
    hostname: "127.0.0.1",
    port: applicationPort,
    path: `${url.pathname}${url.search}`,
    method: incoming.method,
    headers: incoming.headers,
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });

  proxy.on("error", () => {
    if (outgoing.headersSent) return outgoing.end();
    outgoing.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    outgoing.end("Webhook application unavailable");
  });
  incoming.pipe(proxy);
}).listen(gatewayPort, "127.0.0.1", () => {
  console.log(`Webhook gateway em http://127.0.0.1:${gatewayPort}/webhook`);
});
