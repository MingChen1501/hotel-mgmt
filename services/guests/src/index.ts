import { createServiceServer } from "./server.js";

const port = Number(process.env["PORT"] ?? "8086");
const server = createServiceServer("guests");
server.listen(port, () => {
  console.log(`guests listening on :${port}`);
});
