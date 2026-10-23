import { handleTile } from "./handle";
import { createIgn, ignSettings } from "./ign";

/*
 * One IGN client per server instance. Only `GET` is exported, and Next answers 405 to any other
 * method. The visitor's request is not passed on: only the three segments are.
 */
const ign = createIgn({
  // Looked up at each call: Next patches `fetch` on the server.
  fetch: (input, init) => fetch(input, init),
  ...ignSettings(process.env),
});

export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }): Promise<Response> {
  return handleTile(await params, ign);
}
