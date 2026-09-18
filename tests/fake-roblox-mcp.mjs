import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'fake-roblox', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'list_roblox_studios',
    description: 'List connected Roblox Studio instances',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async request => ({
  content: [{
    type: 'text',
    text: JSON.stringify({ tool: request.params.name, arguments: request.params.arguments ?? {} }),
  }],
}));

await server.connect(new StdioServerTransport());
