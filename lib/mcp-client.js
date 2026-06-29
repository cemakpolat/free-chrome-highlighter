/**
 * MCP Client — Model Context Protocol
 *
 * Lightweight HTTP-based client that connects to external MCP servers.
 * MCP servers expose "resources" (readable data) and "tools" (callable actions).
 *
 * Spec reference: https://modelcontextprotocol.io/specification
 *
 * Chrome extension constraints:
 *   - Cannot open a persistent SSE connection from a service worker (no streaming)
 *   - Uses request/response pattern (initialize → tools/list → tools/call)
 *   - Server URL must be in manifest host_permissions to bypass CORS
 */

'use strict';

class MCPClient {
  /**
   * @param {string} serverUrl  - Base URL of the MCP server, e.g. http://localhost:3000
   * @param {object} opts
   * @param {string} opts.name    - Client name reported during handshake
   * @param {number} opts.timeout - Request timeout in ms (default 15000)
   */
  constructor(serverUrl, opts = {}) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.name = opts.name || 'universal-web-highlighter';
    this.timeout = opts.timeout || 15_000;
    this._msgId = 1;
    this._sessionId = null;
    this._capabilities = {};
    this._tools = null;       // cache after first list
    this._resources = null;
  }

  // ─── Connection ───────────────────────────────────────────────────────────

  /** Handshake. Must be called before any other method. */
  async initialize() {
    const resp = await this._rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {}, resources: {} },
      clientInfo: { name: this.name, version: '2.0.0' }
    });

    this._capabilities = resp.capabilities || {};
    this._sessionId = resp.sessionId || null;

    // Confirm handshake
    await this._rpc('notifications/initialized', {}).catch(() => {});

    return resp;
  }

  /** Quick health check — returns true if server responds to initialize. */
  async ping() {
    try {
      await this.initialize();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Tools ────────────────────────────────────────────────────────────────

  /** List all tools the server exposes. Cached after first call. */
  async listTools() {
    if (this._tools) return this._tools;
    const resp = await this._rpc('tools/list', {});
    this._tools = resp.tools || [];
    return this._tools;
  }

  /**
   * Call a tool.
   * @param {string} name
   * @param {object} args
   * @returns {any}  Parsed tool result content
   */
  async callTool(name, args = {}) {
    const resp = await this._rpc('tools/call', { name, arguments: args });
    return this._parseContent(resp.content);
  }

  // ─── Resources ────────────────────────────────────────────────────────────

  /** List all resources the server exposes. */
  async listResources() {
    if (this._resources) return this._resources;
    const resp = await this._rpc('resources/list', {});
    this._resources = resp.resources || [];
    return this._resources;
  }

  /** Read a resource by URI. */
  async readResource(uri) {
    const resp = await this._rpc('resources/read', { uri });
    return this._parseContent(resp.contents);
  }

  // ─── Transport ────────────────────────────────────────────────────────────

  async _rpc(method, params) {
    const id = this._msgId++;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let resp;
    try {
      resp = await fetch(`${this.serverUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(this._sessionId ? { 'Mcp-Session-Id': this._sessionId } : {})
        },
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`MCP server error ${resp.status}: ${text}`);
    }

    const data = await resp.json();

    if (data.error) {
      throw new Error(`MCP error [${data.error.code}]: ${data.error.message}`);
    }

    return data.result ?? data;
  }

  _parseContent(content) {
    if (!content) return null;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(c => {
        if (c.type === 'text') return c.text;
        if (c.type === 'resource') return c.resource?.text || c.resource;
        return c;
      }).join('\n');
    }
    return content;
  }
}


// ─── MCP Tool Plugin wrapper ──────────────────────────────────────────────────
//
// Wraps an MCPClient as a IToolPlugin so agents can use MCP tools
// through the same interface as built-in tools.

class MCPToolPlugin {
  constructor(id, serverUrl, opts = {}) {
    this._id = id;
    this._serverUrl = serverUrl;
    this._client = new MCPClient(serverUrl, opts);
    this._ready = false;
    this._tools = [];
  }

  static get metadata() {
    return {
      id: 'mcp',
      name: 'MCP Server',
      version: '1.0.0',
      category: 'tool',
      description: 'Connect to any MCP-compatible tool server.',
      actions: [],
      requiresAuth: false,
      configFields: [
        { id: 'serverUrl', label: 'MCP Server URL', type: 'text', placeholder: 'http://localhost:3000' }
      ]
    };
  }

  async onEnable(config) {
    if (config?.serverUrl) {
      this._serverUrl = config.serverUrl;
      this._client = new MCPClient(config.serverUrl);
    }
    try {
      await this._client.initialize();
      this._tools = await this._client.listTools();
      this._ready = true;
      console.log(`[MCP:${this._id}] Connected. Tools:`, this._tools.map(t => t.name));
    } catch (err) {
      console.warn(`[MCP:${this._id}] Could not connect:`, err.message);
      this._ready = false;
    }
  }

  async call(action, args) {
    if (!this._ready) {
      return { success: false, error: 'MCP server not connected' };
    }
    try {
      const result = await this._client.callTool(action, args);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  describe() {
    return this._tools.map(t => ({
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema || {}
    }));
  }

  validate(action) {
    const tool = this._tools.find(t => t.name === action);
    if (!tool) return { valid: false, errors: [`Unknown tool: ${action}`] };
    return { valid: true, errors: [] };
  }

  isReady() { return this._ready; }
  getTools() { return this._tools; }
  getServerUrl() { return this._serverUrl; }

  async onDisable() {
    this._ready = false;
    this._tools = [];
  }
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MCPClient, MCPToolPlugin };
} else {
  window.MCPClient = MCPClient;
  window.MCPToolPlugin = MCPToolPlugin;
}
