import { createServiceServer } from "./server.js";

const port = Number(process.env["PORT"] ?? "8084");
const server = createServiceServer("stay");
server.listen(port, () => {
  console.log(`stay listening on :${port}`);
});
