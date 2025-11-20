/**
 * Library interface for frappe-mcp-server
 * Allows using MCP tools as a library with custom credentials per call
 */

import { FrappeApp } from "frappe-js-sdk";
import { createFrappeClient, FrappeClientConfig } from './api-client-factory.js';
import * as docApi from './document-api-parameterized.js';
import * as schemaApi from './schema-api-parameterized.js';
import { DOCUMENT_TOOLS } from './document-operations.js';
import { SCHEMA_TOOLS } from './schema-operations.js';
import { HELPER_TOOLS } from './frappe-instructions.js';
import { BLUEPRINT_TOOLS } from './blueprint-operations.js';

export interface SiteCredentials {
  url: string;
  api_key: string;
  api_secret: string;
}

/**
 * List all available MCP tools
 */
export function listTools() {
  return [
    {
      name: "call_method",
      description: "Execute a whitelisted Frappe method",
      inputSchema: {
        type: "object",
        properties: {
          method: { type: "string", description: "Method name to call (whitelisted)" },
          params: {
            type: "object",
            description: "Parameters to pass to the method (optional)",
            additionalProperties: true
          },
        },
        required: ["method"],
      },
    },
    ...DOCUMENT_TOOLS,
    ...SCHEMA_TOOLS,
    ...HELPER_TOOLS,
    ...BLUEPRINT_TOOLS,
    {
      name: "ping",
      description: "A simple tool to check if the server is responding.",
      inputSchema: { type: "object", properties: {} }
    }
  ];
}

/**
 * Execute an MCP tool with site-specific credentials
 */
export async function executeTool(
  toolName: string,
  args: any,
  credentials: SiteCredentials
): Promise<any> {
  // Create Frappe client with site-specific credentials
  const client = createFrappeClient({
    url: credentials.url,
    api_key: credentials.api_key,
    api_secret: credentials.api_secret
  });

  // Handle ping
  if (toolName === "ping") {
    return { content: [{ type: "text", text: "pong" }], isError: false };
  }

  // Handle call_method
  if (toolName === "call_method") {
    const result = await docApi.callMethod(client, args.method, args.params);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  // Handle document operations
  if (toolName === "create_document") {
    const result = await docApi.createDocument(client, args.doctype, args.values);
    return {
      content: [{
        type: "text",
        text: `Document created successfully:\n${JSON.stringify(result, null, 2)}`
      }],
      isError: false
    };
  }

  if (toolName === "get_document") {
    const result = await docApi.getDocument(client, args.doctype, args.name, args.fields);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  if (toolName === "update_document") {
    const result = await docApi.updateDocument(client, args.doctype, args.name, args.values);
    return {
      content: [{
        type: "text",
        text: `Document updated successfully:\n${JSON.stringify(result, null, 2)}`
      }],
      isError: false
    };
  }

  if (toolName === "delete_document") {
    const result = await docApi.deleteDocument(client, args.doctype, args.name);
    return {
      content: [{
        type: "text",
        text: `Document deleted successfully`
      }],
      isError: false
    };
  }

  if (toolName === "list_documents") {
    const result = await docApi.listDocuments(
      client,
      args.doctype,
      args.filters,
      args.fields,
      args.limit,
      args.order_by,
      args.limit_start
    );
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  // Handle schema operations
  if (toolName === "get_doctype_schema") {
    const result = await schemaApi.getDocTypeSchema(client, args.doctype);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  if (toolName === "get_field_options") {
    const result = await schemaApi.getFieldOptions(client, args.doctype, args.fieldname);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  // Handle blueprint operations
  if (toolName === "execute_blueprint") {
    const result = await docApi.callMethod(
      client,
      "sentra_core.bl_engine.core.blueprint_executor.execute_blueprint_manually",
      {
        blueprint_name: args.blueprint_name,
        doc: args.doc_data
      }
    );
    return {
      content: [{
        type: "text",
        text: `Blueprint executed successfully:\n${JSON.stringify(result, null, 2)}`
      }],
      isError: false
    };
  }

  if (toolName === "list_blueprints") {
    const result = await docApi.listDocuments(
      client,
      "BL Blueprint",
      args.filters || { is_active: 1 },
      ["name", "blueprint_description"]
    );
    return {
      content: [{
        type: "text",
        text: `Available blueprints:\n${JSON.stringify(result, null, 2)}`
      }],
      isError: false
    };
  }

  if (toolName === "get_blueprint_info") {
    const result = await docApi.getDocument(client, "BL Blueprint", args.blueprint_name);
    return {
      content: [{
        type: "text",
        text: `Blueprint details:\n${JSON.stringify(result, null, 2)}`
      }],
      isError: false
    };
  }

  // Handle helper tools - these need to use callMethod or other Frappe APIs
  // For now, just handle a few common ones
  if (toolName === "find_doctypes") {
    const filters: any = {};
    if (args.search_term) {
      filters.name = ["like", `%${args.search_term}%`];
    }
    if (args.module) {
      filters.module = args.module;
    }
    if (args.is_table !== undefined) {
      filters.istable = args.is_table ? 1 : 0;
    }

    const result = await docApi.listDocuments(
      client,
      "DocType",
      filters,
      ["name", "module", "custom", "issingle", "istable"],
      args.limit || 50
    );
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  if (toolName === "get_module_list") {
    const result = await schemaApi.getAllModules(client);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  if (toolName === "get_doctypes_in_module") {
    const result = await docApi.listDocuments(
      client,
      "DocType",
      { module: args.module },
      ["name", "module", "custom", "issingle", "istable"]
    );
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };
  }

  if (toolName === "check_doctype_exists") {
    try {
      await schemaApi.getDocTypeSchema(client, args.doctype);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ exists: true, doctype: args.doctype }, null, 2)
        }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ exists: false, doctype: args.doctype }, null, 2)
        }],
        isError: false
      };
    }
  }

  if (toolName === "check_document_exists") {
    try {
      await docApi.getDocument(client, args.doctype, args.name);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ exists: true, doctype: args.doctype, name: args.name }, null, 2)
        }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ exists: false, doctype: args.doctype, name: args.name }, null, 2)
        }],
        isError: false
      };
    }
  }

  if (toolName === "get_document_count") {
    const result = await docApi.callMethod(
      client,
      "frappe.client.get_count",
      {
        doctype: args.doctype,
        filters: args.filters
      }
    );
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ count: result }, null, 2)
      }],
      isError: false
    };
  }

  // Unknown tool
  throw new Error(`Unknown tool: ${toolName}`);
}

// Re-export for convenience
export { createFrappeClient, FrappeClientConfig };
