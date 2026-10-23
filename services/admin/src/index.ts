import { createServiceServer } from "./server.js";

const port = Number(process.env["PORT"] ?? "8088");
const server = createServiceServer("admin");
server.listen(port, () => {
  console.log(`admin listening on :${port}`);
});
