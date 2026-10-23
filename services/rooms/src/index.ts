import { createServiceServer } from "./server.js";

const port = Number(process.env["PORT"] ?? "8085");
const server = createServiceServer("rooms");
server.listen(port, () => {
  console.log(`rooms listening on :${port}`);
});
