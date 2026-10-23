import { createServiceServer } from "./server.js";
import { AdminStore } from "./store.js";
import { bootStoreFromEnvironment } from "./server.js";

const port = Number(process.env["PORT"] ?? "8088");
const store = new AdminStore();
bootStoreFromEnvironment(store);
const server = createServiceServer("admin", store);
server.listen(port, () => {
  console.log(`admin listening on :${port}`);
});
