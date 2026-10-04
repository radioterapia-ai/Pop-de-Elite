import { tratarPop } from "./pop/api.js";

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/pop/")) return new Response("Not found", { status: 404 });
    return tratarPop(request, env, ctx);
  },
};
