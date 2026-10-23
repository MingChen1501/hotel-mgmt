import { createServer, type Server } from "node:http";

// createServiceServer answers GET /healthz with the module identity and
// refuses every other path with the shared error envelope. Skeleton
// only: operation routes land in later slices per
// docs/architecture/lld.md section 2.
export function createServiceServer(service: string): Server {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ service, status: "ok" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        code: "NOT_FOUND",
        message: "unknown path",
        details: {},
        traceId: "none",
      }),
    );
  });
}
