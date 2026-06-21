#!/usr/bin/env node

/**
 * Multi-Tenant MCP Server with SSE Support
 * Creates MCP server instances using @modelcontextprotocol/sdk
 */

const express = require('express');
const fs = require('fs');

const SITES_CONFIG_PATH = process.env.SITES_CONFIG_PATH || './mcp-sites.json';
const MCP_PORT = parseInt(process.env.MCP_PORT || '4000', 10);

// Load sites configuration
function loadSitesConfig() {
    try {
        if (!fs.existsSync(SITES_CONFIG_PATH)) {
            console.error(`Sites config not found at ${SITES_CONFIG_PATH}, creating empty config...`);
            fs.writeFileSync(SITES_CONFIG_PATH, JSON.stringify({ sites: {} }, null, 2));
            return { sites: {} };
        }

        const configData = fs.readFileSync(SITES_CONFIG_PATH, 'utf8');
        const config = JSON.parse(configData);
        console.log(`Loaded configuration for ${Object.keys(config.sites || {}).length} sites`);
        return config;
    } catch (error) {
        console.error(`Error loading sites config: ${error.message}`);
        return { sites: {} };
    }
}

// Reload sites configuration periodically
let sitesConfig = loadSitesConfig();
setInterval(() => {
    sitesConfig = loadSitesConfig();
}, 30000);

const app = express();
app.use(express.json());

// Import components
let mcpLibrary, Server, StreamableHTTPServerTransport, ListToolsRequestSchema, CallToolRequestSchema;

// Health check endpoint
app.get('/health', (req, res) => {
    const siteCount = Object.keys(sitesConfig.sites || {}).length;
    res.json({
        status: 'healthy',
        sites: siteCount,
        timestamp: new Date().toISOString()
    });
});

// List configured sites
app.get('/sites', (req, res) => {
    const sites = Object.keys(sitesConfig.sites || {});
    res.json({ sites });
});

// Main MCP endpoint with SSE support
app.post(['/mcp', '/mcp/:siteName'], async (req, res) => {
    // Check for dynamic credentials in query parameters, headers, or body
    const url = req.query.url || req.headers['x-frappe-url'] || req.body.url;
    const api_key = req.query.api_key || req.headers['x-frappe-api-key'] || req.body.api_key;
    const api_secret = req.query.api_secret || req.headers['x-frappe-api-secret'] || req.body.api_secret;

    let credentials;

    if (url && api_key && api_secret) {
        credentials = { url, api_key, api_secret };
        console.log(`Processing MCP request with dynamic credentials for URL: ${url}`);
    } else {
        const siteName = req.params.siteName || req.headers['x-frappe-site-name'] || req.body.siteName;

        if (!siteName) {
            return res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Missing site credentials (url, api_key, api_secret) or site name in URL/headers/body'
                },
                id: null
            });
        }

        const siteConfig = sitesConfig.sites[siteName];

        if (!siteConfig) {
            console.error(`Site not found in config: ${siteName}`);
            return res.status(404).json({
                jsonrpc: '2.0',
                error: {
                    code: -32001,
                    message: `Site not found: ${siteName}`
                },
                id: null
            });
        }

        console.log(`Processing MCP request for site: ${siteName}`);
        credentials = {
            url: siteConfig.url,
            api_key: siteConfig.api_key,
            api_secret: siteConfig.api_secret
        };
    }

    try {
        // Create MCP server instance
        const server = new Server(
            { name: 'frappe-mcp-server', version: '0.2.16' },
            { capabilities: { tools: {} } }
        );

        // Handle list tools
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = mcpLibrary.listTools();
            return { tools };
        });

        // Handle tool calls
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            return await mcpLibrary.executeTool(name, args, credentials);
        });

        // Create transport
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
        });

        // Handle cleanup
        res.on('close', () => {
            transport.close();
            server.close();
        });

        // Connect and handle request
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

    } catch (error) {
        console.error(`Error processing MCP request:`, error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: error.message || 'Internal server error',
                    data: error.stack
                },
                id: req.body.id || null
            });
        }
    }
});

// Start server
async function startServer() {
    try {
        console.log('Loading frappe-mcp-server library...');
        mcpLibrary = await import('./build/library.js');

        // Import MCP SDK components
        const sdkServer = await import('@modelcontextprotocol/sdk/server/index.js');
        const sdkStreamable = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
        const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');

        Server = sdkServer.Server;
        StreamableHTTPServerTransport = sdkStreamable.StreamableHTTPServerTransport;
        ListToolsRequestSchema = sdkTypes.ListToolsRequestSchema;
        CallToolRequestSchema = sdkTypes.CallToolRequestSchema;

        console.log('Successfully loaded frappe-mcp-server library with SSE support');

        const MCP_HOST = process.env.MCP_HOST || '127.0.0.1';
        const server = app.listen(MCP_PORT, MCP_HOST, () => {
            console.log(`Multi-Tenant MCP Server listening on http://${MCP_HOST}:${MCP_PORT}`);
            console.log(`Sites config: ${SITES_CONFIG_PATH}`);
            console.log(`Configured sites: ${Object.keys(sitesConfig.sites || {}).length}`);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down Multi-Tenant MCP Server...');
            server.close();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down...');
            server.close();
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to load frappe-mcp-server library:', error);
        process.exit(1);
    }
}

startServer();
