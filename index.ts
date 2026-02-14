/**
 * @openclaw/status — OpenClaw channel plugin for Status Messenger.
 *
 * Wraps the status-backend HTTP/WebSocket API to provide
 * decentralized 1:1 messaging via the Status (Waku) network.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { statusPlugin } from "./src/channel.js";
import { setStatusRuntime } from "./src/runtime.js";

const plugin = {
  id: "status",
  name: "Status Messenger",
  description: "Decentralized messaging via Status (Waku) network",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setStatusRuntime(api.runtime);
    api.registerChannel({ plugin: statusPlugin });
  },
};

export default plugin;
